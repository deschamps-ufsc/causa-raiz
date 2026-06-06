"""
Serviço de acesso aos arquivos Parquet.
Responsável por:
  - Listar datas disponíveis
  - Listar séries (colunas) de um dia
  - Consultar dados de forma colunar eficiente
"""
import os
from datetime import datetime
from typing import Optional

import pandas as pd
import pyarrow.parquet as pq

from utils.config import DATA_DIR
from utils.logger import logger
from services.mapping_service import get_series_info


# ── Listar datas ──────────────────────────────────────────────────────────────

def list_available_dates(usina: str) -> list[str]:
    """Retorna lista de datas com Parquet disponível, ordenada decrescente para a usina."""
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        return []
    dates = []
    for fname in os.listdir(usina_dir):
        if fname.endswith(".parquet"):
            dates.append(fname.replace(".parquet", ""))
    return sorted(dates)


# ── Listar séries de uma data ─────────────────────────────────────────────────

def list_series_for_dates(dates_str: str, usina: str) -> list[dict]:
    """
    Lê apenas o schema dos Parquets de múltiplas datas (sem carregar dados) e retorna
    os metadados unidos de cada série enriquecidos com o mapeamento Mapeamento de Séries.

    Args:
        dates_str: "YYYY-MM-DD,YYYY-MM-DD"
        usina: Nome da usina

    Returns:
        Lista de dicts com keys: coluna, elemento, skid, inversor, stringbox, string, mapeada
    """
    colunas_set = set()
    dates = [d.strip() for d in dates_str.split(",") if d.strip()]
    
    for date in dates:
        path = _parquet_path(date, usina)
        if os.path.exists(path):
            schema = pq.read_schema(path)
            colunas_set.update(f.name for f in schema if f.name != "timestamp")
        
        # Incluir séries processadas (agregadores)
        processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            colunas_set.update(f.name for f in schema_proc if f.name != "timestamp")
    
    if not colunas_set:
        raise FileNotFoundError(f"Nenhum dado encontrado para as datas: {dates_str}")
    from services.mapping_service import load_mapping
    mapping = load_mapping(usina)
    
    result = []
    for col in colunas_set:
        info = mapping.get(col, {})
        
        elemento = info.get("elemento")
        # Preencher elemento para séries sintéticas
        if not elemento:
            if col in ["gpoa", "grear", "geff"]:
                elemento = "Irradiação"
            elif col in ["tamb", "tmod", "tcel"]:
                elemento = "Temperatura"
            elif col == "sujidade":
                elemento = "Sujidade"
            elif col == "tracker" or col == "Tracker Ref." or col.startswith("flag_tracker") or col.startswith("Tracker_is"):
                elemento = "Tracker"
            elif col == "energia":
                elemento = "Potência CA PPC"
            elif col == "energia_pmi":
                elemento = "Energia PMI"

        result.append({
            "coluna": col,
            "elemento": elemento,
            "skid": info.get("skid"),
            "inversor": info.get("inversor"),
            "stringbox": info.get("stringbox"),
            "string": info.get("string"),
            "estacao": info.get("estacao"),
            "mapeada": col in mapping,
        })

    return result


# ── Consultar dados ────────────────────────────────────────────────────────────

