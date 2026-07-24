
@router.get("/heatmap/tracker_chart")
def get_tracker_chart(usina: str, date: str, alvo: str = None, atual: str = None):
    from services.parquet_service import _parquet_path
    import pyarrow.parquet as pq
    import pandas as pd
    import pvlib
    import numpy as np
    import json
    
    config_path = os.path.join(os.path.dirname(__file__), "..", "data", usina, "flow_config.json")
    tracker_params = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            flow_data = json.load(f)
            if "nodeConfigs" in flow_data:
                tracker_params = flow_data["nodeConfigs"].get("tracker", {}).get("trackerParams", {})
            else:
                for node in flow_data.get("nodes", []):
                    if node.get("id") == "tracker":
                        tracker_params = node.get("data", {}).get("trackerParams", {})
                        break
                        
    lat = float(tracker_params.get("latitude", -23.55))
    lon = float(tracker_params.get("longitude", -46.63))
    gcr = float(tracker_params.get("gcr", 0.3))
    max_angle = float(tracker_params.get("max_angle", 60))
    time_offset = int(tracker_params.get("time_offset", 0))
    tolerance = float(tracker_params.get("tolerance", 10))
    
    path = _parquet_path(date, usina)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Parquet not found")
        
    schema = pq.read_schema(path)
    cols_in_file = schema.names
    
    cols_to_read = ["timestamp"]
    if alvo and alvo in cols_in_file:
        cols_to_read.append(alvo)
    if atual and atual in cols_in_file:
        if atual not in cols_to_read:
            cols_to_read.append(atual)
            
    df = pd.read_parquet(path, columns=cols_to_read)
    df.set_index("timestamp", inplace=True)
    
    times_for_pvlib = pd.DatetimeIndex(df.index.values)
    if times_for_pvlib.tz is None:
        times_for_pvlib = times_for_pvlib.tz_localize('America/Sao_Paulo', ambiguous='NaT', nonexistent='NaT')
        
    if time_offset != 0:
        times_for_pvlib = times_for_pvlib - pd.Timedelta(minutes=time_offset)
        
    solpos = pvlib.solarposition.get_solarposition(times_for_pvlib, lat, lon)
    trk = pvlib.tracking.singleaxis(solpos['apparent_zenith'], solpos['azimuth'], 
                                    max_angle=max_angle, backtrack=True, gcr=gcr)
    
    pvlib_series = trk['tracker_theta'].values
    if tracker_params.get("inverter_sinal", False):
        pvlib_series = -pvlib_series
        
    df["pvlib"] = pvlib_series
    
    result = []
    for idx, row in df.iterrows():
        time_str = idx.strftime("%H:%M")
        pt = {"time": time_str}
        if alvo and alvo in row and not pd.isna(row[alvo]):
            pt["alvo"] = round(row[alvo], 2)
        if atual and atual in row and not pd.isna(row[atual]):
            pt["atual"] = round(row[atual], 2)
        if not pd.isna(row["pvlib"]):
            pt["pvlib"] = round(row["pvlib"], 2)
        result.append(pt)
        
    return {"data": result, "tolerance": tolerance}
