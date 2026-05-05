import os
from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
from utils.config import DATA_DIR
from utils.logger import logger
from routes.auth import require_analyst_or_admin

router = APIRouter(prefix="/usinas", tags=["Usinas"])

class UsinaCreate(BaseModel):
    nome: str

@router.get("", response_model=list[str])
def list_usinas():
    """Lista as usinas disponíveis lendo subpastas válidas em DATA_DIR."""
    if not os.path.exists(DATA_DIR):
        return []
    
    usinas = []
    for item in os.listdir(DATA_DIR):
        if os.path.isdir(os.path.join(DATA_DIR, item)):
            usinas.append(item)
            
    logger.info(f"[USINAS] Listando {len(usinas)} usinas.")
    return sorted(usinas)

@router.post("", response_model=dict)
def create_usina(usina: UsinaCreate = Body(...), _: dict = Depends(require_analyst_or_admin)):
    """Cria o diretório correspondente para uma nova usina."""
    if not usina.nome or not usina.nome.strip():
        raise HTTPException(status_code=400, detail="Nome da usina não pode estar vazio.")
    
    nome_limpo = usina.nome.strip()
    path = os.path.join(DATA_DIR, nome_limpo)
    
    if os.path.exists(path):
        raise HTTPException(status_code=400, detail="Usina já existe.")
        
    try:
        os.makedirs(path, exist_ok=True)
        logger.info(f"[USINAS] Nova usina criada: {nome_limpo}")
    except Exception as e:
        logger.error(f"[USINAS] Erro ao criar usina {nome_limpo}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "ok", "usina": nome_limpo}
