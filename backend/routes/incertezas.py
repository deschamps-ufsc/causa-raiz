from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import logging

from services.incertezas_service import run_uncertainty_simulations

router = APIRouter(prefix="/incertezas", tags=["Incertezas"])
logger = logging.getLogger(__name__)

class IncertezaPayload(BaseModel):
    usina: str
    dates: List[str]
    uncertainties: Dict[str, float]
    nodes: List[Dict[str, Any]]

@router.post("/simulate")
def simulate_uncertainties(payload: IncertezaPayload):
    """
    Roda as simulações de incerteza (nominal, min, max) para cada variável
    e retorna o somatório de energia de cada cenário.
    """
    try:
        logger.info(f"[UNCERTAINTY] Iniciando simulações de incerteza para {payload.usina} nas datas {payload.dates}")
        results = run_uncertainty_simulations(
            usina=payload.usina,
            dates=payload.dates,
            uncertainties=payload.uncertainties,
            nodes=payload.nodes
        )
        return {"status": "ok", "results": results}
    except Exception as e:
        logger.error(f"[UNCERTAINTY] Erro na simulação: {e}")
        raise HTTPException(status_code=500, detail=str(e))
