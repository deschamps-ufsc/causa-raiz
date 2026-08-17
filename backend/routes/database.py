import json
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
import pandas as pd
import psycopg2

from services.database_service import DatabaseConfig, test_connection_and_list_tables, fetch_table_data
from services.excel_service import process_raw_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/database", tags=["Database"])

class TableConfig(BaseModel):
    name: str
    offset: int = 0

class DatabasePreviewRequest(BaseModel):
    config: DatabaseConfig
    tables: list[TableConfig]

class DatabaseImportRequest(BaseModel):
    usina: str
    config: DatabaseConfig
    tables: list[TableConfig]
    start_date: str
    end_date: str
    start_time: str | None = None
    end_time: str | None = None
    exception_dates: list[str] = []
    skip_unmapped: bool = False

@router.post("/preview")
def preview_database_connection(req: DatabasePreviewRequest):
    """
    Testa a conexão e verifica se as tabelas solicitadas existem no banco de dados.
    """
    try:
        table_names = [t.name for t in req.tables if t.name.strip()]
        result = test_connection_and_list_tables(req.config, table_names)
        try:
            with open("debug.json", "w") as f:
                json.dump(result, f)
        except Exception:
            pass
        if result.get("missing_tables"):
            return {
                "status": "warning", 
                "message": result.get("message", f"Conectado com sucesso, mas as seguintes tabelas não foram encontradas: {', '.join(result['missing_tables'])}"),
                "data": result
            }
        return {"status": "success", "message": "Conexão bem sucedida e todas as tabelas encontradas!", "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/export-series")
def export_database_series(req: DatabasePreviewRequest):
    """
    Exporta os nomes das colunas (séries) das tabelas para um arquivo Excel.
    """
    try:
        conn = psycopg2.connect(
            host=req.config.host,
            port=req.config.port,
            dbname=req.config.database,
            user=req.config.user,
            password=req.config.password,
            connect_timeout=10
        )
        cursor = conn.cursor()
        
        all_data = []
        for table_config in req.tables:
            if not table_config.name.strip():
                continue
            table = table_config.name
            try:
                # Usa aspas duplas se a tabela tiver caracteres especiais ou maiúsculas, exceto se já estiver com aspas
                safe_table = table if table.startswith('"') else f'"{table}"'
                clean_table_name = table.strip('"')
                
                cursor.execute(f"SELECT * FROM {safe_table} LIMIT 0")
                colnames = [desc[0] for desc in cursor.description]
                
                for col in colnames:
                    if col.lower().strip() not in ['timestamp', 'data_hora', 'time', 'date', 'datetime', 'index']:
                        prefixed_col = f"{clean_table_name}_{col}"
                        all_data.append({"Tabela": table, "Série": prefixed_col})
            except Exception as e:
                logger.error(f"Erro ao extrair séries da tabela {table}: {e}")
                
        cursor.close()
        conn.close()
        
        df = pd.DataFrame(all_data)
        if df.empty:
            df = pd.DataFrame(columns=["Tabela", "Série"])
            
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Séries Mapeadas')
            
        output.seek(0)
        
        headers = {
            'Content-Disposition': 'attachment; filename="series_banco_dados.xlsx"'
        }
        
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/import-stream")
def import_database_stream(req: DatabaseImportRequest):
    """
    Inicia o fluxo de importação do banco de dados (Server-Sent Events).
    Para cada tabela, executa a query e injeta no motor de importação.
    """
    def generate():
        total_series = 0
        try:
            for idx, table_config in enumerate(req.tables, start=1):
                if not table_config.name.strip():
                    continue
                table = table_config.name
                offset = table_config.offset
                
                yield json.dumps({
                    "status": "downloading",
                    "message": f"Consultando tabela '{table}' no banco...",
                    "progress": 10,
                    "file_idx": idx,
                    "total_files": len(req.tables)
                }) + "\n"
                
                try:
                    with open("db_config_dump.json", "w") as f:
                        json.dump(req.config.dict(), f)
                except:
                    pass
                    
                # Fetch data as CSV bytes
                try:
                    content = fetch_table_data(req.config, table, req.start_date, req.end_date, offset_minutes=offset, start_time=req.start_time, end_time=req.end_time, exception_dates=req.exception_dates)
                except Exception as e:
                    yield json.dumps({"status": "error", "message": f"Erro na tabela {table}: {str(e)}"}) + "\n"
                    continue
                
                if content is None:
                    yield json.dumps({
                        "status": "warning",
                        "message": f"Tabela '{table}' não possui dados no período especificado.",
                    }) + "\n"
                    continue
                
                yield json.dumps({
                    "status": "processing",
                    "message": f"Integrando dados da tabela '{table}'...",
                    "progress": 50,
                    "file_idx": idx,
                    "total_files": len(req.tables)
                }) + "\n"
                
                # Definir função de callback de progresso para a barra animada
                def progress_cb(current, total):
                    perc = int(50 + (current / total) * 50)
                    msg = json.dumps({
                        "status": "processing",
                        "message": f"Salvando {current}/{total} séries...",
                        "progress": perc,
                        "total": total,
                        "file_idx": idx,
                        "total_files": len(req.tables)
                    }) + "\n"
                    
                    # Hack for yielding from inner function isn't straightforward without queues,
                    # so we don't yield here in SSE if it's too complex. The frontend just sees 50% until done.
                    pass
                
                try:
                    # Processa como se fosse um arquivo CSV
                    results = process_raw_file(
                        content, 
                        filename=f"{table}.csv", 
                        usina=req.usina.strip(),
                        skip_unmapped=req.skip_unmapped
                    )
                    for r in results:
                        total_series += r.get("imported_series_count", r.get("series_count", 0))
                except Exception as e:
                    yield json.dumps({"status": "error", "message": f"Erro ao processar {table}: {str(e)}"}) + "\n"
                    continue
            
            yield json.dumps({
                "status": "success",
                "message": "Importação concluída!",
                "total_series": total_series
            }) + "\n"
            
        except Exception as e:
            logger.error(f"[DB IMPORT] Erro fatal: {str(e)}")
            yield json.dumps({"status": "error", "message": f"Erro inesperado: {str(e)}"}) + "\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
