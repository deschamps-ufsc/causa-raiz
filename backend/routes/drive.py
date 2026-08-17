import os
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from dotenv import load_dotenv
from services.drive_service import extract_folder_id, get_folder_metadata, list_drive_folder

load_dotenv()

router = APIRouter(prefix="/api/drive", tags=["Drive"])

class DriveLinkRequest(BaseModel):
    url: str

@router.post("/check-link")
def check_drive_link(req: DriveLinkRequest):
    """
    Recebe um link do Google Drive, extrai o ID e retorna os metadados da pasta raiz.
    """
    folder_id = extract_folder_id(req.url)
    if not folder_id:
        raise HTTPException(status_code=400, detail="Link inválido. Não foi possível encontrar o ID da pasta.")
        
    try:
        folder = get_folder_metadata(folder_id)
        return {"status": "success", "data": {"rootFolder": folder}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/folder/{folder_id}/files")
def get_folder_files(folder_id: str):
    """
    Lista os arquivos dentro de uma pasta específica de um dia.
    """
    try:
        files = list_drive_folder(folder_id)
        return {"status": "success", "files": files}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class DrivePreviewRequest(BaseModel):
    file_ids: list[str]

class DriveImportRequest(BaseModel):
    usina: str
    file_ids: list[str]
    skip_unmapped: bool = False
    override_date: str | None = None  # Data confirmada pelo usuário no formato YYYY-MM-DD

from services.drive_service import download_file
from services.excel_service import process_raw_file, preview_file_date

@router.post("/preview")
def preview_import(req: DrivePreviewRequest):
    """
    Faz o download dos arquivos, detecta a data e retorna para confirmação.
    Não salva nada — é apenas uma pré-visualização da data antes da importação.
    """
    try:
        detected_dates = []
        for file_id in req.file_ids:
            content, filename = download_file(file_id)
            detected = preview_file_date(content, filename)
            detected_dates.append({
                "file_id": file_id,
                "filename": filename,
                "detected_date": detected,  # YYYY-MM-DD ou None se não detectado
            })
        
        # Retorna todas as datas detectadas (normalmente serão do mesmo dia)
        return {"status": "success", "files": detected_dates}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import")
def import_drive_data(req: DriveImportRequest):
    """
    Endpoint para iniciar a importação real (download e merge).
    Se override_date for fornecida (YYYY-MM-DD), usa essa data em vez da detectada no arquivo.
    """
    total_series = 0
    try:
        for file_id in req.file_ids:
            # 1. Download do arquivo em memória
            content, filename = download_file(file_id)
            
            # 2. Processamento do arquivo (identificando formato largo ou longo) e merge
            results = process_raw_file(
                content, filename, req.usina.strip(),
                req.skip_unmapped,
                override_date=req.override_date
            )
            for r in results:
                total_series += r.get("imported_series_count", r.get("series_count", 0))
            
        return {"status": "success", "total_series": total_series, "message": "Arquivos importados e unificados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

import queue
import threading
import json
from fastapi.responses import StreamingResponse

@router.post("/import-stream")
def import_drive_data_stream(req: DriveImportRequest):
    """
    Mesmo que /import, mas retorna uma resposta em stream (SSE/NDJSON) para barra de progresso.
    """
    q = queue.Queue()
    
    def worker():
        total_series = 0
        try:
            for idx, file_id in enumerate(req.file_ids):
                q.put({
                    "status": "reading",
                    "file_idx": idx + 1,
                    "total_files": len(req.file_ids),
                    "message": f"Baixando arquivo do Google Drive...",
                    "progress": 0, "total": 0
                })
                
                content, filename = download_file(file_id)
                
                q.put({
                    "status": "processing",
                    "file_idx": idx + 1,
                    "total_files": len(req.file_ids),
                    "message": f"Analisando dados de {filename}...",
                    "progress": 0, "total": 0
                })
                
                def on_progress(curr, tot):
                    q.put({
                        "status": "importing",
                        "file_idx": idx + 1,
                        "total_files": len(req.file_ids),
                        "message": f"Importando séries de {filename}...",
                        "progress": curr, "total": tot
                    })
                    
                results = process_raw_file(
                    content, filename, req.usina.strip(),
                    req.skip_unmapped,
                    override_date=req.override_date,
                    progress_callback=on_progress
                )
                
                for r in results:
                    total_series += r.get("imported_series_count", r.get("series_count", 0))
                
            q.put({
                "status": "success", 
                "total_series": total_series, 
                "message": "Arquivos importados e unificados com sucesso."
            })
        except Exception as e:
            q.put({"status": "error", "message": str(e)})
        finally:
            q.put(None) # EOF

    threading.Thread(target=worker, daemon=True).start()

    def event_stream():
        while True:
            msg = q.get()
            if msg is None:
                break
            yield json.dumps(msg) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


class DriveExportSeriesRequest(BaseModel):
    file_ids: list[str]

@router.post("/export-series")
def export_drive_series_names(req: DriveExportSeriesRequest):
    """
    Extrai os nomes das séries dos arquivos e retorna um Excel.
    """
    from services.extract_series_service import extract_series_names
    import pandas as pd
    import io
    from fastapi.responses import StreamingResponse
    
    try:
        all_data = []
        for file_id in req.file_ids:
            content, filename = download_file(file_id)
            series = extract_series_names(content, filename)
            for s in series:
                all_data.append({"Arquivo": filename, "Série": s})
                
        df = pd.DataFrame(all_data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Séries Mapeadas')
        
        output.seek(0)
        
        headers = {
            'Content-Disposition': 'attachment; filename="series_mapeadas.xlsx"'
        }
        
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