def query_data(
    dates_str: str,
    usina: str,
    series: Optional[list[str]] = None,
    elemento: Optional[str] = None,
    skid: Optional[str] = None,
    start_time: Optional[str] = None,    # "HH:MM"
    end_time: Optional[str] = None,       # "HH:MM"
) -> dict:
    """
    Lê dados de múltiplos Parquets de forma colunar (só as colunas solicitadas).

    Returns:
        { "timestamps": [...], "series": { "col": [...] }, "total_pontos": N }
    """
    dates = [d.strip() for d in dates_str.split(",") if d.strip()]
    if not dates:
        raise ValueError("Nenhuma data informada.")

    # ── Resolver quais colunas carregar (baseado no primeiro dia disponível) ──
    cols_to_load = []
    for date in dates:
        path = _parquet_path(date, usina)
        if os.path.exists(path):
            cols_to_load = _resolve_columns(path, usina, series, elemento, skid)
            break
    
    if not cols_to_load:
        return {"timestamps": [], "series": {}, "total_pontos": 0}

    # ── Detectar séries sintéticas ────────────────────────────────────────────
    from services.synthetic_service import build_lookup, compute_synthetic, get_source_cols
    synth_lookup = build_lookup(usina)
    synth_requested = {col: synth_lookup[col] for col in cols_to_load if col in synth_lookup}
    final_cols = [c for c in cols_to_load if c not in synth_requested]
    for synth_def in synth_requested.values():
        for src in get_source_cols(synth_def):
            if src not in final_cols:
                final_cols.append(src)

    logger.info(
        f"[QUERY] dates={dates_str} | {len(cols_to_load)} séries ({len(synth_requested)} sintéticas) | "
        f"start={start_time} end={end_time}"
    )

    # ── Leitura colunar e reindexação por dia ─────────────────────────────────
    dfs = []
    for date in dates:
        path = _parquet_path(date, usina)
        processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
        
        df_day = None
        
        # 1. Tentar ler dados brutos
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = [f.name for f in schema]
            read_cols = [c for c in final_cols if c in parquet_cols]
            df_day = pd.read_parquet(path, columns=["timestamp"] + read_cols)
        
        # 2. Tentar ler dados processados (agregadores)
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = [f.name for f in schema_proc if f.name != "timestamp"]
            read_proc = [c for c in final_cols if c in proc_cols]
            
            if read_proc:
                df_proc = pd.read_parquet(processed_path, columns=["timestamp"] + read_proc)
                if df_day is not None:
                    # Garantir que timestamps batam para o merge
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                else:
                    df_day = df_proc
        
        if df_day is None:
            logger.warning(f"Nenhum dado (bruto ou processado) para data {date}")
            continue

        if start_time or end_time:
            df_day = _apply_time_filter(df_day, date, start_time, end_time)
            
        df_day = _reindex_to_full_period(df_day, date, start_time, end_time)
        dfs.append(df_day)

    if not dfs:
        raise FileNotFoundError(f"Nenhum Parquet encontrado para usina {usina} nas datas {dates_str}")

    df = pd.concat(dfs, ignore_index=True)

    # ── Calcular séries sintéticas ────────────────────────────────────────────
    for synth_name, synth_def in synth_requested.items():
        try:
            df[synth_name] = compute_synthetic(df, synth_def)
        except Exception as e:
            logger.warning(f"[SYNTHETIC] Erro ao calcular '{synth_name}': {e}")
            df[synth_name] = None

    # ── Montar resposta ───────────────────────────────────────────────────────
    timestamps = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S").tolist()
    series_data = {}
    for col in cols_to_load:   # responde apenas o que foi pedido (incl. sintéticas)
        if col in df.columns:
            series_data[col] = df[col].where(pd.notnull(df[col]), None).tolist()

    return {
        "timestamps": timestamps,
        "series": series_data,
        "total_pontos": len(timestamps),
    }


# ── Helpers privados ──────────────────────────────────────────────────────────

def _parquet_path(date: str, usina: str) -> str:
    return os.path.join(DATA_DIR, usina, f"{date}.parquet")


def _resolve_columns(
    path: str,
    usina: str,
    series: Optional[list[str]],
    elemento: Optional[str],
    skid: Optional[str],
) -> list[str]:
    """
    Determina quais colunas retornar baseado nos filtros.
    Se series[] foi passado explicitamente, usa ele.
    Caso contrário filtra por elemento/skid via mapeamento.
    """
    from services.mapping_service import load_mapping

    if series:
        return series

    # Filtrar via mapeamento
    if elemento or skid:
        schema = pq.read_schema(path)
        all_cols = [f.name for f in schema if f.name != "timestamp"]
        mapping = load_mapping(usina)

        filtered = []
        for col in all_cols:
            info = mapping.get(col, {})
            if elemento and info.get("elemento") != elemento:
                continue
            if skid and info.get("skid") != skid:
                continue
            filtered.append(col)
        return filtered

    return []


def _apply_time_filter(df: pd.DataFrame, date: str, start: str, end: str) -> pd.DataFrame:
    """Filtra o DataFrame pelo intervalo de hora (HH:MM)."""
    if start:
        start_dt = pd.Timestamp(f"{date}T{start}:00")
        df = df[df["timestamp"] >= start_dt]
    if end:
        end_dt = pd.Timestamp(f"{date}T{end}:59")
        df = df[df["timestamp"] <= end_dt]
    return df


def _reindex_to_full_period(
    df: pd.DataFrame,
    date: str,
    start_time: str,
    end_time: str,
) -> pd.DataFrame:
    """
    Garante que o DataFrame cobre o período completo configurado, minuto a minuto.
    Timestamps ausentes no arquivo original são preenchidos com NaN (→ null no JSON).

    Isso permite que o gráfico e a tabela sempre exibam o eixo X completo,
    mesmo quando a planilha não contém todas as linhas do dia.
    """
    start_str = start_time if start_time else "00:00"
    end_str   = end_time   if end_time   else "23:59"

    full_index = pd.date_range(
        start=pd.Timestamp(f"{date}T{start_str}:00"),
        end=pd.Timestamp(f"{date}T{end_str}:00"),
        freq="1min",
    )
    full_df = pd.DataFrame({"timestamp": full_index})

    # Normalizar timestamps para truncar segundos fracionários
    df = df.copy()
    df["timestamp"] = df["timestamp"].dt.floor("min")

    # Left join: mantém todos os minutos do período, preenche lacunas com NaN
    merged = full_df.merge(df, on="timestamp", how="left")
    return merged
