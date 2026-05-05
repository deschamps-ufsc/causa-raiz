"""
Rotas de séries e mapeamento DE-PARA.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse
from typing import Optional

from models.schemas import (
    SeriesInfo,
    SeriesMapRequest,
    MappingImportResponse,
    MappingValidationResponse,
)
from services.parquet_service import list_available_dates, list_series_for_date
from services.mapping_service import (
    load_mapping,
    save_mapping,
    import_from_excel,
    validate_mapping_against_parquet,
    generate_template_excel,
    get_mapping_summary,
)
import pyarrow.parquet as pq
from utils.config import DATA_DIR, ELEMENTOS_VALIDOS
from utils.logger import logger
import os

router = APIRouter(tags=["Séries & Mapeamento"])


# ── Datas disponíveis ─────────────────────────────────────────────────────────

@router.get("/dates", response_model=list[str])
def get_available_dates(usina: str = Query(..., description="Nome da usina para listar datas")):
    """Lista todas as datas com dados Parquet disponíveis para a usina."""
    return list_available_dates(usina)


# ── Listar séries de uma data ─────────────────────────────────────────────────

@router.get("/series", response_model=list[SeriesInfo])
def get_series(
    usina: str = Query(..., description="Nome da usina"),
    date: str = Query(..., description="Data no formato YYYY-MM-DD")
):
    """
    Lista todas as séries disponíveis para uma data e usina,
    enriquecidas com os metadados do mapeamento DE-PARA.
    """
    try:
        series = list_series_for_date(date, usina)
        return [SeriesInfo(**s) for s in series]
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"[SERIES] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Elementos válidos ─────────────────────────────────────────────────────────

@router.get("/elementos", response_model=list[str])
def get_elementos(usina: str = Query(None, description="Usina para derivar os elementos do mapeamento")):
    """
    Lista os tipos de Elemento presentes no mapeamento DE-PARA da usina.
    Se a usina não for informada ou não tiver mapeamento, retorna a lista padrão.
    """
    if usina:
        from services.mapping_service import load_mapping
        mapping = load_mapping(usina)
        if mapping:
            elementos = sorted({
                v.get("elemento") for v in mapping.values()
                if v.get("elemento") and v.get("elemento") != "nan"
            })
            if elementos:
                return elementos
    return ELEMENTOS_VALIDOS


# ── Mapeamento DE-PARA: Importar Excel ────────────────────────────────────────

@router.post("/map-series/import", response_model=MappingImportResponse)
async def import_mapping_excel(
    usina: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Importa um Excel DE-PARA para mapear colunas a Elemento e hierarquia.
    O Excel deve ter colunas: coluna_excel | elemento | skid | inversor | stringbox
    """
    if not usina:
        raise HTTPException(status_code=400, detail="Usina não informada.")
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Apenas arquivos Excel aceitos.")

    content = await file.read()
    try:
        stats = import_from_excel(content, usina)
        return MappingImportResponse(**stats)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"[MAPPING IMPORT] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/map-series/summary", response_model=MappingImportResponse)
def get_mapping_summary_endpoint(usina: str = Query(...)):
    """
    Retorna as estatísticas do mapeamento atual da usina.
    """
    try:
        stats = get_mapping_summary(usina)
        return MappingImportResponse(**stats)
    except Exception as e:
        logger.error(f"[MAPPING SUMMARY] Erro ao obter resumo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/map-series/data")
def get_mapping_data_endpoint(usina: str = Query(...)):
    """
    Retorna o mapeamento bruto atual da Usina.
    """
    return load_mapping(usina)


# ── Mapeamento DE-PARA: Salvar via JSON ───────────────────────────────────────

@router.post("/map-series")
def save_series_map(body: SeriesMapRequest, usina: str = Query(...)):
    """Salva mapeamento enviado como JSON (alternativa ao Excel)."""
    mapping = load_mapping(usina)
    for entry in body.mapeamentos:
        mapping[entry.coluna_excel] = {
            "elemento": entry.elemento,
            "skid": entry.skid,
            "inversor": entry.inversor,
            "stringbox": entry.stringbox,
            "estacao": entry.estacao,
            "string": entry.string,
        }
    save_mapping(mapping, usina)
    return {"saved": len(body.mapeamentos), "total": len(mapping)}


# ── Mapeamento DE-PARA: Validar contra Parquet ────────────────────────────────

@router.get("/map-series/validate", response_model=MappingValidationResponse)
def validate_mapping(
    usina: str = Query(...),
    date: str = Query(..., description="Data YYYY-MM-DD para validar")
):
    """
    Cruza as colunas do Parquet com o mapeamento atual.
    Útil para saber quais séries ainda não foram mapeadas.
    """
    parquet_path = os.path.join(DATA_DIR, usina, f"{date}.parquet")
    if not os.path.exists(parquet_path):
        raise HTTPException(status_code=404, detail=f"Parquet não encontrado para {date}")

    schema = pq.read_schema(parquet_path)
    cols = [f.name for f in schema if f.name != "timestamp"]
    result = validate_mapping_against_parquet(cols, usina)
    return MappingValidationResponse(**result)


# ── Mapeamento DE-PARA: Download de Template ──────────────────────────────────

@router.get("/map-series/template")
def download_template(
    usina: Optional[str] = Query(None, description="Usina para preencher dados"),
    date: Optional[str] = Query(None, description="Se informado, pré-preenche com colunas do Parquet")
):
    """
    Baixa um Excel template para o usuário preencher o DE-PARA.
    Se 'date' for informado, pré-preenche com as colunas já existentes.
    """
    import io
    colunas = None
    if usina and date:
        parquet_path = os.path.join(DATA_DIR, usina, f"{date}.parquet")
        if os.path.exists(parquet_path):
            schema = pq.read_schema(parquet_path)
            colunas = [f.name for f in schema if f.name != "timestamp"]

    excel_bytes = generate_template_excel(colunas)

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_de_para.xlsx"},
    )
