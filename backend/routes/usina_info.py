"""
Rotas de Infos Usina (tabela Série × Qtde Módulos × Wp).
"""
import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse

from services.usina_info_service import (
    load_usina_info,
    import_info_from_excel,
    generate_info_template,
)
from utils.logger import logger

router = APIRouter(tags=["Infos Usina"])


@router.get("/usina-info")
def get_usina_info(usina: str = Query(...)):
    """Retorna o dicionário de infos configuradas por série."""
    return load_usina_info(usina)


@router.post("/usina-info/import")
async def import_usina_info(
    usina: str = Form(...),
    file: UploadFile = File(...),
):
    """Importa Excel com colunas: Série Temporal | Qtde Módulos | Wp."""
    if not usina:
        raise HTTPException(status_code=400, detail="Usina não informada.")
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Apenas arquivos Excel aceitos.")

    content = await file.read()
    try:
        stats = import_info_from_excel(content, usina)
        return stats
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"[USINA_INFO IMPORT] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usina-info/template")
def download_info_template():
    """Baixa o template Excel para preenchimento de Infos Usina."""
    excel_bytes = generate_info_template()
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_infos_usina.xlsx"},
    )
