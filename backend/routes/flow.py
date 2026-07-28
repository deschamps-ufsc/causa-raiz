import json
import os
import uuid
import threading
from typing import Any
from fastapi import APIRouter, HTTPException, Path, Body
from utils.config import DATA_DIR
from utils.logger import logger

from services.flow_service import run_flow_processing, get_flow_integrals

router = APIRouter(prefix="/flow", tags=["Fluxograma"])

# ── Armazenamento de tarefas em memória ────────────────────────────────────────
# Guarda o estado de cada task de processamento do fluxograma.
# Estrutura: { task_id: { status, progress, total, current_day, message, result } }
_flow_tasks = {}
_flow_tasks_lock = threading.Lock()


def get_flow_path(usina: str) -> str:
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        os.makedirs(usina_dir, exist_ok=True)
    return os.path.join(usina_dir, "flow_config.json")


def _run_flow_in_background(task_id: str, usina: str, dates: str):
    """Executa o processamento do fluxograma em uma thread separada."""
    def on_progress(day_idx, total, date_str):
        with _flow_tasks_lock:
            _flow_tasks[task_id].update({
                "progress": day_idx,
                "total": total,
                "current_day": date_str,
            })

    try:
        result = run_flow_processing(usina, dates, progress_callback=on_progress)
        with _flow_tasks_lock:
            if result.get("status") == "error":
                _flow_tasks[task_id].update({
                    "status": "error",
                    "message": result.get("message", "Erro desconhecido"),
                })
            else:
                _flow_tasks[task_id].update({
                    "status": "done",
                    "result": result,
                })
    except Exception as e:
        logger.error(f"[FLOW TASK] Erro na task {task_id}: {e}")
        with _flow_tasks_lock:
            _flow_tasks[task_id].update({
                "status": "error",
                "message": str(e),
            })


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
    """Inicia o processamento do fluxograma em background e retorna um task_id para polling."""
    task_id = uuid.uuid4().hex[:12]
    
    with _flow_tasks_lock:
        _flow_tasks[task_id] = {
            "status": "processing",
            "progress": 0,
            "total": 0,
            "current_day": None,
            "message": None,
            "result": None,
        }
    
    thread = threading.Thread(
        target=_run_flow_in_background,
        args=(task_id, usina, dates),
        daemon=True,
    )
    thread.start()
    
    logger.info(f"[FLOW] Task {task_id} iniciada para {usina} com datas: {dates}")
    return {"status": "started", "task_id": task_id}

@router.get("/{usina}/status/{task_id}")
def get_flow_status(usina: str = Path(...), task_id: str = Path(...)):
    """Retorna o status atual de uma task de processamento do fluxograma."""
    with _flow_tasks_lock:
        task = _flow_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada.")
    
    return task

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
