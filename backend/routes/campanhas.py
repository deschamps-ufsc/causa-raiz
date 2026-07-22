from fastapi import APIRouter, HTTPException, Query, Body
from typing import List, Dict, Any, Optional
import os
import json
from utils.config import DATA_DIR
from utils.logger import logger
from pydantic import BaseModel

router = APIRouter(prefix="/campanhas", tags=["Campanhas"])

CAMPANHAS_FILE = os.path.join(DATA_DIR, "campanhas.json")

class CampanhaPayload(BaseModel):
    nome: str
    dias: List[str]

def load_campanhas() -> Dict[str, Dict[str, List[str]]]:
    if not os.path.exists(CAMPANHAS_FILE):
        return {}
    try:
        with open(CAMPANHAS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Erro ao carregar campanhas: {e}")
        return {}

def save_campanhas(data: Dict[str, Dict[str, List[str]]]):
    with open(CAMPANHAS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@router.get("")
def get_campanhas(usina: str = Query(...)):
    """Retorna a lista de campanhas para uma usina, no formato [{nome, dias}]"""
    data = load_campanhas()
    usina_campanhas = data.get(usina, {})
    return [{"nome": nome, "dias": dias} for nome, dias in usina_campanhas.items()]

@router.post("")
def create_or_update_campanha(usina: str = Query(...), payload: CampanhaPayload = Body(...)):
    """Cria ou atualiza uma campanha"""
    if not payload.nome or not payload.nome.strip():
        raise HTTPException(status_code=400, detail="O nome da campanha é obrigatório.")
    
    data = load_campanhas()
    if usina not in data:
        data[usina] = {}
        
    data[usina][payload.nome.strip()] = payload.dias
    save_campanhas(data)
    
    return {"status": "success", "campanha": {"nome": payload.nome.strip(), "dias": payload.dias}}

@router.delete("")
def delete_campanha(usina: str = Query(...), nome: str = Query(...)):
    """Exclui uma campanha"""
    data = load_campanhas()
    if usina in data and nome in data[usina]:
        del data[usina][nome]
        save_campanhas(data)
    return {"status": "success", "deleted": nome}
