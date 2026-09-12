import os
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, Body, Depends, Query, status
from pydantic import BaseModel

from utils.config import DATA_DIR
from utils.logger import logger
from routes.auth import require_analyst_or_admin, get_current_user
from services import usina_service

router = APIRouter(prefix="/usinas", tags=["Usinas"])

class UsinaCreate(BaseModel):
    nome: str
    cliente: str | None = None
    complexo: str | None = None
    duplicar_de: str | None = None
    duplicar_mapeamento: bool = False
    duplicar_infos_usina: bool = False
    duplicar_sinteticas: bool = False
    duplicar_dados_diarios: bool = False
    duplicar_fluxograma: bool = False

class UsinaRename(BaseModel):
    novo_nome: str
    cliente: str | None = None
    complexo: str | None = None

class UsinaDetailed(BaseModel):
    nome: str
    cliente: str | None = None
    complexo: str | None = None
    criado_em: str
    criado_por: str
    count_elementos: int
    count_series: int
    count_campanhas: int = 0
    total_mwp: float
    total_strings: int
    total_modulos: int
    total_skids: int = 0
    total_inversores: int = 0
    total_stringboxes: int = 0
    total_trackers: int = 0
    total_sinteticas: int
    total_processadas: int
    dias_presentes: int
    drive_link: str | None = None

class UsinaBasic(BaseModel):
    nome: str
    cliente: str | None = None
    complexo: str | None = None

@router.get("", response_model=List[UsinaBasic])
def list_usinas():
    """Lista as usinas disponíveis lendo subpastas válidas em DATA_DIR e retorna informações básicas."""
    if not os.path.exists(DATA_DIR):
        return []
    
    usinas_basicas = []
    for item in os.listdir(DATA_DIR):
        if os.path.isdir(os.path.join(DATA_DIR, item)):
            meta = usina_service.get_usina_metadata(item)
            usinas_basicas.append(UsinaBasic(
                nome=item,
                cliente=meta.get("cliente"),
                complexo=meta.get("complexo")
            ))
            
    order = usina_service.get_usina_order()
    
    def sort_key(usina):
        try:
            return (0, order.index(usina.nome))
        except ValueError:
            return (1, usina.nome)
            
    logger.info(f"[USINAS] Listando {len(usinas_basicas)} usinas.")
    return sorted(usinas_basicas, key=sort_key)

@router.get("/detailed", response_model=List[UsinaDetailed])
def list_usinas_detailed(_: dict = Depends(require_analyst_or_admin)):
    """Retorna lista de usinas com estatísticas agregadas."""
    if not os.path.exists(DATA_DIR):
        return []
    
    result = []
    for item in os.listdir(DATA_DIR):
        if os.path.isdir(os.path.join(DATA_DIR, item)):
            meta = usina_service.get_usina_metadata(item)
            stats = usina_service.get_usina_stats(item)
            result.append(UsinaDetailed(
                nome=item,
                cliente=meta.get("cliente"),
                complexo=meta.get("complexo"),
                criado_em=meta.get("criado_em", ""),
                criado_por=meta.get("criado_por", ""),
                drive_link=meta.get("drive_link"),
                **stats
            ))
    order = usina_service.get_usina_order()
    
    def sort_key(usina_detail):
        try:
            return (0, order.index(usina_detail.nome))
        except ValueError:
            return (1, usina_detail.nome)
            
    return sorted(result, key=sort_key)

@router.post("/reorder", response_model=dict)
def reorder_usinas(order: List[str] = Body(...), _: dict = Depends(require_analyst_or_admin)):
    """Atualiza a ordem de exibição das usinas."""
    try:
        usina_service.save_usina_order(order)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"[USINAS] Erro ao reordenar usinas: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=dict)
