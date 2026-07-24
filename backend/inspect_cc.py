import pandas as pd
import json
import os

usina = 'Cortez - SPE São Claus 1'
DATA_DIR = 'e:/Antigravity/Causa Raiz/backend/data'
usina_dir = os.path.join(DATA_DIR, usina)

mapping = json.load(open(os.path.join(usina_dir, 'series_map.json'), encoding='utf-8'))

tracker_groups = {}
for col, meta in mapping.items():
    if meta.get("elemento") == "Tracker":
        if col.endswith(".PosAngAlvo"):
            base = col.replace(".PosAngAlvo", "")
            typ = "alvo"
        elif col.endswith(".PosAngAtual") or col.endswith(".PosAngMedido"):
            base = col.replace(".PosAngAtual", "").replace(".PosAngMedido", "")
            typ = "atual"
        else:
            continue

        if base not in tracker_groups:
            tracker_groups[base] = {
                "skid": str(meta.get("skid") or ""),
                "inversor": str(meta.get("inversor") or ""),
                "stringbox": str(meta.get("stringbox") or ""),
                "tracker": str(meta.get("tracker") or "") or base.split("-")[-1],
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
                break

print("Total CC strings assigned to trackers:", sum(len(g['cc_strings']) for g in tracker_groups.values()))

# check parquet
df = pd.read_parquet(os.path.join(usina_dir, 'processed', '2026-06-16.parquet'))
if 'Potência CC Média Strings OK_válida' in df.columns:
    print('Potência CC Média Strings OK_válida missing vals:', df['Potência CC Média Strings OK_válida'].isna().sum(), 'out of', len(df))
    print('Potência CC Média Strings OK_válida non-missing:', df['Potência CC Média Strings OK_válida'].notna().sum())
