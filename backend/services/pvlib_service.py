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
            
            axis_tilt = float(params.get("axis_tilt", 0.0))
            
            trk = pvlib.tracking.singleaxis(
                solpos['apparent_zenith'], 
                solpos['azimuth'], 
                axis_tilt=axis_tilt,
                axis_azimuth=0,
                max_angle=max_angle, 
                backtrack=True, 
                gcr=gcr
            )
            
            surface_tilt = trk['surface_tilt']
            surface_azimuth = trk['surface_azimuth']
            aoi = trk['aoi']
            
            dni_extra = pvlib.irradiance.get_extra_radiation(times_for_pvlib)
            
            # Solver iterativo para encontrar o GHI que resulta no Geff_válida (POA) pelo modelo de Erbs
            # Usar pd.Series com index=times_for_pvlib (tz-aware) para evitar conflitos no pandas
            ghi_est = pd.Series(gpoa_eff.fillna(0).values, index=times_for_pvlib)
            gpoa_eff_tz = ghi_est.copy()
            for _ in range(5):
                erbs_res = pvlib.irradiance.erbs(ghi_est, solpos['apparent_zenith'], times_for_pvlib)
                dni_est = erbs_res['dni'].fillna(0)
                dhi_est = erbs_res['dhi'].fillna(0)
                
                poa_comp = pvlib.irradiance.get_total_irradiance(
                    surface_tilt=surface_tilt,
                    surface_azimuth=surface_azimuth,
                    solar_zenith=solpos['apparent_zenith'],
                    solar_azimuth=solpos['azimuth'],
                    dni=dni_est,
                    ghi=ghi_est,
                    dhi=dhi_est,
                    dni_extra=dni_extra,
                    model='haydavies'
                )
                
                poa_calc = poa_comp['poa_global']
                ratio = gpoa_eff_tz / poa_calc.replace(0, np.nan)
                ratio = ratio.fillna(1.0).clip(0.5, 2.0)
                ghi_est = ghi_est * ratio
            
            poa_direct = poa_comp['poa_direct']
            poa_sky_diffuse = poa_comp['poa_sky_diffuse']
            poa_ground_diffuse = poa_comp['poa_ground_diffuse']
            
            # Ajuste de Sombreamento Difuso (Row-to-Row)
            import pvlib.bifacial.utils as bifacial_utils
            
            vf_sky_unshaded = (1 + np.cos(np.radians(surface_tilt))) / 2
            vf_sky_shaded = bifacial_utils.vf_row_sky_2d_integ(surface_tilt.values, gcr, 0.0, 1.0)
            
            sky_shade_factor = pd.Series(vf_sky_shaded / vf_sky_unshaded.values, index=surface_tilt.index)
            sky_shade_factor = sky_shade_factor.fillna(1.0).clip(lower=0)
            
            # Cálculo rigoroso da fração de Albedo que sobrevive ao bloqueio das fileiras
            vf_ground_unshaded = (1 - np.cos(np.radians(surface_tilt))) / 2
            vf_ground_shaded = bifacial_utils.vf_row_ground_2d_integ(surface_tilt.values, gcr, 0.0, 1.0)
            
            # np.where para evitar divisão por zero quando o tracker está deitado (tilt = 0)
            with np.errstate(divide='ignore', invalid='ignore'):
                gf = np.where(vf_ground_unshaded.values > 1e-5, vf_ground_shaded / vf_ground_unshaded.values, 1.0)
            ground_shade_factor = pd.Series(gf, index=surface_tilt.index).fillna(1.0).clip(lower=0)
            
            poa_sky_diffuse_shaded = poa_sky_diffuse * sky_shade_factor
            poa_ground_diffuse_shaded = poa_ground_diffuse * ground_shade_factor
            
            # poa_total_unshaded: energia real sem as obstruções de Near Shadings
            poa_total_unshaded = poa_direct + poa_sky_diffuse + poa_ground_diffuse
            
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
                
            # Fórmulas empíricas do PVSyst para ângulo efetivo (Tracker)
            theta_eff_sky = 59.68 + 0.1388 * surface_tilt
            theta_eff_ground = 90.0 - 0.5788 * surface_tilt
            
            iam_sky = iam_function(theta_eff_sky)
            iam_ground = iam_function(theta_eff_ground)
            
            # Ponderação do IAM usando poa_total_unshaded no divisor
            # Isso aplica matematicamente tanto a perda Óptica (IAM) quanto a Perda de Sombra Mútua (Near Shadings)
            poa_iam_modelo = (poa_direct * iam_direct) + (poa_sky_diffuse_shaded * iam_sky) + (poa_ground_diffuse_shaded * iam_ground)
            fator_optical_total = poa_iam_modelo / poa_total_unshaded.replace(0, np.nan)
            fator_optical_total = fator_optical_total.fillna(1.0).clip(0, 1.0)
            
            # Garante que usamos apenas os arrays para não dar conflito de timezone no index
            gpoa_eff = gpoa_eff * fator_optical_total.values
            
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
        module_quality_loss = float(params.get("module_quality_loss", 0.0)) / 100.0
        aux_loss = float(params.get("aux_loss", 0.0)) # kW
        
        # Puxa sujidade do node config ou usa valor fixo
        soiling_val = 0.0
        
        if params.get("use_fixed_soiling"):
            soiling_pct = params.get("fixed_soiling_pct")
            soiling_val = float(soiling_pct if soiling_pct is not None else 1.0) / 100.0
        else:
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
        total_nominal_p_ac = 0.0
        total_nominal_p_dc = 0.0
        
        for topo in topologies:
            inv_count = topo["count"]
            
            # Para cada string group neste inversor, calcula DC
            inv_total_p_dc = pd.Series(0.0, index=processed_df.index)
            inv_nominal_p_dc = 0.0
            
            # Tensão média de entrada do MPPT para a curva do inversor
            inv_v_in_sum = pd.Series(0.0, index=processed_df.index)
            inv_v_weight = pd.Series(0.0, index=processed_df.index)
            
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
                        R_sh_0=float(raw_pan.get('RShunt0', raw_pan.get('Rp_0', Rsh * 10.0))),
                        R_s=Rs,
                        cells_in_series=Ns,
                        R_sh_exp=float(raw_pan.get('RShuntExp', raw_pan.get('Rp_Exp', 5.5))),
                        EgRef=1.121
                    )
                    
                    # Resolve o circuito equivalente para achar a máxima potência
                    sd_res = pvlib.pvsystem.singlediode(*params)
                    pdc_string_mod = sd_res['p_mp'].clip(lower=0)
                    v_mp_hour = sd_res['v_mp']
                    Vmp_stc = float(raw_pan.get('Vmp', mod_spec.get('vmp', 40.0)))
                else:
                    # PVWatts DC model simplificado (fallback)
                    I_sc_ref = float(mod_spec.get("isc", 14.0))
                    gamma_pdc = float(mod_spec.get("gamma", -0.35)) / 100.0
                    P_ref = float(mod_spec.get("potencia", 550.0))
                    
                    pdc_string_mod = P_ref * (gpoa_eff / 1000.0) * (1 + gamma_pdc * (tcel - 25))
                    pdc_string_mod = pdc_string_mod.clip(lower=0)
                    Vmp_stc = float(mod_spec.get('vmp', 40.0))
                    v_mp_hour = pd.Series(Vmp_stc, index=gpoa_eff.index)
                    
                v_mp_hour = v_mp_hour.replace(0, Vmp_stc).fillna(Vmp_stc)
                
                # Fator quadrático exato: f_loss = loss_stc * (P / P_stc) * (V_stc / V_op)^2
                if wp > 0:
                    loss_dc_group_frac = loss_ohm_dc * (pdc_string_mod / wp) * (Vmp_stc / v_mp_hour)**2
                else:
                    loss_dc_group_frac = loss_ohm_dc
                    
                p_dc_net = (pdc_string_mod * qtde * str_count) * (1 - loss_dc_group_frac)
                
                # Total DC for this group of strings (já descontando Ohmic Loss)
                inv_total_p_dc += p_dc_net
                inv_nominal_p_dc += wp * qtde * str_count
                
                # Acumula tensão ponderada
                v_in_str = v_mp_hour * qtde
                inv_v_in_sum += v_in_str * p_dc_net
                inv_v_weight += p_dc_net
                
            # Aplica mismatch, LID e Module Quality Loss (perdas constantes)
            inv_total_p_dc = inv_total_p_dc * (1 - mismatch) * (1 - lid) * (1 - module_quality_loss)
            
            inv_v_in_avg = inv_v_in_sum / inv_v_weight.replace(0, np.nan)
            
            # Inverter AC model
            raw_ond = inv_spec.get("raw_data")
            if raw_ond:
                unit = raw_ond.get("UnitAffEnum", "")
                mult = 1000.0 if unit == "kW" else 1.0
                pac0_ond = float(raw_ond.get("PNomConv", inv_spec.get("paco", 250000))) * (mult if raw_ond.get("PNomConv") else 1.0)
                total_nominal_p_ac += pac0_ond * inv_count
                
                # Extrai as curvas de eficiência e suas respectivas voltagens
                converter = raw_ond.get("Converter", {})
                
                def make_interp(profil_dict):
                    if not profil_dict or not isinstance(profil_dict, dict):
                        return None
                    pdc_pts = []
                    pac_pts = []
                    for pt_key, pt_val in profil_dict.items():
                        if pt_key.startswith("Point_") and isinstance(pt_val, list) and len(pt_val) >= 2:
                            pdc_val, pac_val = float(pt_val[0]), float(pt_val[1])
                            if pdc_val > 0 or len(pdc_pts) == 0:
                                pdc_pts.append(pdc_val * mult)
                                pac_pts.append(pac_val * mult)
                    if len(pdc_pts) > 2:
                        pts = sorted(zip(pdc_pts, pac_pts))
                        pdc_arr = np.array([p[0] for p in pts])
                        pac_arr = np.array([p[1] for p in pts])
                        from scipy.interpolate import interp1d
                        return interp1d(pdc_arr, pac_arr, bounds_error=False, fill_value=(0, pac_arr.max()))
                    return None

                v1 = float(converter.get("VMppMin", converter.get("VMppMinPIO", 0)))
                v2 = float(converter.get("VmppNom", converter.get("VNomPIO", 0)))
                v3 = float(converter.get("VMPPMax", converter.get("VMppMaxPIO", 0)))
                
                f1 = make_interp(converter.get("ProfilPIOV1"))
                f2 = make_interp(converter.get("ProfilPIOV2") or converter.get("ProfilPIO"))
                f3 = make_interp(converter.get("ProfilPIOV3"))
                
                pac_1 = pd.Series(f1(inv_total_p_dc.values), index=inv_total_p_dc.index) if f1 else None
                pac_2 = pd.Series(f2(inv_total_p_dc.values), index=inv_total_p_dc.index) if f2 else None
                pac_3 = pd.Series(f3(inv_total_p_dc.values), index=inv_total_p_dc.index) if f3 else None
                
                if f1 and f2 and f3 and v1 < v2 < v3:
                    # Interpola entre as curvas baseado na tensão real do array
                    pac_inv = pd.Series(0.0, index=inv_total_p_dc.index)
                    v_in = inv_v_in_avg.fillna(v2)
                    
                    mask1 = v_in <= v1
                    pac_inv[mask1] = pac_1[mask1]
                    
                    mask2 = (v_in > v1) & (v_in <= v2)
                    frac2 = (v_in[mask2] - v1) / (v2 - v1)
                    pac_inv[mask2] = pac_1[mask2] + frac2 * (pac_2[mask2] - pac_1[mask2])
                    
                    mask3 = (v_in > v2) & (v_in <= v3)
                    frac3 = (v_in[mask3] - v2) / (v3 - v2)
                    pac_inv[mask3] = pac_2[mask3] + frac3 * (pac_3[mask3] - pac_2[mask3])
                    
                    mask4 = v_in > v3
                    pac_inv[mask4] = pac_3[mask4]
                    
                    pac_inv = pac_inv.clip(upper=pac0_ond)
                elif f2:
                    # Usa a curva única nominal
                    pac_inv = pac_2.clip(upper=pac0_ond)
                else:
                    # Fallback (sem curvas ProfilPIO)
                    pdc0_ond = float(raw_ond.get("PMaxOUT", inv_spec.get("pdco", 256000))) * (mult if raw_ond.get("PMaxOUT") else 1.0)
                    eta_inv = float(raw_ond.get("EfficEuro", raw_ond.get("EfficMax", 98.0))) / 100.0
                    pac_inv = pvlib.inverter.pvwatts(inv_total_p_dc, pdc0_ond, eta_inv)
                    pac_inv = pac_inv.clip(upper=pac0_ond)
            else:
                pdc0 = float(inv_spec.get("pdco", 256000))
                pac0 = float(inv_spec.get("paco", 250000))
                total_nominal_p_ac += pac0 * inv_count
                eta_inv_nom = pac0 / pdc0 if pdc0 > 0 else 0.98
                pac_inv = pvlib.inverter.pvwatts(inv_total_p_dc, pdc0, eta_inv_nom)
            
            # Multiplica pelo numero de inversores iguais
            total_p_ac += (pac_inv * inv_count)
            total_p_dc += (inv_total_p_dc * inv_count)
            total_nominal_p_dc += (inv_nominal_p_dc * inv_count)
            
        # Aplica perda ohmica AC BT (Quadrática I^2*R)
        if total_nominal_p_ac > 0:
            loss_ac_dynamic = loss_ohm_ac * (total_p_ac / total_nominal_p_ac)
        else:
            loss_ac_dynamic = loss_ohm_ac
        total_p_ac = total_p_ac * (1 - loss_ac_dynamic)
        
        # Aplica perdas do Transformador
        if trafo_pnom > 0:
            from pvlib.transformer import simple_efficiency
            total_p_ac = simple_efficiency(total_p_ac, trafo_iron_loss, trafo_copper_loss, trafo_pnom)
            
        # Aplica perda ohmica AC MT (Quadrática I^2*R)
        if total_nominal_p_ac > 0:
            loss_ac_mt_dynamic = loss_ohm_ac_mt * (total_p_ac / total_nominal_p_ac)
        else:
            loss_ac_mt_dynamic = loss_ohm_ac_mt
        total_p_ac = total_p_ac * (1 - loss_ac_mt_dynamic)
        
        # Subtrai consumo auxiliar (constante) da usina
        total_p_ac = total_p_ac - (aux_loss * 1000.0)
        
        # Garante que os buracos do gpoa_eff (Geff_válida) sejam propagados para a saída
        total_p_ac = total_p_ac.where(gpoa_eff.notna(), np.nan)
        if isinstance(total_p_dc, pd.Series):
            total_p_dc = total_p_dc.where(gpoa_eff.notna(), np.nan)
        else:
            # Caso total_p_dc não seja serie ainda
            pass
            
        # Approximation for the UI column using global totals
        if total_nominal_p_dc > 0:
            global_loss_dc_dyn = loss_ohm_dc * (total_p_dc / total_nominal_p_dc)
        else:
            global_loss_dc_dyn = loss_ohm_dc
            
        return {
            "pvlib_E_Grid_válida": total_p_ac / 1000.0,
            "pvlib_EArray_válida": total_p_dc / 1000.0 if isinstance(total_p_dc, pd.Series) else total_p_dc,
            "pvlib_OhmLoss_DC_válida": total_p_dc * (global_loss_dc_dyn / (1 - global_loss_dc_dyn)) / 1000.0 if loss_ohm_dc < 1 else 0
        }
    except Exception as ex:
        logger.error(f"[PVLIB] Erro na simulacao: {ex}")
        return None
