"""
Rota POST /upload — Recebe Excel, converte para Parquet.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from models.schemas import UploadResponse
from services.excel_service import process_excel
from utils.logger import logger
from routes.auth import require_analyst_or_admin
import os
import json
import pandas as pd
from utils.config import DATA_DIR
import uuid

router = APIRouter(prefix="/upload", tags=["Upload"])

UPLOAD_TASKS = {}

def run_upload_pvsyst_background(task_id: str, content: bytes, usina: str, filename: str):
    UPLOAD_TASKS[task_id] = {"status": "PROCESSING", "progress": 10, "message": "Iniciando processamento do arquivo..."}
    try:
        columns = process_pvsyst_csv(content, usina)
        
        if not columns:
            raise ValueError("Não foi possível encontrar a linha de cabeçalho (iniciando com 'date') no arquivo CSV.")
            
        UPLOAD_TASKS[task_id] = {"status": "PROCESSING", "progress": 80, "message": "Salvando metadados..."}
        
        path = get_pvsyst_path(usina)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(content)
            
        meta_path = get_pvsyst_meta_path(usina)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(columns, f, indent=2, ensure_ascii=False)
            
        UPLOAD_TASKS[task_id] = {"status": "COMPLETED", "progress": 100, "message": "Upload concluído com sucesso!", "columns": columns}
    except Exception as e:
        logger.error(f"[UPLOAD_PVSYST] Erro no task_id {task_id}: {e}")
        UPLOAD_TASKS[task_id] = {"status": "FAILED", "progress": 0, "message": str(e)}

def run_upload_tmy_background(task_id: str, content: bytes, usina: str, filename: str):
    UPLOAD_TASKS[task_id] = {"status": "PROCESSING", "progress": 10, "message": "Iniciando processamento do TMY..."}
    try:
        process_pvsyst_tmy(content, usina)
        UPLOAD_TASKS[task_id] = {"status": "COMPLETED", "progress": 100, "message": "Upload concluído com sucesso!"}
    except Exception as e:
        logger.error(f"[UPLOAD_TMY] Erro no task_id {task_id}: {e}")
        UPLOAD_TASKS[task_id] = {"status": "FAILED", "progress": 0, "message": str(e)}


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
async def upload_pvsyst_file(background_tasks: BackgroundTasks, usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):
    """
    Recebe um arquivo CSV do PVSyst e o processa em background para evitar timeouts.
    Retorna um task_id.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos CSV (.csv) são aceitos para o PVSyst no momento.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    logger.info(f"[UPLOAD_PVSYST] Recebendo: '{file.filename}' para usina '{usina}'")
    content = await file.read()
    
    task_id = str(uuid.uuid4())
    UPLOAD_TASKS[task_id] = {"status": "PENDING", "progress": 0, "message": "Aguardando fila..."}
    background_tasks.add_task(run_upload_pvsyst_background, task_id, content, usina, file.filename)
    
    return {"task_id": task_id, "message": "Processamento iniciado em segundo plano"}

@router.get("/status/{task_id}")
async def get_upload_status(task_id: str):
    task = UPLOAD_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

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

def process_pvsyst_tmy(content: bytes, usina: str) -> None:
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
        raise ValueError("Não foi possível encontrar a linha de cabeçalho (iniciando com 'date') no arquivo CSV do TMY.")
        
    df = pd.read_csv(io.StringIO(text), skiprows=header_idx, sep=delimiter, on_bad_lines='skip')
    
    if len(df) > 0:
        df = df.iloc[1:].reset_index(drop=True)
        
    df.columns = [str(c).strip() for c in df.columns]
    
    date_col = next((c for c in df.columns if c.lower() == 'date'), None)
    if not date_col:
        raise ValueError("Coluna 'date' não encontrada.")
        
    df = df.dropna(subset=[date_col])
    df = df[df[date_col].astype(str).str.strip() != '']
    
    def parse_month(val):
        val = str(val).lower().strip()
        
        if val.startswith('jan'): return 1
        if val.startswith('feb') or val.startswith('fev'): return 2
        if val.startswith('mar'): return 3
        if val.startswith('apr') or val.startswith('abr'): return 4
        if val.startswith('may') or val.startswith('mai'): return 5
        if val.startswith('jun'): return 6
        if val.startswith('jul'): return 7
        if val.startswith('aug') or val.startswith('ago'): return 8
        if val.startswith('sep') or val.startswith('set'): return 9
        if val.startswith('oct') or val.startswith('out'): return 10
        if val.startswith('nov'): return 11
        if val.startswith('dec') or val.startswith('dez'): return 12
        
        if val == '1' or val == '01': return 1
        if val == '2' or val == '02': return 2
        if val == '3' or val == '03': return 3
        if val == '4' or val == '04': return 4
        if val == '5' or val == '05': return 5
        if val == '6' or val == '06': return 6
        if val == '7' or val == '07': return 7
        if val == '8' or val == '08': return 8
        if val == '9' or val == '09': return 9
        if val == '10': return 10
        if val == '11': return 11
        if val == '12': return 12
        
        if '/' in val:
            parts = val.split('/')
            if len(parts) >= 2:
                try:
                    # Assumes DD/MM/YYYY format which is default in BR PVsyst
                    return int(parts[1])
                except:
                    pass
        return None

    df['month'] = df[date_col].apply(parse_month)
    df = df.dropna(subset=['month'])
    df['month'] = df['month'].astype(int)
    
    target_cols = [c for c in df.columns if c.lower() in ['pr', 'pr ratio', 'tarrwtd', 'prbifi']]
    if not target_cols:
        raise ValueError("Nenhuma das colunas esperadas ('PR' ou 'TArrWtd') foi encontrada.")
        
    for col in target_cols:
        if pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
            df[col] = df[col].astype(str).str.replace(',', '.')
        df[col] = pd.to_numeric(df[col], errors='coerce')
        
    # Padroniza nomes das colunas
    rename_map = {}
    for c in df.columns:
        if c.lower() in ['pr ratio', 'pr']:
            rename_map[c] = 'PR Ratio'
        elif c.lower() == 'prbifi':
            rename_map[c] = 'PRBifi'
        elif c.lower() == 'tarrwtd':
            rename_map[c] = 'TArrWtd'
    df = df.rename(columns=rename_map)

    cols_to_keep = ['month'] + [c for c in rename_map.values() if c in df.columns]
    df = df[cols_to_keep]
    
    df = df.groupby('month').mean().reset_index()
    
    tmy_path = os.path.join(DATA_DIR, usina.strip(), "pvsyst_tmy.parquet")
    os.makedirs(os.path.dirname(tmy_path), exist_ok=True)
    df.to_parquet(tmy_path, index=False)

@router.post("/pvsyst/tmy")
async def upload_pvsyst_tmy_file(background_tasks: BackgroundTasks, usina: str = Form(...), file: UploadFile = File(...), _: dict = Depends(require_analyst_or_admin)):
    """
    Recebe um arquivo CSV do PVSyst com dados TMY (diários) e o processa em background.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos CSV (.csv) são aceitos no momento.",
        )

    if not usina or not usina.strip():
        raise HTTPException(status_code=400, detail="Usina não informada.")

    logger.info(f"[UPLOAD_TMY] Recebendo: '{file.filename}' para usina '{usina}'")
    content = await file.read()
    
    task_id = str(uuid.uuid4())
    UPLOAD_TASKS[task_id] = {"status": "PENDING", "progress": 0, "message": "Aguardando fila..."}
    background_tasks.add_task(run_upload_tmy_background, task_id, content, usina, file.filename)
    
    return {"task_id": task_id, "message": "Processamento iniciado em segundo plano"}
