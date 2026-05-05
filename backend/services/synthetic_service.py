"""
Serviço de Séries Sintéticas — modelo em GRUPOS (batches).

Cada upload cria um grupo com:
  - nome descritivo
  - lista de séries (cada uma com serie_1, serie_2, serie_3)
  - UMA única fórmula aplicada a todas as séries do grupo

Estrutura salva em synthetic_series.json:
{
  "batch_abc123": {
    "nome": "Potência CC por String",
    "formula": "S1 * S2",
    "criado_em": "2025-04-13T...",
    "series": [
      {"nome_sintetico": "CLS01..PotCC01", "serie_1": "...", "serie_2": "...", "serie_3": null},
      ...
    ]
  }
}
"""
import io
import json
import os
import re
import uuid
from datetime import datetime

import pandas as pd

from utils.config import DATA_DIR
from utils.logger import logger

_SAFE_TOKEN_RE = re.compile(r'^[\s\d\+\-\*\/\(\)\.S123]+$')


def _synthetic_file(usina: str) -> str:
    return os.path.join(DATA_DIR, usina, "synthetic_series.json")


# ── Carregar / Salvar ─────────────────────────────────────────────────────────

def load_synthetics(usina: str) -> dict:
    """Retorna dict { batch_id: { nome, formula, criado_em, series: [...] } }."""
    path = _synthetic_file(usina)
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_synthetics(usina: str, data: dict) -> None:
    path = _synthetic_file(usina)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info(f"[SYNTHETIC] Salvo: {len(data)} grupos → {path}")


# ── Lookup plano: nome_sintetico → definição ──────────────────────────────────

def build_lookup(usina: str) -> dict:
    """
    Retorna {nome_sintetico: { formula, serie_1, serie_2, serie_3 }}
    Usado pelo heatmap para computar séries sob demanda.
    """
    lookup = {}
    for batch in load_synthetics(usina).values():
        formula = batch.get("formula")
        for s in batch.get("series", []):
            lookup[s["nome_sintetico"]] = {
                "formula": formula,
                "serie_1": s.get("serie_1"),
                "serie_2": s.get("serie_2"),
                "serie_3": s.get("serie_3"),
            }
    return lookup


# ── Import Excel → cria novo grupo ────────────────────────────────────────────

def import_refs_from_excel(content: bytes, usina: str, nome_grupo: str = "") -> dict:
    """
    Lê Excel com colunas:
        Série Sintética | Série 1 | Série 2 | Série 3
    Cria um novo grupo (batch). Não sobrescreve grupos existentes.
    """
    df = pd.read_excel(io.BytesIO(content), engine="openpyxl")

    col_map = {}
    for c in df.columns:
        norm = c.strip().lower().replace(" ", "_").replace("é", "e").replace("ó", "o")
        col_map[c] = norm
    df.rename(columns=col_map, inplace=True)

    def find_col(keywords):
        for kw in keywords:
            matches = [c for c in df.columns if kw in c]
            if matches:
                return matches[0]
        return None

    col_sint = find_col(["sintetica", "sintetico", "nome", "saida"])
    col_s1   = find_col(["serie_1", "s1", "entrada_1", "entrada1"])
    col_s2   = find_col(["serie_2", "s2", "entrada_2", "entrada2"])
    col_s3   = find_col(["serie_3", "s3", "entrada_3", "entrada3"])

    if not col_sint or not col_s1:
        raise ValueError(
            "O Excel deve ter pelo menos as colunas: Série Sintética, Série 1. "
            f"Colunas encontradas: {list(df.columns)}"
        )

    series = []
    for _, row in df.iterrows():
        def clean(v):
            if pd.isna(v) or str(v).strip().lower() in ("nan", ""):
                return None
            return str(v).strip()

        nome = clean(row.get(col_sint))
        if not nome:
            continue

        series.append({
            "nome_sintetico": nome,
            "serie_1": clean(row.get(col_s1)) if col_s1 else None,
            "serie_2": clean(row.get(col_s2)) if col_s2 else None,
            "serie_3": clean(row.get(col_s3)) if col_s3 else None,
        })

    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    batch = {
        "nome": nome_grupo or f"Grupo {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        "formula": None,
        "criado_em": datetime.now().isoformat(),
        "series": series,
    }

    existing = load_synthetics(usina)
    existing[batch_id] = batch
    save_synthetics(usina, existing)

    return {
        "batch_id": batch_id,
        "nome": batch["nome"],
        "total_series": len(series),
    }


# ── Salvar fórmula do grupo ───────────────────────────────────────────────────

def set_batch_formula(usina: str, batch_id: str, formula: str, nome: str = None) -> dict:
    if not _SAFE_TOKEN_RE.match(formula):
        raise ValueError(
            "Fórmula inválida. Use apenas operações aritméticas com S1, S2, S3. "
            f"Recebido: {formula!r}"
        )
    data = load_synthetics(usina)
    if batch_id not in data:
        raise KeyError(f"Grupo '{batch_id}' não encontrado.")
    data[batch_id]["formula"] = formula
    if nome:
        data[batch_id]["nome"] = nome
    save_synthetics(usina, data)
    return data[batch_id]


# ── Deletar grupo ─────────────────────────────────────────────────────────────

def delete_batch(usina: str, batch_id: str) -> None:
    data = load_synthetics(usina)
    if batch_id not in data:
        raise KeyError(f"Grupo '{batch_id}' não encontrado.")
    del data[batch_id]
    save_synthetics(usina, data)


# ── Computar série sintética ──────────────────────────────────────────────────

def compute_synthetic(df: pd.DataFrame, definition: dict) -> pd.Series:
    """definition = { formula, serie_1, serie_2, serie_3 }"""
    formula = definition.get("formula")
    if not formula:
        raise ValueError("Série sintética sem fórmula cadastrada.")

    s1_col = definition.get("serie_1")
    s2_col = definition.get("serie_2")
    s3_col = definition.get("serie_3")

    S1 = df[s1_col].fillna(0) if s1_col and s1_col in df.columns else pd.Series(0, index=df.index)
    S2 = df[s2_col].fillna(0) if s2_col and s2_col in df.columns else pd.Series(0, index=df.index)
    S3 = df[s3_col].fillna(0) if s3_col and s3_col in df.columns else pd.Series(0, index=df.index)

    return eval(formula, {"__builtins__": {}}, {"S1": S1, "S2": S2, "S3": S3})  # noqa: S307


def get_source_cols(definition: dict) -> list[str]:
    return [c for c in [
        definition.get("serie_1"),
        definition.get("serie_2"),
        definition.get("serie_3"),
    ] if c]
