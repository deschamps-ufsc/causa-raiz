from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import pandas as pd
import numpy as np
import os
import json

from utils.config import DATA_DIR
from utils.logger import logger
from services.parquet_service import query_data
from services.flow_service import get_flow_integrals

router = APIRouter(prefix="/capacity-test", tags=["Capacity Test"])
logger = logging.getLogger(__name__)

RESULTS_FILE = os.path.join(DATA_DIR, "capacity_test_results.json")

def load_results() -> Dict[str, Any]:
    if not os.path.exists(RESULTS_FILE):
        return {}
    try:
        with open(RESULTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Erro ao carregar capacity_test_results.json: {e}")
        return {}

def save_results(data: Dict[str, Any]):
    os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@router.get("/results")
def get_capacity_test_results(usina: str = Query(...)):
    data = load_results()
    return data.get(usina, {})

class SaveResultsPayload(BaseModel):
    usina: str
    results: Dict[str, Any]

@router.post("/results")
def save_capacity_test_results_route(payload: SaveResultsPayload):
    data = load_results()
    data[payload.usina] = payload.results
    save_results(data)
    return {"status": "success"}

class CapacityTestPayload(BaseModel):
    usina: str
    dates: List[str]
    p_series: str
    g_series: str
    t_series: str
    g_min: float
    g_max: float
    resolution: str = "1 min"
    astm_window: int = 5

@router.post("/process")
def process_capacity_test(payload: CapacityTestPayload):
    try:
        dates_str = ",".join(payload.dates)
        series_list = [payload.p_series, payload.g_series, payload.t_series]
        
        logger.info(f"[CAPACITY] Iniciando regressão para {payload.usina} nas datas {dates_str}. Séries: {series_list}, Resolução: {payload.resolution}")
        
        result = query_data(
            dates_str=dates_str,
            usina=payload.usina,
            series=series_list
        )
        
        if not result or "series" not in result or len(result["series"]) == 0:
            raise ValueError("Não há dados disponíveis para as séries e datas selecionadas.")
            
        df = pd.DataFrame(result["series"])
        if "timestamps" in result:
            df["timestamp"] = result["timestamps"]
        
        # Garante que as colunas existem
        for s in series_list:
            if s not in df.columns:
                raise ValueError(f"Série {s} não encontrada nos dados.")
                
        # Converte para numérico e remove NaNs
        df_numeric = df[series_list].apply(pd.to_numeric, errors='coerce')
        if "timestamp" in df.columns:
            df_numeric["timestamp"] = pd.to_datetime(df["timestamp"], errors='coerce')
        df = df_numeric.dropna(subset=series_list)
        
        diagnostics_15min = None
        if getattr(payload, "resolution", "1 min") == "15 min" and "timestamp" in df.columns:
            df = df.sort_values("timestamp")
            df = df.drop_duplicates(subset=["timestamp"])
            
            df_resampled = df.set_index("timestamp").resample('15min')
            counts = df_resampled[payload.p_series].count()
            
            valid_intervals = counts[counts == 15].index
            
            total_blocks = len(counts[counts > 0])
            complete_blocks = len(valid_intervals)
            incomplete_blocks = counts[(counts > 0) & (counts < 15)]
            
            incomplete_blocks_list = [
                {"time": ts.strftime('%Y-%m-%d %H:%M'), "count": int(c)} 
                for ts, c in incomplete_blocks.items()
            ]
            
            diagnostics_15min = {
                "total_blocks": total_blocks,
                "complete_blocks": complete_blocks,
                "incomplete_blocks": len(incomplete_blocks),
                "incomplete_details": incomplete_blocks_list
            }
            
            df = df_resampled.mean().loc[valid_intervals].reset_index()
        
        # Filtra pelos limites de irradiância
        df = df[(df[payload.g_series] >= payload.g_min) & (df[payload.g_series] <= payload.g_max)]
        
        if len(df) == 0:
            raise ValueError("Não restaram dados após aplicar os limites de Irradiância.")
            
        # Variáveis da regressão:
        # Modelo: P = a1*G + a2*G^2 + a3*G*T
        G = df[payload.g_series].values
        T = df[payload.t_series].values
        P = df[payload.p_series].values
        
        # Construindo a matriz de features X
        X1 = G
        X2 = G ** 2
        X3 = G * T
        
        X = np.column_stack((X1, X2, X3))
        
        # Regressão Linear Múltipla sem intercepto usando mínimos quadrados
        coef, residuals, rank, s = np.linalg.lstsq(X, P, rcond=None)
        
        a1, a2, a3 = coef
        
        # Calcular R² e Previsões
        P_pred = np.dot(X, coef)
        ss_res = np.sum((P - P_pred) ** 2)
        ss_tot = np.sum((P - np.mean(P)) ** 2)
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # Calcular RMSE e MAE
        resid = P - P_pred
        rmse = np.sqrt(np.mean(resid ** 2))
        mae = np.mean(np.abs(resid))
        
        # Estatísticas dos Coeficientes
        from scipy import stats
        n = len(P)
        p_params = X.shape[1]
        df_resid = n - p_params
        
        MSE = np.sum(resid ** 2) / df_resid if df_resid > 0 else 0
        try:
            cov_b = np.linalg.inv(X.T @ X) * MSE
            se = np.sqrt(np.diagonal(cov_b))
            t_stat = coef / se
            p_values = stats.t.sf(np.abs(t_stat), df_resid) * 2
        except Exception as e:
            logger.warning(f"Erro ao calcular estatísticas dos coeficientes: {e}")
            se = np.zeros(p_params)
            t_stat = np.zeros(p_params)
            p_values = np.zeros(p_params)
            
        coeff_stats = {
            "a1": {"coef": float(a1), "se": float(se[0]), "t": float(t_stat[0]), "p_value": float(p_values[0])},
            "a2": {"coef": float(a2), "se": float(se[1]), "t": float(t_stat[1]), "p_value": float(p_values[1])},
            "a3": {"coef": float(a3), "se": float(se[2]), "t": float(t_stat[2]), "p_value": float(p_values[2])},
        }
        
        # Percentis (G e Tamb)
        def calc_percentiles(arr):
            return {
                "min": float(np.min(arr)),
                "max": float(np.max(arr)),
                "p10": float(np.percentile(arr, 10)),
                "p25": float(np.percentile(arr, 25)),
                "p50": float(np.percentile(arr, 50)),
                "p75": float(np.percentile(arr, 75)),
                "p90": float(np.percentile(arr, 90)),
            }
            
        data_ranges = {
            "G": calc_percentiles(G),
            "Tamb": calc_percentiles(T)
        }
        
        # Reduzir pontos do gráfico para não travar o frontend (sub-sampling)
        n_points = len(P)
        max_points = 5000
        if n_points > max_points:
            idx = np.random.choice(n_points, max_points, replace=False)
            idx.sort()
        else:
            idx = np.arange(n_points)
            
        plot_data = {
            "P_medida": P[idx].tolist(),
            "P_prevista": P_pred[idx].tolist(),
            "G": G[idx].tolist(),
            "Tamb": T[idx].tolist(),
            "residuals": resid[idx].tolist()
        }
        
        daily_results = {}
        if "timestamp" in df.columns:
            df["date"] = df["timestamp"].dt.strftime('%Y-%m-%d')
            for date, group in df.groupby("date"):
                if len(group) < 3:
                    continue
                g_d = group[payload.g_series].values
                t_d = group[payload.t_series].values
                p_d = group[payload.p_series].values
                
                x_d = np.column_stack((g_d, g_d ** 2, g_d * t_d))
                
                coef_d, _, _, _ = np.linalg.lstsq(x_d, p_d, rcond=None)
                a1_d, a2_d, a3_d = coef_d
                
                p_pred_d = np.dot(x_d, coef_d)
                ss_res_d = np.sum((p_d - p_pred_d) ** 2)
                ss_tot_d = np.sum((p_d - np.mean(p_d)) ** 2)
                r2_d = 1 - (ss_res_d / ss_tot_d) if ss_tot_d > 0 else 0
                rmse_d = np.sqrt(np.mean((p_d - p_pred_d) ** 2))
                
                n_points_d = len(group)
                p_params_d = x_d.shape[1]
                df_resid_d = n_points_d - p_params_d
                
                # Daily p-values logic
                p_values_d = [None, None, None]
                se_d = [None, None, None]
                t_stat_d = [None, None, None]
                error_stat = None
                p_value_max = None
                
                mse_d = np.sum((p_d - p_pred_d) ** 2) / df_resid_d if df_resid_d > 0 else 0
                if df_resid_d > 0 and mse_d > 0:
                    try:
                        cov_b_d = np.linalg.inv(x_d.T @ x_d) * mse_d
                        se_array = np.sqrt(np.diagonal(cov_b_d))
                        t_array = coef_d / se_array
                        p_array = stats.t.sf(np.abs(t_array), df_resid_d) * 2
                        
                        p_values_d = [float(p) if not np.isnan(p) else None for p in p_array]
                        se_d = [float(s) if not np.isnan(s) else None for s in se_array]
                        t_stat_d = [float(t) if not np.isnan(t) else None for t in t_array]
                        valid_ps = [p for p in p_values_d if p is not None]
                        p_value_max = float(max(valid_ps)) if valid_ps else None
                    except Exception as e:
                        error_stat = f"Erro no cálculo da matriz: {str(e)}"
                else:
                    error_stat = "Dados insuficientes ou MSE zero."

                g_median_d = float(np.median(g_d)) if len(g_d) > 0 else 0
                g_iqr_d = float(np.percentile(g_d, 75) - np.percentile(g_d, 25)) if len(g_d) > 0 else 0
                t_median_d = float(np.median(t_d)) if len(t_d) > 0 else 0
                t_iqr_d = float(np.percentile(t_d, 75) - np.percentile(t_d, 25)) if len(t_d) > 0 else 0
                
                g_min_d = float(np.min(g_d)) if len(g_d) > 0 else 0
                g_max_d = float(np.max(g_d)) if len(g_d) > 0 else 0
                t_min_d = float(np.min(t_d)) if len(t_d) > 0 else 0
                t_max_d = float(np.max(t_d)) if len(t_d) > 0 else 0
                
                g_p60_d = float(np.percentile(g_d, 60)) if len(g_d) > 0 else 0
                t_mean_d = float(np.mean(t_d)) if len(t_d) > 0 else 0

                daily_results[date] = {
                    "a1": float(a1_d),
                    "a2": float(a2_d),
                    "a3": float(a3_d),
                    "r2": float(r2_d),
                    "rmse": float(rmse_d),
                    "n_points": n_points_d,
                    "p_values": p_values_d,
                    "se": se_d,
                    "t_stat": t_stat_d,
                    "p_value_max": p_value_max,
                    "error_stat": error_stat,
                    "g_median": g_median_d,
                    "g_iqr": g_iqr_d,
                    "t_median": t_median_d,
                    "t_iqr": t_iqr_d,
                    "g_min": g_min_d,
                    "g_max": g_max_d,
                    "t_min": t_min_d,
                    "t_max": t_max_d,
                    "g_p60": g_p60_d,
                    "t_mean": t_mean_d
                }

        astm_results = {}
        astm_error = None
        try:
            integrals = get_flow_integrals(payload.usina)
            valid_days_set = {row['date'] for row in integrals.get('rows', []) if row.get('val_validacao') == 'Dia Válido'}
            
            if not valid_days_set:
                astm_error = "Para calcular o ASTM Capacity Ratio, processe primeiro as Integrais (Fluxograma) para mapear os dias válidos."
            else:
                eligible_days = sorted([d for d in df["date"].unique() if d in valid_days_set])
                
                if len(eligible_days) < payload.astm_window:
                    astm_error = f"Dias válidos insuficientes ({len(eligible_days)}). A janela requer {payload.astm_window} dias."
                else:
                    for i in range(len(eligible_days) - payload.astm_window + 1):
                        window_days = eligible_days[i : i + payload.astm_window]
                        df_window = df[df["date"].isin(window_days)]
                        
                        G_w = df_window[payload.g_series].values
                        T_w = df_window[payload.t_series].values
                        P_w = df_window[payload.p_series].values
                        
                        if len(P_w) >= 3:
                            X_w = np.column_stack((G_w, G_w ** 2, G_w * T_w))
                            coef_w, _, _, _ = np.linalg.lstsq(X_w, P_w, rcond=None)
                            
                            p_pred_w = X_w @ coef_w
                            ss_res_w = np.sum((P_w - p_pred_w) ** 2)
                            ss_tot_w = np.sum((P_w - np.mean(P_w)) ** 2)
                            r2_w = 1 - (ss_res_w / ss_tot_w) if ss_tot_w > 0 else 0
                            rmse_w = np.sqrt(np.mean((P_w - p_pred_w) ** 2))
                            
                            df_resid_w = len(P_w) - 3
                            p_value_max_w = None
                            error_stat_w = None
                            
                            if df_resid_w > 0 and ss_res_w > 0:
                                mse_w = ss_res_w / df_resid_w
                                try:
                                    cov_w = np.linalg.inv(X_w.T @ X_w) * mse_w
                                    se_w = np.sqrt(np.diagonal(cov_w))
                                    t_array_w = coef_w / se_w
                                    from scipy import stats
                                    p_array_w = stats.t.sf(np.abs(t_array_w), df_resid_w) * 2
                                    valid_ps_w = [float(p) for p in p_array_w if not np.isnan(p)]
                                    p_value_max_w = max(valid_ps_w) if valid_ps_w else None
                                except Exception as e:
                                    error_stat_w = f"Erro cov matriz: {str(e)}"
                            
                            g_median_w = float(np.median(G_w)) if len(G_w) > 0 else 0
                            g_iqr_w = float(np.percentile(G_w, 75) - np.percentile(G_w, 25)) if len(G_w) > 0 else 0
                            t_median_w = float(np.median(T_w)) if len(T_w) > 0 else 0
                            t_iqr_w = float(np.percentile(T_w, 75) - np.percentile(T_w, 25)) if len(T_w) > 0 else 0
                            
                            g_min_w = float(np.min(G_w)) if len(G_w) > 0 else 0
                            g_max_w = float(np.max(G_w)) if len(G_w) > 0 else 0
                            t_min_w = float(np.min(T_w)) if len(T_w) > 0 else 0
                            t_max_w = float(np.max(T_w)) if len(T_w) > 0 else 0
                            
                            g_p60_w = float(np.percentile(G_w, 60)) if len(G_w) > 0 else 0
                            t_mean_w = float(np.mean(T_w)) if len(T_w) > 0 else 0

                            first_day = window_days[0]
                            astm_results[first_day] = {
                                "a1": float(coef_w[0]),
                                "a2": float(coef_w[1]),
                                "a3": float(coef_w[2]),
                                "r2": float(r2_w),
                                "rmse": float(rmse_w),
                                "n_points": len(P_w),
                                "p_value_max": p_value_max_w,
                                "error_stat": error_stat_w,
                                "window_days": window_days,
                                "g_median": g_median_w,
                                "g_iqr": g_iqr_w,
                                "t_median": t_median_w,
                                "t_iqr": t_iqr_w,
                                "g_min": g_min_w,
                                "g_max": g_max_w,
                                "t_min": t_min_w,
                                "t_max": t_max_w,
                                "g_p60": g_p60_w,
                                "t_mean": t_mean_w
                            }
        except Exception as e:
            logger.error(f"Erro calculando ASTM: {e}")
            astm_error = f"Erro interno ao calcular ASTM: {e}"
        
        return {
            "status": "ok",
            "a1": float(a1),
            "a2": float(a2),
            "a3": float(a3),
            "r2": float(r2),
            "rmse": float(rmse),
            "mae": float(mae),
            "n_points": n,
            "resolution": getattr(payload, "resolution", "1 min"),
            "diagnostics_15min": diagnostics_15min,
            "coefficient_statistics": coeff_stats,
            "data_ranges": data_ranges,
            "plot_data": plot_data,
            "daily_results": daily_results,
            "astm_results": astm_results,
            "astm_error": astm_error
        }
        
    except Exception as e:
        logger.error(f"Erro no processamento do Capacity Test: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-stream")
def process_capacity_test_stream(payload: CapacityTestPayload):
    """Processa o capacity test em chunks retornando progresso via SSE."""
    def generate():
        try:
            series_list = [payload.p_series, payload.g_series, payload.t_series]
            dates = [d.strip() for d in payload.dates if d.strip()]
            if not dates:
                yield json.dumps({"error": "Nenhuma data informada."}) + "\n"
                return
                
            all_df = []
            total_days = len(dates)
            
            for i, date in enumerate(dates):
                yield json.dumps({"status": "progress", "progress": i, "total": total_days, "current_day": date}) + "\n"
                
                res = query_data(dates_str=date, usina=payload.usina, series=series_list)
                if not res or "series" not in res or len(res["series"]) == 0:
                    continue
                    
                df_day = pd.DataFrame(res["series"])
                if "timestamps" in res:
                    df_day["timestamp"] = res["timestamps"]
                all_df.append(df_day)
                
            if not all_df:
                yield json.dumps({"error": "Nenhum dado encontrado para os dias informados."}) + "\n"
                return
                
            yield json.dumps({"status": "progress", "progress": total_days, "total": total_days, "current_day": "Agregando..."}) + "\n"
            
            df = pd.concat(all_df, ignore_index=True)
            
            # Repete a mesma lógica de cálculo
            for s in series_list:
                if s not in df.columns:
                    yield json.dumps({"error": f"Série {s} não encontrada."}) + "\n"
                    return
            
            df_numeric = df[series_list].apply(pd.to_numeric, errors='coerce')
            if "timestamp" in df.columns:
                df_numeric["timestamp"] = pd.to_datetime(df["timestamp"], errors='coerce')
            df = df_numeric.dropna(subset=series_list)
            
            diagnostics_15min = None
            if getattr(payload, "resolution", "1 min") == "15 min" and "timestamp" in df.columns:
                df = df.sort_values("timestamp")
                df = df.drop_duplicates(subset=["timestamp"])
                
                df_resampled = df.set_index("timestamp").resample('15min')
                counts = df_resampled[payload.p_series].count()
                
                valid_intervals = counts[counts == 15].index
                
                total_blocks = len(counts[counts > 0])
                complete_blocks = len(valid_intervals)
                incomplete_blocks = counts[(counts > 0) & (counts < 15)]
                
                incomplete_blocks_list = [
                    {"time": ts.strftime('%Y-%m-%d %H:%M'), "count": int(c)} 
                    for ts, c in incomplete_blocks.items()
                ]
                
                diagnostics_15min = {
                    "total_blocks": total_blocks,
                    "complete_blocks": complete_blocks,
                    "incomplete_blocks": len(incomplete_blocks),
                    "incomplete_details": incomplete_blocks_list
                }
                
                df = df_resampled.mean().loc[valid_intervals].reset_index()
            
            df = df[(df[payload.g_series] >= payload.g_min) & (df[payload.g_series] <= payload.g_max)]
            
            if len(df) == 0:
                yield json.dumps({"error": "Não restaram dados após filtros."}) + "\n"
                return
                
            G = df[payload.g_series].values
            T = df[payload.t_series].values
            P = df[payload.p_series].values
            
            X1 = G
            X2 = G ** 2
            X3 = G * T
            X = np.column_stack((X1, X2, X3))
            
            coef, residuals, rank, s = np.linalg.lstsq(X, P, rcond=None)
            a1, a2, a3 = coef
            
            P_pred = np.dot(X, coef)
            ss_res = np.sum((P - P_pred) ** 2)
            ss_tot = np.sum((P - np.mean(P)) ** 2)
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
            resid = P - P_pred
            rmse = np.sqrt(np.mean(resid ** 2))
            mae = np.mean(np.abs(resid))
            
            from scipy import stats
            n = len(P)
            p_params = X.shape[1]
            df_resid = n - p_params
            
            MSE = np.sum(resid ** 2) / df_resid if df_resid > 0 else 0
            try:
                cov_b = np.linalg.inv(X.T @ X) * MSE
                se = np.sqrt(np.diagonal(cov_b))
                t_stat = coef / se
                p_values = stats.t.sf(np.abs(t_stat), df_resid) * 2
            except:
                se = np.zeros(p_params)
                t_stat = np.zeros(p_params)
                p_values = np.zeros(p_params)
                
            coeff_stats = {
                "a1": {"coef": float(a1), "se": float(se[0]), "t": float(t_stat[0]), "p_value": float(p_values[0])},
                "a2": {"coef": float(a2), "se": float(se[1]), "t": float(t_stat[1]), "p_value": float(p_values[1])},
                "a3": {"coef": float(a3), "se": float(se[2]), "t": float(t_stat[2]), "p_value": float(p_values[2])},
            }
            
            def calc_percentiles(arr):
                return {
                    "min": float(np.min(arr)), "max": float(np.max(arr)),
                    "p10": float(np.percentile(arr, 10)), "p25": float(np.percentile(arr, 25)),
                    "p50": float(np.percentile(arr, 50)), "p75": float(np.percentile(arr, 75)),
                    "p90": float(np.percentile(arr, 90)),
                }
                
            data_ranges = { "G": calc_percentiles(G), "Tamb": calc_percentiles(T) }
            
            n_points = len(P)
            max_points = 5000
            if n_points > max_points:
                idx = np.random.choice(n_points, max_points, replace=False)
                idx.sort()
            else:
                idx = np.arange(n_points)
                
            plot_data = {
                "P_medida": P[idx].tolist(),
                "P_prevista": P_pred[idx].tolist(),
                "G": G[idx].tolist(),
                "Tamb": T[idx].tolist(),
                "residuals": resid[idx].tolist()
            }
            
            daily_results = {}
            if "timestamp" in df.columns:
                df["date"] = df["timestamp"].dt.strftime('%Y-%m-%d')
                for date_key, group in df.groupby("date"):
                    if len(group) < 3:
                        continue
                    g_d = group[payload.g_series].values
                    t_d = group[payload.t_series].values
                    p_d = group[payload.p_series].values
                    x_d = np.column_stack((g_d, g_d ** 2, g_d * t_d))
                    
                    coef_d, _, _, _ = np.linalg.lstsq(x_d, p_d, rcond=None)
                    p_pred_d = np.dot(x_d, coef_d)
                    ss_res_d = np.sum((p_d - p_pred_d) ** 2)
                    ss_tot_d = np.sum((p_d - np.mean(p_d)) ** 2)
                    r2_d = 1 - (ss_res_d / ss_tot_d) if ss_tot_d > 0 else 0
                    rmse_d = np.sqrt(np.mean((p_d - p_pred_d) ** 2))
                    
                    n_points_d = len(group)
                    p_params_d = x_d.shape[1]
                    df_resid_d = n_points_d - p_params_d
                    
                    # Daily p-values logic
                    p_values_d = [None, None, None]
                    se_d = [None, None, None]
                    t_stat_d = [None, None, None]
                    error_stat = None
                    p_value_max = None
                    
                    mse_d = np.sum((p_d - p_pred_d) ** 2) / df_resid_d if df_resid_d > 0 else 0
                    if df_resid_d > 0 and mse_d > 0:
                        try:
                            cov_b_d = np.linalg.inv(x_d.T @ x_d) * mse_d
                            se_array = np.sqrt(np.diagonal(cov_b_d))
                            t_array = coef_d / se_array
                            p_array = stats.t.sf(np.abs(t_array), df_resid_d) * 2
                            
                            p_values_d = [float(p) if not np.isnan(p) else None for p in p_array]
                            se_d = [float(s) if not np.isnan(s) else None for s in se_array]
                            t_stat_d = [float(t) if not np.isnan(t) else None for t in t_array]
                            valid_ps = [p for p in p_values_d if p is not None]
                            p_value_max = float(max(valid_ps)) if valid_ps else None
                        except Exception as e:
                            error_stat = f"Erro no cálculo da matriz: {str(e)}"
                    else:
                        error_stat = "Dados insuficientes ou MSE zero."

                    g_median_d = float(np.median(g_d)) if len(g_d) > 0 else 0
                    g_iqr_d = float(np.percentile(g_d, 75) - np.percentile(g_d, 25)) if len(g_d) > 0 else 0
                    t_median_d = float(np.median(t_d)) if len(t_d) > 0 else 0
                    t_iqr_d = float(np.percentile(t_d, 75) - np.percentile(t_d, 25)) if len(t_d) > 0 else 0
                    
                    g_min_d = float(np.min(g_d)) if len(g_d) > 0 else 0
                    g_max_d = float(np.max(g_d)) if len(g_d) > 0 else 0
                    t_min_d = float(np.min(t_d)) if len(t_d) > 0 else 0
                    t_max_d = float(np.max(t_d)) if len(t_d) > 0 else 0
                    
                    g_p60_d = float(np.percentile(g_d, 60)) if len(g_d) > 0 else 0
                    t_mean_d = float(np.mean(t_d)) if len(t_d) > 0 else 0

                    daily_results[date_key] = {
                        "a1": float(coef_d[0]),
                        "a2": float(coef_d[1]),
                        "a3": float(coef_d[2]),
                        "r2": float(r2_d),
                        "rmse": float(rmse_d),
                        "n_points": n_points_d,
                        "p_values": p_values_d,
                        "se": se_d,
                        "t_stat": t_stat_d,
                        "p_value_max": p_value_max,
                        "error_stat": error_stat,
                        "g_median": g_median_d,
                        "g_iqr": g_iqr_d,
                        "t_median": t_median_d,
                        "t_iqr": t_iqr_d,
                        "g_min": g_min_d,
                        "g_max": g_max_d,
                        "t_min": t_min_d,
                        "t_max": t_max_d,
                        "g_p60": g_p60_d,
                        "t_mean": t_mean_d
                    }

            astm_results = {}
            astm_error = None
            try:
                integrals = get_flow_integrals(payload.usina)
                valid_days_set = {row['date'] for row in integrals.get('rows', []) if row.get('val_validacao') == 'Dia Válido'}
                
                if not valid_days_set:
                    astm_error = "Para calcular o ASTM Capacity Ratio, processe primeiro as Integrais (Fluxograma) para mapear os dias válidos."
                else:
                    eligible_days = sorted([d for d in df["date"].unique() if d in valid_days_set])
                    
                    if len(eligible_days) < payload.astm_window:
                        astm_error = f"Dias válidos insuficientes ({len(eligible_days)}). A janela requer {payload.astm_window} dias."
                    else:
                        for i in range(len(eligible_days) - payload.astm_window + 1):
                            window_days = eligible_days[i : i + payload.astm_window]
                            df_window = df[df["date"].isin(window_days)]
                            
                            G_w = df_window[payload.g_series].values
                            T_w = df_window[payload.t_series].values
                            P_w = df_window[payload.p_series].values
                            
                            if len(P_w) >= 3:
                                X_w = np.column_stack((G_w, G_w ** 2, G_w * T_w))
                                coef_w, _, _, _ = np.linalg.lstsq(X_w, P_w, rcond=None)
                                
                                p_pred_w = X_w @ coef_w
                                ss_res_w = np.sum((P_w - p_pred_w) ** 2)
                                ss_tot_w = np.sum((P_w - np.mean(P_w)) ** 2)
                                r2_w = 1 - (ss_res_w / ss_tot_w) if ss_tot_w > 0 else 0
                                rmse_w = np.sqrt(np.mean((P_w - p_pred_w) ** 2))
                                
                                df_resid_w = len(P_w) - 3
                                p_value_max_w = None
                                error_stat_w = None
                                
                                if df_resid_w > 0 and ss_res_w > 0:
                                    mse_w = ss_res_w / df_resid_w
                                    try:
                                        cov_w = np.linalg.inv(X_w.T @ X_w) * mse_w
                                        se_w = np.sqrt(np.diagonal(cov_w))
                                        t_array_w = coef_w / se_w
                                        from scipy import stats
                                        p_array_w = stats.t.sf(np.abs(t_array_w), df_resid_w) * 2
                                        valid_ps_w = [float(p) for p in p_array_w if not np.isnan(p)]
                                        p_value_max_w = max(valid_ps_w) if valid_ps_w else None
                                    except Exception as e:
                                        error_stat_w = f"Erro cov matriz: {str(e)}"
                                
                                g_median_w = float(np.median(G_w)) if len(G_w) > 0 else 0
                                g_iqr_w = float(np.percentile(G_w, 75) - np.percentile(G_w, 25)) if len(G_w) > 0 else 0
                                t_median_w = float(np.median(T_w)) if len(T_w) > 0 else 0
                                t_iqr_w = float(np.percentile(T_w, 75) - np.percentile(T_w, 25)) if len(T_w) > 0 else 0
                                
                                g_min_w = float(np.min(G_w)) if len(G_w) > 0 else 0
                                g_max_w = float(np.max(G_w)) if len(G_w) > 0 else 0
                                t_min_w = float(np.min(T_w)) if len(T_w) > 0 else 0
                                t_max_w = float(np.max(T_w)) if len(T_w) > 0 else 0
                                
                                g_p60_w = float(np.percentile(G_w, 60)) if len(G_w) > 0 else 0
                                t_mean_w = float(np.mean(T_w)) if len(T_w) > 0 else 0

                                first_day = window_days[0]
                                astm_results[first_day] = {
                                    "a1": float(coef_w[0]),
                                    "a2": float(coef_w[1]),
                                    "a3": float(coef_w[2]),
                                    "r2": float(r2_w),
                                    "rmse": float(rmse_w),
                                    "n_points": len(P_w),
                                    "p_value_max": p_value_max_w,
                                    "error_stat": error_stat_w,
                                    "window_days": window_days,
                                    "g_median": g_median_w,
                                    "g_iqr": g_iqr_w,
                                    "t_median": t_median_w,
                                    "t_iqr": t_iqr_w,
                                    "g_min": g_min_w,
                                    "g_max": g_max_w,
                                    "t_min": t_min_w,
                                    "t_max": t_max_w,
                                    "g_p60": g_p60_w,
                                    "t_mean": t_mean_w
                                }
            except Exception as e:
                logger.error(f"Erro calculando ASTM em stream: {e}")
                astm_error = f"Erro interno ao calcular ASTM: {e}"

            result_dict = {
                "status": "ok",
                "a1": float(a1),
                "a2": float(a2),
                "a3": float(a3),
                "r2": float(r2),
                "rmse": float(rmse),
                "mae": float(mae),
                "n_points": int(n),
                "resolution": getattr(payload, "resolution", "1 min"),
                "diagnostics_15min": diagnostics_15min,
                "coefficient_statistics": coeff_stats,
                "data_ranges": data_ranges,
                "plot_data": plot_data,
                "daily_results": daily_results,
                "astm_results": astm_results,
                "astm_error": astm_error
            }
            
            yield json.dumps({"status": "completed", "result": result_dict}) + "\n"
        except Exception as e:
            logger.error(f"Erro no process_stream: {e}", exc_info=True)
            yield json.dumps({"error": str(e)}) + "\n"
            
    return StreamingResponse(generate(), media_type="application/x-ndjson")