def create_usina(usina: UsinaCreate = Body(...), current_user: dict = Depends(require_analyst_or_admin)):
    """Cria o diretório correspondente para uma nova usina e salva metadados."""
    if not usina.nome or not usina.nome.strip():
        raise HTTPException(status_code=400, detail="Nome da usina não pode estar vazio.")
    
    nome_limpo = usina.nome.strip()
    path = os.path.join(DATA_DIR, nome_limpo)
    
    if os.path.exists(path):
        raise HTTPException(status_code=400, detail="Usina já existe.")
        
    try:
        os.makedirs(path, exist_ok=True)
        # Salva metadados
        meta = {
            "cliente": usina.cliente,
            "complexo": usina.complexo,
            "criado_em": datetime.now().isoformat(),
            "criado_por": current_user.get("name") or current_user.get("email", "Desconhecido")
        }
        usina_service.save_usina_metadata(nome_limpo, meta)
        
        # Lógica de Duplicação
        if usina.duplicar_de:
            source_path = os.path.join(DATA_DIR, usina.duplicar_de)
            if os.path.exists(source_path):
                import shutil
                if usina.duplicar_mapeamento:
                    src_map = os.path.join(source_path, "mapping.json")
                    if os.path.exists(src_map):
                        shutil.copy2(src_map, os.path.join(path, "mapping.json"))
                
                if usina.duplicar_infos_usina:
                    src_info = os.path.join(source_path, "usina_info.json")
                    if os.path.exists(src_info):
                        shutil.copy2(src_info, os.path.join(path, "usina_info.json"))
                        
                if usina.duplicar_sinteticas:
                    src_synth = os.path.join(source_path, "synthetics.json")
                    if os.path.exists(src_synth):
                        shutil.copy2(src_synth, os.path.join(path, "synthetics.json"))
                        
                if usina.duplicar_fluxograma:
                    src_flow = os.path.join(source_path, "flow_config.json")
                    if os.path.exists(src_flow):
                        shutil.copy2(src_flow, os.path.join(path, "flow_config.json"))
                        
                if usina.duplicar_dados_diarios:
                    for folder in ["raw", "processed"]:
                        src_folder = os.path.join(source_path, folder)
                        dst_folder = os.path.join(path, folder)
                        if os.path.exists(src_folder):
                            shutil.copytree(src_folder, dst_folder, dirs_exist_ok=True)
                            
        logger.info(f"[USINAS] Nova usina criada: {nome_limpo} por {meta['criado_por']}")
    except Exception as e:
        logger.error(f"[USINAS] Erro ao criar usina {nome_limpo}: {e}")
        # Em caso de erro, tenta remover a pasta criada parcialmente
        if os.path.exists(path):
            import shutil
            shutil.rmtree(path, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "ok", "usina": nome_limpo}

@router.patch("/{nome}", response_model=dict)
def rename_usina(nome: str, body: UsinaRename = Body(...), _: dict = Depends(require_analyst_or_admin)):
    """Edita os metadados e opcionalmente renomeia uma usina."""
    try:
        novo_nome = body.novo_nome.strip() if body.novo_nome else nome
        
        target_name = nome
        if novo_nome and novo_nome != nome:
            usina_service.rename_usina_dir(nome, novo_nome)
            target_name = novo_nome
            
        meta = usina_service.get_usina_metadata(target_name)
        if body.cliente is not None:
            meta["cliente"] = body.cliente
        if body.complexo is not None:
            meta["complexo"] = body.complexo
            
        usina_service.save_usina_metadata(target_name, meta)
        
        return {"status": "ok", "mensagem": "Usina atualizada com sucesso."}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[USINAS] Erro ao renomear usina {nome}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{nome}", status_code=status.HTTP_204_NO_CONTENT)
def remove_usina(nome: str, _: dict = Depends(require_analyst_or_admin)):
    """Remove uma usina e todos os seus arquivos."""
    try:
        usina_service.delete_usina_dir(nome)
        return None
    except Exception as e:
        logger.error(f"[USINAS] Erro ao remover usina {nome}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class UsinaDriveLink(BaseModel):
    drive_link: str

@router.patch("/{nome}/drive-link", response_model=dict)
def update_drive_link(nome: str, body: UsinaDriveLink = Body(...), _: dict = Depends(require_analyst_or_admin)):
    """Atualiza o link do Google Drive da usina."""
    try:
        meta = usina_service.get_usina_metadata(nome)
        meta["drive_link"] = body.drive_link.strip()
        usina_service.save_usina_metadata(nome, meta)
        return {"status": "ok", "mensagem": "Link do Drive atualizado com sucesso.", "drive_link": meta["drive_link"]}
    except Exception as e:
        logger.error(f"[USINAS] Erro ao atualizar link do drive da usina {nome}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

