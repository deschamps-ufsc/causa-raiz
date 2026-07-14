import pandas as pd

raw_df = pd.read_parquet(r"e:\Antigravity\Causa Raiz\backend\data\Cortez - SPE São Claus 1\2025-11-28.parquet")
cols = [
    "CLS01.1-INV04-SB12-TR046.PosAngAlvo",
    "CLS01.1-INV04-SB12-TR046.PosAngAtual"
]

if "timestamp" in raw_df.columns:
    raw_df.set_index("timestamp", inplace=True)

subset = raw_df.between_time("11:45", "12:00")[cols]
print(subset.to_string())
