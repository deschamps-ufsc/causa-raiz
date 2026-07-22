"""
Rotas de séries e Mapeamento de Séries.
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
from services.parquet_service import list_available_dates, list_series_for_dates, delete_series_from_parquet
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


@router.get("/dates/summary")
def get_dates_summary(usina: str = Query(..., description="Nome da usina")):
    """
    Retorna cada data disponível com a contagem de séries nativas e sintéticas.
    """
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        return []
    
    from services.synthetic_service import build_lookup
    synth_lookup = build_lookup(usina)
    
    result = []
    for fname in sorted(os.listdir(usina_dir)):
        if fname.endswith(".parquet") and fname != "pvsyst_data.parquet":
            date = fname.replace(".parquet", "")
            path = os.path.join(usina_dir, fname)
            try:
                schema = pq.read_schema(path)
                col_names = {f.name for f in schema if f.name != "timestamp"}
                native_count = len(col_names)
                
                # Check how many synthetic series can be computed
                synth_count = 0
                for synth_def in synth_lookup.values():
                    # a synthetic can be computed if all its required base series are present
                    s1 = synth_def.get("serie_1")
                    s2 = synth_def.get("serie_2")
                    s3 = synth_def.get("serie_3")
                    if s1 and s1 not in col_names:
                        continue
                    if s2 and str(s2).strip() != "nan" and s2 not in col_names:
                        continue
                    if s3 and str(s3).strip() != "nan" and s3 not in col_names:
                        continue
                    synth_count += 1
                    
            except Exception:
                native_count = 0
                synth_count = 0
                
            result.append({
                "date": date, 
                "series_count": native_count + synth_count,
                "nativas_count": native_count,
                "sinteticas_count": synth_count
            })
    return sorted(result, key=lambda x: x["date"])


@router.get("/dates/{date}/details")
def get_date_details(date: str, usina: str = Query(..., description="Nome da usina")):
    """
    Retorna o detalhamento das séries disponíveis na data.
    """
    try:
        series_info = list_series_for_dates(date, usina)
        
        elementos = set()
        skids = set()
        inversores = set()
        estacoes = set()
        stringboxes = set()
        trackers = set()
        strings = set()
        nao_mapeadas = []
        processadas = []
        outros = []
        
        for s in series_info:
            if s.get("mapeada"):
                elemento = s.get("elemento")
                if not elemento or str(elemento).strip() == "nan" or str(elemento).strip() == "Outros":
                    outros.append(s["coluna"])
                else:
                    elementos.add(elemento)
                
                if s.get("skid"): skids.add(s["skid"])
                if s.get("inversor"): inversores.add(s["inversor"])
                if s.get("estacao"): estacoes.add(s["estacao"])
                if s.get("stringbox"): stringboxes.add(s["stringbox"])
                if s.get("tracker"): trackers.add(s["tracker"])
                if s.get("string"): strings.add(str(s["string"]))
            else:
                if s.get("processada"):
                    processadas.append(s["coluna"])
                else:
                    nao_mapeadas.append(s["coluna"])

        def fmt(s_set):
            l = sorted(list(s_set))
            return {"count": len(l), "values": l}

        return {
            "elementos": fmt(elementos),
            "skids": fmt(skids),
            "inversores": fmt(inversores),
            "estacoes": fmt(estacoes),
            "stringboxes": fmt(stringboxes),
            "trackers": fmt(trackers),
            "strings": fmt(strings),
            "outros": {"count": len(outros), "values": sorted(outros)},
            "nao_mapeadas": {"count": len(nao_mapeadas), "values": sorted(nao_mapeadas)},
            "processadas": {"count": len(processadas), "values": sorted(processadas)}
        }
    except Exception as e:
        logger.error(f"[DATES DETAILS] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Listar séries de uma data ─────────────────────────────────────────────────

@router.get("/series", response_model=list[SeriesInfo])
def get_series(
    usina: str = Query(..., description="Nome da usina"),
    dates: str = Query(..., description="Datas no formato YYYY-MM-DD separadas por vírgula")
):
    """
    Lista todas as séries disponíveis para as datas e usina,
    enriquecidas com os metadados do Mapeamento de Séries.
    """
    try:
        series = list_series_for_dates(dates, usina)
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
    Lista os tipos de Elemento presentes no Mapeamento de Séries da usina.
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


# ── Mapeamento Mapeamento de Séries: Importar Excel ────────────────────────────────────────

@router.post("/map-series/import", response_model=MappingImportResponse)
async def import_mapping_excel(
    usina: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Importa um Excel de Mapeamento de Séries para mapear colunas a Elemento e hierarquia.
    O Excel deve ter colunas: coluna_excel | elemento | skid | inversor | stringbox | string
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


# ── Mapeamento Mapeamento de Séries: Salvar via JSON ───────────────────────────────────────

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


# ── Mapeamento Mapeamento de Séries: Validar contra Parquet ────────────────────────────────

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


# ── Mapeamento Mapeamento de Séries: Download de Template ──────────────────────────────────

@router.get("/map-series/template")
def download_template(
    usina: Optional[str] = Query(None, description="Usina para preencher dados"),
    date: Optional[str] = Query(None, description="Se informado, pré-preenche com colunas do Parquet")
):
    """
    Baixa um Excel template para o usuário preencher o Mapeamento de Séries.
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


# ── Deleção de Séries ─────────────────────────────────────────────────────────

from pydantic import BaseModel

class DeleteSeriesRequest(BaseModel):
    usina: str
    series: list[str]
    dates: list[str] = ["all"]  # ou datas específicas

@router.delete("/series")
def delete_series(req: DeleteSeriesRequest):
    """
    Remove séries específicas dos arquivos Parquet da usina.
    """
    if not req.series:
        raise HTTPException(status_code=400, detail="Nenhuma série informada para exclusão.")
        
    try:
        result = delete_series_from_parquet(req.usina, req.dates, req.series)
        return {
            "status": "success",
            "message": f"{result['columns_dropped']} séries removidas e {result['files_deleted']} arquivos vazios deletados.",
            "data": result
        }
    except Exception as e:
        logger.error(f"[DELETE] Erro ao deletar séries: {e}")
        raise HTTPException(status_code=500, detail=str(e))
