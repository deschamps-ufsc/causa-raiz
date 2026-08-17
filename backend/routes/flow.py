import json
import os
import uuid
import threading
from typing import Any
from fastapi import APIRouter, HTTPException, Path, Body, BackgroundTasks
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


@router.post("/{usina}/integrals/start")
def start_integrals(usina: str = Path(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    """Inicia o cálculo das integrais diárias em background."""
    from services.flow_service import start_integrals_task, run_integrals_background
    try:
        task_id = start_integrals_task(usina)
        background_tasks.add_task(run_integrals_background, task_id, usina)
        return {"status": "started", "task_id": task_id}
    except Exception as e:
        logger.error(f"Erro ao iniciar cálculo de integrais de {usina}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{usina}/integrals/status/{task_id}")
def get_integrals_status(usina: str = Path(...), task_id: str = Path(...)):
    """Retorna o status do cálculo das integrais."""
    from services.flow_service import INTEGRALS_TASKS
    task = INTEGRALS_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada.")
    return task

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

from pydantic import BaseModel
from typing import List, Optional

class ExportPvsystRequest(BaseModel):
    dates: Optional[List[str]] = None

@router.post("/{usina}/export-pvsyst/start")
def start_export_pvsyst_route(usina: str, request: ExportPvsystRequest, background_tasks: BackgroundTasks):
    from services.flow_service import start_export_pvsyst_task, run_export_pvsyst_background
    task_id = start_export_pvsyst_task(usina, request.dates)
    background_tasks.add_task(run_export_pvsyst_background, task_id, usina, request.dates)
    return {"task_id": task_id}

@router.get("/{usina}/export-pvsyst/status/{task_id}")
def status_export_pvsyst_route(usina: str, task_id: str):
    from services.flow_service import EXPORT_TASKS
    task = EXPORT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"progress": task["progress"], "status": task["status"], "error": task["error"]}

@router.get("/{usina}/export-pvsyst/download/{task_id}")
def download_export_pvsyst_route(usina: str, task_id: str):
    from fastapi.responses import FileResponse
    from services.flow_service import EXPORT_TASKS
    task = EXPORT_TASKS.get(task_id)
    if not task or task["status"] != "done" or not task["file_path"]:
        raise HTTPException(status_code=404, detail="File not ready or task not found")
        
    return FileResponse(
        path=task["file_path"],
        media_type="text/csv",
        filename=f"export_pvsyst_{usina}.csv"
    )

@router.get("/{usina}/fluxograma-chart")
def get_fluxograma_chart(usina: str, date: str):
    import pandas as pd
    import numpy as np
    file_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Data not found for the requested date")
    
    try:
        df = pd.read_parquet(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading data: {str(e)}")

    def get_series(col_name):
        valid_col = f"{col_name}_válida"
        if col_name in df.columns and df[col_name].notna().any():
            return df[col_name].replace({np.nan: None}).tolist()
        if valid_col in df.columns and df[valid_col].notna().any():
            return df[valid_col].replace({np.nan: None}).tolist()
        return [None] * len(df)

    if 'timestamp' in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df['timestamp']):
            timestamps = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist()
        else:
            timestamps = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d %H:%M:%S').tolist()
    else:
        timestamps = df.index.tolist()

    gpoa = get_series("gpoa")
    grear = get_series("grear")
    geff = get_series("geff")
    tamb = get_series("tamb")
    tmod = get_series("tmod")
    tcel = get_series("tcel")
    energia_pmi = get_series("Energia PMI")
    energia_pmi_valida = get_series("Energia PMI_válida")
    e_grid_ajustada_corr = get_series("E_Grid_Ajustada_Corr_Unidade_válida")
    
    # Curtailment
    potencia_ppc = get_series("potencia_ppc")
    potencia_ppc_15min = get_series("Potência PPC_15min")
    referencia_ppc = get_series("referencia_ppc")
    referencia_ppc_15min = get_series("Referência PPC_15min")

    # Strings Perdida (e novas séries do gráfico)
    potencia_cc_strings_perdida = get_series("Potência CC Strings Perdida Não OK")
    potencia_cc_strings_perdida_corrigida = get_series("Potência CC Strings Perdida Não OK Corrigida")
    potencia_ca_recuperavel = get_series("Potência CA Recuperável_válida")
    potencia_ca_vaga = get_series("Potência CA Vaga_válida")
    e_grid_ajustada_mw = get_series("E_Grid_Ajustada_MW_válida")
    
    # Dados válidos e Flags
    dados_validos = get_series("Dados Válidos")
    flag_curtailment = get_series("curtailment")
    
    return {
        "timestamps": timestamps,
        "gpoa": gpoa,
        "grear": grear,
        "geff": geff,
        "tamb": tamb,
        "tmod": tmod,
        "tcel": tcel,
        "energia_pmi": energia_pmi,
        "energia_pmi_valida": energia_pmi_valida,
        "e_grid_ajustada_corr": e_grid_ajustada_corr,
        "potencia_ppc": potencia_ppc,
        "potencia_ppc_15min": potencia_ppc_15min,
        "referencia_ppc": referencia_ppc,
        "referencia_ppc_15min": referencia_ppc_15min,
        "potencia_cc_strings_perdida": potencia_cc_strings_perdida,
        "potencia_cc_strings_perdida_corrigida": potencia_cc_strings_perdida_corrigida,
        "potencia_ca_recuperavel": potencia_ca_recuperavel,
        "potencia_ca_vaga": potencia_ca_vaga,
        "e_grid_ajustada_mw": e_grid_ajustada_mw,
        "dados_validos": dados_validos,
        "flag_curtailment": flag_curtailment
    }
