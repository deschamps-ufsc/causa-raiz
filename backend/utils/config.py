"""
Configurações centralizadas do backend.
Altere aqui para ajustar comportamentos globais.
"""
import os

# ── Diretórios ────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")          # Pastas das usinas ficarão aqui
MD5_CACHE_FILE = os.path.join(BASE_DIR, "upload_cache.json")
LOG_FILE = os.path.join(BASE_DIR, "app.log")

# ── Parsing do Excel ──────────────────────────────────────────────────────────
# Primeira coluna é sempre o timestamp (índice 0)
TIMESTAMP_COL_INDEX = 0
# Formato usado no Excel: 04/12/2025  03:02:00
# pandas.read_excel com dayfirst=True resolve esse formato
TIMESTAMP_DAYFIRST = True

# ── Tipos de Elemento (Enum textual) ─────────────────────────────────────────
ELEMENTOS_VALIDOS = [
    "Tracker",
    "Corrente CA",
    "Corrente CC Total",
    "Corrente CC String",
    "Potência CC String",
    "Irradiação",
    "Potência CA Inv",
    "Potência CA PPC",
    "Sujidade",
    "Temperatura Módulo",
    "Tensão CA Inv",
    "Tensão CC Inv",
    "Tensão CC Stringbox",
    "Velocidade do Vento",
]

# ── Performance ───────────────────────────────────────────────────────────────
# Nº máximo de séries retornadas numa consulta /data para evitar sobrecarga
MAX_SERIES_PER_QUERY = 50
