import os
import json
import pandas as pd
import numpy as np
import pvlib
import math
import functools
from scipy.constants import k, e
from utils.logger import logger
from utils.config import DATA_DIR
from services.settings_service import load_equipamentos

def get_topology_groups(usina: str):
    """
    Reads usina_info.json and groups identical inverters to optimize PVLib simulation.
    Returns a list of topologies:
    [
        {
            "count": <number_of_identical_inverters>,
            "strings": [
                { "wp": 615.0, "qtde_modulos": 28, "count": 240 },
                ...
            ]
        }, ...
    ]
    """
    info_path = os.path.join(DATA_DIR, usina, "usina_info.json")
    if not os.path.exists(info_path):
        return []
        
    with open(info_path, "r", encoding="utf-8") as f:
        usina_info = json.load(f)
        
    # Agrupa strings por inversor
    # { "skid|inversor": { (wp, qtde_modulos): count } }
    inverters = {}
    for key, data in usina_info.items():
        inv_key = f"{data.get('skid', '')}|{data.get('inversor', '')}"
        wp = float(data.get("wp", 0))
        qtde = int(data.get("qtde_modulos", 0))
        
        if inv_key not in inverters:
            inverters[inv_key] = {}
        
        str_key = (wp, qtde)
        inverters[inv_key][str_key] = inverters[inv_key].get(str_key, 0) + 1
        
    # Agrupa inversores identicos
    # Identidade definida pela composição exata de strings
    topologies_map = {}
    for inv_key, strings in inverters.items():
        # tuple of sorted strings to use as dict key
        topo_key = tuple(sorted(strings.items()))
        if topo_key not in topologies_map:
            topologies_map[topo_key] = 0
        topologies_map[topo_key] += 1
        
    result = []
    for topo_key, count in topologies_map.items():
        strings_list = []
        for (wp, qtde), str_count in topo_key:
            strings_list.append({
                "wp": wp,
                "qtde_modulos": qtde,
                "count": str_count
            })
        result.append({
            "count": count,
            "strings": strings_list
        })
        
    return result

