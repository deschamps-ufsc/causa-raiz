import json
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

from models.schemas import VisualizationPayload, VisualizationResponse
from utils.config import DATA_DIR
from utils.logger import logger

router = APIRouter()

def get_vis_path(usina: str) -> str:
    # Retorna o caminho do arquivo JSON que armazena as visualizações da usina
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        os.makedirs(usina_dir, exist_ok=True)
    return os.path.join(usina_dir, "visualizations.json")

def get_shared_vis_path() -> str:
    return os.path.join(DATA_DIR, "shared_visualizations.json")

def load_visualizations(usina: str) -> list[dict]:
    path = get_vis_path(usina)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Erro ao carregar visualizações de {usina}: {e}")
        return []

def load_shared_visualizations() -> list[dict]:
    path = get_shared_vis_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Erro ao carregar visualizações compartilhadas: {e}")
        return []

def save_visualizations(usina: str, data: list[dict]):
    path = get_vis_path(usina)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Erro ao salvar visualizações de {usina}: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao salvar visualização local.")

def save_shared_visualizations(data: list[dict]):
    path = get_shared_vis_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Erro ao salvar visualizações compartilhadas: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao salvar visualização compartilhada.")


@router.get("/{usina}", response_model=list[VisualizationResponse])
def get_visualizacoes(usina: str = Path(...)):
    """Lista todas as visualizações salvas para uma usina e as compartilhadas."""
    local_vis = load_visualizations(usina)
    shared_vis = load_shared_visualizations()
    
    # Merge avoiding duplicate IDs just in case
    all_vis = {v["id"]: v for v in local_vis}
    for v in shared_vis:
        all_vis[v["id"]] = v
        
    # Sort by created_at descending just for nice ordering, or leave as is
    return list(all_vis.values())


@router.post("/{usina}", response_model=VisualizationResponse)
def create_visualizacao(payload: VisualizationPayload, usina: str = Path(...)):
    """Cria uma nova visualização."""
    new_vis = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now().isoformat(),
        **payload.dict()
    }
    
    if payload.shared:
        shared_data = load_shared_visualizations()
        shared_data.append(new_vis)
        save_shared_visualizations(shared_data)
    else:
        local_data = load_visualizations(usina)
        local_data.append(new_vis)
        save_visualizations(usina, local_data)
        
    return new_vis


@router.put("/{usina}/{vis_id}", response_model=VisualizationResponse)
def update_visualizacao(payload: VisualizationPayload, usina: str = Path(...), vis_id: str = Path(...)):
    """Atualiza (sobrescreve) uma visualização existente."""
    local_data = load_visualizations(usina)
    shared_data = load_shared_visualizations()
    
    updated_vis = {
        "id": vis_id,
        "created_at": datetime.now().isoformat(),
        **payload.dict()
    }
    
    # Remove from both lists to cleanly recreate it in the correct one
    local_data = [v for v in local_data if v["id"] != vis_id]
    shared_data = [v for v in shared_data if v["id"] != vis_id]
    
    if payload.shared:
        shared_data.append(updated_vis)
    else:
        local_data.append(updated_vis)
        
    save_visualizations(usina, local_data)
    save_shared_visualizations(shared_data)
    
    return updated_vis


@router.delete("/{usina}/{vis_id}")
def delete_visualizacao(usina: str = Path(...), vis_id: str = Path(...)):
    """Deleta uma visualização existente."""
    local_data = load_visualizations(usina)
    shared_data = load_shared_visualizations()
    
    new_local = [v for v in local_data if v["id"] != vis_id]
    new_shared = [v for v in shared_data if v["id"] != vis_id]
    
    if len(new_local) == len(local_data) and len(new_shared) == len(shared_data):
        raise HTTPException(status_code=404, detail="Visualização não encontrada.")
        
    if len(new_local) != len(local_data):
        save_visualizations(usina, new_local)
        
    if len(new_shared) != len(shared_data):
        save_shared_visualizations(new_shared)
        
    return {"status": "ok"}
