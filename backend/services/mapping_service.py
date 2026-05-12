"""
Serviço do sistema de mapeamento de séries (Mapeamento de Séries).
Responsável por:
  - Carregar / salvar series_map.json
  - Importar Excel de Mapeamento de Séries enviado pelo usuário
  - Validar o mapeamento contra colunas de um Parquet
  - Gerar template Excel para preenchimento
"""
import io
import json
import os
import re
from typing import Optional

import pandas as pd

def _natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

from utils.config import DATA_DIR, ELEMENTOS_VALIDOS
from utils.logger import logger
from services.settings_service import get_registered_elements_names


# ── Carregar / Salvar ─────────────────────────────────────────────────────────

def _get_mapping_file(usina: str) -> str:
    return os.path.join(DATA_DIR, usina, "series_map.json")


def load_mapping(usina: str) -> dict:
    """
    Carrega o mapeamento do arquivo JSON específico da usina.
    """
    mapping_file = _get_mapping_file(usina)
    if not os.path.exists(mapping_file):
        return {}
    with open(mapping_file, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mapping(mapping: dict, usina: str) -> None:
    """Persiste o mapeamento em disco."""
    mapping_file = _get_mapping_file(usina)
    os.makedirs(os.path.dirname(mapping_file), exist_ok=True)
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
    logger.info(f"[MAPPING] Salvo: {len(mapping)} entradas → {mapping_file}")


def get_series_info(col_name: str, usina: str) -> dict:
    """Retorna os metadados de uma série, ou dict vazio se não mapeada."""
    mapping = load_mapping(usina)
    if col_name in mapping:
        return {**mapping[col_name], "mapeada": True}
    return {"mapeada": False}


# ── Importar Excel Mapeamento de Séries ────────────────────────────────────────────────────

def import_from_excel(content: bytes, usina: str) -> dict:
    """
    Lê o Excel de Mapeamento de Séries enviado pelo usuário.

    Colunas esperadas (case-insensitive):
        coluna_excel | elemento | skid | inversor | stringbox

    Returns:
        dict com estatísticas do mapeamento importado
    """
    df = pd.read_excel(io.BytesIO(content), engine="openpyxl")

    # Normalizar nomes de colunas (lowercase, sem espaços extras)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Verificar coluna obrigatória
    if "coluna_excel" not in df.columns or "elemento" not in df.columns:
        raise ValueError(
            "O Excel de Mapeamento de Séries precisa ter pelo menos as colunas 'coluna_excel' e 'elemento'."
        )

    mapping = {}
    linhas_invalidas = 0

    for _, row in df.iterrows():
        col_name = str(row.get("coluna_excel", "")).strip()

        if not col_name or col_name.lower() in ("nan", ""):
            linhas_invalidas += 1
            continue

        elementoRaw = row.get("elemento", "")
        if pd.isna(elementoRaw) or str(elementoRaw).strip().lower() in ("nan", ""):
            elemento = ""
        else:
            elemento = str(elementoRaw).strip()

        entry = {"elemento": elemento}

        for field in ["skid", "inversor", "stringbox", "estacao", "string"]:
            val = row.get(field, None)
            if pd.notna(val) and str(val).strip().lower() not in ("", "nan"):
                val_str = str(val).strip()
                if val_str.endswith(".0"):
                    val_str = val_str[:-2]
                entry[field] = val_str
            else:
                entry[field] = None

        mapping[col_name] = entry

    # Substituir completamente o mapeamento existente (não mesclar)
    save_mapping(mapping, usina)

    elementos_encontrados = list({v["elemento"] for v in mapping.values() if v.get("elemento")})
    skids_encontrados = list({v["skid"] for v in mapping.values() if v.get("skid")})
    inversores_encontrados = list({v["inversor"] for v in mapping.values() if v.get("inversor")})
    stringboxes_encontrados = list({v["stringbox"] for v in mapping.values() if v.get("stringbox")})
    estacoes_encontradas = list({v["estacao"] for v in mapping.values() if v.get("estacao")})
    strings_encontradas = list({v["string"] for v in mapping.values() if v.get("string")})

    logger.info(
        f"[MAPPING] Importado: {len(mapping)} entradas, "
        f"{linhas_invalidas} linhas inválidas"
    )

    registered_elements = get_registered_elements_names()
    elementos_nao_cadastrados = sorted([e for e in elementos_encontrados if e and e != 'nan' and e not in registered_elements], key=_natural_sort_key)

    return {
        "total_mapeamentos": len(mapping),
        "linhas_invalidas": linhas_invalidas,
        "elementos_encontrados": sorted([e for e in elementos_encontrados if e and e != 'nan'], key=_natural_sort_key),
        "elementos_nao_cadastrados": elementos_nao_cadastrados,
        "skids_encontrados": sorted([s for s in skids_encontrados if s and s != 'nan'], key=_natural_sort_key),
        "inversores_encontrados": sorted([i for i in inversores_encontrados if i and i != 'nan'], key=_natural_sort_key),
        "stringboxes_encontrados": sorted([sb for sb in stringboxes_encontrados if sb and sb != 'nan'], key=_natural_sort_key),
        "estacoes_encontradas": sorted([es for es in estacoes_encontradas if es and es != 'nan'], key=_natural_sort_key),
        "strings_encontradas": sorted([st for st in strings_encontradas if st and st != 'nan'], key=_natural_sort_key),
    }


def get_mapping_summary(usina: str) -> dict:
    """
    Retorna estatísticas do mapeamento atual, semelhante ao retorno da importação.
    """
    mapping = load_mapping(usina)

    elementos_encontrados = list({v["elemento"] for v in mapping.values() if v.get("elemento")})
    skids_encontrados = list({v["skid"] for v in mapping.values() if v.get("skid")})
    inversores_encontrados = list({v["inversor"] for v in mapping.values() if v.get("inversor")})
    stringboxes_encontrados = list({v["stringbox"] for v in mapping.values() if v.get("stringbox")})
    estacoes_encontradas = list({v["estacao"] for v in mapping.values() if v.get("estacao")})
    strings_encontradas = list({v["string"] for v in mapping.values() if v.get("string")})

    registered_elements = get_registered_elements_names()
    elementos_nao_cadastrados = sorted([e for e in elementos_encontrados if e and e != 'nan' and e not in registered_elements], key=_natural_sort_key)

    return {
        "total_mapeamentos": len(mapping),
        "linhas_invalidas": 0,
        "elementos_encontrados": sorted([e for e in elementos_encontrados if e and e != 'nan'], key=_natural_sort_key),
        "elementos_nao_cadastrados": elementos_nao_cadastrados,
        "skids_encontrados": sorted([s for s in skids_encontrados if s and s != 'nan'], key=_natural_sort_key),
        "inversores_encontrados": sorted([i for i in inversores_encontrados if i and i != 'nan'], key=_natural_sort_key),
        "stringboxes_encontrados": sorted([sb for sb in stringboxes_encontrados if sb and sb != 'nan'], key=_natural_sort_key),
        "estacoes_encontradas": sorted([es for es in estacoes_encontradas if es and es != 'nan'], key=_natural_sort_key),
        "strings_encontradas": sorted([st for st in strings_encontradas if st and st != 'nan'], key=_natural_sort_key),
    }


# ── Validar mapeamento contra Parquet ─────────────────────────────────────────

def validate_mapping_against_parquet(parquet_columns: list[str], usina: str) -> dict:
    """
    Cruza as colunas do Parquet com o mapeamento atual.
    Retorna quais colunas estão sem mapeamento.
    """
    mapping = load_mapping(usina)
    mapeadas = [c for c in parquet_columns if c in mapping and c != "timestamp"]
    sem_mapeamento = [c for c in parquet_columns if c not in mapping and c != "timestamp"]

    logger.info(
        f"[VALIDATION] {len(mapeadas)} mapeadas, {len(sem_mapeamento)} sem mapeamento"
    )

    return {
        "total_colunas_parquet": len(parquet_columns),
        "total_mapeadas": len(mapeadas),
        "total_sem_mapeamento": len(sem_mapeamento),
        "colunas_sem_mapeamento": sem_mapeamento[:200],  # Limita a 200 para a resposta
    }


# ── Gerar Template Excel ──────────────────────────────────────────────────────

def generate_template_excel(colunas_parquet: Optional[list[str]] = None) -> bytes:
    """
    Gera um Excel template para o usuário preencher o Mapeamento de Séries.
    Se colunas_parquet for fornecido, pré-preenche a coluna 'coluna_excel'.
    """
    if colunas_parquet:
        data = {
            "coluna_excel": colunas_parquet,
            "elemento": [""] * len(colunas_parquet),
            "skid": [""] * len(colunas_parquet),
            "estacao": [""] * len(colunas_parquet),
            "inversor": [""] * len(colunas_parquet),
            "stringbox": [""] * len(colunas_parquet),
        }
    else:
        # Template vazio com exemplos
        data = {
            "coluna_excel": [
                "SKID01_INV01_STR01_POT_CC",
                "SKID01_INV01_PIRA_01",
                "SKID01_INV01_COR_CA",
            ],
            "elemento": [
                "Potência CC String",
                "Irradiação",
                "Corrente CA",
            ],
            "skid": ["SKID-01", "SKID-01", "SKID-01"],
            "estacao": ["EST-01", "EST-01", ""],
            "inversor": ["INV-01", "INV-01", "INV-01"],
            "stringbox": ["STB-01", "", ""],
        }

    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="DE-PARA")

        # Estilizar cabeçalho
        ws = writer.sheets["DE-PARA"]
        for cell in ws[1]:
            cell.font = __import__("openpyxl").styles.Font(bold=True, color="FFFFFF")
            cell.fill = __import__("openpyxl").styles.PatternFill(
                "solid", fgColor="1F2937"
            )

        # Ajustar largura das colunas
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = max(max_len + 4, 20)

    return output.getvalue()
