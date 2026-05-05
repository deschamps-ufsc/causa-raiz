"""
Logger padronizado. Importar e usar em qualquer módulo:
    from utils.logger import logger
"""
import logging
import sys
from utils.config import LOG_FILE

def _create_logger() -> logging.Logger:
    fmt = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] %(name)s -- %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Handler para console — errors='replace' evita falhas com emojis no Windows
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)
    console_handler.stream = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1, errors='replace', closefd=False)

    # Handler para arquivo — sempre UTF-8
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(fmt)

    log = logging.getLogger("usina_solar")
    log.setLevel(logging.INFO)
    if not log.handlers:
        log.addHandler(console_handler)
        log.addHandler(file_handler)

    return log

logger = _create_logger()
