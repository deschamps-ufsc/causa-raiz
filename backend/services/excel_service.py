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
import numpy as np
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


def _parse_timestamp_col(series: pd.Series) -> pd.Series:
    """Converte uma coluna de timestamps usando dayfirst=True (formato DD/MM/YYYY)."""
    return pd.to_datetime(
        series.astype(str).str.strip(),
        dayfirst=TIMESTAMP_DAYFIRST,
        errors="coerce",
    )


def preview_file_date(content: bytes, filename: str) -> str | None:
    """
    Faz uma leitura rápida do arquivo e retorna a data detectada no formato YYYY-MM-DD.
    Não salva nada.
    """
    import io
    try:
        if filename.lower().endswith('.csv'):
            try:
                df = pd.read_csv(io.BytesIO(content), nrows=5, on_bad_lines='skip')
                if len(df.columns) <= 1:
                    raise ValueError("Possivelmente separador é ;")
            except Exception:
                df = pd.read_csv(io.BytesIO(content), sep=';', nrows=5, on_bad_lines='skip')
        else:
            df = pd.read_excel(io.BytesIO(content), engine="openpyxl", parse_dates=False, nrows=5)

        cols_lower = [str(c).lower().strip() for c in df.columns]
        if all(c in cols_lower for c in ['timestamp', 'tag', 'value']):
            ts_col = df.columns[cols_lower.index('timestamp')]
        else:
            ts_col = df.columns[TIMESTAMP_COL_INDEX]

        parsed = _parse_timestamp_col(df[ts_col])
        parsed = parsed.dropna()
        if parsed.empty:
            return None
        return parsed.dt.date.iloc[0].isoformat()
    except Exception:
        return None


# ── Função principal ──────────────────────────────────────────────────────────

