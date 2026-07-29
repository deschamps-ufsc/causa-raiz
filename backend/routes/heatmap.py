"""
Rota de Heatmap de Yield (Energia CA / MWp instalado).

Yield por par (SKID, Inversor):
  1. Identifica séries no Mapeamento de Séries com skid=S, inversor=I, elemento=E
  2. Lê essas colunas do Parquet
  3. Integra potência (kW, 1 min) → energia MWh:  Σ(kW) / 60000
  4. Divide MWh / MWp (da usina_info) → Yield
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from services.parquet_service import _parquet_path
from services.mapping_service import load_mapping
from services.usina_info_service import load_usina_info
from services.synthetic_service import build_lookup, compute_synthetic, get_source_cols
from utils.logger import logger

import os
import pandas as pd
import pyarrow.parquet as pq

router = APIRouter(tags=["Heatmap"])


@router.get("/heatmap/yield")
def get_yield_heatmap(
    usina: str = Query(...),
    dates:  str = Query(...),
    elemento: Optional[str] = Query(None, description="Elemento que representa Potência CA Inv"),
    filters: Optional[str] = Query(None, description="String de filtros separados por vírgula para qualidade"),
    row_cat: str = Query("skid", description="Categoria para as linhas do heatmap"),
    col_cat: str = Query("inversor", description="Categoria para as colunas do heatmap"),
):
    """
    Calcula o mapa de calor de forma dinâmica baseada em row_cat e col_cat.
    Se categorias forem skid e inversor, calcula o Yield usando MWp da usina_info.
    Caso contrário, retorna apenas a soma integrada (Σ / 60000).
    """
    date_list = [d.strip() for d in dates.split(",") if d.strip()]
    if not date_list:
        raise HTTPException(status_code=400, detail="Nenhuma data informada.")

    mapping = load_mapping(usina)

    info_records = []
    try:
        from services.usina_info_service import load_usina_info
        info_records = load_usina_info(usina) or []
    except Exception:
        pass

    mwp_dict = {}
    if info_records:
        for rec in info_records:
            sk = rec.get("skid", "")
            iv = rec.get("inversor", "")
            mwp = rec.get("mwp")
            if sk and iv and mwp:
                mwp_dict[(sk, iv)] = float(mwp)

    pair_cols = {}
    for col, meta in mapping.items():
        if elemento and meta.get("elemento") != elemento:
            continue
        row_val = meta.get(row_cat)
        col_val = meta.get(col_cat)
        
        if not row_val or not col_val or str(row_val).lower() == 'nan' or str(col_val).lower() == 'nan':
            continue
            
        pair = (row_val, col_val)
        pair_cols.setdefault(pair, []).append(col)

    if not pair_cols:
        raise HTTPException(
            status_code=422,
            detail=f"Nenhuma série encontrada para {row_cat} × {col_cat} e elemento '{elemento}'."
        )

    cols_needed = set()
    for cols in pair_cols.values():
        cols_needed.update(cols)
        
    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    
    cols_to_read = list(cols_needed) + active_filters

    dfs = []
    for date in date_list:
        path = _parquet_path(date, usina)
        if not os.path.exists(path):
            continue
        schema = pq.read_schema(path)
        parquet_cols = {f.name for f in schema}
        valid_cols_day = [c for c in cols_to_read if c in parquet_cols]
        if valid_cols_day:
            df_day = pd.read_parquet(path, columns=valid_cols_day)
            dfs.append(df_day)
            
    if not dfs:
        raise HTTPException(status_code=422, detail="Nenhuma coluna válida no Parquet para as datas selecionadas.")
        
    df = pd.concat(dfs, ignore_index=True)
    
    # Aplica iterativamente cada filtro presente no dataframe
    for f_col in active_filters:
        if f_col in df.columns:
            df = df[df[f_col] == 1]
            logger.info(f"[HEATMAP] Filtro [{f_col}] aplicado. Linhas restantes: {len(df)}")
        else:
            logger.warning(f"[HEATMAP] Filtro [{f_col}] não encontrado no parquet.")

    matrix = {}
    rows_set = set()
    cols_set = set()
    
    is_yield = (row_cat == "skid" and col_cat == "inversor")
    
    for (r_val, c_val), cols in pair_cols.items():
        rows_set.add(r_val)
        cols_set.add(c_val)
        active_cols = [c for c in cols if c in df.columns]
        if not active_cols:
            matrix.setdefault(r_val, {})[c_val] = None
            continue
            
        total_sum = df[active_cols].sum(axis=1).sum()
        integral = float(total_sum) / 60000.0
        
        final_value = integral
        if is_yield:
            mwp = mwp_dict.get((r_val, c_val))
            if mwp:
                final_value = round(integral / mwp, 4)
            else:
                final_value = None
        else:
            final_value = round(integral, 4)
            
        matrix.setdefault(r_val, {})[c_val] = final_value
        
    return {
        "dates": dates,
        "elemento": elemento,
        "rows": sorted(rows_set),
        "cols": sorted(cols_set),
        "matrix": matrix,
        "row_cat": row_cat,
        "col_cat": col_cat,
        "is_yield": is_yield
    }


@router.get("/heatmap/pivot")
def get_pivot_heatmap(
    usina: str = Query(...),
    dates:  str = Query(...),
    elemento: str = Query(..., description="Elemento para integralizar"),
    filters: Optional[str] = Query(None, description="String de filtros separados por vírgula para qualidade"),
):
    """
    Retorna uma lista plana de folhas (séries individuais) com sua integral (soma/60)
    e seus metadados (skid, inversor, stringbox, estacao, kwp).
    Ideal para montagem de Pivot Table multicamadas no frontend.
    """
    date_list = [d.strip() for d in dates.split(",") if d.strip()]
    if not date_list:
        raise HTTPException(status_code=400, detail="Nenhuma data informada.")

    mapping = load_mapping(usina)
    
    # Injeta a nova tabela de info (Série -> kWp)
    info_dict = {}
    try:
        from services.usina_info_service import load_usina_info
        info_dict = load_usina_info(usina) or {}
    except Exception:
        pass

    # Filtrar séries com base no elemento desejado
    target_series = []
    for col, meta in mapping.items():
        if meta.get("elemento") == elemento:
            target_series.append(col)

    if not target_series:
        raise HTTPException(
            status_code=422,
            detail=f"Nenhuma série encontrada para o elemento '{elemento}'."
        )

    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    cols_to_read = list(set(target_series)) + active_filters

    # Séries sintéticas: identificar e coletar colunas-fonte adicionais
    synth_lookup = build_lookup(usina)
    all_needed_cols = list(set(target_series)) + active_filters
    synth_in_target = {col: synth_lookup[col] for col in all_needed_cols if col in synth_lookup}
    for synth_name, synth_def in synth_in_target.items():
        cols_to_read.remove(synth_name)  # não existe no Parquet
        for src in get_source_cols(synth_def):
            if src not in cols_to_read:
                cols_to_read.append(src)

    dfs = []
    for date in date_list:
        path = _parquet_path(date, usina)
        if not os.path.exists(path):
            continue
        schema = pq.read_schema(path)
        parquet_cols = {f.name for f in schema}
        valid_cols_day = [c for c in cols_to_read if c in parquet_cols]
        if valid_cols_day:
            df_day = pd.read_parquet(path, columns=valid_cols_day)
            df_day["_date_str"] = date
            dfs.append(df_day)
            
    if not dfs:
        raise HTTPException(status_code=422, detail="Nenhuma coluna válida no Parquet.")
        
    df = pd.concat(dfs, ignore_index=True)

    # Injetar séries sintéticas calculadas no DataFrame
    for synth_name, synth_def in synth_in_target.items():
        try:
            df[synth_name] = compute_synthetic(df, synth_def)
        except Exception as e:
            logger.warning(f"[SYNTHETIC] Erro ao calcular '{synth_name}': {e}")
            df[synth_name] = 0.0
    
    # Aplica iterativamente cada filtro presente no dataframe
    for f_col in active_filters:
        if f_col in df.columns:
            df = df[df[f_col] == 1]
            logger.info(f"[HEATMAP PIVOT] Filtro [{f_col}] aplicado. Linhas restantes: {len(df)}")
    
    records = []
    
    for date_str, df_group in df.groupby("_date_str"):
        for col in target_series:
            if col not in df_group.columns:
                continue
                
            total_sum = df_group[col].sum()
            avg_val = float(df_group[col].mean()) if not df_group[col].empty else 0.0
            # Integralizamos assumindo dados minuto-a-minuto: sum / 60
            integral = float(total_sum) / 60.0
            
            kwp_val = 0.0
            
            meta = mapping.get(col, {})
            m_sk = str(meta.get("skid") or "").strip()
            m_in = str(meta.get("inversor") or "").strip()
            m_sb = str(meta.get("stringbox") or "").strip()
            m_tr = str(meta.get("tracker") or "").strip()
            m_st = str(meta.get("string") or "").strip()
            
            parts = [p for p in [m_sk, m_in, m_sb, m_st] if p]
            # Calcula kWp se a série tem ao menos SKID + Inversor definidos.
            # Variáveis ambientais com só SKID não devem somar toda a planta.
            if m_sk and m_in and parts:
                target_prefix = "|".join(parts)
                for key_path, data_dict in info_dict.items():
                    if key_path == target_prefix or key_path.startswith(target_prefix + "|"):
                        kwp_val += data_dict.get("kwp", 0.0)

            records.append({
                "date": date_str,
                "serie": col,
                "skid": m_sk,
                "inversor": m_in,
                "stringbox": m_sb,
                "tracker": m_tr,
                "string": m_st,
                "estacao": str(meta.get("estacao") or ""),
                "avg_val": round(avg_val, 4),
                "integral": round(integral, 4),
                "kwp": round(kwp_val, 4) if kwp_val > 0 else None
            })
        
    return {
        "dates": dates,
        "elemento": elemento,
        "records": records
    }


@router.get("/heatmap/mapa")
def get_mapa_heatmap(
    usina: str = Query(...),
    dates:  str = Query(...),
    filters: Optional[str] = Query(None, description="String de filtros separados por vírgula para qualidade"),
    variavel: Optional[str] = Query("potencia_cc", description="Variável a ser plotada (potencia_cc ou tensao_cc)")
):
    """
    Retorna integral e avg_val específicos para as séries definidas no layout do mapa.
    Lê o mapa_layout.json para determinar as target_series.
    """
    date_list = [d.strip() for d in dates.split(",") if d.strip()]
    if not date_list:
        raise HTTPException(status_code=400, detail="Nenhuma data informada.")

    from routes.upload import get_mapa_path
    import json
    path_mapa = get_mapa_path(usina)
    if not os.path.exists(path_mapa):
        raise HTTPException(status_code=404, detail="Layout de Mapa não encontrado. Faça upload do Excel na Configuração da Usina.")
    
    with open(path_mapa, "r", encoding="utf-8") as f:
        layout = json.load(f)
        
    target_series = list(set([cell["label"] for cell in layout if "label" in cell]))
    
    if not target_series:
        raise HTTPException(status_code=422, detail="Nenhuma série encontrada no layout do Mapa.")

    mapping = load_mapping(usina)
    info_dict = {}
    try:
        from services.usina_info_service import load_usina_info
        info_dict = load_usina_info(usina) or {}
    except Exception:
        pass

    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    cols_to_read = list(set(target_series)) + active_filters

    synth_lookup = build_lookup(usina)
    all_needed_cols = list(set(target_series)) + active_filters
    
    tensao_mapping = {}
    if variavel == "tensao_cc":
        for col in target_series:
            if col in synth_lookup:
                synth_def = synth_lookup[col]
                sources = get_source_cols(synth_def)
                tensao_cols = [s for s in sources if "tensao" in s.lower() or "voltage" in s.lower()]
                if tensao_cols:
                    tensao_mapping[col] = tensao_cols[0]
                    if tensao_cols[0] not in cols_to_read:
                        cols_to_read.append(tensao_cols[0])
        
        synth_in_target = {col: synth_lookup[col] for col in active_filters if col in synth_lookup}
    else:
        synth_in_target = {col: synth_lookup[col] for col in all_needed_cols if col in synth_lookup}
        
    for synth_name, synth_def in synth_in_target.items():
        if synth_name in cols_to_read:
            cols_to_read.remove(synth_name)
        for src in get_source_cols(synth_def):
            if src not in cols_to_read:
                cols_to_read.append(src)

    from services.parquet_service import DATA_DIR
    dfs = []
    for date in date_list:
        path = _parquet_path(date, usina)
        processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
        
        df_day = None
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = {f.name for f in schema}
            valid_cols_day = [c for c in cols_to_read if c in parquet_cols]
            
            if valid_cols_day:
                read_cols = valid_cols_day + (["timestamp"] if "timestamp" not in valid_cols_day else [])
                df_day = pd.read_parquet(path, columns=list(set(read_cols)))
                
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = {f.name for f in schema_proc}
            valid_proc_day = [c for c in cols_to_read if c in proc_cols]
            
            if valid_proc_day:
                read_proc = valid_proc_day + (["timestamp"] if "timestamp" not in valid_proc_day else [])
                df_proc = pd.read_parquet(processed_path, columns=list(set(read_proc)))
                
                if df_day is not None:
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                else:
                    df_day = df_proc
                    
        if df_day is not None:
            df_day["_date_str"] = date
            dfs.append(df_day)
            
    if not dfs:
        raise HTTPException(status_code=422, detail="Nenhuma coluna válida no Parquet correspondente às séries do Mapa.")
        
    df = pd.concat(dfs, ignore_index=True)


    for synth_name, synth_def in synth_in_target.items():
        try:
            df[synth_name] = compute_synthetic(df, synth_def)
        except Exception as e:
            df[synth_name] = 0.0
    
    for f_col in active_filters:
        if f_col in df.columns:
            df = df[df[f_col] == 1]
    
    records = []
    
    # Precalculate meta and kwp per serie to avoid nested looping per day
    kwp_cache = {}
    for col in target_series:
        kwp_val = 0.0
        meta = mapping.get(col, {})
        m_sk = str(meta.get("skid") or "").strip()
        m_in = str(meta.get("inversor") or "").strip()
        m_sb = str(meta.get("stringbox") or "").strip()
        m_st = str(meta.get("string") or "").strip()
        m_tr = str(meta.get("tracker") or "").strip()
        
        parts = [p for p in [m_sk, m_in, m_sb, m_st] if p]
        if m_sk and m_in and parts:
            target_prefix = "|".join(parts)
            for key_path, data_dict in info_dict.items():
                if key_path == target_prefix or key_path.startswith(target_prefix + "|"):
                    kwp_val += data_dict.get("kwp", 0.0)
                    
        kwp_cache[col] = {
            "skid": m_sk,
            "inversor": m_in,
            "stringbox": m_sb,
            "tracker": m_tr,
            "estacao": str(meta.get("estacao") or ""),
            "kwp": round(kwp_val, 4) if kwp_val > 0 else None
        }
    
    try:
        for date_str, df_group in df.groupby("_date_str"):
            for col in target_series:
                if variavel == "tensao_cc":
                    actual_col = tensao_mapping.get(col)
                else:
                    actual_col = col

                if not actual_col or actual_col not in df_group.columns:
                    continue
                    
                total_sum = df_group[actual_col].sum()
                avg_raw = df_group[actual_col].mean()
                max_raw = df_group[actual_col].max()
                
                avg_val = 0.0 if pd.isna(avg_raw) else float(avg_raw)
                max_val = 0.0 if pd.isna(max_raw) else float(max_raw)
                
                integral = float(total_sum) / 60.0
                
                cached = kwp_cache.get(col)
                if cached:
                    records.append({
                        "date": date_str,
                        "serie": col,
                        "skid": cached["skid"],
                        "inversor": cached["inversor"],
                        "stringbox": cached["stringbox"],
                        "tracker": cached["tracker"],
                        "estacao": cached["estacao"],
                        "avg_val": round(avg_val, 4),
                        "max_val": round(max_val, 4),
                        "integral": round(integral, 4),
                        "kwp": cached["kwp"]
                    })
        return {
            "dates": dates,
            "records": records
        }
    except Exception as e:
        import traceback
        with open("C:/mapa_error.txt", "w") as f:
            f.write(f"Error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap/trackers")
def get_trackers_heatmap(
    usina: str = Query(...),
    dates:  str = Query(...),
    filters: Optional[str] = Query(None, description="String de filtros separados por vírgula para qualidade"),
):
    """
    Retorna a Média da Diferença Absoluta (em graus) entre Tracker Alvo/Atual
    e o Tracker de Referência (PVLib), considerando APENAS períodos sem backtracking.
    """
    date_list = [d.strip() for d in dates.split(",") if d.strip()]
    if not date_list:
        raise HTTPException(status_code=400, detail="Nenhuma data informada.")

    mapping = load_mapping(usina)
    
    info_dict = {}
    try:
        from services.usina_info_service import load_usina_info
        info_dict = load_usina_info(usina) or {}
    except Exception:
        pass
    
    # Pegar parâmetros de tracker_config
    import json
    tracker_params = {}
    config_path = os.path.join(os.path.dirname(__file__), "..", "data", usina, "flow_config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            if "nodeConfigs" in cfg:
                tracker_params = cfg["nodeConfigs"].get("tracker", {}).get("trackerParams", {})
            else:
                for node in cfg.get("nodes", []):
                    if node.get("id") == "tracker":
                        tracker_params = node.get("data", {}).get("trackerParams", {})
                        break

    # Filtrar séries com base no elemento 'Tracker'
    target_series = []
    tracker_groups = {} # base -> {alvo: col, atual: col, skid, inversor, stringbox, estacao}
    
    for col, meta in mapping.items():
        if meta.get("elemento") == "Tracker":
            if ".PosAngAlvo" in col:
                base = col.replace(".PosAngAlvo", "")
                typ = "alvo"
            elif ".PosAngAtual" in col or ".PosAngMedido" in col:
                base = col.replace(".PosAngAtual", "").replace(".PosAngMedido", "")
                typ = "atual"
            else:
                continue

            target_series.append(col)
            if base not in tracker_groups:
                tracker_groups[base] = {
                    "skid": str(meta.get("skid") or ""),
                    "inversor": str(meta.get("inversor") or ""),
                    "stringbox": str(meta.get("stringbox") or ""),
                    "estacao": str(meta.get("estacao") or ""),
                    # Usa o campo 'tracker' do mapeamento; fallback para inferição pelo nome da série
                    "tracker": str(meta.get("tracker") or "") or base.split("-")[-1],
                    "strings": str(meta.get("string") or ""),
                    "cc_strings": []
                }
            tracker_groups[base][typ] = col

    for col, meta in mapping.items():
        el = meta.get("elemento", "").lower()
        if "pot" in el and "string" in el and "cc" in el:
            sk = str(meta.get("skid") or "")
            inv = str(meta.get("inversor") or "")
            sb = str(meta.get("stringbox") or "")
            tr = str(meta.get("tracker") or "") or col.split(".")[0].split("-")[-1]
            
            for base, tg in tracker_groups.items():
                if tg["skid"] == sk and tg["inversor"] == inv and tg["stringbox"] == sb and tg["tracker"] == tr:
                    tg["cc_strings"].append(col)
                    target_series.append(col)
                    break

    if not target_series:
        raise HTTPException(
            status_code=422,
            detail="Nenhuma série encontrada para o elemento 'Tracker'."
        )

    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    cols_to_read = list(set(target_series)) + active_filters

    # Séries sintéticas: identificar e coletar colunas-fonte adicionais
    synth_lookup = build_lookup(usina)
    all_needed_cols = list(set(target_series)) + active_filters
    synth_in_target = {c: synth_lookup[c] for c in all_needed_cols if c in synth_lookup}
    for synth_name, synth_def in synth_in_target.items():
        if synth_name in cols_to_read:
            cols_to_read.remove(synth_name)  # não existe no Parquet
        for src in get_source_cols(synth_def):
            if src not in cols_to_read:
                cols_to_read.append(src)

    from services.parquet_service import DATA_DIR
    dfs = []
    for date in date_list:
        path = _parquet_path(date, usina)
        processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
        
        df_day = None
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = {f.name for f in schema}
            valid_cols_day = [c for c in cols_to_read if c in parquet_cols]
            
            if valid_cols_day or "timestamp" in parquet_cols:
                read_cols = valid_cols_day + (["timestamp"] if "timestamp" not in valid_cols_day else [])
                df_day = pd.read_parquet(path, columns=list(set(read_cols)))
                
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = {f.name for f in schema_proc}
            valid_proc_day = [c for c in cols_to_read if c in proc_cols]
            
            if valid_proc_day:
                read_proc = valid_proc_day + (["timestamp"] if "timestamp" not in valid_proc_day else [])
                df_proc = pd.read_parquet(processed_path, columns=list(set(read_proc)))
                
                if df_day is not None:
                    df_day = df_day.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
                    df_proc = df_proc.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                else:
                    df_day = df_proc.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
                    
        if df_day is not None:
            if "timestamp" in df_day.columns and not df_day.empty and len(df_day) > len(df_day["timestamp"].dt.floor("Min").unique()):
                 df_day = df_day.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
            dfs.append(df_day)
            
    if not dfs:
        raise HTTPException(status_code=422, detail="Nenhuma coluna válida no Parquet.")
        
    df = pd.concat(dfs, ignore_index=True)
    
    # Injetar séries sintéticas calculadas no DataFrame
    for synth_name, synth_def in synth_in_target.items():
        try:
            df[synth_name] = compute_synthetic(df, synth_def)
        except Exception as e:
            logger.warning(f"[SYNTHETIC] Erro ao calcular '{synth_name}' em trackers: {e}")
            df[synth_name] = 0.0

    if "timestamp" in df.columns:
        df.set_index("timestamp", inplace=True)

    # Aplica iterativamente cada filtro presente no dataframe
    for f_col in active_filters:
        if f_col in df.columns:
            df = df[df[f_col] == 1]
            logger.info(f"[TRACKERS] Filtro [{f_col}] aplicado. Linhas restantes: {len(df)}")
    
    if df.empty:
        return {"dates": dates, "records": []}

    import pvlib
    import numpy as np

    lat = float(tracker_params.get("latitude", -23.55))
    lon = float(tracker_params.get("longitude", -46.63))
    gcr = float(tracker_params.get("gcr", 0.3))
    max_angle = float(tracker_params.get("max_angle", 60))
    time_offset = int(tracker_params.get("time_offset", 0))
    tolerance = float(tracker_params.get("tolerance", 10))
    angulo_defesa = float(tracker_params.get("angulo_defesa", -60))
    tol_vento = int(tracker_params.get("tol_pontos_vento", 0))
    tol_travado = int(tracker_params.get("tol_pontos_travado", 0))

    times_for_pvlib = pd.DatetimeIndex(df.index.values)
    if times_for_pvlib.tz is None:
        times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
        
    if time_offset != 0:
        times_for_pvlib = times_for_pvlib - pd.Timedelta(minutes=time_offset)
    
    solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
    
    trk_true = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                         max_angle=max_angle, backtrack=True, gcr=gcr)
    
    trk_false = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                          max_angle=max_angle, backtrack=False, gcr=gcr)

    ref_theta_vals = trk_true['tracker_theta'].values
    trk_false_vals = trk_false['tracker_theta'].values
    
    if tracker_params.get("inverter_sinal", False):
        ref_theta_vals = -ref_theta_vals
        trk_false_vals = -trk_false_vals
    
    ref_theta_series = pd.Series(ref_theta_vals, index=df.index)
    is_backtracking_series = pd.Series((np.round(ref_theta_vals, 2) != np.round(trk_false_vals, 2)).astype(int), index=df.index)
    
    df["TrackerRef"] = ref_theta_series.values
    df["is_backtracking"] = is_backtracking_series.values

    # Conforme nova regra de negócio, os períodos em backtracking não são mais descartados.
    df_no_bt = df.copy()
    # Explicitamente ignorar períodos onde a referência do PVLib for vazia (NaN)
    df_no_bt = df_no_bt.dropna(subset=["TrackerRef"])
    df_no_bt["_date_str"] = df_no_bt.index.strftime("%Y-%m-%d")

    records = []
    
    for date_str, df_group in df_no_bt.groupby("_date_str"):
        for base, data in tracker_groups.items():
            diff_alvo = None
            diff_atual = None
            count_alvo = 0
            count_atual = 0
            pts_fora_alvo = 0
            pts_fora_atual = 0

            pts_erro_alvo = 0
            pts_vento = 0
            pts_travado = 0
            mask_erro_alvo = pd.Series(False, index=df_group.index)
            mask_vento = pd.Series(False, index=df_group.index)

            sum_diff_erro_alvo = 0.0
            sum_diff_vento = 0.0
            sum_diff_travado = 0.0

            col_alvo = data.get("alvo")
            col_atual = data.get("atual")
            erro_alvo_col = f"tracker_{base}_erro_alvo"
            vento_col = f"tracker_{base}_vento"
            travado_col = f"tracker_{base}_travado"
            
            if erro_alvo_col in df_group.columns and travado_col in df_group.columns:
                mask_erro_alvo = df_group[erro_alvo_col] == 1
                mask_vento = df_group[vento_col] == 1 if vento_col in df_group.columns else pd.Series(False, index=df_group.index)
                mask_travado = df_group[travado_col] == 1
            else:
                if col_atual and col_atual in df_group.columns:
                    mask_erro_atual = (df_group[col_atual] - df_group["TrackerRef"]).abs() > tolerance
                else:
                    mask_erro_atual = pd.Series(False, index=df_group.index)
                    
                if col_alvo and col_alvo in df_group.columns:
                    mask_alvo_divergente = (df_group[col_alvo] - df_group["TrackerRef"]).abs() > tolerance
                else:
                    mask_alvo_divergente = pd.Series(False, index=df_group.index)
                    
                mask_erro_alvo = mask_alvo_divergente & mask_erro_atual
                mask_travado = mask_erro_atual & ~mask_erro_alvo
                if col_alvo and col_alvo in df_group.columns:
                    mask_vento = mask_erro_alvo & (df_group[col_alvo] == angulo_defesa)
                else:
                    mask_vento = pd.Series(False, index=df_group.index)
                
            pts_erro_alvo = 0
            if mask_erro_alvo.any():
                streaks = mask_erro_alvo.groupby((~mask_erro_alvo).cumsum()).sum()
                pts_erro_alvo = int(streaks[streaks > tol_vento].sum())
            pts_vento = 0
            if mask_vento.any():
                streaks = mask_vento.groupby((~mask_vento).cumsum()).sum()
                pts_vento = int(streaks[streaks > tol_vento].sum())

            if col_alvo and col_alvo in df_group.columns:
                diff_series = (df_group[col_alvo] - df_group["TrackerRef"]).abs().dropna()
                if not diff_series.empty:
                    diff_alvo = round(float(diff_series.mean()), 4)
                    count_alvo = len(diff_series)
                    pts_fora_alvo = int((diff_series > tolerance).sum())


            if col_atual and col_atual in df_group.columns:
                diff_atual_series = (df_group[col_atual] - df_group["TrackerRef"]).abs()
                diff_series = diff_atual_series.dropna()
                if not diff_series.empty:
                    diff_atual = round(float(diff_series.mean()), 4)
                    count_atual = len(diff_series)
                    pts_fora_atual = int((diff_series > tolerance).sum())


                    
                pts_travado = 0
                if mask_travado.any():
                    streaks_travado = mask_travado.groupby((~mask_travado).cumsum()).sum()
                    pts_travado = int(streaks_travado[streaks_travado > tol_travado].sum())
                
                sum_diff_erro_alvo = float(diff_atual_series[mask_erro_alvo].sum())
                sum_diff_vento = float(diff_atual_series[mask_vento].sum())
                sum_diff_travado = float(diff_atual_series[mask_travado].sum())
            else:
                if col_alvo and col_alvo in df_group.columns:
                    diff_alvo_series = (df_group[col_alvo] - df_group["TrackerRef"]).abs()
                    sum_diff_erro_alvo = float(diff_alvo_series[mask_erro_alvo].sum())
                    sum_diff_vento = float(diff_alvo_series[mask_vento].sum())

            energia_strings = 0.0
            kwp_val = 0.0
            if "cc_strings" in data and data["cc_strings"]:
                valid_cc_cols = [c for c in data["cc_strings"] if c in df_group.columns]
                if valid_cc_cols:
                    energia_strings = float(df_group[valid_cc_cols].sum().sum()) / 60.0
                
                for c_col in data["cc_strings"]:
                    meta_col = mapping.get(c_col, {})
                    m_sk = str(meta_col.get("skid") or "").strip()
                    m_in = str(meta_col.get("inversor") or "").strip()
                    m_sb = str(meta_col.get("stringbox") or "").strip()
                    m_st = str(meta_col.get("string") or "").strip()
                    parts = [p for p in [m_sk, m_in, m_sb, m_st] if p]
                    if m_sk and m_in and parts:
                        target_prefix = "|".join(parts)
                        for key_path, data_dict in info_dict.items():
                            if key_path == target_prefix or key_path.startswith(target_prefix + "|"):
                                kwp_val += data_dict.get("kwp", 0.0)
                                
            yield_val = None
            if energia_strings > 0 and kwp_val > 0:
                yield_val = energia_strings / kwp_val

            if diff_alvo is not None or diff_atual is not None:
                records.append({
                    "date": date_str,
                    "tracker": data.get("tracker") or base.split("-")[-1],
                    "base": base,
                    "skid": data["skid"],
                    "inversor": data["inversor"],
                    "stringbox": data["stringbox"],
                    "estacao": data["estacao"],
                    "diff_alvo": diff_alvo,
                    "diff_atual": diff_atual,
                    "count_alvo": count_alvo,
                    "count_atual": count_atual,
                    "pts_fora_alvo": pts_fora_alvo,
                    "pts_fora_atual": pts_fora_atual,
                    "pts_erro_alvo": pts_erro_alvo,
                    "pts_vento": pts_vento,
                    "pts_travado": pts_travado,
                    "sum_diff_erro_alvo": sum_diff_erro_alvo,
                    "sum_diff_vento": sum_diff_vento,
                    "sum_diff_travado": sum_diff_travado,
                    "alvo": col_alvo,
                    "atual": col_atual,
                    "serie_alvo": col_alvo,
                    "serie_atual": col_atual,
                    "strings": data.get("strings", ""),
                    "energia": round(energia_strings, 4),
                    "kwp": round(kwp_val, 4) if kwp_val > 0 else None,
                    "yield": round(yield_val, 4) if yield_val is not None else None
                })
            
    return {
        "dates": dates,
        "tolerance": tolerance,
        "records": records
    }


@router.get("/heatmap/times")
def get_heatmap_times(usina: str = Query(...), date: str = Query(...)):
    """
    Retorna a lista de horários (HH:MM) onde há dados válidos no dia.
    """
    from services.parquet_service import DATA_DIR
    import pyarrow.parquet as pq
    import pandas as pd
    
    path = os.path.join(DATA_DIR, usina, f"{date}.parquet")
    if not os.path.exists(path):
        return {"times": []}
        
    schema = pq.read_schema(path)
    if "timestamp" not in {f.name for f in schema}:
        return {"times": []}
        
    df = pd.read_parquet(path, columns=["timestamp"])
    df["timestamp"] = df["timestamp"].dt.floor("min")
    times = df["timestamp"].dt.strftime("%H:%M").dropna().unique().tolist()
    return {"times": sorted(times)}


_instant_cache = {}
_tensao_mapping_cache = {}

@router.get("/heatmap/mapa/instant")
def get_mapa_heatmap_instant(
    usina: str = Query(...),
    date: str = Query(...),
    time: str = Query(...), # HH:MM
    filters: Optional[str] = Query(None, description="Filtros separados por vírgula"),
    variavel: Optional[str] = Query("potencia_cc", description="Variável a ser plotada (potencia_cc ou tensao_cc)")
):
    """
    Retorna a potência instantânea (e kwp) para o Mapa no minuto exato.
    Usa um cache em memória para não precisar reler o Parquet a cada clique.
    """
    from services.parquet_service import DATA_DIR
    from services.mapping_service import load_mapping
    from routes.upload import get_mapa_path
    import pyarrow.parquet as pq
    import pandas as pd
    import json
    
    path_mapa = get_mapa_path(usina)
    if not os.path.exists(path_mapa):
        raise HTTPException(status_code=404, detail="Layout de Mapa não encontrado.")
    
    with open(path_mapa, "r", encoding="utf-8") as f:
        layout = json.load(f)
        
    target_series = [cell["label"] for cell in layout if "label" in cell]
    if not target_series:
        raise HTTPException(status_code=422, detail="Nenhuma série encontrada.")

    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    cols_to_read = list(set(target_series)) + active_filters
    
    from services.synthetic_service import build_lookup, get_source_cols, compute_synthetic
    synth_lookup = build_lookup(usina)
    all_needed_cols = list(set(target_series)) + active_filters
    
    tensao_mapping = {}
    if variavel == "tensao_cc":
        if usina not in _tensao_mapping_cache:
            mapping_temp = {}
            for col in target_series:
                if col in synth_lookup:
                    synth_def = synth_lookup[col]
                    sources = get_source_cols(synth_def)
                    tensao_cols = [s for s in sources if "tensao" in s.lower() or "voltage" in s.lower()]
                    if tensao_cols:
                        mapping_temp[col] = tensao_cols[0]
            _tensao_mapping_cache[usina] = mapping_temp
            
        tensao_mapping = _tensao_mapping_cache[usina]
        for col, t_col in tensao_mapping.items():
            if t_col not in cols_to_read:
                cols_to_read.append(t_col)
        
        synth_in_target = {col: synth_lookup[col] for col in active_filters if col in synth_lookup}
    else:
        synth_in_target = {col: synth_lookup[col] for col in all_needed_cols if col in synth_lookup}
        
    for synth_name, synth_def in synth_in_target.items():
        if synth_name in cols_to_read:
            cols_to_read.remove(synth_name)
        for src in get_source_cols(synth_def):
            if src not in cols_to_read:
                cols_to_read.append(src)

    target_ts = pd.to_datetime(f"{date} {time}")

    path = os.path.join(DATA_DIR, usina, f"{date}.parquet")
    processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
    
    cache_key = f"{usina}_{date}"
    df_day = None
    
    if cache_key in _instant_cache:
        cached_data = _instant_cache[cache_key]
        if set(cols_to_read).issubset(cached_data["attempted_cols"]):
            df_day = cached_data["df"]

    if df_day is None:
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = {f.name for f in schema}
            valid_cols = [c for c in cols_to_read if c in parquet_cols]
            if valid_cols or "timestamp" in parquet_cols:
                read_cols = list(set(valid_cols + ["timestamp"]))
                # Carrega o dia inteiro (sem filtro) para ficar no cache
                df_day = pd.read_parquet(path, columns=read_cols)
                
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = {f.name for f in schema_proc}
            valid_proc = [c for c in cols_to_read if c in proc_cols]
            if valid_proc:
                read_proc = list(set(valid_proc + ["timestamp"]))
                df_proc = pd.read_parquet(processed_path, columns=read_proc)
                if df_day is not None and not df_day.empty and not df_proc.empty:
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                elif not df_proc.empty:
                    df_day = df_proc
        
        if df_day is not None and not df_day.empty and "timestamp" in df_day.columns:
            df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
            
            for synth_name, synth_def in synth_in_target.items():
                try:
                    df_day[synth_name] = compute_synthetic(df_day, synth_def)
                except Exception:
                    df_day[synth_name] = None

            _instant_cache[cache_key] = {"df": df_day, "attempted_cols": set(cols_to_read)}
            # Limitar cache a 2 dias para não estourar RAM
            if len(_instant_cache) > 2:
                oldest = list(_instant_cache.keys())[0]
                del _instant_cache[oldest]
                
    import time as tm
    if df_day is None or df_day.empty or "timestamp" not in df_day.columns:
        return {"date": date, "time": time, "records": []}
    
    df_min = df_day[df_day["timestamp"] == target_ts].copy()
    
    if df_min.empty:
        return {"date": date, "time": time, "records": []}
            
    for f_col in active_filters:
        if f_col in df_min.columns:
            df_min = df_min[df_min[f_col] == 1]
            
    if df_min.empty:
        return {"date": date, "time": time, "records": []}
        
    # Gather kWp from Usina Info
    info_dict = {}
    try:
        from services.usina_info_service import load_usina_info
        info_dict = load_usina_info(usina) or {}
    except Exception:
        pass
    
    mapping = load_mapping(usina)
    row = df_min.iloc[0]
    
    try:
        records = []
        for serie in target_series:
            if variavel == "tensao_cc":
                actual_col = tensao_mapping.get(serie)
            else:
                actual_col = serie

            if actual_col and actual_col in df_min.columns:
                val = float(row[actual_col]) if pd.notnull(row[actual_col]) else None
                meta = mapping.get(serie, {})
                inversor = meta.get("inversor")
                skid = meta.get("skid")
                
                kwp = None
                if inversor and skid:
                    kwp = info_dict.get(skid, {}).get(inversor, {}).get("kwp")
                
                records.append({
                    "date": date,
                    "time": time,
                    "serie": serie,
                    "val": val,
                    "kwp": kwp,
                    "skid": skid,
                    "inversor": inversor,
                    "stringbox": meta.get("stringbox"),
                    "tracker": str(meta.get("tracker") or "").strip()
                })
                
        out_dict = {"date": date, "time": time, "records": records}
        import json
        from fastapi.responses import Response
        return Response(content=json.dumps(out_dict), media_type="application/json")
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


@router.get("/heatmap/trackers/instant")
def get_trackers_heatmap_instant(
    usina: str = Query(...),
    date: str = Query(...),
    time: str = Query(...),
    filters: Optional[str] = Query(None, description="Filtros separados por vírgula")
):
    """
    Retorna o erro instantâneo dos trackers (diferença entre TrackerRef e PosAngAtual).
    """
    from services.parquet_service import DATA_DIR
    from services.mapping_service import load_mapping
    import pyarrow.parquet as pq
    import pandas as pd
    import json
    
    mapping = load_mapping(usina)
    tracker_params = {}
    config_path = os.path.join(DATA_DIR, usina, "flow_config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            if "nodeConfigs" in cfg:
                tracker_params = cfg["nodeConfigs"].get("tracker", {}).get("trackerParams", {})
            else:
                for node in cfg.get("nodes", []):
                    if node.get("id") == "tracker":
                        tracker_params = node.get("data", {}).get("trackerParams", {})
                        break

    target_series = []
    tracker_groups = {} 
    
    for col, meta in mapping.items():
        if meta.get("elemento") == "Tracker":
            if ".PosAngAlvo" in col:
                base = col.replace(".PosAngAlvo", "")
                typ = "alvo"
            elif ".PosAngAtual" in col or ".PosAngMedido" in col:
                base = col.replace(".PosAngAtual", "").replace(".PosAngMedido", "")
                typ = "atual"
            else:
                continue

            target_series.append(col)
            if base not in tracker_groups:
                tracker_groups[base] = {
                    "skid": str(meta.get("skid") or ""),
                    "inversor": str(meta.get("inversor") or ""),
                    "stringbox": str(meta.get("stringbox") or ""),
                    "estacao": str(meta.get("estacao") or "")
                }
            tracker_groups[base][typ] = col

    if not target_series:
        raise HTTPException(status_code=422, detail="Nenhuma série encontrada para o elemento 'Tracker'.")

    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    cols_to_read = list(set(target_series)) + active_filters

    target_ts = pd.to_datetime(f"{date} {time}")

    path = os.path.join(DATA_DIR, usina, f"{date}.parquet")
    processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
    
    cache_key = f"{usina}_{date}"
    df_day = None
    
    if cache_key in _instant_cache:
        cached_data = _instant_cache[cache_key]
        if set(cols_to_read).issubset(cached_data["attempted_cols"]):
            df_day = cached_data["df"]

    if df_day is None:
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = {f.name for f in schema}
            valid_cols = [c for c in cols_to_read if c in parquet_cols]
            if valid_cols or "timestamp" in parquet_cols:
                read_cols = list(set(valid_cols + ["timestamp"]))
                df_day = pd.read_parquet(path, columns=read_cols)
                
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = {f.name for f in schema_proc}
            valid_proc = [c for c in cols_to_read if c in proc_cols]
            if valid_proc:
                read_proc = list(set(valid_proc + ["timestamp"]))
                df_proc = pd.read_parquet(processed_path, columns=read_proc)
                if df_day is not None and not df_day.empty and not df_proc.empty:
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                elif not df_proc.empty:
                    df_day = df_proc
        
        if df_day is not None and not df_day.empty and "timestamp" in df_day.columns:
            df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
            _instant_cache[cache_key] = {"df": df_day, "attempted_cols": set(cols_to_read)}
            if len(_instant_cache) > 2:
                oldest = list(_instant_cache.keys())[0]
                del _instant_cache[oldest]
                
    if df_day is None or df_day.empty or "timestamp" not in df_day.columns:
        return {"date": date, "time": time, "records": []}
        
    df_day = df_day[df_day["timestamp"] == target_ts].copy()
    
    if df_day.empty:
        return {"date": date, "time": time, "records": []}

    for f_col in active_filters:
        if f_col in df_day.columns:
            df_day = df_day[df_day[f_col] == 1]
            
    if df_day.empty:
        return {"date": date, "time": time, "records": []}

    # PVLib
    import pvlib
    import numpy as np

    lat = float(tracker_params.get("latitude", -23.55))
    lon = float(tracker_params.get("longitude", -46.63))
    gcr = float(tracker_params.get("gcr", 0.3))
    max_angle = float(tracker_params.get("max_angle", 60))
    time_offset = int(tracker_params.get("time_offset", 0))

    times_for_pvlib = pd.DatetimeIndex(df_day["timestamp"])
    if times_for_pvlib.tz is None:
        times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
    
    solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
    trk_true = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                         max_angle=max_angle, backtrack=True, gcr=gcr)
    
    ref_theta_vals = trk_true['tracker_theta'].values
    if tracker_params.get("inverter_sinal", False):
        ref_theta_vals = -ref_theta_vals
    
    # We only have 1 row, so shift doesn't make sense here. If time_offset is used, it needs previous data... 
    # But for an instant view, applying shift requires loading the whole day.
    # To keep it fast, we can't do shift properly here on just 1 row.
    # We will compute the reference angle exactly for target_ts - time_offset periods.
    if time_offset != 0:
        offset_ts = pd.DatetimeIndex([target_ts - pd.Timedelta(minutes=time_offset)])
        offset_ts = offset_ts.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
        solpos_off = pvlib.solarposition.get_solarposition(offset_ts, lat, lon)
        trk_true_off = pvlib.tracking.singleaxis(solpos_off['apparent_zenith'], solpos_off['azimuth'], 
                                                 max_angle=max_angle, backtrack=True, gcr=gcr)
        ref_theta_vals = trk_true_off['tracker_theta'].values
        if tracker_params.get("inverter_sinal", False):
            ref_theta_vals = -ref_theta_vals

    df_day["TrackerRef"] = ref_theta_vals

    row = df_day.iloc[0]
    records = []
    
    for base, data in tracker_groups.items():
        diff_alvo = None
        diff_atual = None

        col_alvo = data.get("alvo")
        if col_alvo and col_alvo in df_day.columns and pd.notnull(row[col_alvo]):
            diff_alvo = round(float(abs(row[col_alvo] - row["TrackerRef"])), 4)

        col_atual = data.get("atual")
        if col_atual and col_atual in df_day.columns and pd.notnull(row[col_atual]):
            diff_atual = round(float(abs(row[col_atual] - row["TrackerRef"])), 4)

        if diff_alvo is not None or diff_atual is not None:
            records.append({
                "date": date,
                "time": time,
                "tracker": base.split("-")[-1],
                "base": base,
                "skid": data["skid"],
                "inversor": data["inversor"],
                "stringbox": data["stringbox"],
                "estacao": data["estacao"],
                "diff_alvo": diff_alvo,
                "diff_atual": diff_atual,
                "serie_alvo": col_alvo,
                "serie_atual": col_atual
            })
            
    out_dict = {
        "date": date,
        "time": time,
        "records": records
    }
    import json
    from fastapi.responses import Response
    return Response(content=json.dumps(out_dict), media_type="application/json")


@router.get("/heatmap/tracker_chart")
def get_tracker_chart(usina: str, date: str, alvo: str = None, atual: str = None, filters: str = None):
    from services.parquet_service import _parquet_path
    import pyarrow.parquet as pq
    import pandas as pd
    import pvlib
    import numpy as np
    import json
    
    config_path = os.path.join(os.path.dirname(__file__), "..", "data", usina, "flow_config.json")
    tracker_params = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            flow_data = json.load(f)
            if "nodeConfigs" in flow_data:
                tracker_params = flow_data["nodeConfigs"].get("tracker", {}).get("trackerParams", {})
            else:
                for node in flow_data.get("nodes", []):
                    if node.get("id") == "tracker":
                        tracker_params = node.get("data", {}).get("trackerParams", {})
                        break
                        
    lat = float(tracker_params.get("latitude", -23.55))
    lon = float(tracker_params.get("longitude", -46.63))
    gcr = float(tracker_params.get("gcr", 0.3))
    max_angle = float(tracker_params.get("max_angle", 60))
    time_offset = int(tracker_params.get("time_offset", 0))
    tolerance = float(tracker_params.get("tolerance", 10))
    
    from services.parquet_service import DATA_DIR
    active_filters = [f.strip() for f in filters.split(",")] if filters else []
    if "Dados Válidos" not in active_filters:
        active_filters.append("Dados Válidos")
    
    path = _parquet_path(date, usina)
    processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")
    
    from services.synthetic_service import build_lookup, get_source_cols, compute_synthetic
    from services.mapping_service import load_mapping
    
    mapping = load_mapping(usina)
    tracker_strings = []
    meta_base = mapping.get(alvo) if alvo else mapping.get(atual)
    if meta_base:
        t_skid = meta_base.get("skid")
        t_inv = meta_base.get("inversor")
        t_sb = meta_base.get("stringbox")
        t_tr = meta_base.get("tracker")
        if t_skid and t_inv and t_sb and t_tr:
            for col, meta in mapping.items():
                el = meta.get("elemento", "").lower()
                if "pot" in el and "string" in el and "cc" in el and \
                   meta.get("skid") == t_skid and \
                   meta.get("inversor") == t_inv and \
                   meta.get("stringbox") == t_sb and \
                   meta.get("tracker") == t_tr:
                    tracker_strings.append(col)
    
    cols_to_read = list(active_filters) + tracker_strings
    synth_lookup = build_lookup(usina)
    synth_in_target = {col: synth_lookup[col] for col in cols_to_read if col in synth_lookup}
    for synth_name, synth_def in list(synth_in_target.items()):
        if synth_name in cols_to_read:
            cols_to_read.remove(synth_name)
        for src in get_source_cols(synth_def):
            if src not in cols_to_read:
                cols_to_read.append(src)
                
    df_raw = None
    if os.path.exists(path):
        schema = pq.read_schema(path)
        cols_in_file = schema.names
        read_cols = ["timestamp"]
        if alvo and alvo in cols_in_file: read_cols.append(alvo)
        if atual and atual in cols_in_file and atual not in read_cols: read_cols.append(atual)
        valid_cols = [c for c in cols_to_read if c in cols_in_file and c not in read_cols]
        read_cols.extend(valid_cols)
        if "Tracker_is_backtracking" in cols_in_file and "Tracker_is_backtracking" not in read_cols:
            read_cols.append("Tracker_is_backtracking")
        df_raw = pd.read_parquet(path, columns=read_cols)
        
    df_proc = None
    if os.path.exists(processed_path):
        schema_proc = pq.read_schema(processed_path)
        cols_in_proc = schema_proc.names
        valid_proc = [c for c in cols_to_read if c in cols_in_proc]
        if valid_proc:
            read_proc = ["timestamp"] + valid_proc
            if "Tracker_is_backtracking" in cols_in_proc and "Tracker_is_backtracking" not in read_proc:
                read_proc.append("Tracker_is_backtracking")
            if "Potência CC Média Strings OK" in cols_in_proc and "Potência CC Média Strings OK" not in read_proc:
                read_proc.append("Potência CC Média Strings OK")
            if "Potência CC Média Strings OK_válida" in cols_in_proc and "Potência CC Média Strings OK_válida" not in read_proc:
                read_proc.append("Potência CC Média Strings OK_válida")
            df_proc = pd.read_parquet(processed_path, columns=list(set(read_proc)))
            
    if df_raw is not None and df_proc is not None:
        df_raw = df_raw.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
        df_proc = df_proc.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
        df = df_raw.merge(df_proc, on="timestamp", how="outer")
    elif df_raw is not None:
        df = df_raw.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
    elif df_proc is not None:
        df = df_proc.set_index("timestamp").resample("1min").mean(numeric_only=True).reset_index()
    else:
        raise HTTPException(status_code=404, detail="Parquet not found")
        
    for synth_name, synth_def in synth_in_target.items():
        try:
            df[synth_name] = compute_synthetic(df, synth_def)
        except Exception:
            df[synth_name] = 0.0

    df.set_index("timestamp", inplace=True)
    
    times_for_pvlib = pd.DatetimeIndex(df.index.values)
    if times_for_pvlib.tz is None:
        times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
        
    if time_offset != 0:
        times_for_pvlib = times_for_pvlib - pd.Timedelta(minutes=time_offset)
        
    solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
    trk = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                    max_angle=max_angle, backtrack=True, gcr=gcr)
    
    pvlib_series = trk['tracker_theta'].values
    if tracker_params.get("inverter_sinal", False):
        pvlib_series = -pvlib_series
        
    df["pvlib"] = pvlib_series
    
    # Substituir os valores NaN e infinity de alvo e atual antes de converter pra lista
    alvo_list = [round(x, 2) if pd.notnull(x) else None for x in df[alvo]] if alvo and alvo in df else None
    atual_list = [round(x, 2) if pd.notnull(x) else None for x in df[atual]] if atual and atual in df else None
    
    # Calculate Vento and Travado flags
    base = None
    if alvo and ".PosAngAlvo" in alvo:
        base = alvo.replace(".PosAngAlvo", "")
    elif atual and (".PosAngAtual" in atual or ".PosAngMedido" in atual):
        base = atual.replace(".PosAngAtual", "").replace(".PosAngMedido", "")
        
    erro_alvo_col = f"tracker_{base}_erro_alvo" if base else None
    vento_col = f"tracker_{base}_vento" if base else None
    travado_col = f"tracker_{base}_travado" if base else None
    
    if erro_alvo_col and erro_alvo_col in df.columns and travado_col and travado_col in df.columns:
        mask_erro_alvo = df[erro_alvo_col] == 1
        mask_vento = df[vento_col] == 1 if vento_col in df.columns else pd.Series(False, index=df.index)
        mask_travado = df[travado_col] == 1
    else:
        if atual and atual in df.columns:
            mask_erro_atual = (df[atual] - df["pvlib"]).abs() > tolerance
        else:
            mask_erro_atual = pd.Series(False, index=df.index)
            
        if alvo and alvo in df.columns:
            mask_alvo_divergente = (df[alvo] - df["pvlib"]).abs() > tolerance
        else:
            mask_alvo_divergente = pd.Series(False, index=df.index)
            
        mask_erro_alvo = mask_alvo_divergente & mask_erro_atual
        mask_travado = mask_erro_atual & ~mask_erro_alvo
        if alvo and alvo in df.columns:
            mask_vento = mask_erro_alvo & (df[alvo] == tracker_params.get("angulo_defesa", -60))
        else:
            mask_vento = pd.Series(False, index=df.index)
        
    has_data = pd.Series(False, index=df.index)
    if alvo and alvo in df.columns: has_data = has_data | df[alvo].notnull()
    if atual and atual in df.columns: has_data = has_data | df[atual].notnull()

    if active_filters:
        valid_data = pd.Series(True, index=df.index)
        for f_col in active_filters:
            if f_col in df.columns:
                valid_data = valid_data & (df[f_col] == 1)
        valid_data = valid_data & has_data
    else:
        valid_data = has_data.copy()
        
    mask_ok = has_data & df["pvlib"].notnull() & ~mask_erro_alvo & ~mask_travado
    
    backtracking_list = []
    if "Tracker_is_backtracking" in df.columns:
        backtracking_list = [1 if (b == 1 and pd.notnull(p)) else 0 for b, p in zip(df["Tracker_is_backtracking"], df["pvlib"])]
    else:
        backtracking_list = [0] * len(df)
        
    erro_alvo_list = [1 if e else 0 for e in mask_erro_alvo]
    vento_list = [1 if v else 0 for v in mask_vento]
    travado_list = [1 if t else 0 for t in mask_travado]
    ok_list = [1 if o else 0 for o in mask_ok]
    valido_list = [1 if v else 0 for v in valid_data]
    
    strings_data = {}
    for sc in tracker_strings:
        if sc in df.columns:
            strings_data[sc] = [round(x, 2) if pd.notnull(x) else None for x in df[sc]]
            
    if "Potência CC Média Strings OK" in df.columns:
        strings_data["Potência CC Média Strings OK"] = [round(x, 2) if pd.notnull(x) else None for x in df["Potência CC Média Strings OK"]]
    if "Potência CC Média Strings OK_válida" in df.columns:
        strings_data["Potência CC Média Strings OK_válida"] = [round(x, 2) if pd.notnull(x) else None for x in df["Potência CC Média Strings OK_válida"]]
    
    return {
        "timestamps": df.index.strftime("%Y-%m-%d %H:%M:%S").tolist(),
        "alvo": alvo_list,
        "atual": atual_list,
        "pvlib": [round(x, 2) if pd.notnull(x) else None for x in df["pvlib"]],
        "tolerance": tolerance,
        "erro_alvo": erro_alvo_list,
        "vento": vento_list,
        "travado": travado_list,
        "ok": ok_list,
        "valido": valido_list,
        "backtracking": backtracking_list,
        "strings_data": strings_data
    }
