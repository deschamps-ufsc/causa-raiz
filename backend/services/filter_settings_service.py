import os
import json
from utils.config import DATA_DIR
from utils.logger import logger

FILTER_SETTINGS_FILE = os.path.join(DATA_DIR, "filter_settings.json")

def load_filter_settings() -> list[dict]:
    """Carrega as configurações padrão de filtros do servidor."""
    if not os.path.exists(FILTER_SETTINGS_FILE):
        return []
    
    try:
        with open(FILTER_SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[SETTINGS] Erro ao carregar filter_settings.json: {e}")
        return []

def save_filter_settings(settings: list[dict]) -> None:
    """Salva a lista de configurações padrão de filtros no servidor."""
    os.makedirs(os.path.dirname(FILTER_SETTINGS_FILE), exist_ok=True)
    with open(FILTER_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    logger.info(f"[SETTINGS] {len(settings)} filtros salvos.")
