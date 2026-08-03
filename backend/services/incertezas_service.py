import pandas as pd
import numpy as np
import os
import json
import logging
from typing import Dict, List, Any

from utils.config import DATA_DIR
from services.pvlib_service import run_pvlib_simulation
from services.flow_service import get_processed_path

logger = logging.getLogger(__name__)

def run_uncertainty_simulations(usina: str, dates: List[str], uncertainties: Dict[str, float], nodes: List[Dict[str, Any]]):
    """
    Roda as simulações (1 nominal + variaveis x 2 extremos) e retorna 
    os totais de E_Grid de cada cenário.
    As variáveis perturbáveis são: gpoa, grear, tmod, sujidade.
    """
    
    # 1. Carrega todos os processed_df dos dias solicitados
    dfs = []
    for date in dates:
        path = get_processed_path(date, usina)
        if os.path.exists(path):
            df = pd.read_parquet(path)
            # Se reset_index foi usado para salvar (com a coluna index ou timestamp), converte de volta se precisar
            if 'index' in df.columns:
                df = df.set_index('index')
            elif 'timestamp' in df.columns:
                df = df.set_index('timestamp')
            dfs.append(df)
            
    if not dfs:
        raise ValueError(f"Nenhum dado processado encontrado para a usina {usina} no período selecionado.")

    # Busca o nó pvlib para enviar à simulação
    pvlib_node = next((n for n in nodes if n.get("type") == "pvlib" or n.get("id") == "pvlib"), None)
    if not pvlib_node:
        raise ValueError("Nó PVLib não encontrado na configuração fornecida.")

    # Variáveis alvo e colunas no dataframe
    targets = {
        "gpoa": "gpoa_válida",
        "grear": "grear_válida",
        "tmod": ["tmod_válida", "Tmod_válida"],
        "sujidade": "sujidade_válida"
    }

    results = {}
    
    # Inicializa o dicionário de resultados
    results["nominal"] = {"valor": 0.0}
    results["medida"] = {"valor": 0.0}
    for var_key, u_pct in uncertainties.items():
        if u_pct > 0 and var_key in targets:
            results[f"{var_key}_min"] = {"valor": 0.0}
            results[f"{var_key}_max"] = {"valor": 0.0}
            
    # Função auxiliar para recalcular as dependências
    def recalc_df(df: pd.DataFrame) -> pd.DataFrame:
        df_new = df.copy()
        
        # 1. Recalcula Geff_válida se gpoa_válida e grear_válida existirem
        # Geff = Gpoa + beta * Grear * (1 - SSF) * (1 - MLF)
        geff_node = next((n for n in nodes if n.get("type") == "geff" or n.get("id") == "geff"), None)
        beta = 0.0
        ssf = 0.0
        mlf = 0.0
        if geff_node:
            data = geff_node.get("data", {})
            beta = data.get("beta", 0.0)
            ssf = data.get("SSF", 0.0)
            mlf = data.get("MLF", 0.0)
            
        if "gpoa_válida" in df_new.columns:
            g_base = df_new["gpoa_válida"]
            g_rear = df_new["grear_válida"] if "grear_válida" in df_new.columns else 0
            df_new["Geff_válida"] = g_base + beta * g_rear * (1 - ssf) * (1 - mlf)
            # Como pvlib_service as vezes busca 'geff_válida' minusculo:
            df_new["geff_válida"] = df_new["Geff_válida"]
            
        # 2. Recalcula Tcel_válida
        # Tcel = Tmod + (Gpoa / 1000) * 3.0
        if "tmod_válida" in df_new.columns or "Tmod_válida" in df_new.columns:
            t_base = df_new.get("tmod_válida", df_new.get("Tmod_válida"))
            g_base = df_new.get("gpoa_válida", 0)
            df_new["Tcel_válida"] = t_base + (g_base / 1000.0) * 3.0
            df_new["tcel_válida"] = df_new["Tcel_válida"]
            
        return df_new

    # ==========================
    # SIMULAÇÕES POR DIA
    # ==========================
    logger.info("[UNCERTAINTY] Executando simulações (Nominal e Perturbações) dia a dia...")
    
    for df_day in dfs:
        # Captura energia medida real se existir
        if "Energia PMI_válida" in df_day.columns:
            results["medida"]["valor"] += float(df_day["Energia PMI_válida"].sum() / 0.06)
            
        # 0. SIMULAÇÃO NOMINAL
        nominal_df = recalc_df(df_day.copy())
        res_nominal = run_pvlib_simulation(nominal_df, pvlib_node, usina, "nominal", nodes)
        
        if res_nominal and "pvlib_E_Grid_válida" in res_nominal:
            results["nominal"]["valor"] += float(res_nominal["pvlib_E_Grid_válida"].sum() / 60.0)
            
        # 1. PERTURBAÇÕES
        for var_key, u_pct in uncertainties.items():
            if u_pct <= 0 or var_key not in targets:
                continue
                
            col_names = targets[var_key]
            if isinstance(col_names, str):
                col_names = [col_names]
                
            actual_cols = [c for c in col_names if c in df_day.columns]
            if not actual_cols:
                continue
                
            for scenario, multiplier in [("min", 1.0 - (u_pct/100.0)), ("max", 1.0 + (u_pct/100.0))]:
                df_perturbed = df_day.copy()
                for c in actual_cols:
                    if var_key == "tmod":
                        delta = -u_pct if scenario == "min" else u_pct
                        df_perturbed[c] = df_perturbed[c] + delta
                    elif var_key == "sujidade":
                        is_efficiency = df_day[c].mean() > 50
                        delta = -u_pct if scenario == "min" else u_pct
                        if is_efficiency:
                            # A perda é 100 - eficiência
                            loss = 100.0 - df_perturbed[c]
                            new_loss = (loss + delta).clip(lower=0)
                            df_perturbed[c] = 100.0 - new_loss
                        else:
                            df_perturbed[c] = (df_perturbed[c] + delta).clip(lower=0)
                    else:
                        multiplier = 1.0 - (u_pct/100.0) if scenario == "min" else 1.0 + (u_pct/100.0)
                        df_perturbed[c] = df_perturbed[c] * multiplier
                    
                df_perturbed = recalc_df(df_perturbed)
                
                res_pert = run_pvlib_simulation(df_perturbed, pvlib_node, usina, f"{var_key}_{scenario}", nodes)
                
                if res_pert and "pvlib_E_Grid_válida" in res_pert:
                    results[f"{var_key}_{scenario}"]["valor"] += float(res_pert["pvlib_E_Grid_válida"].sum() / 60.0)
                    
    # Verificação de erro
    if results["nominal"]["valor"] == 0.0:
        raise ValueError("Simulação PVLib falhou ou retornou zero. Verifique se os Módulos e Inversores estão configurados e salvos no nó PVLib do Fluxograma.")
        
    return results
