"""
Serviço de gerenciamento de Usinas.
Lida com metadados, estatísticas agregadas e operações de diretório.
"""
import os
import json
import shutil
from datetime import datetime
from utils.config import DATA_DIR
from utils.logger import logger
from services.mapping_service import load_mapping
from services.usina_info_service import load_usina_info
from services.synthetic_service import load_synthetics

METADATA_FILE = "metadata.json"
USINA_ORDER_FILE = "usinas_order.json"

def get_usina_order() -> list[str]:
    path = os.path.join(DATA_DIR, USINA_ORDER_FILE)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_usina_order(order: list[str]):
    path = os.path.join(DATA_DIR, USINA_ORDER_FILE)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(order, f, ensure_ascii=False)

def get_usina_metadata(usina: str) -> dict:
    """Retorna metadados da usina (data criação, criador)."""
    path = os.path.join(DATA_DIR, usina, METADATA_FILE)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
            
    # Fallback para usinas sem metadata.json
    try:
        mtime = os.path.getmtime(os.path.join(DATA_DIR, usina))
        return {
            "criado_em": datetime.fromtimestamp(mtime).isoformat(),
            "criado_por": "Sistema (Legado)"
        }
    except Exception:
        return {
            "criado_em": datetime.now().isoformat(),
            "criado_por": "Desconhecido"
        }

def save_usina_metadata(usina: str, metadata: dict):
    """Salva metadados na pasta da usina."""
    path = os.path.join(DATA_DIR, usina, METADATA_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

def get_usina_stats(usina: str) -> dict:
    """Calcula estatísticas agregadas da usina."""
    try:
        mapping = load_mapping(usina)
        info = load_usina_info(usina)
        synthetics = load_synthetics(usina)
        
        # Elementos, Séries Mapeadas e Trackers
        elementos = set()
        series_mapeadas = 0
        trackers = set()
        skids = set()
        inversores = set()
        stringboxes = set()

        for col, data in mapping.items():
            s = data.get("skid", "")
            i = data.get("inversor", "")
            sb = data.get("stringbox", "")
            if s: skids.add(s)
            if s and i: inversores.add(f"{s}|{i}")
            if s and i and sb: stringboxes.add(f"{s}|{i}|{sb}")

            el = data.get("elemento")
            if el:
                elementos.add(el)
                series_mapeadas += 1
            t = data.get("tracker")
            if t:
                trackers.add(f"{s}|{i}|{sb}|{t}")
                
        # Potência, Strings, Módulos
        total_mwp = 0.0
        total_strings = len(info)
        total_modulos = 0
        for key, record in info.items():
            total_mwp += record.get("kwp", 0) / 1000.0
            total_modulos += record.get("qtde_modulos", 0)
            s = record.get("skid", "")
            i = record.get("inversor", "")
            sb = record.get("stringbox", "")
            
            # Fallback para JSONs legados que não continham esses campos no valor
            if not s and key:
                parts = str(key).split("|")
                if len(parts) > 0: s = parts[0]
                if len(parts) > 1: i = parts[1]
                if len(parts) > 2: sb = parts[2]

            if s: skids.add(s)
            if s and i: inversores.add(f"{s}|{i}")
            if s and i and sb: stringboxes.add(f"{s}|{i}|{sb}")
            
        # Sintéticas
        total_sinteticas = 0
        for batch in synthetics.values():
            total_sinteticas += len(batch.get("series", []))
            
        # Dias presentes
        from services.parquet_service import list_available_dates
        dates = list_available_dates(usina)
        dias_presentes = len(dates)
        
        # Processadas
        total_processadas = 0
        if dates:
            import pyarrow.parquet as pq
            # Tenta ler o schema do primeiro dia processado disponível
            for d in dates:
                processed_path = os.path.join(DATA_DIR, usina, "processed", f"{d}.parquet")
                if os.path.exists(processed_path):
                    try:
                        schema = pq.read_schema(processed_path)
                        total_processadas = len([f.name for f in schema if f.name != "timestamp"])
                        break
                    except Exception:
                        pass
                        
        # Campanhas
        count_campanhas = 0
        campanhas_path = os.path.join(DATA_DIR, "campanhas.json")
        if os.path.exists(campanhas_path):
            try:
                with open(campanhas_path, "r", encoding="utf-8") as f:
                    campanhas_data = json.load(f)
                    if usina in campanhas_data:
                        count_campanhas = len(campanhas_data[usina])
            except Exception:
                pass
            
        return {
            "count_elementos": len(elementos),
            "count_series": series_mapeadas,
            "count_campanhas": count_campanhas,
            "total_mwp": round(total_mwp, 4),
            "total_strings": total_strings,
            "total_modulos": total_modulos,
            "total_skids": len(skids),
            "total_inversores": len(inversores),
            "total_stringboxes": len(stringboxes),
            "total_trackers": len(trackers),
            "total_sinteticas": total_sinteticas,
            "dias_presentes": dias_presentes,
            "total_processadas": total_processadas
        }
    except Exception as e:
        logger.error(f"[USINA_SERVICE] Erro ao obter stats da usina {usina}: {e}")
        return {
            "count_elementos": 0, "count_series": 0, "count_campanhas": 0, "total_mwp": 0,
            "total_strings": 0, "total_modulos": 0, "total_sinteticas": 0,
            "total_skids": 0, "total_inversores": 0, "total_stringboxes": 0, "total_trackers": 0,
            "dias_presentes": 0, "total_processadas": 0
        }

def delete_usina_dir(usina: str):
    """Remove completamente a pasta da usina."""
    path = os.path.join(DATA_DIR, usina)
    if os.path.exists(path):
        shutil.rmtree(path)
        logger.info(f"[USINA_SERVICE] Usina deletada: {usina}")

def rename_usina_dir(old_name: str, new_name: str):
    """Renomeia a pasta da usina."""
    old_path = os.path.join(DATA_DIR, old_name)
    new_path = os.path.join(DATA_DIR, new_name)
    if not os.path.exists(old_path):
        raise FileNotFoundError(f"Usina '{old_name}' não encontrada.")
    if os.path.exists(new_path):
        raise ValueError(f"Já existe uma usina com o nome '{new_name}'.")
    os.rename(old_path, new_path)
    logger.info(f"[USINA_SERVICE] Usina renomeada: {old_name} -> {new_name}")
