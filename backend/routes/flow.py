import json
import os
from typing import Any
from fastapi import APIRouter, HTTPException, Path, Body
from utils.config import DATA_DIR
from utils.logger import logger

from services.flow_service import run_flow_processing, get_flow_integrals

router = APIRouter(prefix="/flow", tags=["Fluxograma"])

def get_flow_path(usina: str) -> str:
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        os.makedirs(usina_dir, exist_ok=True)
    return os.path.join(usina_dir, "flow_config.json")

@router.get("/{usina}/integrals")
def get_integrals(usina: str = Path(...)):
    """Calcula e retorna as integrais diárias de cada variável do fluxograma."""
    try:
        return get_flow_integrals(usina)
    except Exception as e:
        logger.error(f"Erro ao calcular integrais de {usina}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{usina}/run")
def run_flow(usina: str = Path(...), dates: str = None):
    """Executa o processamento do fluxograma para a usina. Se dates for informado (YYYY-MM-DD,YYYY-MM-DD) processa apenas estes dias."""
    try:
        from services.flow_service import run_flow_processing
        result = run_flow_processing(usina, dates)
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return result
    except Exception as e:
        logger.error(f"Erro ao processar fluxograma de {usina}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{usina}")
def get_flow_config(usina: str = Path(...)):
    """Retorna a configuração do fluxograma para uma usina."""
    path = get_flow_path(usina)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Erro ao carregar flow_config de {usina}: {e}")
        return []

@router.post("/{usina}")
def save_flow_config(usina: str = Path(...), config: Any = Body(...)):
    """Salva a configuração do fluxograma para uma usina."""
    path = get_flow_path(usina)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro ao salvar flow_config de {usina}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar configuração do fluxograma.")

@router.get("/{usina}/export-pvsyst")
def export_pvsyst_route(usina: str = Path(...)):
    """Exporta as séries filtradas em formato XLSX para o PVSyst."""
    from fastapi.responses import StreamingResponse
    from services.flow_service import export_pvsyst_xlsx
    import io

    excel_data = export_pvsyst_xlsx(usina)
    if not excel_data:
        raise HTTPException(status_code=404, detail="Dados não encontrados ou não processados.")

    return StreamingResponse(
        io.BytesIO(excel_data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=export_pvsyst_{usina}.xlsx"}
    )

