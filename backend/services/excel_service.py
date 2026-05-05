"""
Serviço de processamento de arquivos Excel.
Responsável por:
  - Ler o Excel bruto (podendo ter ~10k colunas)
  - Parsear o timestamp no formato DD/MM/YYYY HH:MM:SS
  - Salvar como Parquet na pasta data/
  - Cache por MD5 para evitar reprocessamento
"""
import hashlib
import json
import os

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from utils.config import (
    DATA_DIR,
    MD5_CACHE_FILE,
    TIMESTAMP_COL_INDEX,
    TIMESTAMP_DAYFIRST,
)
from utils.logger import logger


# ── Helpers de cache ──────────────────────────────────────────────────────────

def _load_cache() -> dict:
    if os.path.exists(MD5_CACHE_FILE):
        with open(MD5_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_cache(cache: dict) -> None:
    with open(MD5_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def _md5_of_bytes(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()


# ── Função principal ──────────────────────────────────────────────────────────

def process_excel(content: bytes, original_filename: str, usina: str) -> dict:
    """
    Lê o Excel, converte para Parquet e retorna metadados.

    Args:
        content: bytes do arquivo Excel
        original_filename: nome original para logging
        usina: nome da usina à qual o arquivo pertence

    Returns:
        dict com keys: date (str), series_count (int), cached (bool), parquet_path (str)
    """
    usina_dir = os.path.join(DATA_DIR, usina)
    os.makedirs(usina_dir, exist_ok=True)

    # ── Verificar cache por MD5 + Usina ──────────────────────────────────────
    file_md5 = _md5_of_bytes(content)
    cache_key = f"{file_md5}_{usina}"
    cache = _load_cache()

    if cache_key in cache:
        cached_info = cache[cache_key]
        logger.info(
            f"[CACHE HIT] '{original_filename}' de '{usina}' já processado → {cached_info['parquet_path']}"
        )
        return {**cached_info, "cached": True}

    # ── Ler Excel ────────────────────────────────────────────────────────────
    logger.info(f"[EXCEL] Lendo '{original_filename}' para usina '{usina}' ({len(content)/1024/1024:.2f} MB)...")

    import io
    df = pd.read_excel(
        io.BytesIO(content),
        engine="openpyxl",
        parse_dates=False,          # Vamos parsear manualmente
    )

    logger.info(f"[EXCEL] Lido: {df.shape[0]} linhas × {df.shape[1]} colunas")

    # ── Parsear timestamp (sempre primeira coluna) ────────────────────────────
    ts_col = df.columns[TIMESTAMP_COL_INDEX]
    logger.info(f"[EXCEL] Coluna de timestamp detectada: '{ts_col}'")

    df[ts_col] = pd.to_datetime(
        df[ts_col].astype(str).str.strip(),
        dayfirst=TIMESTAMP_DAYFIRST,
        errors="coerce",
    )

    # Renomear para nome padronizado
    df = df.rename(columns={ts_col: "timestamp"})
    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    # ── Detectar data do arquivo ──────────────────────────────────────────────
    detected_date = df["timestamp"].dt.date.iloc[0].isoformat()  # "2025-12-04"
    parquet_path = os.path.join(usina_dir, f"{detected_date}.parquet")

    # ── Salvar como Parquet ───────────────────────────────────────────────────
    logger.info(f"[PARQUET] Salvando em '{parquet_path}'...")
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(
        table,
        parquet_path,
        compression="snappy",       # Compressão rápida, boa para leitura
    )

    series_count = len(df.columns) - 1  # Exclui timestamp
    logger.info(f"[PARQUET] Salvo! {series_count} séries, data={detected_date}")

    # ── Salvar no cache ───────────────────────────────────────────────────────
    result = {
        "date": detected_date,
        "series_count": series_count,
        "parquet_path": parquet_path,
        "cached": False,
    }
    cache[cache_key] = {k: v for k, v in result.items() if k != "cached"}
    _save_cache(cache)

    return result
