import os
import json
from utils.config import DATA_DIR
from utils.logger import logger

SETTINGS_FILE = os.path.join(DATA_DIR, "element_settings.json")
EQUIPAMENTOS_FILE = os.path.join(DATA_DIR, "equipamentos.json")

def load_element_settings() -> list[dict]:
    """Carrega as configurações de elementos do servidor."""
    if not os.path.exists(SETTINGS_FILE):
        return []
    
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            stored = json.load(f)
            
        return stored
    except Exception as e:
        logger.error(f"[SETTINGS] Erro ao carregar element_settings.json: {e}")
        return []

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

def load_equipamentos() -> dict:
    """Carrega o banco de módulos e inversores."""
    if not os.path.exists(EQUIPAMENTOS_FILE):
        return {"modulos": [], "inversores": []}
    try:
        with open(EQUIPAMENTOS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[SETTINGS] Erro ao carregar equipamentos.json: {e}")
        return {"modulos": [], "inversores": []}

def save_equipamentos(data: dict) -> None:
    """Salva o banco de módulos e inversores."""
    os.makedirs(os.path.dirname(EQUIPAMENTOS_FILE), exist_ok=True)
    with open(EQUIPAMENTOS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info(f"[SETTINGS] Equipamentos salvos: {len(data.get('modulos', []))} módulos, {len(data.get('inversores', []))} inversores.")
