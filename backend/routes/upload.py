"""
Rota POST /upload — Recebe Excel, converte para Parquet.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from models.schemas import UploadResponse
from services.excel_service import process_excel
from utils.logger import logger
from routes.auth import require_analyst_or_admin
import os
import json
import pandas as pd
from utils.config import DATA_DIR

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("", response_model=UploadResponse)
async def upload_excel(usina: str = Form(...), skip_unmapped: bool = Form(False), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):

    """
    Recebe um arquivo Excel diário da usina solar.
    Converte para Parquet e retorna metadados vinculados à usina informada.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos Excel (.xlsx, .xls) são aceitos.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    logger.info(f"[UPLOAD] Recebendo: '{file.filename}' para usina '{usina}'")
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    try:
        result = process_excel(content, file.filename, usina.strip(), skip_unmapped)
    except Exception as e:
        logger.error(f"[UPLOAD] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar Excel: {str(e)}")

    return UploadResponse(
        filename=file.filename,
        date=result["date"],
        series_count=result["series_count"],
        cached=result["cached"],
    )

def get_mapa_path(usina: str) -> str:
    return os.path.join(DATA_DIR, usina.strip(), "mapa_layout.json")

@router.post("/mapa")
async def upload_mapa_excel(usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):
    """
    Recebe o Excel com o mapeamento visual (layout em grid) da usina.
    As posições das células correspondem à posição física das strings.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos Excel (.xlsx, .xls) são aceitos.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    try:
        content = await file.read()
        import io
        df = pd.read_excel(io.BytesIO(content), header=None)
        
        layout = []
        for row_idx, row in df.iterrows():
            for col_idx, value in row.items():
                if pd.notna(value) and str(value).strip():
                    layout.append({
                        "row": int(row_idx),
                        "col": int(col_idx),
                        "label": str(value).strip()
                    })
        
        path = get_mapa_path(usina)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(layout, f, indent=2, ensure_ascii=False)
            
        return {"message": "Mapa de layout salvo com sucesso", "count": len(layout)}
        
    except Exception as e:
        logger.error(f"[UPLOAD_MAPA] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar Mapa: {str(e)}")

from fastapi import Query

@router.get("/mapa")
async def get_mapa_layout(usina: str = Query(...)):
    """
    Retorna o JSON do layout do mapa para o frontend.
    """
    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    path = get_mapa_path(usina)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []
