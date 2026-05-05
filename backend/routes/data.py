"""
Rota GET /data — Retorna dados temporais filtrados.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from models.schemas import DataResponse
from services.parquet_service import query_data
from utils.config import MAX_SERIES_PER_QUERY
from utils.logger import logger

router = APIRouter(tags=["Dados"])


@router.get("/data", response_model=DataResponse)
def get_data(
    usina: str = Query(..., description="Nome da usina para consulta"),
    date: str = Query(..., description="Data no formato YYYY-MM-DD"),
    series: Optional[str] = Query(None, description="Nomes das colunas separados por vírgula"),
    elemento: Optional[str] = Query(None, description="Filtrar por tipo de Elemento"),
    skid: Optional[str] = Query(None, description="Filtrar por SKID"),
    start: Optional[str] = Query(None, description="Hora inicial HH:MM"),
    end: Optional[str] = Query(None, description="Hora final HH:MM"),
):
    """
    Retorna dados de séries temporais para uma data e usina específica.

    Estratégia de leitura: colunar (Parquet) — apenas as colunas solicitadas
    são lidas do disco, sem carregar o arquivo inteiro na memória.
    """

    # Parsear lista de séries (query param: "col1,col2,col3")
    series_list: Optional[list[str]] = None
    if series:
        series_list = [s.strip() for s in series.split(",") if s.strip()]
        if len(series_list) > MAX_SERIES_PER_QUERY:
            raise HTTPException(
                status_code=400,
                detail=f"Máximo de {MAX_SERIES_PER_QUERY} séries por consulta.",
            )

    if not series_list and not elemento and not skid:
        raise HTTPException(
            status_code=400,
            detail="Informe ao menos um de: series, elemento ou skid.",
        )

    logger.info(
        f"[DATA] Consulta: usina={usina}, date={date}, series={series_list}, "
        f"elemento={elemento}, skid={skid}, [{start} → {end}]"
    )

    try:
        result = query_data(
            date=date,
            usina=usina,
            series=series_list,
            elemento=elemento,
            skid=skid,
            start_time=start,
            end_time=end,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"[DATA] Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return DataResponse(
        date=date,
        timestamps=result["timestamps"],
        series=result["series"],
        total_pontos=result["total_pontos"],
    )
