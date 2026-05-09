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

def save_visualizations(usina: str, data: list[dict]):
    path = get_vis_path(usina)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Erro ao salvar visualizações de {usina}: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao salvar visualização.")


@router.get("/{usina}", response_model=list[VisualizationResponse])
def get_visualizacoes(usina: str = Path(...)):
    """Lista todas as visualizações salvas para uma usina."""
    return load_visualizations(usina)


@router.post("/{usina}", response_model=VisualizationResponse)
def create_visualizacao(payload: VisualizationPayload, usina: str = Path(...)):
    """Cria uma nova visualização."""
    data = load_visualizations(usina)
    
    new_vis = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now().isoformat(),
        **payload.dict()
    }
    
    data.append(new_vis)
    save_visualizations(usina, data)
    return new_vis


@router.put("/{usina}/{vis_id}", response_model=VisualizationResponse)
def update_visualizacao(payload: VisualizationPayload, usina: str = Path(...), vis_id: str = Path(...)):
    """Atualiza (sobrescreve) uma visualização existente."""
    data = load_visualizations(usina)
    
    for i, vis in enumerate(data):
        if vis["id"] == vis_id:
            updated_vis = {
                "id": vis_id,
                "created_at": datetime.now().isoformat(), # Atualiza o timestamp
                **payload.dict()
            }
            data[i] = updated_vis
            save_visualizations(usina, data)
            return updated_vis
            
    raise HTTPException(status_code=404, detail="Visualização não encontrada.")


@router.delete("/{usina}/{vis_id}")
def delete_visualizacao(usina: str = Path(...), vis_id: str = Path(...)):
    """Deleta uma visualização existente."""
    data = load_visualizations(usina)
    
    new_data = [vis for vis in data if vis["id"] != vis_id]
    
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="Visualização não encontrada.")
        
    save_visualizations(usina, new_data)
    return {"status": "ok"}
