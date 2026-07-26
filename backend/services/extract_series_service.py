import io
import pandas as pd
from utils.logger import logger

def extract_series_names(content: bytes, filename: str) -> list[str]:
    """
    Extrai rapidamente o nome de todas as séries de um arquivo sem processar todos os valores.
    """
    logger.info(f"[EXTRACT] Extraindo colunas de '{filename}'...")
    
    if filename.lower().endswith('.csv'):
        try:
            df = pd.read_csv(io.BytesIO(content), on_bad_lines='skip')
            if len(df.columns) <= 1:
                raise ValueError("Possivelmente separador é ;")
        except Exception:
            df = pd.read_csv(io.BytesIO(content), sep=';', on_bad_lines='skip')
    else:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl", parse_dates=False)
        
    cols_lower = [str(c).lower().strip() for c in df.columns]
    
    is_long_format = all(c in cols_lower for c in ['timestamp', 'tag', 'value'])
    is_hybrid_pmi_format = all(c in cols_lower for c in ['time', 'meter_name', 'kwh_del_int', 'kwh_rec_int'])
    
    if is_long_format:
        tag_col = df.columns[cols_lower.index('tag')]
        return [str(c).strip() for c in df[tag_col].dropna().unique()]
        
    elif is_hybrid_pmi_format:
        tag_col = df.columns[cols_lower.index('meter_name')]
        ts_col = df.columns[cols_lower.index('time')]
        id_vars = [ts_col, tag_col]
        value_vars = [c for c in df.columns if c not in id_vars]
        
        # Obter os medidores únicos
        meters = df[tag_col].dropna().unique()
        
        tags = []
        for meter in meters:
            for var in value_vars:
                tags.append(f"{str(meter).strip()}_{str(var).strip()}")
        return tags
        
    else:
        # Largo (Wide)
        # O timestamp geralmente é a primeira coluna ou a que se chama timestamp
        if 'timestamp' in cols_lower:
            ts_index = cols_lower.index('timestamp')
        else:
            ts_index = 0
            
        columns = list(df.columns)
        if ts_index < len(columns):
            columns.pop(ts_index)
            
        return [str(c).strip() for c in columns]
