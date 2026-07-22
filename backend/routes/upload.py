"""
Rota POST /upload — Recebe Excel, converte para Parquet.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from models.schemas import UploadResponse
from services.excel_service import process_excel
from utils.logger import logger
from routes.auth import require_analyst_or_admin
import os
import json
import pandas as pd
from utils.config import DATA_DIR

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("", response_model=UploadResponse)
async def upload_excel(usina: str = Form(...), skip_unmapped: bool = Form(False), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):

    """
    Recebe um arquivo Excel diário da usina solar.
    Converte para Parquet e retorna metadados vinculados à usina informada.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos Excel (.xlsx, .xls) são aceitos.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    logger.info(f"[UPLOAD] Recebendo: '{file.filename}' para usina '{usina}'")
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    try:
        result = process_excel(content, file.filename, usina.strip(), skip_unmapped)
    except Exception as e:
        logger.error(f"[UPLOAD] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar Excel: {str(e)}")

    return UploadResponse(
        filename=file.filename,
        date=result["date"],
        series_count=result["series_count"],
        cached=result["cached"],
    )

def get_mapa_path(usina: str) -> str:
    return os.path.join(DATA_DIR, usina.strip(), "mapa_layout.json")

@router.post("/mapa")
async def upload_mapa_excel(usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):
    """
    Recebe o Excel com o mapeamento visual (layout em grid) da usina.
    As posições das células correspondem à posição física das strings.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos Excel (.xlsx, .xls) são aceitos.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    try:
        content = await file.read()
        import io
        df = pd.read_excel(io.BytesIO(content), header=None)
        
        layout = []
        for row_idx, row in df.iterrows():
            for col_idx, value in row.items():
                if pd.notna(value) and str(value).strip():
                    layout.append({
                        "row": int(row_idx),
                        "col": int(col_idx),
                        "label": str(value).strip()
                    })
        
        path = get_mapa_path(usina)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(layout, f, indent=2, ensure_ascii=False)
            
        return {"message": "Mapa de layout salvo com sucesso", "count": len(layout)}
        
    except Exception as e:
        logger.error(f"[UPLOAD_MAPA] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar Mapa: {str(e)}")

from fastapi import Query

@router.get("/mapa")
async def get_mapa_layout(usina: str = Query(...)):
    """
    Retorna o JSON do layout do mapa para o frontend.
    """
    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    path = get_mapa_path(usina)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def get_pvsyst_path(usina: str) -> str:
    return os.path.join(DATA_DIR, usina.strip(), "pvsyst_raw.csv")

def get_pvsyst_meta_path(usina: str) -> str:
    return os.path.join(DATA_DIR, usina.strip(), "pvsyst_columns.json")

def process_pvsyst_csv(content: bytes, usina: str) -> list:
    import io
    import pandas as pd
    
    text = content.decode('utf-8', errors='replace')
    header_idx = None
    delimiter = ';'
    
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.lower().startswith('date;'):
            header_idx = i
            delimiter = ';'
            break
        elif line.lower().startswith('date,'):
            header_idx = i
            delimiter = ','
            break
            
    if header_idx is None:
        return []
        
    df = pd.read_csv(io.StringIO(text), skiprows=header_idx, sep=delimiter, on_bad_lines='skip')
    
    if len(df) > 0:
        df = df.iloc[1:].reset_index(drop=True)
        
    df.columns = [str(c).strip() for c in df.columns]
    
    date_col = next((c for c in df.columns if c.lower() == 'date'), None)
    if not date_col:
        return []
        
    df = df.dropna(subset=[date_col])
    df = df[df[date_col].astype(str).str.strip() != '']
    
    df['timestamp'] = pd.to_datetime(df[date_col], format='mixed', dayfirst=True, errors='coerce')
    df = df.dropna(subset=['timestamp'])
    df = df.drop(columns=[date_col])
    
    for col in df.columns:
        if col != 'timestamp':
            if pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
                df[col] = df[col].astype(str).str.replace(',', '.')
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    df = df.sort_values('timestamp')
    
    pvsyst_path = os.path.join(DATA_DIR, usina.strip(), "pvsyst_data.parquet")
    if os.path.exists(pvsyst_path):
        try:
            df_existing = pd.read_parquet(pvsyst_path)
            df_combined = pd.concat([df_existing, df])
            df = df_combined.drop_duplicates(subset=['timestamp'], keep='last').sort_values('timestamp')
        except Exception as e:
            logger.warning(f"Erro ao ler pvsyst_data.parquet existente: {e}")
            
    os.makedirs(os.path.dirname(pvsyst_path), exist_ok=True)
    df.to_parquet(pvsyst_path, index=False)
    
    return [c for c in df.columns if c != 'timestamp']

@router.post("/pvsyst")
async def upload_pvsyst_file(usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):
    """
    Recebe um arquivo CSV do PVSyst, acha as colunas disponíveis e as salva.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos CSV (.csv) são aceitos para o PVSyst no momento.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    logger.info(f"[UPLOAD_PVSYST] Recebendo: '{file.filename}' para usina '{usina}'")
    try:
        content = await file.read()
        columns = process_pvsyst_csv(content, usina)
        
        if not columns:
            raise ValueError("Não foi possível encontrar a linha de cabeçalho (iniciando com 'date') no arquivo CSV.")
            
        # Salva o raw
        path = get_pvsyst_path(usina)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(content)
            
        # Salva os meta (colunas)
        meta_path = get_pvsyst_meta_path(usina)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(columns, f, indent=2, ensure_ascii=False)
            
        return {"message": "Upload do PVSyst realizado com sucesso", "columns": columns}
        
    except Exception as e:
        logger.error(f"[UPLOAD_PVSYST] Erro ao processar '{file.filename}' (usina {usina}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo PVSyst: {str(e)}")

@router.get("/pvsyst/columns")
async def get_pvsyst_columns(usina: str = Query(...)):
    """
    Retorna a lista de colunas disponíveis do arquivo PVSyst salvo para a usina.
    """
    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    meta_path = get_pvsyst_meta_path(usina)
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []
