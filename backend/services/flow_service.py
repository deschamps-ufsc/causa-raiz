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
                        if f_def.get("min_action") == "substituir":
                            s_data[s_data < f_def["min_value"]] = f_def["min_value"]
                        else:
                            s_data[s_data < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        if f_def.get("max_action") == "substituir":
                            s_data[s_data > f_def["max_value"]] = f_def["max_value"]
                        else:
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
                        if f_def.get("min_action") == "substituir":
                            agg_result[agg_result < f_def["min_value"]] = f_def["min_value"]
                        else:
                            agg_result[agg_result < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        if f_def.get("max_action") == "substituir":
                            agg_result[agg_result > f_def["max_value"]] = f_def["max_value"]
                        else:
                            agg_result[agg_result > f_def["max_value"]] = np.nan
                    if f_def.get("max_variation") is not None:
                        diff = agg_result.diff().abs()
                        agg_result[diff > f_def["max_variation"]] = np.nan

                processed_df[agg_id] = agg_result
            
            if agg_id == "tracker":
                try:
                    import pvlib
                    tracker_params = agg.get("data", {}).get("trackerParams", {})
                    lat = float(tracker_params.get("latitude", -23.55))
                    lon = float(tracker_params.get("longitude", -46.63))
                    gcr = float(tracker_params.get("gcr", 0.3))
                    max_angle = float(tracker_params.get("max_angle", 60))
                    tol = float(tracker_params.get("tolerance", 10))
                    
                    times = raw_df.index
                    times_for_pvlib = pd.DatetimeIndex(times.values)
                    if times_for_pvlib.tz is None:
                        times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
                    
                    solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
                    
                    trk_true = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                                         max_angle=max_angle, backtrack=True, gcr=gcr)
                    
                    trk_false = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                                          max_angle=max_angle, backtrack=False, gcr=gcr)

                    ref_theta_vals = trk_true['tracker_theta'].values
                    trk_false_vals = trk_false['tracker_theta'].values
                    
                    if tracker_params.get("inverter_sinal", False):
                        ref_theta_vals = -ref_theta_vals
                        trk_false_vals = -trk_false_vals
                    
                    is_backtracking_vals = (np.round(ref_theta_vals, 2) != np.round(trk_false_vals, 2)).astype(float)
                    
                    ref_theta = pd.Series(ref_theta_vals, index=raw_df.index)
                    is_backtracking = pd.Series(is_backtracking_vals, index=raw_df.index).fillna(0).astype(int)
                    
                    processed_df["Tracker Ref."] = ref_theta
                    processed_df["Tracker_is_backtracking"] = is_backtracking

                    for inp, s_data in zip(inputs, all_input_series):
                        s_name = inp.get("series") if isinstance(inp, dict) else inp
                        if s_name:
                            diff = (s_data - ref_theta).abs()
                            flag = ((diff > tol) & (is_backtracking == 0) & ref_theta.notna()).astype(int)
                            processed_df[f"flag_tracker_erro_{s_name}"] = flag
                            
                except Exception as e:
                    logger.error(f"[TRACKER] Erro ao calcular PVLib para {date}: {e}")
                
                continue

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
        "tracker": "Tracker",
        "energia": "Potência",
        "energia_pmi": "Energia PMI"
    }

    column_definitions = []
    
    # Ordem desejada para as colunas
    group_order = ["gpoa", "grear", "geff", "tamb", "tmod", "tcel", "sujidade", "tracker", "energia", "energia_pmi"]

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
            is_sujidade_restricted = (group == "sujidade" and node.get("data", {}).get("startTime") and node.get("data", {}).get("endTime"))
            is_sujidade_trimmed = (group == "sujidade" and node.get("data", {}).get("trimPercent"))
            
            column_definitions.append({
                "key": group,
                "label": f"{agg_label} (Dia completo)" if (is_sujidade_restricted or is_sujidade_trimmed) else agg_label,
                "type": "output",
                "node_id": group
            })
            
            if is_sujidade_restricted:
                column_definitions.append({
                    "key": f"{group}_restricted",
                    "label": f"{agg_label} (Hora Restrita)",
                    "type": "output",
                    "node_id": group,
                    "restricted": True,
                    "start_time": node.get("data", {}).get("startTime"),
                    "end_time": node.get("data", {}).get("endTime")
                })
                
            if is_sujidade_trimmed:
                try:
                    trim_val = float(node.get("data", {}).get("trimPercent"))
                    if trim_val > 0:
                        column_definitions.append({
                            "key": f"{group}_trimmed",
                            "label": f"{agg_label} (Média Interna)",
                            "type": "output",
                            "node_id": group,
                            "trimmed": True,
                            "trim_percent": trim_val
                        })
                except ValueError:
                    pass
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
        tracker_errors_for_day = []
        tracker_valid_points_for_day = 0
        
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
                        # Média simples percentual de sujeira
                        val = s_data.mean(skipna=True)
                        if pd.notna(val):
                            val = 100 - val if val > 1 else (1 - val) * 100
                    elif col["node_id"] == "tracker":
                        if processed_df is not None and f"flag_tracker_erro_{series_name}" in processed_df.columns:
                            flag_series = processed_df[f"flag_tracker_erro_{series_name}"]
                            is_bt_series = processed_df.get("Tracker_is_backtracking")
                            
                            total_errors = flag_series.sum(skipna=True)
                            if is_bt_series is not None:
                                total_valid_points = (is_bt_series == 0).sum()
                            else:
                                total_valid_points = len(flag_series.dropna())
                            
                            tracker_errors_for_day.append(total_errors)
                            tracker_valid_points_for_day = total_valid_points
                            
                            if total_valid_points > 0:
                                perc = (total_errors / total_valid_points) * 100
                                val = f"{int(total_errors)} ({perc:.1f}%)"
                            else:
                                val = f"{int(total_errors)} (0.0%)"
                        else:
                            val = None
                    else:
                        # Calcular integral (soma) e converter de 1-min para base horária / kW
                        raw_sum = s_data.sum(min_count=1)
                        if raw_sum is not None and not pd.isna(raw_sum):
                            val = raw_sum / 0.06 if col["node_id"] == "energia" else raw_sum / 60000.0
                        else:
                            val = None
            else:
                # Output ou special (ler do processed_df)
                is_restricted = col.get("restricted", False)
                is_trimmed = col.get("trimmed", False)
                
                base_key = col_key
                if is_restricted:
                    base_key = base_key.replace("_restricted", "")
                elif is_trimmed:
                    base_key = base_key.replace("_trimmed", "")
                
                if processed_df is not None and base_key in processed_df.columns:
                    s_data = processed_df[base_key].copy()
                    
                    if is_restricted:
                        try:
                            start_t = pd.to_datetime(col["start_time"]).time()
                            end_t = pd.to_datetime(col["end_time"]).time()
                            s_data = s_data.between_time(start_t, end_t)
                        except Exception as e:
                            logger.error(f"Erro ao filtrar tempo restrito para sujidade: {e}")
                            
                    if is_trimmed:
                        try:
                            trim_p = col.get("trim_percent", 0) / 100.0
                            if trim_p > 0:
                                lower_p = trim_p / 2
                                upper_p = 1.0 - (trim_p / 2)
                                lower_bound = s_data.quantile(lower_p)
                                upper_bound = s_data.quantile(upper_p)
                                s_data = s_data[(s_data >= lower_bound) & (s_data <= upper_bound)]
                        except Exception as e:
                            logger.error(f"Erro ao calcular média interna para sujidade: {e}")
                    
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
                        # Média simples percentual de sujeira
                        val = s_data.mean(skipna=True)
                        if pd.notna(val):
                            val = 100 - val if val > 1 else (1 - val) * 100
                    elif col["node_id"] == "tracker":
                        if tracker_errors_for_day and tracker_valid_points_for_day > 0:
                            avg_errors = sum(tracker_errors_for_day) / len(tracker_errors_for_day)
                            perc = (avg_errors / tracker_valid_points_for_day) * 100
                            val = f"{int(round(avg_errors))} ({perc:.1f}%)"
                        else:
                            val = "-"
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
            elif isinstance(val, str):
                row_data[col_key] = val
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
