"""Find the EXACT error when processing 2+ days of tensao_cc."""
import sys, os, traceback
sys.path.insert(0, "e:/Antigravity/Causa Raiz/backend")

usina = "WEG - UFV Arapuá"
dates = "2026-02-01,2026-03-12"
variavel = "tensao_cc"
filters = None

import pandas as pd
import pyarrow.parquet as pq
from services.mapping_service import load_mapping
from services.synthetic_service import build_lookup, get_source_cols, compute_synthetic
from services.parquet_service import DATA_DIR

date_list = [d.strip() for d in dates.split(",") if d.strip()]

def get_mapa_path(u):
    return os.path.join(DATA_DIR, u.strip(), "mapa_layout.json")

import json
path_mapa = get_mapa_path(usina)

with open(path_mapa, "r", encoding="utf-8") as f:
    layout = json.load(f)
target_series = list(set([cell["label"] for cell in layout if "label" in cell]))

mapping = load_mapping(usina)

active_filters = []
cols_to_read = list(set(target_series)) + active_filters

synth_lookup = build_lookup(usina)
all_needed_cols = list(set(target_series)) + active_filters

tensao_mapping = {}
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

for synth_name, synth_def in synth_in_target.items():
    if synth_name in cols_to_read:
        cols_to_read.remove(synth_name)
    for src in get_source_cols(synth_def):
        if src not in cols_to_read:
            cols_to_read.append(src)

print(f"cols_to_read: {len(cols_to_read)}")

def _parquet_path(date, usina):
    return os.path.join(DATA_DIR, usina, f"{date}.parquet")

dfs = []
for date in date_list:
    path = _parquet_path(date, usina)
    processed_path = os.path.join(DATA_DIR, usina, "processed", f"{date}.parquet")

    df_day = None
    try:
        if os.path.exists(path):
            schema = pq.read_schema(path)
            parquet_cols = {f.name for f in schema}
            valid_cols_day = [c for c in cols_to_read if c in parquet_cols]

            if valid_cols_day:
                read_cols = valid_cols_day + (["timestamp"] if "timestamp" not in valid_cols_day else [])
                df_day = pd.read_parquet(path, columns=list(set(read_cols)))
                print(f"  {date}: loaded {len(df_day)} rows, {len(df_day.columns)} cols")
    except Exception as e:
        print(f"  {date}: ERROR loading raw: {e}")
        traceback.print_exc()

    try:
        if os.path.exists(processed_path):
            schema_proc = pq.read_schema(processed_path)
            proc_cols = {f.name for f in schema_proc}
            valid_proc_day = [c for c in cols_to_read if c in proc_cols]

            if valid_proc_day:
                read_proc = valid_proc_day + (["timestamp"] if "timestamp" not in valid_proc_day else [])
                df_proc = pd.read_parquet(processed_path, columns=list(set(read_proc)))
                print(f"  {date}: loaded {len(df_proc)} rows from processed")

                if df_day is not None:
                    df_day["timestamp"] = df_day["timestamp"].dt.floor("min")
                    df_proc["timestamp"] = df_proc["timestamp"].dt.floor("min")
                    df_day = df_day.merge(df_proc, on="timestamp", how="outer")
                else:
                    df_day = df_proc
    except Exception as e:
        print(f"  {date}: ERROR loading processed: {e}")
        traceback.print_exc()

    if df_day is not None:
        df_day["_date_str"] = date
        dfs.append(df_day)
    else:
        print(f"  {date}: NO DATA")

print(f"dfs count: {len(dfs)}")
if len(dfs) >= 2:
    print(f"df[0] cols: {len(dfs[0].columns)}, df[1] cols: {len(dfs[1].columns)}")
    # Check for column differences
    c0 = set(dfs[0].columns)
    c1 = set(dfs[1].columns)
    diff01 = c0 - c1
    diff10 = c1 - c0
    if diff01:
        print(f"  In df[0] but not df[1]: {len(diff01)} cols, e.g.: {list(diff01)[:5]}")
    if diff10:
        print(f"  In df[1] but not df[0]: {len(diff10)} cols, e.g.: {list(diff10)[:5]}")
    
    # Check dtype mismatches
    common = c0 & c1
    mismatches = []
    for c in common:
        if dfs[0][c].dtype != dfs[1][c].dtype:
            mismatches.append((c, str(dfs[0][c].dtype), str(dfs[1][c].dtype)))
    if mismatches:
        print(f"  Dtype mismatches: {len(mismatches)}")
        for m in mismatches[:10]:
            print(f"    {m[0]}: {m[1]} vs {m[2]}")

try:
    df = pd.concat(dfs, ignore_index=True)
    print(f"concat OK: {len(df)} rows, {len(df.columns)} cols")
except Exception as e:
    print(f"CONCAT ERROR: {e}")
    traceback.print_exc()

print("DONE")
