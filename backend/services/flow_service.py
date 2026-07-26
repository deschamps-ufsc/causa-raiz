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

def run_flow_processing(usina: str, dates_str: str = None):
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
    
    # Novo formato: { nodeConfigs: { node_id: { campo: valor, ... } } }
    # Reconstrói a lista de nodes esperada pelo resto do código
    if isinstance(flow_config, dict) and "nodeConfigs" in flow_config:
        node_configs = flow_config["nodeConfigs"]
        nodes = []
        for node_id, cfg in node_configs.items():
            # Detecta o tipo do nó para marcar aggregator corretamente
            NON_AGGREGATOR_TYPES = {"geff", "tcel", "curtailment", "pvsyst"}
            node_type = node_id if node_id in NON_AGGREGATOR_TYPES else "box"
            is_aggregator = node_type not in NON_AGGREGATOR_TYPES
            node_data = dict(cfg)  # copia todos os campos de config
            node_data["aggregator"] = is_aggregator
            nodes.append({"id": node_id, "type": node_type, "data": node_data})
    elif isinstance(flow_config, list):
        nodes = flow_config
    else:
        nodes = flow_config.get("nodes", [])
    
    filters = load_filter_settings()
    filter_map = {f['name']: f for f in filters}
    
    available_dates = list_available_dates(usina)
    
    if dates_str:
        target_dates = set(dates_str.split(","))
        available_dates = [d for d in available_dates if d in target_dates]
        
    if not available_dates:
        return {"status": "error", "message": "Nenhum dado bruto encontrado para as datas selecionadas."}

    # 1.5 Carregar Mapeamento para Identificar Trackers e Strings
    tracker_groups = {}
    map_path = os.path.join(DATA_DIR, usina, "series_map.json")
    if os.path.exists(map_path):
        with open(map_path, "r", encoding="utf-8") as f:
            mapping = json.load(f)
            
        for col, meta in mapping.items():
            if meta.get("elemento") == "Tracker":
                if ".PosAngAlvo" in col:
                    base = col.replace(".PosAngAlvo", "")
                    typ = "alvo"
                elif ".PosAngAtual" in col or ".PosAngMedido" in col:
                    base = col.replace(".PosAngAtual", "").replace(".PosAngMedido", "")
                    typ = "atual"
                else:
                    continue

                if base not in tracker_groups:
                    tracker_groups[base] = {
                        "skid": str(meta.get("skid") or ""),
                        "inversor": str(meta.get("inversor") or ""),
                        "stringbox": str(meta.get("stringbox") or ""),
                        "tracker": str(meta.get("tracker") or "") or base.split("-")[-1],
                        "cc_strings": []
                    }
                tracker_groups[base][typ] = col
                
        for col, meta in mapping.items():
            el = meta.get("elemento", "").lower()
            if "pot" in el and "string" in el and "cc" in el:
                sk = str(meta.get("skid") or "")
                inv = str(meta.get("inversor") or "")
                sb = str(meta.get("stringbox") or "")
                tr = str(meta.get("tracker") or "") or col.split(".")[0].split("-")[-1]
                
                for base, tg in tracker_groups.items():
                    if tg["skid"] == sk and tg["inversor"] == inv and tg["stringbox"] == sb and tg["tracker"] == tr:
                        tg["cc_strings"].append(col)
                        break

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
        
        # --- Tracker: Pré-processamento ---
        invalidated_sensors_map = {}
        tracker_node = next((n for n in aggregators if n["id"] == "tracker"), None)
        if tracker_node:
            tracker_inputs = tracker_node.get("data", {}).get("inputs", [])
            tracker_params = tracker_node.get("data", {}).get("trackerParams", {})
            try:
                import pvlib
                lat = float(tracker_params.get("latitude", -23.55))
                lon = float(tracker_params.get("longitude", -46.63))
                gcr = float(tracker_params.get("gcr", 0.3))
                max_angle = float(tracker_params.get("max_angle", 60))
                tol = float(tracker_params.get("tolerance", 10))
                
                times_for_pvlib = pd.DatetimeIndex(raw_df.index.values)
                if times_for_pvlib.tz is None:
                    times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
                
                # Se houver defasagem (em minutos), subtraímos do timestamp antes de calcular o sol,
                # assim o ângulo calculado no minuto "t" reflete onde o sol estava em "t - offset".
                # Isso evita ter que usar .shift().bfill().ffill() e criar linhas retas.
                time_offset = int(tracker_params.get("time_offset", 0))
                if time_offset != 0:
                    times_for_pvlib = times_for_pvlib - pd.Timedelta(minutes=time_offset)
                
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

                # --- Calcula as flags Vento e Travado por Tracker ---
                has_any_ref = ref_theta.notna()
                for base, group in tracker_groups.items():
                    alvo_col = group.get("alvo")
                    atual_col = group.get("atual")
                    
                    if alvo_col and alvo_col in raw_df.columns:
                        diff_alvo = (raw_df[alvo_col] - ref_theta).abs()
                        mask_vento = diff_alvo > tol
                    else:
                        mask_vento = pd.Series(False, index=raw_df.index)
                        
                    if atual_col and atual_col in raw_df.columns:
                        mask_erro_atual = (raw_df[atual_col] - ref_theta).abs() > tol
                        mask_travado = mask_erro_atual & ~mask_vento
                    else:
                        mask_travado = pd.Series(False, index=raw_df.index)
                        
                    # Salva as flags apenas onde existe dados (evita 0 em madrugadas de forma errada, mas podemos setar 0)
                    processed_df[f"tracker_{base}_vento"] = (mask_vento & has_any_ref).astype(int)
                    processed_df[f"tracker_{base}_travado"] = (mask_travado & has_any_ref).astype(int)

                for inp in tracker_inputs:
                    if isinstance(inp, str):
                        s_name = inp
                        sensors = []
                    else:
                        s_name = inp.get("series")
                        sensors = inp.get("sensors", [])
                    
                    if s_name and s_name in raw_df.columns:
                        s_data_tracker = raw_df[s_name]
                        diff_tracker = (s_data_tracker - ref_theta).abs()
                        flag_col_name = f"flag_tracker_erro_{s_name}"
                        # Se a diferença > tolerância, OU se o sensor estiver sem dados (NaN), é Erro (1).
                        # Só avaliamos se existe Referência do Sol (ref_theta).
                        is_error = (diff_tracker > tol) | s_data_tracker.isna()
                        flag = (is_error & ref_theta.notna()).astype(int)
                        processed_df[flag_col_name] = flag
                        
                        for sensor in sensors:
                            invalidated_sensors_map[sensor] = flag_col_name

                # --- Gera 'Tracker Piranômetro' ---
                # Flag = 1 quando AO MENOS 1 sensor está OK (flag_tracker_erro = 0)
                # Flag = 0 somente quando TODOS os sensores têm erro (todas flags = 1)
                # Lógica: 1 - min(flags). Se min=0 → algum válido → Piranômetro=1. Se min=1 → todos com erro → Piranômetro=0.
                tracker_erro_cols = [c for c in processed_df.columns if c.startswith("flag_tracker_erro")]
                if tracker_erro_cols:
                    processed_df["Tracker Piranômetro"] = (
                        1 - processed_df[tracker_erro_cols].min(axis=1).fillna(1).astype(int)
                    )
                    # Força a ser 0 nos minutos em que a Referência do Tracker não existe (ex: à noite)
                    processed_df.loc[ref_theta.isna(), "Tracker Piranômetro"] = 0
                else:
                    processed_df["Tracker Piranômetro"] = 0

            except Exception as e:
                logger.error(f"[TRACKER] Erro ao calcular PVLib para {date}: {e}")

        # --- Primeiro processa os agregadores (Gpoa e Grear são agregadores) ---
        for agg in aggregators:
            # ... (lógica de agregação mantida)
            agg_id = agg["id"]
            if agg_id == "tracker": continue
            inputs = agg.get("data", {}).get("inputs", [])
            if not inputs: continue
            
            all_input_series = []
            all_input_series_semTR = []
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
                
                # Cópia para a série sem tracker antes de invalidar
                s_data_semTR = s_data.copy()
                
                # Invalida sensor se mapeado para erro de tracker
                if series_name in invalidated_sensors_map:
                    flag_col = invalidated_sensors_map[series_name]
                    if flag_col in processed_df.columns:
                        s_data[processed_df[flag_col] == 1] = np.nan
                
                if filter_name and filter_name in filter_map:
                    f_def = filter_map[filter_name]
                    if f_def.get("min_value") is not None:
                        if f_def.get("min_action") == "substituir":
                            s_data[s_data < f_def["min_value"]] = f_def["min_value"]
                            s_data_semTR[s_data_semTR < f_def["min_value"]] = f_def["min_value"]
                        else:
                            s_data[s_data < f_def["min_value"]] = np.nan
                            s_data_semTR[s_data_semTR < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        if f_def.get("max_action") == "substituir":
                            s_data[s_data > f_def["max_value"]] = f_def["max_value"]
                            s_data_semTR[s_data_semTR > f_def["max_value"]] = f_def["max_value"]
                        else:
                            s_data[s_data > f_def["max_value"]] = np.nan
                            s_data_semTR[s_data_semTR > f_def["max_value"]] = np.nan
                    if f_def.get("max_variation") is not None:
                        median_window = f_def.get("median_window")
                        if median_window and median_window > 1:
                            med = s_data.rolling(window=median_window, center=True, min_periods=1).median()
                            diff = (s_data - med).abs()
                            med_semTR = s_data_semTR.rolling(window=median_window, center=True, min_periods=1).median()
                            diff_semTR = (s_data_semTR - med_semTR).abs()
                        else:
                            diff = s_data.diff().abs()
                            diff_semTR = s_data_semTR.diff().abs()
                        
                        s_data[diff > f_def["max_variation"]] = np.nan
                        s_data_semTR[diff_semTR > f_def["max_variation"]] = np.nan
                    if f_def.get("min_variation") is not None:
                        min_time = f_def.get("min_time", 1)
                        diff = s_data.diff().abs()
                        mask = diff < f_def["min_variation"]
                        if min_time > 1:
                            group = (~mask).cumsum()
                            run_lengths = mask.groupby(group).transform('sum')
                            mask = mask & (run_lengths >= min_time)
                        s_data[mask] = np.nan
                        
                        diff_semTR = s_data_semTR.diff().abs()
                        mask_semTR = diff_semTR < f_def["min_variation"]
                        if min_time > 1:
                            group_semTR = (~mask_semTR).cumsum()
                            run_lengths_semTR = mask_semTR.groupby(group_semTR).transform('sum')
                            mask_semTR = mask_semTR & (run_lengths_semTR >= min_time)
                        s_data_semTR[mask_semTR] = np.nan
                
                all_input_series.append(s_data)
                all_input_series_semTR.append(s_data_semTR)
            
            if all_input_series:
                op = agg.get("data", {}).get("operation", "sum")
                
                combined = pd.concat(all_input_series, axis=1)
                combined_semTR = pd.concat(all_input_series_semTR, axis=1)
                
                if op == "mean":
                    agg_result = combined.mean(axis=1)
                    agg_result_semTR = combined_semTR.mean(axis=1)
                else:
                    agg_result = combined.sum(axis=1, min_count=1)
                    agg_result_semTR = combined_semTR.sum(axis=1, min_count=1)
                
                # Aplica o fator de conversão/multiplicador se for o bloco energia_pmi
                if agg_id == "energia_pmi":
                    multiplier = agg.get("data", {}).get("energiaPmiParams", {}).get("multiplier", 1.0)
                    agg_result = agg_result * multiplier
                    agg_result_semTR = agg_result_semTR * multiplier
                
                # Filtro final de saída
                out_filter_name = agg.get("data", {}).get("outputFilter")
                if out_filter_name and out_filter_name in filter_map:
                    f_def = filter_map[out_filter_name]
                    if f_def.get("min_value") is not None:
                        if f_def.get("min_action") == "substituir":
                            agg_result[agg_result < f_def["min_value"]] = f_def["min_value"]
                            agg_result_semTR[agg_result_semTR < f_def["min_value"]] = f_def["min_value"]
                        else:
                            agg_result[agg_result < f_def["min_value"]] = np.nan
                            agg_result_semTR[agg_result_semTR < f_def["min_value"]] = np.nan
                    if f_def.get("max_value") is not None:
                        if f_def.get("max_action") == "substituir":
                            agg_result[agg_result > f_def["max_value"]] = f_def["max_value"]
                            agg_result_semTR[agg_result_semTR > f_def["max_value"]] = f_def["max_value"]
                        else:
                            agg_result[agg_result > f_def["max_value"]] = np.nan
                            agg_result_semTR[agg_result_semTR > f_def["max_value"]] = np.nan
                    if f_def.get("max_variation") is not None:
                        median_window = f_def.get("median_window")
                        if median_window and median_window > 1:
                            med = agg_result.rolling(window=median_window, center=True, min_periods=1).median()
                            diff = (agg_result - med).abs()
                            med_semTR = agg_result_semTR.rolling(window=median_window, center=True, min_periods=1).median()
                            diff_semTR = (agg_result_semTR - med_semTR).abs()
                        else:
                            diff = agg_result.diff().abs()
                            diff_semTR = agg_result_semTR.diff().abs()

                        agg_result[diff > f_def["max_variation"]] = np.nan
                        agg_result_semTR[diff_semTR > f_def["max_variation"]] = np.nan
                    if f_def.get("min_variation") is not None:
                        min_time = f_def.get("min_time", 1)
                        diff = agg_result.diff().abs()
                        mask = diff < f_def["min_variation"]
                        if min_time > 1:
                            group = (~mask).cumsum()
                            run_lengths = mask.groupby(group).transform('sum')
                            mask = mask & (run_lengths >= min_time)
                        agg_result[mask] = np.nan
                        
                        diff_semTR = agg_result_semTR.diff().abs()
                        mask_semTR = diff_semTR < f_def["min_variation"]
                        if min_time > 1:
                            group_semTR = (~mask_semTR).cumsum()
                            run_lengths_semTR = mask_semTR.groupby(group_semTR).transform('sum')
                            mask_semTR = mask_semTR & (run_lengths_semTR >= min_time)
                        agg_result_semTR[mask_semTR] = np.nan

                # Filtro de PPC removido e migrado para bloco próprio de Curtailment

                out_col = "Energia PMI" if agg_id == "energia_pmi" else agg_id
                processed_df[out_col] = agg_result
                if agg_id in ["gpoa", "grear", "referencia_ppc"] or agg_id.startswith("referencia_ppc"):
                    processed_df[f"{out_col}_semTR"] = agg_result_semTR
            


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
            gpoa_semTR = processed_df.get("gpoa_semTR")
            grear_semTR = processed_df.get("grear_semTR")
            
            if gpoa is not None and grear is not None:
                geff_result = gpoa + beta * grear * (1 - SSF) * (1 - MLF)
                processed_df[geff_id] = geff_result
            else:
                logger.warning(f"[GEFF] gpoa ou grear ausentes para {geff_id} em {date}")
                
            if gpoa_semTR is not None and grear_semTR is not None:
                geff_result_semTR = gpoa_semTR + beta * grear_semTR * (1 - SSF) * (1 - MLF)
                processed_df[f"{geff_id}_semTR"] = geff_result_semTR

        # --- Depois processa o Bloco Tcel (depende de Tmod e Gpoa) ---
        tcel_nodes = [n for n in nodes if n.get("type") == "tcel" or n.get("id") == "tcel"]
        for tcel in tcel_nodes:
            tcel_id = tcel["id"]
            tmod = processed_df.get("tmod")
            gpoa = processed_df.get("gpoa")
            gpoa_semTR = processed_df.get("gpoa_semTR")
            
            if tmod is not None and gpoa is not None:
                tcel_result = tmod + (gpoa / 1000.0) * 3.0
                processed_df[tcel_id] = tcel_result
            else:
                logger.warning(f"[TCEL] tmod ou gpoa ausentes para {tcel_id} em {date}")
                
            if tmod is not None and gpoa_semTR is not None:
                tcel_result_semTR = tmod + (gpoa_semTR / 1000.0) * 3.0
                processed_df[f"{tcel_id}_semTR"] = tcel_result_semTR

        # --- Depois processa o Bloco Curtailment ---
        curtailment_nodes = [n for n in nodes if n.get("type") == "curtailment" or n.get("id") == "curtailment"]
        for curtailment in curtailment_nodes:
            curtailment_id = curtailment["id"]
            data = curtailment.get("data", {})
            ref_min = data.get("curtailmentRefMin", 52.8)
            ref_margin = data.get("curtailmentRefMargin", 3.0)
            diff_margin = data.get("curtailmentDiffMargin", 5.0)
            resolution_mode = data.get("resolutionMode", "1min")
            
            potencia_ppc = processed_df.get("potencia_ppc")
            
            # Pega as colunas de Referência PPC para comparação
            ppc_cols = [c for c in processed_df.columns if c.startswith("referencia_ppc") and not c.endswith("_semTR") and not c.endswith("_válida")]
            
            if potencia_ppc is not None and ppc_cols:
                ppc_data = processed_df[ppc_cols[0]]
                
                try:
                    # Gera as séries de 15 minutos sempre, para visualização
                    processed_df["Potência PPC_15min"] = processed_df.groupby(pd.Grouper(freq="15min"))["potencia_ppc"].transform("mean")
                    processed_df["Referência PPC_15min"] = processed_df.groupby(pd.Grouper(freq="15min"))[ppc_cols[0]].transform("mean")
                    
                    # Avalia de acordo com a resolução
                    if resolution_mode == "15min":
                        eval_potencia = processed_df["Potência PPC_15min"]
                        eval_referencia = processed_df["Referência PPC_15min"]
                    else:
                        eval_potencia = potencia_ppc
                        eval_referencia = ppc_data
                        
                    threshold_min = float(ref_min) * (1 - (float(ref_margin) / 100.0))
                    cond_1 = eval_referencia < threshold_min

                    # Gatilho 2: potência real está dentro da banda de tolerância da referência
                    # |real - ref| <= ref * (diff_margin / 100)
                    tolerance_band = (eval_referencia * (float(diff_margin) / 100.0)).abs()
                    cond_2 = (eval_potencia - eval_referencia).abs() <= tolerance_band

                    # Curtailment efetivo (0) se cond_1 e cond_2 forem verdadeiras. Caso contrário, válido (1)
                    curtailment_flag = ~(cond_1 & cond_2)
                    processed_df[curtailment_id] = curtailment_flag.astype(int)
                except Exception as e:
                    logger.error(f"[FLOW] Erro ao calcular curtailment: {e}")
                    processed_df[curtailment_id] = 1
            else:
                logger.warning(f"[CURTAILMENT] potencia_ppc ou referencia_ppc ausentes para {curtailment_id} em {date}")
                processed_df[curtailment_id] = 1

        # --- Pré-processa EPI (Variáveis do PVSyst) ---
        epi_node = next((n for n in nodes if n.get("id") == "epi"), None)
        if epi_node:
            epi_params = epi_node.get("data", {}).get("epiParams", {})
            energia_var = epi_params.get("energiaVar")
            irrad_var = epi_params.get("irradianciaVar")
            
            vars_to_load = [v for v in [energia_var, irrad_var] if v]
            if vars_to_load:
                pvsyst_path = os.path.join(DATA_DIR, usina, "pvsyst_data.parquet")
                if os.path.exists(pvsyst_path):
                    try:
                        day_start = pd.to_datetime(date)
                        if day_start.tz is not None:
                            day_start = day_start.tz_localize(None)
                        day_end = day_start + pd.Timedelta(days=1)
                        
                        df_pvsyst = pd.read_parquet(
                            pvsyst_path,
                            columns=["timestamp"] + [v for v in vars_to_load if v not in ["timestamp"]]
                        )
                        if df_pvsyst["timestamp"].dt.tz is not None:
                            df_pvsyst["timestamp"] = df_pvsyst["timestamp"].dt.tz_localize(None)
                            
                        mask = (df_pvsyst["timestamp"] >= day_start) & (df_pvsyst["timestamp"] < day_end)
                        df_pvsyst_day = df_pvsyst[mask].copy()
                        
                        if not df_pvsyst_day.empty:
                            df_pvsyst_day.set_index("timestamp", inplace=True)
                            
                            # Alinha o fuso horário
                            if processed_df.index.tz is not None and df_pvsyst_day.index.tz is None:
                                df_pvsyst_day.index = df_pvsyst_day.index.tz_localize(processed_df.index.tz)
                            elif processed_df.index.tz is None and df_pvsyst_day.index.tz is not None:
                                df_pvsyst_day.index = df_pvsyst_day.index.tz_localize(None)
                                
                            for v in vars_to_load:
                                if v in df_pvsyst_day.columns:
                                    processed_df[v] = df_pvsyst_day[v]
                    except Exception as e:
                        logger.warning(f"[EPI] Erro ao carregar PVSyst para {date}: {e}")

        # --- Depois processa o Bloco Simultaneidade/Dados Válidos ---
        simult_nodes = [n for n in nodes if n.get("id") == "simultaneidade" or n.get("data", {}).get("label", "").find("Simultaneidade") != -1 or n.get("data", {}).get("label", "").find("Dados Válidos") != -1]
        for node in simult_nodes:
            data = node.get("data", {})
            out_name = "Dados Válidos"
            params = data.get("simultParams", {})
            
            check_geff = params.get("geff", True)
            check_tamb = params.get("tamb", True)
            check_tcel = params.get("tcel", True)
            check_potencia_ppc = params.get("potencia_ppc", False) # Desativado conforme pedido
            check_energia_pmi = params.get("energia_pmi", True)
            check_curtailment = params.get("curtailment", False)
            
            valid_mask = pd.Series(True, index=processed_df.index)
            
            if check_geff:
                geff_data = processed_df.get("geff")
                if geff_data is not None:
                    valid_mask = valid_mask & geff_data.notna()
                else:
                    valid_mask = False
                    
            if check_tamb:
                tamb_data = processed_df.get("tamb")
                if tamb_data is not None:
                    valid_mask = valid_mask & tamb_data.notna()
                else:
                    valid_mask = False
                    
            if check_tcel:
                tcel_data = processed_df.get("tcel")
                if tcel_data is not None:
                    valid_mask = valid_mask & tcel_data.notna()
                else:
                    valid_mask = False
                    
            # check_potencia_ppc removido da lógica de simultaneidade conforme pedido
                    
            if check_energia_pmi:
                energia_pmi_data = processed_df.get("Energia PMI")
                if energia_pmi_data is not None:
                    valid_mask = valid_mask & energia_pmi_data.notna()
                else:
                    valid_mask = False
                
                # O usuário pediu que se a energia_pmi estiver ativa,
                # qualquer dado faltando (de 1 min) invalide todo o bloco de 5 min.
                # Agrupamos a máscara de validade a cada 5 minutos
                # e se houver qualquer False, todo o bloco vira False.
                if isinstance(valid_mask, pd.Series):
                    valid_mask = valid_mask.groupby(pd.Grouper(freq='5min')).transform('min').astype(bool)
                    
            # A flag Simultaneidade observa apenas as séries dela
            if isinstance(valid_mask, bool):
                processed_df["Simultaneidade"] = int(valid_mask)
            else:
                processed_df["Simultaneidade"] = valid_mask.astype(int)

            if check_curtailment:
                curtailment_data = processed_df.get("curtailment")
                if curtailment_data is not None:
                    # A série de curtailment já é 0 ou 1 (1 = válido)
                    valid_mask = valid_mask & (curtailment_data == 1)
                else:
                    valid_mask = False
                    
                # Se a energia_pmi estiver ativa, garantimos que qualquer
                # ponto invalidado pelo Curtailment também derrube o bloco inteiro de 5 min
                if check_energia_pmi and isinstance(valid_mask, pd.Series):
                    valid_mask = valid_mask.groupby(pd.Grouper(freq='5min')).transform('min').astype(bool)
            
            if isinstance(valid_mask, bool):
                processed_df[out_name] = int(valid_mask)
            else:
                processed_df[out_name] = valid_mask.astype(int)

            # --- Cria as séries "_válida" multiplicando pela flag de Dados Válidos ---
            simult_flag = processed_df[out_name]
            for col in list(processed_df.columns):
                if col != out_name and col != "Simultaneidade" and not col.endswith("_válida") and not col.lower().startswith("curtailment") and not col.startswith("flag_tracker_erro") and not col.startswith("tracker_") and col != "Tracker Piranômetro":
                    # Substitui os dados inválidos por NaN (vazio)
                    processed_df[f"{col}_válida"] = processed_df[col].where(simult_flag == 1, np.nan)

            # --- Cria a série de Média de Potência CC de Strings OK ---
            tracker_ok_strings = []
            
            # Load synthetic lookup once for the plant
            try:
                from services.synthetic_service import build_lookup, compute_synthetic
                synth_lookup = build_lookup(usina)
            except Exception as e:
                logger.warning(f"Erro ao carregar lookup de séries sintéticas: {e}")
                synth_lookup = {}
                
            for base, group in tracker_groups.items():
                vento_col = f"tracker_{base}_vento"
                travado_col = f"tracker_{base}_travado"
                if vento_col in processed_df.columns and travado_col in processed_df.columns:
                    mask_ok = (processed_df[vento_col] == 0) & (processed_df[travado_col] == 0)
                    
                    for st_col in group["cc_strings"]:
                        if st_col not in raw_df.columns and st_col in synth_lookup:
                            try:
                                raw_df[st_col] = compute_synthetic(raw_df, synth_lookup[st_col])
                            except Exception as e:
                                logger.warning(f"Erro ao computar sintética {st_col}: {e}")
                                
                        if st_col in raw_df.columns:
                            ok_st_series = raw_df[st_col].where(mask_ok, np.nan)
                            tracker_ok_strings.append(ok_st_series)
                            
                            
            if tracker_ok_strings:
                df_ok_strings = pd.concat(tracker_ok_strings, axis=1)
                # Calcula a média por minuto. Usamos min_periods=1 para que se houver ao menos 1 ok, tenhamos média.
                media_strings_ok = df_ok_strings.mean(axis=1)
                # Aplica filtro de Dados Válidos 
                processed_df["Potência CC Média Strings OK_válida"] = media_strings_ok.where(simult_flag == 1, np.nan)
            else:
                processed_df["Potência CC Média Strings OK_válida"] = np.nan

            # --- Cria as séries de 15min para gpoa ---
            if "gpoa" in processed_df.columns:
                processed_df["gpoa_15min"] = processed_df.groupby(pd.Grouper(freq="15min"))["gpoa"].transform("mean")
            
            if "gpoa_válida" in processed_df.columns:
                processed_df["gpoa_válida_15min"] = processed_df.groupby(pd.Grouper(freq="15min"))["gpoa_válida"].transform("mean")

            # --- Cria série E_Grid_Ajustada_válida ---
            if "E_Grid_válida" in processed_df.columns and "GlobInc_válida" in processed_df.columns and "geff_válida" in processed_df.columns:
                processed_df["E_Grid_Ajustada_válida"] = processed_df["E_Grid_válida"] * (processed_df["geff_válida"] / processed_df["GlobInc_válida"].replace(0, np.nan))


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

def check_3_hours_consecutive(series: pd.Series, threshold: float = 600, required_minutes: int = 180) -> str:
    if series is None or series.empty or series.isna().all():
        return "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
    
    mask = series > threshold
    total_pts = int(mask.sum())
    total_h = total_pts / 60.0
    
    if total_pts == 0:
        return "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
    
    group = (~mask).cumsum()
    consecutive_counts = mask.groupby(group).sum()
    max_consec_pts = int(consecutive_counts.max()) if not consecutive_counts.empty else 0
    max_consec_h = max_consec_pts / 60.0
    
    stats_str = f"{total_pts} pts - {total_h:.2f} h totais | {max_consec_pts} pts - {max_consec_h:.2f} h consecutivos"
    stats_str = stats_str.replace(".", ",")
    
    if max_consec_pts >= required_minutes:
        return f"OK|{stats_str}"
    elif total_pts >= required_minutes:
        return f"OK_RESSALVA|{stats_str}"
    else:
        return f"NÃO_OK|{stats_str}"


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
    
    # Novo formato: { nodeConfigs: { node_id: { campo: valor, ... } } }
    if isinstance(flow_config, dict) and "nodeConfigs" in flow_config:
        node_configs = flow_config["nodeConfigs"]
        nodes = []
        NON_AGGREGATOR_TYPES = {"geff", "tcel", "curtailment", "pvsyst"}
        for node_id, cfg in node_configs.items():
            node_type = node_id if node_id in NON_AGGREGATOR_TYPES else "box"
            node_data = dict(cfg)
            node_data["aggregator"] = node_type not in NON_AGGREGATOR_TYPES
            nodes.append({"id": node_id, "type": node_type, "data": node_data})
    elif isinstance(flow_config, list):
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
        "tracker": "Tracker Piranômetro",
        "potencia_ppc": "Potência PPC",
        "referencia_ppc": "Referência PPC",
        "energia_pmi": "Energia PMI"
    }

    column_definitions = []
    
    # Ordem desejada para as colunas
    group_order = ["gpoa", "grear", "geff", "tamb", "tmod", "tcel", "sujidade", "tracker", "potencia_ppc", "curtailment", "energia_pmi", "pvsyst", "epi"]

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
                "key": "Energia PMI" if group == "energia_pmi" else group,
                "label": f"{agg_label} (Dia completo)" if (is_sujidade_restricted or is_sujidade_trimmed) else agg_label,
                "type": "output",
                "node_id": group
            })
            if group.lower() not in ["sujidade", "tracker", "curtailment", "epi", "pvsyst"]:
                val_key = "Energia PMI_válida" if group == "energia_pmi" else f"{group}_válida"
                column_definitions.append({
                    "key": val_key,
                    "label": f"{agg_label} (Válido)",
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
            # Geff e Tcel e outros
            node_type = node.get("type", "")
            
            if group == "pvsyst":
                # Adiciona GlobInc (Válido) logo antes da Energia Prevista, que ficará logo após Energia PMI
                column_definitions.append({
                    "key": "GlobInc_válida",
                    "label": "GlobInc (Válido)",
                    "type": "special",
                    "node_id": "pvsyst_irrad"
                })
                # Adiciona Fator de Ajuste
                column_definitions.append({
                    "key": "fator_ajuste",
                    "label": "Fator de Ajuste",
                    "type": "special",
                    "node_id": "pvsyst_fator"
                })
                column_definitions.append({
                    "key": "E_Grid_válida",
                    "label": "Energia Prevista (Válido)",
                    "type": "special",
                    "node_id": "pvsyst"
                })
                # Adiciona Energia Prevista Ajustada (Válido)
                column_definitions.append({
                    "key": "E_Grid_Ajustada_válida",
                    "label": "Energia Prevista Ajustada (Válido)",
                    "type": "special",
                    "node_id": "pvsyst_ajustada"
                })
            elif group == "epi":
                column_definitions.append({
                    "key": "epi",
                    "label": "EPI",
                    "type": "special",
                    "node_id": group
                })
            else:
                node_label = "Geff" if node_type == "geff" else "Tcel" if node_type == "tcel" else node.get("data", {}).get("label", group)
                
                column_definitions.append({
                    "key": "Energia PMI" if group == "energia_pmi" else group,
                    "label": node_label,
                    "type": "special",
                    "node_id": group
                })
                if group.lower() not in ["sujidade", "tracker", "curtailment"]:
                    val_key = "Energia PMI_válida" if group == "energia_pmi" else f"{group}_válida"
                    column_definitions.append({
                        "key": val_key,
                        "label": f"{node_label} (Válido)",
                        "type": "special",
                        "node_id": group
                    })

    # Adicionar grupo de validação (sempre no final)
    validation_cols = [
        {"key": "val_irrad_3h_medidos", "label": "Irradiância maior que 600 W/m² - Dados Medidos"},
        {"key": "val_irrad_3h_validos", "label": "Irradiância maior que 600 W/m² - Dados Válidos"},
        {"key": "val_irrad_3kwh_medidos", "label": "Irradiação maior que 3 kWh/m² - Dados Medidos"},
        {"key": "val_irrad_3kwh_validos", "label": "Irradiação maior que 3 kWh/m² - Dados Válidos"},
        {"key": "val_validacao", "label": "Validação"}
    ]
    for v_col in validation_cols:
        column_definitions.append({
            "key": v_col["key"],
            "label": v_col["label"],
            "type": "validation",
            "node_id": "validacao"
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
        
        # --- Cálculo das Colunas de Validação ---
        if processed_df is not None:
            if "gpoa_15min" in processed_df.columns:
                row_data["val_irrad_3h_medidos"] = check_3_hours_consecutive(processed_df["gpoa_15min"])
            else:
                row_data["val_irrad_3h_medidos"] = "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
                
            if "gpoa_válida_15min" in processed_df.columns:
                row_data["val_irrad_3h_validos"] = check_3_hours_consecutive(processed_df["gpoa_válida_15min"])
            else:
                row_data["val_irrad_3h_validos"] = "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
                
            if "gpoa" in processed_df.columns:
                gpoa_sum = processed_df["gpoa"].sum(skipna=True) / 60000.0
                status = "OK" if gpoa_sum >= 3.0 else "NÃO_OK"
                row_data["val_irrad_3kwh_medidos"] = f"{status}|{gpoa_sum:.2f} kWh/m²".replace(".", ",")
            else:
                row_data["val_irrad_3kwh_medidos"] = "NÃO_OK|0,00 kWh/m²"
                
            if "gpoa_válida" in processed_df.columns:
                gpoa_val_sum = processed_df["gpoa_válida"].sum(skipna=True) / 60000.0
                status = "OK" if gpoa_val_sum >= 3.0 else "NÃO_OK"
                row_data["val_irrad_3kwh_validos"] = f"{status}|{gpoa_val_sum:.2f} kWh/m²".replace(".", ",")
            else:
                row_data["val_irrad_3kwh_validos"] = "NÃO_OK|0,00 kWh/m²"
        else:
            row_data["val_irrad_3h_medidos"] = "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
            row_data["val_irrad_3h_validos"] = "NÃO_OK|0 pts - 0,00 h totais | 0 pts - 0,00 h consecutivos"
            row_data["val_irrad_3kwh_medidos"] = "NÃO_OK|0,00 kWh/m²"
            row_data["val_irrad_3kwh_validos"] = "NÃO_OK|0,00 kWh/m²"
            
        # Validação final: se qualquer coluna de Dados Válidos estiver NÃO_OK, o dia é Inválido
        irrad_600_ok = not row_data.get("val_irrad_3h_validos", "").startswith("NÃO_OK")
        irrad_3kwh_ok = not row_data.get("val_irrad_3kwh_validos", "").startswith("NÃO_OK")
        row_data["val_validacao"] = "Dia Válido" if (irrad_600_ok and irrad_3kwh_ok) else "Dia Inválido"
        # ----------------------------------------
        
        for col in column_definitions:
            if col["type"] == "validation":
                continue # já calculado acima

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
                            median_window = f_def.get("median_window")
                            if median_window and median_window > 1:
                                med = s_data.rolling(window=median_window, center=True, min_periods=1).median()
                                diff = (s_data - med).abs()
                            else:
                                diff = s_data.diff().abs()
                            s_data[diff > f_def["max_variation"]] = np.nan
                        if f_def.get("min_variation") is not None:
                            min_time = f_def.get("min_time", 1)
                            diff = s_data.diff().abs()
                            mask = diff < f_def["min_variation"]
                            if min_time > 1:
                                group = (~mask).cumsum()
                                run_lengths = mask.groupby(group).transform('sum')
                                mask = mask & (run_lengths >= min_time)
                            s_data[mask] = np.nan
                    
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
                            
                            # Considera apenas os minutos em que existe a Referência do Tracker
                            if "Tracker Ref." in processed_df.columns:
                                valid_mask = processed_df["Tracker Ref."].notna()
                                flag_series = flag_series[valid_mask]
                            
                            total_errors = flag_series.sum(skipna=True)
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
                            if col["node_id"] in ["potencia_ppc", "referencia_ppc"]:
                                val = raw_sum / 0.06
                            elif col["node_id"] == "energia_pmi":
                                val = raw_sum / 5.0
                            else:
                                val = raw_sum / 60000.0
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
                
                if col["node_id"] == "tracker":
                    if processed_df is not None and "Tracker Piranômetro" in processed_df.columns:
                        tracker_flag = processed_df["Tracker Piranômetro"]
                        
                        # Considera apenas os minutos em que existe a Referência do Tracker
                        if "Tracker Ref." in processed_df.columns:
                            valid_mask = processed_df["Tracker Ref."].notna()
                            tracker_flag = tracker_flag[valid_mask]
                            
                        # Invalidados são os pontos em que a flag final é 0
                        total_invalidos = (tracker_flag == 0).sum()
                        total_pontos = tracker_flag.notna().sum()
                        
                        if total_pontos > 0:
                            perc = (total_invalidos / total_pontos) * 100
                            val = f"{int(total_invalidos)} ({perc:.1f}%)"
                        else:
                            val = "-"
                    else:
                        val = "-"
                elif col["node_id"] == "curtailment":
                    if processed_df is not None and "curtailment" in processed_df.columns:
                        curt_flag = processed_df["curtailment"]
                        
                        total_invalidos = (curt_flag == 0).sum()
                        total_pontos = curt_flag.notna().sum()
                        
                        if total_pontos > 0:
                            perc = (total_invalidos / total_pontos) * 100
                            val = f"{int(total_invalidos)} ({perc:.1f}%)"
                        else:
                            val = "-"
                    else:
                        val = "-"
                elif processed_df is not None and base_key in processed_df.columns:
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
                                s_data_clean = s_data.dropna().sort_values()
                                n = len(s_data_clean)
                                if n > 0:
                                    k = int(n * trim_p / 2.0)
                                    if k > 0:
                                        s_data = s_data_clean.iloc[k : n - k]
                                    else:
                                        s_data = s_data_clean
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
                    else:
                        # Calcular integral (soma) e converter de 1-min para base horária / kW
                        raw_sum = s_data.sum(min_count=1)
                        if raw_sum is not None and not pd.isna(raw_sum):
                            if col["node_id"] in ["potencia_ppc", "referencia_ppc", "energia_pmi"]:
                                val = raw_sum / 0.06
                            elif col["node_id"] in ["pvsyst", "pvsyst_ajustada"]:
                                val = raw_sum / 60.0
                            else:
                                val = raw_sum / 60000.0
                        else:
                            val = None
            
            # Formatando o valor
            if pd.isna(val) or val is None:
                row_data[col_key] = "-"
            elif isinstance(val, str):
                row_data[col_key] = val
            else:
                row_data[col_key] = float(val)
                
        # Calcula o EPI (Energia PMI (Válido) / Energia Prevista Ajustada (Válido))
        if "Energia PMI_válida" in row_data and "E_Grid_Ajustada_válida" in row_data:
            val_pmi = row_data["Energia PMI_válida"]
            val_pvsyst = row_data["E_Grid_Ajustada_válida"]
            if val_pmi != "-" and val_pvsyst != "-" and val_pvsyst != 0:
                row_data["epi"] = val_pmi / val_pvsyst

        # Calcula o Fator de Ajuste (geff_válida / GlobInc_válida)
        if "GlobInc_válida" in row_data and "geff_válida" in row_data:
            val_glob = row_data["GlobInc_válida"]
            val_geff = row_data["geff_válida"]
            if val_glob != "-" and val_geff != "-" and val_glob != 0:
                row_data["fator_ajuste"] = val_geff / val_glob
                
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

def export_pvsyst_xlsx(usina: str) -> bytes:
    """Gera um XLSX com Timestamp, Geff, Tamb e Tcel multiplicados pelo filtro de Simultaneidade."""
    import io
    processed_dir = os.path.join(DATA_DIR, usina, "processed")
    if not os.path.exists(processed_dir):
        return b""
        
    dfs = []
    for f in sorted(os.listdir(processed_dir)):
        if f.endswith(".parquet"):
            try:
                df = pd.read_parquet(os.path.join(processed_dir, f))
                dfs.append(df)
            except Exception as e:
                logger.error(f"[FLOW EXPORT] Erro ao ler {f}: {e}")
                
    if not dfs:
        return b""
        
    full_df = pd.concat(dfs, ignore_index=True)
    cols = full_df.columns
    
    geff_col = next((c for c in cols if c.lower() == 'geff'), None)
    tamb_col = next((c for c in cols if c.lower() == 'tamb'), None)
    tcel_col = next((c for c in cols if c.lower() == 'tcel'), None)
    valid_col = next((c for c in cols if c.lower() == 'dados válidos'), None)
    
    output_df = pd.DataFrame()
    if 'timestamp' in cols:
        output_df['Timestamp'] = full_df['timestamp']
    elif full_df.index.name == 'timestamp':
        output_df['Timestamp'] = full_df.index
        
    if valid_col and geff_col and tamb_col and tcel_col:
        mask = full_df[valid_col].fillna(0).astype(int)
        output_df['Geff'] = full_df[geff_col].where(mask == 1, np.nan)
        output_df['Tamb'] = full_df[tamb_col].where(mask == 1, np.nan)
        output_df['Tcel'] = full_df[tcel_col].where(mask == 1, np.nan)
    else:
        logger.warning(f"[FLOW EXPORT] Faltam colunas para exportação completa.")
        if geff_col: output_df['Geff'] = full_df[geff_col]
        if tamb_col: output_df['Tamb'] = full_df[tamb_col]
        if tcel_col: output_df['Tcel'] = full_df[tcel_col]
        
    # Remove timezone so Excel can save it, if it is tz-aware
    if pd.api.types.is_datetime64tz_dtype(output_df['Timestamp']):
        output_df['Timestamp'] = output_df['Timestamp'].dt.tz_localize(None)

    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
        output_df.to_excel(writer, index=False, sheet_name="PVSyst Export")
    return excel_buffer.getvalue()