def process_excel(content: bytes, original_filename: str, usina: str, skip_unmapped: bool = False) -> dict:
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

    # ── Identificar formato longo / híbrido / largo ──
    cols_lower = [str(c).lower().strip() for c in df.columns]
    is_long_format = all(c in cols_lower for c in ['timestamp', 'tag', 'value'])
    is_hybrid_pmi_format = all(c in cols_lower for c in ['time', 'meter_name', 'kwh_del_int', 'kwh_rec_int'])

    if is_long_format:
        logger.info(f"[EXCEL] Formato longo detectado no process_excel. Realizando pivot...")
        ts_col = df.columns[cols_lower.index('timestamp')]
        tag_col = df.columns[cols_lower.index('tag')]
        val_col = df.columns[cols_lower.index('value')]
        
        df[ts_col] = pd.to_datetime(
            df[ts_col].astype(str).str.strip(), 
            dayfirst=TIMESTAMP_DAYFIRST,
            errors='coerce'
        )
        df = df.drop_duplicates(subset=[ts_col, tag_col], keep='last')
        df = df.pivot(index=ts_col, columns=tag_col, values=val_col).reset_index()
        df = df.rename(columns={ts_col: "timestamp"})
        df = df.dropna(subset=["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)

    elif is_hybrid_pmi_format:
        logger.info(f"[EXCEL] Formato híbrido PMI detectado. Realizando melt e pivot...")
        ts_col = df.columns[cols_lower.index('time')]
        tag_col = df.columns[cols_lower.index('meter_name')]
        
        df[ts_col] = pd.to_datetime(
            df[ts_col].astype(str).str.strip(), 
            dayfirst=TIMESTAMP_DAYFIRST,
            errors='coerce'
        )
        
        id_vars = [ts_col, tag_col]
        value_vars = [c for c in df.columns if c not in id_vars]
        
        melted = pd.melt(df, id_vars=id_vars, value_vars=value_vars, var_name='var_type', value_name='value')
        melted['tag'] = melted[tag_col].astype(str) + '_' + melted['var_type'].astype(str)
        
        melted = melted.drop_duplicates(subset=[ts_col, 'tag'], keep='last')
        df = melted.pivot(index=ts_col, columns='tag', values='value').reset_index()
        df = df.rename(columns={ts_col: "timestamp"})
        df.columns.name = None
        df = df.dropna(subset=["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)

    else:
        # ── Parsear timestamp padrão (sempre primeira coluna) ─────────────────
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

    # Converter colunas de métricas para tipo numérico usando regex robusto
    for col in df.columns:
        if col != "timestamp":
            if not pd.api.types.is_numeric_dtype(df[col]):
                s = df[col].astype(str)
                # Se contém vírgula, tratamos como PT-BR (vírgula=decimal). Extraímos apenas dígitos, vírgula e sinal.
                if s.str.contains(',').any():
                    s = s.str.replace(r'[^\d\-,]', '', regex=True).str.replace(',', '.', regex=False)
                else:
                    s = s.str.replace(r'[^\d\-.]', '', regex=True)
                
                s = s.replace('', np.nan)
                df[col] = pd.to_numeric(s, errors='coerce')
            else:
                df[col] = pd.to_numeric(df[col], errors='coerce')

    # 1. Agrupa por minuto (eliminando duplicatas reais)
    df.set_index("timestamp", inplace=True)
    df = df.resample('1min').mean()
    
    # 2. Preenchimento de buracos (Forward Fill) em cima da grade de minutos perfeita
    df = df.ffill()
    
    # 3. Voltar a coluna timestamp
    df.reset_index(inplace=True)

    if skip_unmapped:
        from services.mapping_service import load_mapping
        mapping = load_mapping(usina)
        cols_to_keep = [c for c in df.columns if c in mapping or c == "timestamp"]
        df = df[cols_to_keep]
        logger.info(f"[PROCESS] Séries após filtro de mapeamento: {len(df.columns) - 1}")

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


def process_raw_file(content: bytes, filename: str, usina: str, skip_unmapped: bool = False, override_date: str | None = None, progress_callback=None) -> dict:
    """
    Processa um arquivo bruto (CSV ou Excel), converte formato longo para largo,
    e faz merge (append de colunas) caso o parquet do dia já exista.
    
    Se override_date for fornecida (YYYY-MM-DD), usa essa data para nomear o arquivo
    em vez da data detectada nos dados — útil quando o parser inverte dia/mês.
    """
    usina_dir = os.path.join(DATA_DIR, usina)
    os.makedirs(usina_dir, exist_ok=True)
    
    logger.info(f"[PROCESS] Lendo '{filename}' para usina '{usina}'...")
    
    import io
    
    # Detecção de CSV vs Excel
    if filename.lower().endswith('.csv'):
        # Tenta ler com separador vírgula
        try:
            df = pd.read_csv(io.BytesIO(content), on_bad_lines='skip')
            if len(df.columns) <= 1:
                raise ValueError("Possivelmente separador é ;")
        except Exception:
            # Fallback para ponto-e-vírgula se der erro
            df = pd.read_csv(io.BytesIO(content), sep=';', on_bad_lines='skip')
    else:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl", parse_dates=False)
        
    logger.info(f"[PROCESS] Lido: {df.shape[0]} linhas × {df.shape[1]} colunas")
    
    # Converte colunas para minúsculo para facilitar a busca
    cols_lower = [str(c).lower().strip() for c in df.columns]
    
    # ── Identificar formato longo (timestamp, tag, value) ──
    is_long_format = all(c in cols_lower for c in ['timestamp', 'tag', 'value'])
    is_hybrid_pmi_format = all(c in cols_lower for c in ['time', 'meter_name', 'kwh_del_int', 'kwh_rec_int'])
    
    if is_long_format:
        logger.info(f"[PROCESS] Formato longo detectado. Realizando pivot...")
        # Encontra os nomes originais das colunas
        ts_col = df.columns[cols_lower.index('timestamp')]
        tag_col = df.columns[cols_lower.index('tag')]
        val_col = df.columns[cols_lower.index('value')]
        
        # Parse timestamp - dayfirst=True garante formato DD/MM/YYYY
        df[ts_col] = pd.to_datetime(
            df[ts_col].astype(str).str.strip(), 
            dayfirst=TIMESTAMP_DAYFIRST,
            errors='coerce'
        )
        
        # Pivot
        df = df.drop_duplicates(subset=[ts_col, tag_col], keep='last')
        df = df.pivot(index=ts_col, columns=tag_col, values=val_col).reset_index()
        # O nome da coluna do índice agora é o nome da coluna original do ts
        df = df.rename(columns={ts_col: "timestamp"})
        
    elif is_hybrid_pmi_format:
        logger.info(f"[PROCESS] Formato híbrido PMI detectado. Realizando melt e pivot...")
        ts_col = df.columns[cols_lower.index('time')]
        tag_col = df.columns[cols_lower.index('meter_name')]
        
        # Parse timestamp
        df[ts_col] = pd.to_datetime(
            df[ts_col].astype(str).str.strip(), 
            dayfirst=TIMESTAMP_DAYFIRST,
            errors='coerce'
        )
        
        # Melt das colunas de valores (tudo que não é time nem meter_name)
        id_vars = [ts_col, tag_col]
        value_vars = [c for c in df.columns if c not in id_vars]
        
        melted = pd.melt(df, id_vars=id_vars, value_vars=value_vars, var_name='var_type', value_name='value')
        
        # Cria a nova tag combinando o nome do meter e o nome da variável (ex: CLS01_Pri_kWh_del_int)
        melted['tag'] = melted[tag_col].astype(str) + '_' + melted['var_type'].astype(str)
        
        # Pivot para voltar ao formato Largo (Wide) padrão da plataforma
        melted = melted.drop_duplicates(subset=[ts_col, 'tag'], keep='last')
        df = melted.pivot(index=ts_col, columns='tag', values='value').reset_index()
        df = df.rename(columns={ts_col: "timestamp"})
        
        # Limpa o nome do eixo das colunas criado pelo pivot
        df.columns.name = None
        
    else:
        logger.info(f"[PROCESS] Formato largo detectado.")
        ts_col = df.columns[TIMESTAMP_COL_INDEX]
        # dayfirst=True garante que DD/MM/YYYY seja interpretado corretamente
        df[ts_col] = pd.to_datetime(
            df[ts_col].astype(str).str.strip(),
            dayfirst=TIMESTAMP_DAYFIRST,
            errors='coerce'
        )
        df = df.rename(columns={ts_col: "timestamp"})
        
    # Garante que as colunas não tenham espaços extras (comum em CSVs do SCADA)
    df.columns = [str(c).strip() for c in df.columns]

    # Limpeza
    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    # Converter colunas de métricas para tipo numérico usando regex robusto
    for col in df.columns:
        if col != "timestamp":
            if not pd.api.types.is_numeric_dtype(df[col]):
                s = df[col].astype(str)
                # Se contém vírgula, tratamos como PT-BR (vírgula=decimal). Extraímos apenas dígitos, vírgula e sinal.
                if s.str.contains(',').any():
                    s = s.str.replace(r'[^\d\-,]', '', regex=True).str.replace(',', '.', regex=False)
                else:
                    s = s.str.replace(r'[^\d\-.]', '', regex=True)
                
                s = s.replace('', np.nan)
                
                converted = pd.to_numeric(s, errors='coerce')
                
                # DEBUG LOGGING: Identify values that became NaN after conversion
                nan_mask = converted.isna() & df[col].notna() & (df[col].astype(str).str.strip() != '')
                if nan_mask.any():
                    bad_vals = df[col][nan_mask].unique()
                    logger.warning(f"[DEBUG] Coluna {col} teve conversões falhas para numérico. Valores originais: {bad_vals[:10]}")
                
                df[col] = converted
            else:
                df[col] = pd.to_numeric(df[col], errors='coerce')

    # 1. Agrupa por minuto (eliminando duplicatas reais)
    df.set_index("timestamp", inplace=True)
    df = df.resample('1min').mean()
    
    # 2. Preenchimento de buracos (Forward Fill) em cima da grade de minutos perfeita
    df = df.ffill()
    
    # 3. Voltar a coluna timestamp
    df.reset_index(inplace=True)
    if skip_unmapped:
        from services.mapping_service import load_mapping
        mapping = load_mapping(usina)
        cols_to_keep = [c for c in df.columns if c in mapping or c == "timestamp"]
        df = df[cols_to_keep]
        logger.info(f"[PROCESS] Séries após filtro de mapeamento: {len(df.columns) - 1}")
    
    if df.empty:
        raise ValueError(f"O arquivo {filename} não contém dados de timestamp válidos.")
        
    # Identificar a data: usa a data confirmada pelo usuário se fornecida
    detected_date = df["timestamp"].dt.date.iloc[0].isoformat()
    
    if override_date and override_date != detected_date:
        logger.info(f"[PROCESS] Data override: detectada={detected_date}, confirmada={override_date}")
        from datetime import datetime, timedelta
        # Recalcula os timestamps usando a override_date mas mantendo hora/minuto/segundo
        try:
            target_date = datetime.strptime(override_date, "%Y-%m-%d").date()
            df["timestamp"] = df["timestamp"].apply(
                lambda ts: ts.replace(year=target_date.year, month=target_date.month, day=target_date.day)
                if pd.notnull(ts) else ts
            )
            detected_date = override_date
        except Exception as e:
            logger.warning(f"[PROCESS] Não foi possível aplicar override_date: {e}. Usando data detectada.")
    
    parquet_path = os.path.join(usina_dir, f"{detected_date}.parquet")
    
    # Séries efetivamente importadas (antes do merge)
    imported_series_count = len(df.columns) - 1
    
    if progress_callback:
        import time
        # Emite progresso de "série em série" (em lotes) para a barra de progresso no frontend
        batch_size = max(1, imported_series_count // 50)
        for i in range(1, imported_series_count + 1):
            if i % batch_size == 0 or i == imported_series_count:
                progress_callback(i, imported_series_count)
                time.sleep(0.02) # Leve delay para suavizar a animação
    
    # ── Merge com o Parquet existente (caso exista) ──
    if os.path.exists(parquet_path):
        logger.info(f"[PROCESS] Arquivo parquet já existe para {detected_date}. Fazendo merge das séries...")
        existing_table = pq.read_table(parquet_path)
        existing_df = existing_table.to_pandas()
        
        # Remove do parquet existente as séries que estão sendo importadas agora (substituição)
        overlapping_cols = [c for c in df.columns if c in existing_df.columns and c != 'timestamp']
        if overlapping_cols:
            existing_df = existing_df.drop(columns=overlapping_cols)
            
        # Merge: Outer Join no timestamp
        df = pd.merge(existing_df, df, on='timestamp', how='outer')
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        # Faz um ffill novamente após o merge para preencher os buracos nos timestamps
        # recém-adicionados onde as colunas antigas não tinham correspondência.
        # Aplica resample novamente para higienizar caso o parquet antigo contivesse segundos exatos.
        df.set_index("timestamp", inplace=True)
        df = df.resample('1min').mean()
        df = df.ffill()
        df.reset_index(inplace=True)
        
    # ── Salvar no Parquet final ──
    logger.info(f"[PARQUET] Salvando em '{parquet_path}'...")
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(
        table,
        parquet_path,
        compression="snappy"
    )
    
    series_count = len(df.columns) - 1 # Remove o timestamp
    logger.info(f"[PARQUET] Salvo! {series_count} séries totais no dia {detected_date} ({imported_series_count} processadas agora)")
    
    return {
        "date": detected_date,
        "series_count": series_count, # Total de séries do dia (após merge)
        "imported_series_count": imported_series_count, # Séries processadas/importadas *neste* arquivo
        "parquet_path": parquet_path,
        "filename": filename
    }

