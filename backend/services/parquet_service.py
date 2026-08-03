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
        if fname.endswith(".parquet") and fname != "pvsyst_data.parquet":
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
    raw_cols = set()
    proc_cols = set()
    dates = [d.strip() for d in dates_str.split(",") if d.strip()]
    if dates == ["all"]:
        dates = list_available_dates(usina)
    
    for date in dates:
        path = _parquet_path(date, usina)
        if os.path.exists(path):
            schema = pq.read_schema(path)
            raw_cols.update(f.name for f in schema if f.name != "timestamp")
        
        # Incluir séries processadas (agregadores)
        processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols.update(f.name for f in schema_proc if f.name != "timestamp")
    
    from services.synthetic_service import build_lookup
    synth_lookup = build_lookup(usina)
    
    synth_cols = set()
    pvsyst_cols = set()
    
    pvsyst_path = os.path.join(DATA_DIR, usina, "pvsyst_data.parquet")
    if os.path.exists(pvsyst_path):
        schema_pvsyst = pq.read_schema(pvsyst_path)
        pvsyst_cols.update(f.name for f in schema_pvsyst if f.name != "timestamp")
        
    all_parquet_cols = raw_cols.union(proc_cols).union(pvsyst_cols)
    for s_name, s_def in synth_lookup.items():
        s1 = s_def.get("serie_1")
        s2 = s_def.get("serie_2")
        s3 = s_def.get("serie_3")
        if s1 and s1 not in all_parquet_cols:
            continue
        if s2 and str(s2).strip() != "nan" and s2 not in all_parquet_cols:
            continue
        if s3 and str(s3).strip() != "nan" and s3 not in all_parquet_cols:
            continue
        synth_cols.add(s_name)
    
    colunas_set = all_parquet_cols.union(synth_cols)
    if not colunas_set:
        raise FileNotFoundError(f"Nenhum dado encontrado para as datas: {dates_str}")
    from services.mapping_service import load_mapping
    mapping = load_mapping(usina)
    
    result = []
    for col in colunas_set:
        info = mapping.get(col, {})
        
        elemento = info.get("elemento")
        # Forçar PVSyst para colunas que vieram do arquivo PVSyst ou derivadas
        base_col = col.replace("_válida", "")
        if base_col in pvsyst_cols or base_col.startswith("E_Grid_Ajustada") or base_col.startswith("OhmLoss") or base_col.startswith("EArray") or base_col.startswith("Ajuste Potência CC"):
            elemento = "PVSyst"
            info["mapeada"] = True
            
        if base_col.startswith("pvlib_"):
            elemento = "PVLib"
            info["mapeada"] = True
            
        # Preencher elemento para séries sintéticas
        if not elemento:
            col_lower = col.lower()
            if col_lower.startswith("gpoa") or col_lower.startswith("grear") or col_lower.startswith("geff"):
                elemento = "Irradiação"
            elif col_lower.startswith("tamb") or col_lower.startswith("tmod") or col_lower.startswith("tcel"):
                elemento = "Temperatura"
            elif col_lower.startswith("sujidade"):
                elemento = "Sujidade"
            elif col_lower.startswith("tracker") or col_lower == "tracker ref." or col_lower.startswith("flag_tracker"):
                elemento = "Tracker"
            elif col_lower.startswith("potencia_ppc") or col_lower.startswith("potência ppc"):
                elemento = "Potência CA PPC"
            elif col_lower.startswith("referencia_ppc") or col_lower.startswith("referência ppc"):
                elemento = "Potência CA PPC"
            elif col_lower.startswith("energia_pmi") or col_lower.startswith("energia pmi"):
                elemento = "Energia PMI"
            elif col_lower.startswith("simultaneidade"):
                elemento = "Filtro"

        result.append({
            "coluna": col,
            "elemento": elemento,
            "skid": info.get("skid"),
            "inversor": info.get("inversor"),
            "stringbox": info.get("stringbox"),
            "tracker": info.get("tracker"),
            "string": info.get("string"),
            "estacao": info.get("estacao"),
            "mapeada": col in mapping or info.get("mapeada", False),
            "processada": (col in proc_cols) and (col not in raw_cols),
            "sintetica": col in synth_cols,
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
            if not df_day.empty:
                df_day = df_day.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()

        
        # 2. Tentar ler dados processados (agregadores)
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = [f.name for f in schema_proc if f.name != "timestamp"]
            already_loaded = list(df_day.columns) if df_day is not None else []
            read_proc = [c for c in final_cols if c in proc_cols and c not in already_loaded]
            
            if read_proc:
                df_proc = pd.read_parquet(processed_path, columns=["timestamp"] + read_proc)
                if df_day is not None:
                    # Garantir que timestamps batam para o merge
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                else:
                    df_day = df_proc
                    
        # 3. Tentar ler dados do PVSyst
        pvsyst_path = os.path.join(DATA_DIR, usina, "pvsyst_data.parquet")
        if os.path.exists(pvsyst_path):
            schema_pvsyst = pq.read_schema(pvsyst_path)
            pvsyst_cols = [f.name for f in schema_pvsyst if f.name != "timestamp"]
            already_loaded = list(df_day.columns) if df_day is not None else []
            read_pvsyst = [c for c in final_cols if c in pvsyst_cols and c not in already_loaded]
            
            if read_pvsyst:
                import pyarrow.compute as pc
                day_start = pd.to_datetime(date)
                day_end = day_start + pd.Timedelta(days=1)
                
                try:
                    df_pvsyst = pd.read_parquet(
                        pvsyst_path, 
                        columns=["timestamp"] + read_pvsyst,
                        filters=[
                            ("timestamp", ">=", day_start),
                            ("timestamp", "<", day_end)
                        ]
                    )
                    
                    if not df_pvsyst.empty:
                        df_pvsyst["timestamp"] = df_pvsyst["timestamp"].dt.floor("min")
                        if df_day is not None:
                            df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                            df_day = df_day.merge(df_pvsyst, on="timestamp", how="outer")
                        else:
                            df_day = df_pvsyst
                except Exception as e:
                    logger.warning(f"Erro ao ler pvsyst_data.parquet para data {date}: {e}")
        
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
        
        pvsyst_path = os.path.join(DATA_DIR, usina, "pvsyst_data.parquet")
        pvsyst_cols = []
        if os.path.exists(pvsyst_path):
            schema_pvsyst = pq.read_schema(pvsyst_path)
            pvsyst_cols = [f.name for f in schema_pvsyst if f.name != "timestamp"]
            all_cols.extend(pvsyst_cols)
            
        mapping = load_mapping(usina)

        filtered = []
        for col in all_cols:
            info = mapping.get(col, {})
            if col in pvsyst_cols or col.startswith("E_Grid_Ajustada") or col.startswith("OhmLoss") or col.startswith("EArray") or col.startswith("Ajuste Potência CC"):
                info["elemento"] = "PVSyst"
                info["mapeada"] = True
            
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


def delete_series_from_parquet(usina: str, dates: list[str], series_to_delete: list[str]) -> dict:
    """
    Remove colunas específicas dos arquivos Parquet da usina.
    Se a data for 'all', remove de todos os arquivos Parquet encontrados na usina.
    Retorna a quantidade de colunas removidas e a quantidade de arquivos deletados.
    """
    usina_dir = os.path.join(DATA_DIR, usina)
    if not os.path.exists(usina_dir):
        return {"columns_dropped": 0, "files_deleted": 0}

    import pyarrow.parquet as pq

    if not dates or dates == ["all"]:
        # Seleciona todos os .parquet
        files_to_process = [f for f in os.listdir(usina_dir) if f.endswith(".parquet")]
    else:
        files_to_process = [f"{d}.parquet" for d in dates]

    total_cols_dropped = 0
    total_files_deleted = 0

    for fname in files_to_process:
        path = os.path.join(usina_dir, fname)
        if not os.path.exists(path):
            continue

        try:
            if "__ALL__" in series_to_delete:
                os.remove(path)
                total_files_deleted += 1
                logger.info(f"[DELETE] Arquivo '{fname}' deletado completamente a pedido do usuário.")
                continue

            # Ler apenas o schema para ver se a série existe no arquivo
            schema = pq.read_schema(path)
            cols_in_file = schema.names
            cols_to_drop = [c for c in series_to_delete if c in cols_in_file]

            if not cols_to_drop:
                continue

            # Se vai excluir colunas, lê a tabela e usa drop_columns
            table = pq.read_table(path)
            table = table.drop_columns(cols_to_drop)
            
            total_cols_dropped += len(cols_to_drop)

            # Verifica se sobrou apenas a coluna timestamp
            if len(table.column_names) <= 1:
                # O arquivo ficou vazio (só timestamp ou nada), então remove
                os.remove(path)
                total_files_deleted += 1
                logger.info(f"[DELETE] Arquivo '{fname}' deletado pois ficou sem séries.")
            else:
                # Salva o arquivo novamente
                pq.write_table(table, path, compression="snappy")
                logger.info(f"[DELETE] {len(cols_to_drop)} séries removidas de '{fname}'.")

        except Exception as e:
            logger.error(f"[DELETE] Erro ao processar '{fname}' para deleção: {e}")

    # Limpar cache do MD5 (como modificamos os arquivos, o cache do excel original já não serve muito, 
    # mas o importante é que os arquivos parquet mudaram. As próximas consultas os lerão do disco)
    from services.excel_service import MD5_CACHE_FILE, _load_cache, _save_cache
    cache = _load_cache()
    keys_to_delete = [k for k in cache.keys() if k.endswith(f"_{usina}")]
    if keys_to_delete:
        for k in keys_to_delete:
            del cache[k]
        _save_cache(cache)
        logger.info(f"[DELETE] Limpos {len(keys_to_delete)} registros do cache MD5 da usina '{usina}'.")
    
    return {
        "columns_dropped": total_cols_dropped,
        "files_deleted": total_files_deleted,
    }
