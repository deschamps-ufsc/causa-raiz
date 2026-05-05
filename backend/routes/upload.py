"""
Rota POST /upload — Recebe Excel, converte para Parquet.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from models.schemas import UploadResponse
from services.excel_service import process_excel
from utils.logger import logger
from routes.auth import require_analyst_or_admin

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("", response_model=UploadResponse)
async def upload_excel(usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):

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
        result = process_excel(content, file.filename, usina.strip())
    except Exception as e:
        logger.error(f"[UPLOAD] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar Excel: {str(e)}")

    return UploadResponse(
        filename=file.filename,
        date=result["date"],
        series_count=result["series_count"],
        cached=result["cached"],
    )
