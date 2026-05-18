import os
import json
import pandas as pd
import numpy as np
from typing import List, Dict, Any
from utils.config import DATA_DIR
from utils.logger import logger
from services.parquet_service import _parquet_path, list_available_dates
from services.filter_settings_service import load_filter_settings

def get_processed_path(date: str, usina: str) -> str:
    processed_dir = os.path.join(DATA_DIR, usina, "processed")
    os.makedirs(processed_dir, exist_ok=True)
    return os.path.join(processed_dir, f"{date}.parquet")

def run_flow_processing(usina: str):
    """
    Executa o processamento de todo o fluxograma para a usina.
    """
    logger.info(f"[FLOW] Iniciando processamento para a usina: {usina}")
    
    # 1. Carregar Configurações
    flow_path = os.path.join(DATA_DIR, usina, "flow_config.json")
    if not os.path.exists(flow_path):
        logger.warning(f"[FLOW] flow_config.json não encontrado para {usina}")
        return {"status": "error", "message": "Configuração do fluxograma não encontrada."}
    
    with open(flow_path, "r", encoding="utf-8") as f:
        flow_config = json.load(f)
    
    # Suporte a formato antigo (lista direta) e novo (dict com nodes/edges)
    if isinstance(flow_config, list):
        nodes = flow_config
    else:
        nodes = flow_config.get("nodes", [])
    # edges = flow_config.get("edges", []) # Futuramente usado para ordem automática
    
    filters = load_filter_settings()
    filter_map = {f['name']: f for f in filters}
    
    available_dates = list_available_dates(usina)
    if not available_dates:
        return {"status": "error", "message": "Nenhum dado bruto encontrado."}

    # 2. Identificar Agregadores e Blocos Especiais
    aggregators = [n for n in nodes if n.get("data", {}).get("aggregator")]
    geff_nodes = [n for n in nodes if n.get("type") == "geff"]

    results_summary = []

    for date in available_dates:
        raw_path = _parquet_path(date, usina)
        if not os.path.exists(raw_path): continue
        
        raw_df = pd.read_parquet(raw_path)
        if "timestamp" in raw_df.columns:
            raw_df.set_index("timestamp", inplace=True)
        
        processed_df = pd.DataFrame(index=raw_df.index)
        
        # --- Primeiro processa os agregadores (Gpoa e Grear são agregadores) ---
        for agg in aggregators:
            # ... (lógica de agregação mantida)
            agg_id = agg["id"]
            inputs = agg.get("data", {}).get("inputs", [])
            if not inputs: continue
            
            all_input_series = []
            for inp in inputs:
                if isinstance(inp, str): inp = {"series": inp, "filter": "" }
                series_name = inp.get("series")
                filter_name = inp.get("filter")
                if not series_name: continue
                
                s_data = None
                if series_name.startswith("agg_"):
                    source_agg_id = series_name.replace("agg_", "")
                    if source_agg_id in processed_df.columns:
                        s_data = processed_df[source_agg_id].copy()
                elif series_name in raw_df.columns:
                    s_data = raw_df[series_name].copy()
                
                if s_data is None: continue
                
                if filter_name and filter_name in filter_map:
                    f_def = filter_map[filter_name]
                    if f_def.get("min_value") is not None:
                        s_data[s_data < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        s_data[s_data > f_def["max_value"]] = np.nan
                    if f_def.get("max_variation") is not None:
                        diff = s_data.diff().abs()
                        s_data[diff > f_def["max_variation"]] = np.nan
                
                all_input_series.append(s_data)
            
            if all_input_series:
                op = agg.get("data", {}).get("operation", "sum")
                combined = pd.concat(all_input_series, axis=1)
                if op == "mean":
                    agg_result = combined.mean(axis=1)
                else:
                    agg_result = combined.sum(axis=1, min_count=1)
                
                # Filtro final de saída
                out_filter_name = agg.get("data", {}).get("outputFilter")
                if out_filter_name and out_filter_name in filter_map:
                    f_def = filter_map[out_filter_name]
                    if f_def.get("min_value") is not None:
                        agg_result[agg_result < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        agg_result[agg_result > f_def["max_value"]] = np.nan
                    if f_def.get("max_variation") is not None:
                        diff = agg_result.diff().abs()
                        agg_result[diff > f_def["max_variation"]] = np.nan

                processed_df[agg_id] = agg_result

        # --- Depois processa o Bloco Geff (depende de Gpoa e Grear) ---
        for geff in geff_nodes:
            geff_id = geff["id"]
            data = geff.get("data", {})
            beta = data.get("beta", 1.0)
            SSF = data.get("SSF", 0.0)
            MLF = data.get("MLF", 0.0)
            
            # Geff = Gpoa + beta * Grear * (1 - SSF) * (1 - MLF)
            # Busca gpoa e grear no que já foi processado hoje
            gpoa = processed_df.get("gpoa")
            grear = processed_df.get("grear")
            
            if gpoa is not None and grear is not None:
                geff_result = gpoa + beta * grear * (1 - SSF) * (1 - MLF)
                processed_df[geff_id] = geff_result
            else:
                logger.warning(f"[GEFF] gpoa ou grear ausentes para {geff_id} em {date}")

        # --- Depois processa o Bloco Tcel (depende de Tmod e Gpoa) ---
        tcel_nodes = [n for n in nodes if n.get("type") == "tcel" or n.get("id") == "tcel"]
        for tcel in tcel_nodes:
            tcel_id = tcel["id"]
            tmod = processed_df.get("tmod")
            gpoa = processed_df.get("gpoa")
            
            if tmod is not None and gpoa is not None:
                tcel_result = tmod + (gpoa / 1000.0) * 3.0
                processed_df[tcel_id] = tcel_result
            else:
                logger.warning(f"[TCEL] tmod ou gpoa ausentes para {tcel_id} em {date}")

        # Salvar o dia processado
        if not processed_df.empty:
            out_path = get_processed_path(date, usina)
            # Salvamos resetando o index para incluir timestamp
            processed_df.reset_index().to_parquet(out_path)
            results_summary.append(date)

    logger.info(f"[FLOW] Processamento concluído para {len(results_summary)} dias.")
    return {
        "status": "ok", 
        "processed_days": len(results_summary),
        "aggregators": [a["id"] for a in aggregators]
    }

def get_flow_integrals(usina: str) -> Dict[str, Any]:
    """
    Calcula a integral (soma acumulada diária) para cada variável de entrada e saída
    do fluxograma, agrupado por dia.
    """
    logger.info(f"[FLOW] Calculando integrais diárias para usina: {usina}")
    flow_path = os.path.join(DATA_DIR, usina, "flow_config.json")
    if not os.path.exists(flow_path):
        return {"columns": [], "rows": []}

    with open(flow_path, "r", encoding="utf-8") as f:
        flow_config = json.load(f)
    
    if isinstance(flow_config, list):
        nodes = flow_config
    else:
        nodes = flow_config.get("nodes", [])

    filters = load_filter_settings()
    filter_map = {f['name']: f for f in filters}

    available_dates = list_available_dates(usina)
    if not available_dates:
        return {"columns": [], "rows": []}

    # Mapeamento limpo de labels dos agregadores
    aggregator_label_map = {
        "gpoa": "Gpoa",
        "grear": "Grear",
        "tamb": "Tamb",
        "tmod": "Tmod",
        "sujidade": "Sujidade",
        "energia": "Energia"
    }

    # Determinar a ordem das colunas
    # Queremos: Gpoa (entradas e saida) -> Grear (entradas e saida) -> Geff -> Tamb (entradas e saida) -> Tmod (entradas e saida) -> Tcel -> Sujidade (entradas e saida) -> Energia (entradas e saida)
    column_definitions = []
    
    # Ordem fixa dos grupos
    group_order = ["gpoa", "grear", "geff", "tamb", "tmod", "tcel", "sujidade", "energia"]

    for group in group_order:
        # Achar o nó correspondente
        node = next((n for n in nodes if n.get("id") == group), None)
        if not node: continue

        is_agg = node.get("data", {}).get("aggregator")
        
        if is_agg:
            # Primeiro as entradas
            inputs = node.get("data", {}).get("inputs", [])
            agg_label = aggregator_label_map.get(group, node.get("data", {}).get("label", group))
            
            for idx, inp in enumerate(inputs):
                if isinstance(inp, str):
                    series_name = inp
                    filter_name = ""
                else:
                    series_name = inp.get("series")
                    filter_name = inp.get("filter")
                
                if not series_name: continue
                
                # Criar chave única para a coluna
                col_key = f"{group}_in_{idx}"
                col_label = f"{agg_label} - Entrada {idx + 1}"
                column_definitions.append({
                    "key": col_key,
                    "label": col_label,
                    "type": "input",
                    "node_id": group,
                    "series": series_name,
                    "filter": filter_name
                })
            
            # Depois o output do agregador
            column_definitions.append({
                "key": group,
                "label": agg_label,
                "type": "output",
                "node_id": group
            })
        else:
            # Geff e Tcel
            node_type = node.get("type", "")
            node_label = "Geff" if node_type == "geff" else "Tcel" if node_type == "tcel" else node.get("data", {}).get("label", group)
            column_definitions.append({
                "key": group,
                "label": node_label,
                "type": "special",
                "node_id": group
            })

    # Agora vamos calcular as linhas dia a dia
    rows = []
    
    for date in sorted(available_dates):
        raw_path = _parquet_path(date, usina)
        processed_path = get_processed_path(date, usina)
        
        if not os.path.exists(raw_path): continue
        
        raw_df = pd.read_parquet(raw_path)
        if "timestamp" in raw_df.columns:
            raw_df.set_index("timestamp", inplace=True)
            
        processed_df = None
        if os.path.exists(processed_path):
            processed_df = pd.read_parquet(processed_path)
            if "timestamp" in processed_df.columns:
                processed_df.set_index("timestamp", inplace=True)
        
        row_data = {"date": date}
        
        for col in column_definitions:
            val = None
            col_key = col["key"]
            is_temp = col["node_id"] in ["tamb", "tmod", "tcel"]
            is_soiling = col["node_id"] == "sujidade"
            
            if col["type"] == "input":
                # Carregar do raw_df ou do processed_df se começar com agg_
                series_name = col["series"]
                filter_name = col["filter"]
                
                s_data = None
                if series_name.startswith("agg_"):
                    source_agg_id = series_name.replace("agg_", "")
                    if processed_df is not None and source_agg_id in processed_df.columns:
                        s_data = processed_df[source_agg_id].copy()
                elif series_name in raw_df.columns:
                    s_data = raw_df[series_name].copy()
                    
                if s_data is not None:
                    # Aplicar filtro
                    if filter_name and filter_name in filter_map:
                        f_def = filter_map[filter_name]
                        if f_def.get("min_value") is not None:
                            s_data[s_data < f_def["min_value"]] = np.nan
                        if f_def.get("max_value") is not None:
                            s_data[s_data > f_def["max_value"]] = np.nan
                        if f_def.get("max_variation") is not None:
                            diff = s_data.diff().abs()
                            s_data[diff > f_def["max_variation"]] = np.nan
                    
                    if is_temp:
                        # Média ponderada por Gpoa
                        gpoa_series = None
                        if processed_df is not None and "gpoa" in processed_df.columns:
                            gpoa_series = processed_df["gpoa"]
                        
                        if gpoa_series is not None:
                            valid_mask = s_data.notna() & gpoa_series.notna() & (gpoa_series > 0)
                            if valid_mask.any():
                                val = (s_data[valid_mask] * gpoa_series[valid_mask]).sum() / gpoa_series[valid_mask].sum()
                            else:
                                val = s_data.mean(skipna=True)
                        else:
                            val = s_data.mean(skipna=True)
                    elif is_soiling:
                        # Média simples
                        val = s_data.mean(skipna=True)
                    else:
                        # Calcular integral (soma) e converter de 1-min para base horária / kW
                        raw_sum = s_data.sum(min_count=1)
                        if raw_sum is not None and not pd.isna(raw_sum):
                            val = raw_sum / 0.06 if col["node_id"] == "energia" else raw_sum / 60000.0
                        else:
                            val = None
            else:
                # Output ou special (ler do processed_df)
                if processed_df is not None and col_key in processed_df.columns:
                    s_data = processed_df[col_key]
                    if is_temp:
                        # Média ponderada por Gpoa
                        gpoa_series = None
                        if "gpoa" in processed_df.columns:
                            gpoa_series = processed_df["gpoa"]
                        
                        if gpoa_series is not None:
                            valid_mask = s_data.notna() & gpoa_series.notna() & (gpoa_series > 0)
                            if valid_mask.any():
                                val = (s_data[valid_mask] * gpoa_series[valid_mask]).sum() / gpoa_series[valid_mask].sum()
                            else:
                                val = s_data.mean(skipna=True)
                        else:
                            val = s_data.mean(skipna=True)
                    elif is_soiling:
                        # Média simples
                        val = s_data.mean(skipna=True)
                    else:
                        # Calcular integral (soma) e converter de 1-min para base horária / kW
                        raw_sum = s_data.sum(min_count=1)
                        if raw_sum is not None and not pd.isna(raw_sum):
                            val = raw_sum / 0.06 if col["node_id"] == "energia" else raw_sum / 60000.0
                        else:
                            val = None
            
            # Formatando o valor
            if pd.isna(val) or val is None:
                row_data[col_key] = "-"
            else:
                row_data[col_key] = float(val)
                
        rows.append(row_data)

    return {
        "columns": [
            {
                "key": c["key"], 
                "label": c["label"],
                "node_id": c["node_id"],
                "type": c["type"]
            } 
            for c in column_definitions
        ],
        "rows": rows
    }
