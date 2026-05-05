import os
import json
from utils.config import DATA_DIR
from utils.logger import logger

SETTINGS_FILE = os.path.join(DATA_DIR, "element_settings.json")

DEFAULT_ELEMENT_SETTINGS = [
  { "element": 'Tracker',             "axis": 'y3', "colors": ['#6A1B9A'], "width": 1.5, "dash": 'solid' },
  { "element": 'Corrente CA',         "axis": 'y3', "colors": ['#D81B60'], "width": 1.5, "dash": 'solid' },
  { "element": 'Corrente CC Total',   "axis": 'y3', "colors": ['#D81B60'], "width": 1.5, "dash": 'solid' },
  { "element": 'Corrente CC String',  "axis": 'y3', "colors": ['#D81B60'], "width": 1.5, "dash": 'solid' },
  { "element": 'Irradiação',          "axis": 'y1', "colors": ['#F9CC00'], "width": 1.5, "dash": 'solid' },
  { "element": 'Potência CA Inv',     "axis": 'y2', "colors": ['#2E7D32'], "width": 1.5, "dash": 'solid' },
  { "element": 'Sujidade',            "axis": 'y3', "colors": ['#6D4C41'], "width": 1.5, "dash": 'solid' },
  { "element": 'Temperatura Módulo',  "axis": 'y3', "colors": ['#EF6C00'], "width": 1.5, "dash": 'solid' },
  { "element": 'Tensão CA Inv',       "axis": 'y3', "colors": ['#000000'], "width": 1.5, "dash": 'solid' },
  { "element": 'Tensão CC Inv',       "axis": 'y3', "colors": ['#000000'], "width": 1.5, "dash": 'solid' },
  { "element": 'Tensão CC Stringbox', "axis": 'y3', "colors": ['#000000'], "width": 1.5, "dash": 'solid' },
  { "element": 'Velocidade do Vento', "axis": 'y3', "colors": ['#0277BD'], "width": 1.5, "dash": 'solid' },
  { "element": 'Potência CC String',  "axis": 'y3', "colors": ['#999999'], "width": 1.5, "dash": 'solid' },
  { "element": 'Potência CA PPC',     "axis": 'y2', "colors": ['#00838F'], "width": 1.5, "dash": 'solid' },
  { "element": 'Filtro',              "axis": 'y3', "colors": ['#000000'], "width": 1.5, "dash": 'dash' },
]

def load_element_settings() -> list[dict]:
    """Carrega as configurações de elementos do servidor, ou defaults."""
    if not os.path.exists(SETTINGS_FILE):
        return DEFAULT_ELEMENT_SETTINGS
    
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            stored = json.load(f)
            
        # Garante que os defaults que não existem no salvo sejam mesclados
        existing_elements = {s.get("element") for s in stored}
        missing_defaults = [d for d in DEFAULT_ELEMENT_SETTINGS if d["element"] not in existing_elements]
        
        return stored + missing_defaults
    except Exception as e:
        logger.error(f"[SETTINGS] Erro ao carregar element_settings.json: {e}")
        return DEFAULT_ELEMENT_SETTINGS

def save_element_settings(settings: list[dict]) -> None:
    """Salva a lista de configurações de elementos no servidor."""
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    logger.info(f"[SETTINGS] {len(settings)} elementos salvos.")

def get_registered_elements_names() -> list[str]:
    """Retorna apenas a lista de nomes dos elementos cadastrados."""
    settings = load_element_settings()
    return [s.get("element") for s in settings if s.get("element")]
