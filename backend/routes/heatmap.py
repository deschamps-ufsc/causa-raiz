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
    
    for col in target_series:
        if col not in df.columns:
            continue
            
        total_sum = df[col].sum()
        avg_val = float(df[col].mean()) if not df[col].empty else 0.0
        # Integralizamos assumindo dados minuto-a-minuto: sum / 60
        integral = float(total_sum) / 60.0
        
        kwp_val = 0.0
        
        meta = mapping.get(col, {})
        m_sk = str(meta.get("skid") or "").strip()
        m_in = str(meta.get("inversor") or "").strip()
        m_sb = str(meta.get("stringbox") or "").strip()
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
            "serie": col,
            "skid": m_sk,
            "inversor": m_in,
            "stringbox": m_sb,
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