def run_pvlib_simulation(processed_df: pd.DataFrame, pvlib_node: dict, usina: str, date: str, nodes: list = None):
    """
    Executa a simulação PVLib para a usina na data fornecida.
    """
    try:
        data = pvlib_node.get("data", {})
        params = data.get("pvlibParams", {})
        
        # Equipamentos
        equipamentos = load_equipamentos()
        sel_modulos = params.get("selected_modulos", [])
        sel_inversores = params.get("selected_inversores", [])
        
        if not sel_modulos or not sel_inversores:
            logger.warning("[PVLIB] Módulos ou Inversores não selecionados.")
            return None
            
        # Pega as specs cadastradas
        modulos_specs = {m["id"]: m for m in equipamentos.get("modulos", []) if m["id"] in sel_modulos}
        inversores_specs = {i["id"]: i for i in equipamentos.get("inversores", []) if i["id"] in sel_inversores}
        
        if not modulos_specs or not inversores_specs:
            logger.warning("[PVLIB] Equipamentos selecionados não encontrados no banco.")
            return None
            
        # Usa o primeiro inversor (assume-se 1 tipo de inversor principal para simplificar, ou fazer match se houvesse info)
        inv_spec = list(inversores_specs.values())[0]
        
        # Mapeamento Wp -> Spec do Módulo
        modulos_by_wp = {float(m["potencia"]): m for m in modulos_specs.values()}
        
        topologies = get_topology_groups(usina)
        if not topologies:
            logger.warning(f"[PVLIB] Nenhuma topologia encontrada para {usina} em usina_info.json")
            return None
            
        # Entradas climáticas estritamente baseadas em dados válidos
        gpoa_eff = processed_df.get("Geff_válida", processed_df.get("geff_válida"))
        tamb = processed_df.get("tamb")
        tcel = processed_df.get("Tcel_válida", processed_df.get("tcel_válida"))
        
        if gpoa_eff is None or tamb is None or tcel is None:
            logger.warning("[PVLIB] Faltam variáveis climáticas válidas (Geff_válida/geff_válida, tamb, Tcel_válida/tcel_válida). Abortando simulação.")
            return None
            
        # =========================================================
        # INÍCIO DO CÁLCULO DE IAM VIA DIRINT / HAY-DAVIES
        # =========================================================
        try:
            tracker_node = next((n for n in (nodes or []) if n.get("id") == "tracker"), None)
            tracker_params = tracker_node.get("data", {}).get("trackerParams", {}) if tracker_node else {}
            
            lat = float(tracker_params.get("latitude", -23.55))
            lon = float(tracker_params.get("longitude", -46.63))
            gcr = float(tracker_params.get("gcr", 0.3))
            max_angle = float(tracker_params.get("max_angle", 60))
            
            times_for_pvlib = pd.DatetimeIndex(processed_df.index.values)
            if times_for_pvlib.tz is None:
                times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
                
            time_offset = int(tracker_params.get("time_offset", 0))
            if time_offset != 0:
                times_for_pvlib = times_for_pvlib - pd.Timedelta(minutes=time_offset)
                
            solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
            
            trk = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], max_angle=max_angle, backtrack=True, gcr=gcr)
            
            surface_tilt = trk['surface_tilt']
            surface_azimuth = trk['surface_azimuth']
            aoi = trk['aoi']
            
            dirint_res = pvlib.irradiance.gti_dirint(
                poa_global=gpoa_eff.fillna(0).values,
                aoi=aoi,
                solar_zenith=solpos['apparent_zenith'],
                solar_azimuth=solpos['azimuth'],
                times=times_for_pvlib,
                surface_tilt=surface_tilt,
                surface_azimuth=surface_azimuth,
                use_delta_kt_prime=False
            )
            
            dni_extra = pvlib.irradiance.get_extra_radiation(times_for_pvlib)
            
            poa_comp = pvlib.irradiance.get_total_irradiance(
                surface_tilt=surface_tilt,
                surface_azimuth=surface_azimuth,
                solar_zenith=solpos['apparent_zenith'],
                solar_azimuth=solpos['azimuth'],
                dni=dirint_res['dni'],
                ghi=dirint_res['ghi'],
                dhi=dirint_res['dhi'],
                dni_extra=dni_extra,
                model='haydavies'
            )
            
            poa_direct = poa_comp['poa_direct']
            poa_sky_diffuse = poa_comp['poa_sky_diffuse']
            poa_ground_diffuse = poa_comp['poa_ground_diffuse']
            
            poa_total_modelo = poa_direct + poa_sky_diffuse + poa_ground_diffuse
            
            # === PVSyst IAM Extraction ===
            mod_spec = list(modulos_specs.values())[0] if modulos_specs else {}
            raw_pan = mod_spec.get('raw_data', {})
            
            iam_mode = raw_pan.get('PVObject_IAM', {}).get('IAMMode', 'Default')
            front_surface = raw_pan.get('FrontSurface', 'fsNormalGlass')
            
            iam_model_name = 'ashrae'
            iam_kwargs = {'b': 0.05} # PVSyst default normal glass
            
            if iam_mode == 'UserProfile':
                profile = raw_pan.get('PVObject_IAM', {}).get('IAMProfile', {})
                n_pts = int(profile.get('NPtsEff', profile.get('NPtsMax', 9)))
                theta_list = []
                iam_list = []
                for i in range(1, n_pts + 1):
                    pt = profile.get(f'Point_{i}')
                    if pt and len(pt) == 2:
                        theta_list.append(float(pt[0]))
                        iam_list.append(float(pt[1]))
                if len(theta_list) > 1:
                    # Sort by theta and remove duplicates
                    pts = sorted(zip(theta_list, iam_list))
                    clean_pts = []
                    for t, v in pts:
                        if not clean_pts or t > clean_pts[-1][0]:
                            clean_pts.append((t, v))
                    theta_list = [p[0] for p in clean_pts]
                    iam_list = [p[1] for p in clean_pts]
                    
                    iam_model_name = 'interp'
                    iam_kwargs = {'theta_ref': theta_list, 'iam_ref': iam_list}
            elif front_surface == 'fsARCoating':
                # PVSyst Default AR Coating
                iam_model_name = 'interp'
                iam_kwargs = {
                    'theta_ref': [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
                    'iam_ref': [1.0, 1.0, 1.0, 1.0, 1.0, 0.998, 0.978, 0.908, 0.697, 0.0]
                }
            
            if iam_model_name == 'interp':
                iam_direct = pvlib.iam.interp(aoi, **iam_kwargs)
                iam_function = functools.partial(pvlib.iam.interp, **iam_kwargs)
            else:
                iam_direct = pvlib.iam.ashrae(aoi, **iam_kwargs)
                iam_function = functools.partial(pvlib.iam.ashrae, **iam_kwargs)
                
            # Calcular diffuse via integração numérica com a função IAM escolhida
            iam_sky = pvlib.iam.marion_integrate(iam_function, surface_tilt, 'sky')
            iam_ground = pvlib.iam.marion_integrate(iam_function, surface_tilt, 'ground')
            
            poa_iam_modelo = (poa_direct * iam_direct) + (poa_sky_diffuse * iam_sky) + (poa_ground_diffuse * iam_ground)
            
            fator_iam = poa_iam_modelo / poa_total_modelo.replace(0, np.nan)
            fator_iam = fator_iam.fillna(1.0).clip(0, 1.0)
            
            # Garante que usamos apenas os arrays para não dar conflito de timezone no index
            gpoa_eff = gpoa_eff * fator_iam.values
            
        except Exception as err:
            logger.error(f"[PVLIB] Falha ao calcular fator IAM via DIRINT/Hay-Davies: {err}")
        # =========================================================
        
        # Perdas
        loss_ohm_dc = float(params.get("loss_ohm_dc", 1.5)) / 100.0
        loss_ohm_ac = float(params.get("loss_ohm_ac", 1.0)) / 100.0
        loss_ohm_ac_mt = float(params.get("loss_ohm_ac_mt", 0.0)) / 100.0
        
        trafo_pnom = float(params.get("trafo_pnom", 0.0)) * 1000.0 # Input em kVA, converte para VA
        trafo_iron_loss = float(params.get("trafo_iron_loss", 0.0)) / 100.0
        trafo_copper_loss = float(params.get("trafo_copper_loss", 0.0)) / 100.0
        
        # Perdas Adicionais do Node
        mismatch = float(params.get("mismatch", 0.0)) / 100.0
        lid = float(params.get("lid", 0.0)) / 100.0
        aux_loss = float(params.get("aux_loss", 0.0)) # kW
        
        # Puxa sujidade do node config e calcula o valor diário único (média interna)
        soiling_val = 0.0
        suj_node = next((n for n in nodes if n.get("type") == "sujidade" or n.get("id") == "sujidade"), None)
        if suj_node and "sujidade_válida" in processed_df.columns:
            s_data = processed_df["sujidade_válida"].dropna()
            if not s_data.empty:
                cfg = suj_node.get("data", {})
                
                # Aplica restrição de tempo
                start_str = cfg.get("startTime")
                end_str = cfg.get("endTime")
                if start_str and end_str:
                    try:
                        start_t = pd.to_datetime(start_str).time()
                        end_t = pd.to_datetime(end_str).time()
                        s_data = s_data.between_time(start_t, end_t)
                    except Exception:
                        pass
                
                # Aplica trim
                try:
                    trim_val = float(cfg.get("trimPercent", 0))
                    if trim_val > 0 and not s_data.empty:
                        lower = s_data.quantile(trim_val / 100.0)
                        upper = s_data.quantile(1 - (trim_val / 100.0))
                        s_data = s_data[(s_data >= lower) & (s_data <= upper)]
                except Exception:
                    pass
                        
                if not s_data.empty:
                    soiling_val = float(s_data.mean()) / 100.0
                    
        # Aplica soiling no Geff (Geff real suja) usando o valor único diário
        # Se o valor for muito alto (ex: 99%), significa eficiência (ratio), então multiplica direto
        # Se for baixo (ex: 2%), significa perda, então multiplica por (1 - soiling_val)
        if soiling_val > 0.5:
            gpoa_eff = gpoa_eff * soiling_val
        else:
            gpoa_eff = gpoa_eff * (1 - soiling_val)
        
        total_p_ac = pd.Series(0.0, index=processed_df.index)
        total_p_dc = pd.Series(0.0, index=processed_df.index)
        
        for topo in topologies:
            inv_count = topo["count"]
            
            # Para cada string group neste inversor, calcula DC
            inv_total_p_dc = pd.Series(0.0, index=processed_df.index)
            
            for str_group in topo["strings"]:
                wp = str_group["wp"]
                qtde = str_group["qtde_modulos"]
                str_count = str_group["count"]
                
                # Encontra o módulo correspondente
                # Tenta match exato ou o mais próximo
                if wp in modulos_by_wp:
                    mod_spec = modulos_by_wp[wp]
                else:
                    # closest wp
                    closest_wp = min(modulos_by_wp.keys(), key=lambda x: abs(x - wp))
                    mod_spec = modulos_by_wp[closest_wp]
                    
                # Checa se o módulo tem os parâmetros brutos do PVSyst
                raw_pan = mod_spec.get("raw_data")
                if raw_pan:
                    # Extração rigorosa do modelo PVSyst 1-Diodo
                    Isc = float(raw_pan.get('Isc', mod_spec.get('isc', 14.0)))
                    Voc = float(raw_pan.get('Voc', mod_spec.get('voc', 50.0)))
                    Ns = float(raw_pan.get('NCelS', mod_spec.get('celulas', 72)))
                    Gamma = float(raw_pan.get('Gamma', 0.95))
                    Rs = float(raw_pan.get('RSerie', 0.2))
                    Rsh = float(raw_pan.get('RShunt', 500.0))
                    
                    Vth = k * (273.15 + 25) / e
                    nNsVth = Ns * Gamma * Vth
                    
                    try:
                        Io_ref = (Isc - Voc/Rsh) / (math.exp(Voc / nNsVth) - 1)
                        IL_ref = Isc + Io_ref * (math.exp(Isc * Rs / nNsVth) - 1) + Isc * Rs / Rsh
                    except OverflowError:
                        Io_ref = 1e-11
                        IL_ref = Isc
                    
                    params = pvlib.pvsystem.calcparams_pvsyst(
                        effective_irradiance=gpoa_eff,
                        temp_cell=tcel,
                        alpha_sc=float(raw_pan.get('muISC', mod_spec.get('alpha', 0.04) * Isc / 100)) / 1000, 
                        gamma_ref=Gamma,
                        mu_gamma=float(raw_pan.get('muGamma', 0)),
                        I_L_ref=IL_ref,
                        I_o_ref=Io_ref,
                        R_sh_ref=Rsh,
                        R_sh_0=float(raw_pan.get('Rp_0', Rsh * 4)),
                        R_s=Rs,
                        cells_in_series=Ns,
                        R_sh_exp=float(raw_pan.get('Rp_Exp', 5.5)),
                        EgRef=1.121
                    )
                    
                    # Resolve o circuito equivalente para achar a máxima potência
                    sd_res = pvlib.pvsystem.singlediode(*params)
                    pdc_string_mod = sd_res['p_mp'].clip(lower=0)
                else:
                    # PVWatts DC model simplificado (fallback)
                    I_sc_ref = float(mod_spec.get("isc", 14.0))
                    gamma_pdc = float(mod_spec.get("gamma", -0.35)) / 100.0
                    P_ref = float(mod_spec.get("potencia", 550.0))
                    
                    pdc_string_mod = P_ref * (gpoa_eff / 1000.0) * (1 + gamma_pdc * (tcel - 25))
                    pdc_string_mod = pdc_string_mod.clip(lower=0)
                
                # Total DC for this group of strings
                inv_total_p_dc += pdc_string_mod * qtde * str_count
                
            # Aplica perda ohmica DC, mismatch e LID
            inv_total_p_dc = inv_total_p_dc * (1 - loss_ohm_dc) * (1 - mismatch) * (1 - lid)
            
            # Inverter AC model
            raw_ond = inv_spec.get("raw_data")
            if raw_ond:
                unit = raw_ond.get("UnitAffEnum", "")
                mult = 1000.0 if unit == "kW" else 1.0
                pac0_ond = float(raw_ond.get("PNomConv", inv_spec.get("paco", 250000))) * (mult if raw_ond.get("PNomConv") else 1.0)
                
                # Tenta extrair a curva detalhada do inversor do OND
                converter = raw_ond.get("Converter", {})
                # Usamos a curva nominal (V2) ou qualquer outra disponível
                profil = converter.get("ProfilPIO") or converter.get("ProfilPIOV2") or converter.get("ProfilPIOV1") or converter.get("ProfilPIOV3")
                
                if profil and isinstance(profil, dict):
                    pdc_pts = []
                    pac_pts = []
                    for pt_key, pt_val in profil.items():
                        if pt_key.startswith("Point_") and isinstance(pt_val, list) and len(pt_val) >= 2:
                            pdc_val, pac_val = float(pt_val[0]), float(pt_val[1])
                            # Adiciona o ponto se não for um preenchimento com zero no final
                            if pdc_val > 0 or len(pdc_pts) == 0:
                                pdc_pts.append(pdc_val * mult)
                                pac_pts.append(pac_val * mult)
                    
                    if len(pdc_pts) > 2:
                        # Ordena os pontos pelo Pdc
                        pts = sorted(zip(pdc_pts, pac_pts))
                        pdc_arr = np.array([p[0] for p in pts])
                        pac_arr = np.array([p[1] for p in pts])
                        
                        from scipy.interpolate import interp1d
                        interp_func = interp1d(pdc_arr, pac_arr, bounds_error=False, fill_value=(0, pac_arr.max()))
                        
                        pac_inv = pd.Series(interp_func(inv_total_p_dc.values), index=inv_total_p_dc.index)
                        pac_inv = pac_inv.clip(upper=pac0_ond)
                    else:
                        # Fallback se a curva estiver vazia
                        pdc0_ond = float(raw_ond.get("PMaxOUT", inv_spec.get("pdco", 256000))) * (mult if raw_ond.get("PMaxOUT") else 1.0)
                        eta_inv = float(raw_ond.get("EfficEuro", raw_ond.get("EfficMax", 98.0))) / 100.0
                        pac_inv = pvlib.inverter.pvwatts(inv_total_p_dc, pdc0_ond, eta_inv)
                        pac_inv = pac_inv.clip(upper=pac0_ond)
                else:
                    # Fallback se não encontrar os perfis
                    pdc0_ond = float(raw_ond.get("PMaxOUT", inv_spec.get("pdco", 256000))) * (mult if raw_ond.get("PMaxOUT") else 1.0)
                    eta_inv = float(raw_ond.get("EfficEuro", raw_ond.get("EfficMax", 98.0))) / 100.0
                    pac_inv = pvlib.inverter.pvwatts(inv_total_p_dc, pdc0_ond, eta_inv)
                    pac_inv = pac_inv.clip(upper=pac0_ond)
            else:
                pdc0 = float(inv_spec.get("pdco", 256000))
                pac0 = float(inv_spec.get("paco", 250000))
                eta_inv_nom = pac0 / pdc0 if pdc0 > 0 else 0.98
                pac_inv = pvlib.inverter.pvwatts(inv_total_p_dc, pdc0, eta_inv_nom)
            
            # Multiplica pelo numero de inversores iguais
            total_p_ac += (pac_inv * inv_count)
            total_p_dc += (inv_total_p_dc * inv_count)
            
        # Aplica perda ohmica AC BT (Baixa Tensão)
        total_p_ac = total_p_ac * (1 - loss_ohm_ac)
        
        # Aplica perdas do Transformador
        if trafo_pnom > 0:
            from pvlib.transformer import simple_efficiency
            total_p_ac = simple_efficiency(total_p_ac, trafo_iron_loss, trafo_copper_loss, trafo_pnom)
            
        # Aplica perda ohmica AC MT (Média Tensão)
        total_p_ac = total_p_ac * (1 - loss_ohm_ac_mt)
        
        # Subtrai consumo auxiliar (constante) da usina
        total_p_ac = total_p_ac - (aux_loss * 1000.0)
        
        # Garante que os buracos do gpoa_eff (Geff_válida) sejam propagados para a saída
        total_p_ac = total_p_ac.where(gpoa_eff.notna(), np.nan)
        if isinstance(total_p_dc, pd.Series):
            total_p_dc = total_p_dc.where(gpoa_eff.notna(), np.nan)
        else:
            # Caso total_p_dc não seja serie ainda
            pass
            
        # Retorna o dicionário de colunas para serem inseridas no df
        # Convertendo W para kW
        return {
            "pvlib_E_Grid_válida": total_p_ac / 1000.0,
            "pvlib_EArray_válida": total_p_dc / 1000.0 if isinstance(total_p_dc, pd.Series) else total_p_dc,
            "pvlib_OhmLoss_DC_válida": total_p_dc * (loss_ohm_dc / (1 - loss_ohm_dc)) / 1000.0 if loss_ohm_dc < 1 else 0
        }
    except Exception as ex:
        logger.error(f"[PVLIB] Erro na simulacao: {ex}")
        return None
