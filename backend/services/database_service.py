import psycopg2
import pandas as pd
from typing import List, Tuple
from pydantic import BaseModel

class DatabaseConfig(BaseModel):
    host: str
    port: int
    database: str
    user: str
    password: str

def test_connection_and_list_tables(config: DatabaseConfig, requested_tables: List[str]) -> dict:
    """
    Testa a conexão e verifica se as tabelas solicitadas existem.
    Retorna o status ou lança uma exceção.
    """
    try:
        conn = psycopg2.connect(
            host=config.host,
            port=config.port,
            dbname=config.database,
            user=config.user,
            password=config.password,
            connect_timeout=10
        )
        cursor = conn.cursor()
        
        # Busca todas as tabelas no schema public (ou outros)
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');")
        all_tables_in_db = [row[0] for row in cursor.fetchall()]
        
        found_tables = []
        missing_tables = []
        available_tables_str = ", ".join(all_tables_in_db[:20]) # mostra até 20 para o usuário saber
        if len(all_tables_in_db) > 20:
            available_tables_str += "..."
            
        global_min = None
        global_max = None
        debug_sample = None
        
        # Guardar qual é a coluna de tempo de cada tabela
        table_time_cols = {}
        
        for table in requested_tables:
            clean_table = table.strip('"')
            # Tenta match exato primeiro
            if clean_table in all_tables_in_db:
                found_tables.append(table)
                
                time_col = "timestamp" # default
                try:
                    cursor.execute(f"SELECT * FROM {table} LIMIT 0")
                    colnames = [desc[0] for desc in cursor.description]
                    # Procura por variações de timestamp
                    for col in colnames:
                        if col.lower() in ['timestamp', 'data_hora', 'time', 'date', 'datetime']:
                            time_col = f'"{col}"'
                            break
                    table_time_cols[table] = time_col
                except Exception as e:
                    conn.rollback()
                    
                # Pega um sample para debug (só da primeira tabela)
                if debug_sample is None:
                    try:
                        cursor.execute(f"SELECT * FROM {table} LIMIT 1")
                        colnames = [desc[0] for desc in cursor.description]
                        row = cursor.fetchone()
                        debug_sample = dict(zip(colnames, row)) if row else "Table is empty"
                    except Exception as e:
                        debug_sample = f"Error fetching sample: {str(e)}"
                        conn.rollback()

                try:
                    cursor.execute(f"SELECT MIN(CAST({time_col} AS TIMESTAMP)), MAX(CAST({time_col} AS TIMESTAMP)) FROM {table}")
                    t_min, t_max = cursor.fetchone()
                    if t_min and (global_min is None or t_min < global_min):
                        global_min = t_min
                    if t_max and (global_max is None or t_max > global_max):
                        global_max = t_max
                except psycopg2.Error as e:
                    debug_sample = str(debug_sample) + f" | Error in MIN/MAX: {str(e)}"
                    conn.rollback()
            else:
                # Tenta match ignorando case
                matched = next((t for t in all_tables_in_db if t.lower() == clean_table.lower()), None)
                if matched:
                    missing_tables.append(table)
                else:
                    missing_tables.append(table)
                    
        cursor.close()
        conn.close()
        
        min_date_str = None
        max_date_str = None
        
        if global_min:
            try:
                min_date_str = global_min.strftime('%Y-%m-%d') if hasattr(global_min, 'strftime') else dateutil.parser.parse(str(global_min)).strftime('%Y-%m-%d')
            except:
                pass
        if global_max:
            try:
                max_date_str = global_max.strftime('%Y-%m-%d') if hasattr(global_max, 'strftime') else dateutil.parser.parse(str(global_max)).strftime('%Y-%m-%d')
            except:
                pass
        
        if missing_tables:
            return {
                "status": "warning",
                "message": f"Tabelas não encontradas: {', '.join(missing_tables)}. Tabelas disponíveis: {available_tables_str}. Dica: Se a tabela tiver letras maiúsculas no banco, escreva-a entre aspas duplas, ex: \"{missing_tables[0]}\"",
                "found_tables": found_tables,
                "missing_tables": missing_tables,
                "min_date": min_date_str,
                "max_date": max_date_str,
                "debug_sample": str(debug_sample)
            }
            
        return {
            "status": "success",
            "found_tables": found_tables,
            "missing_tables": missing_tables,
            "min_date": min_date_str,
            "max_date": max_date_str,
            "debug_sample": str(debug_sample)
        }
    except Exception as e:
        raise Exception(f"Erro ao conectar ao PostgreSQL: {str(e)}")

def fetch_table_data(config: DatabaseConfig, table: str, start_date: str, end_date: str, offset_minutes: int = 0, start_time: str | None = None, end_time: str | None = None, exception_dates: list[str] | None = None) -> pd.DataFrame | None:
    """
    Faz um SELECT na tabela filtrando por data e retorna o conteúdo como DataFrame.
    Retorna None se a tabela estiver vazia no período.
    Assume que a coluna de tempo se chama 'timestamp'.
    """
    import warnings
    warnings.filterwarnings('ignore', category=UserWarning, module='pandas')
    
    conn = psycopg2.connect(
        host=config.host,
        port=config.port,
        dbname=config.database,
        user=config.user,
        password=config.password
    )
    
    # Detecta a coluna de tempo
    time_col = "timestamp"
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} LIMIT 0")
        colnames = [desc[0] for desc in cursor.description]
        for col in colnames:
            if col.lower() in ['timestamp', 'data_hora', 'time', 'date', 'datetime']:
                time_col = f'"{col}"'
                break
        cursor.close()
    except:
        pass
    
    # Monta a query para pegar dados dentro do período especificado
    # Adicionamos "ORDER BY <time_col>" para garantir ordem cronológica
    # Ajustamos a janela do banco de dados (UTC/outro) para a janela local solicitada
    # db_time = local_time - offset
    import pandas as pd
    try:
        db_start = pd.to_datetime(f"{start_date} 00:00:00") - pd.Timedelta(minutes=offset_minutes)
        db_end = pd.to_datetime(f"{end_date} 23:59:59") - pd.Timedelta(minutes=offset_minutes)
        db_start_str = db_start.strftime("%Y-%m-%d %H:%M:%S")
        db_end_str = db_end.strftime("%Y-%m-%d %H:%M:%S")
    except:
        db_start_str = f"{start_date} 00:00:00"
        db_end_str = f"{end_date} 23:59:59"

    # Usamos CAST para que a comparação de strings com a data funcione mesmo se a coluna for do tipo TEXT no banco
    base_query = f"SELECT * FROM {table} WHERE CAST({time_col} AS TIMESTAMP) >= CAST('{db_start_str}' AS TIMESTAMP) AND CAST({time_col} AS TIMESTAMP) <= CAST('{db_end_str}' AS TIMESTAMP)"
    
    if exception_dates:
        dates_str = ", ".join([f"'{d}'" for d in exception_dates])
        # Aplicar o offset dentro do banco para saber a que dia LOCAL a linha pertence e então excluir
        interval_str = f"INTERVAL '{offset_minutes} minutes'"
        base_query += f" AND CAST(CAST({time_col} AS TIMESTAMP) + {interval_str} AS DATE) NOT IN ({dates_str})"
        
    query = f"{base_query} ORDER BY CAST({time_col} AS TIMESTAMP)"
    
    # Usa o COPY_TO para extrair rapidamente como CSV, depois carrega no pandas
    import io
    output = io.StringIO()
    copy_query = f"COPY ({query}) TO STDOUT WITH CSV HEADER"
    
    try:
        cursor = conn.cursor()
        cursor.copy_expert(copy_query, output)
        cursor.close()
    except Exception as e:
        conn.close()
        raise e
        
    conn.close()
    
    val = output.getvalue()
    if not val or len(val.split('\n', 1)) <= 1 or not val.strip():
        return None
        
    df = pd.read_csv(io.StringIO(val), on_bad_lines='skip')
    
    if df.empty:
        return None
        
    # Renomear colunas para incluir o nome da tabela (evitar sobreposição)
    clean_table_name = table.strip('"')
    time_col_clean = time_col.strip('"')
    new_cols = {}
    for col in df.columns:
        if col == time_col_clean or col.lower() in ['timestamp', 'data_hora', 'time', 'date', 'datetime']:
            continue
        new_cols[col] = f"{clean_table_name}_{col}"
        
    if new_cols:
        df.rename(columns=new_cols, inplace=True)
        
    if offset_minutes != 0:
        actual_time_col = time_col.strip('"')
        if actual_time_col in df.columns:
            df[actual_time_col] = pd.to_datetime(df[actual_time_col]) + pd.Timedelta(minutes=offset_minutes)
            
    if start_time and end_time:
        actual_time_col = time_col.strip('"')
        if actual_time_col in df.columns:
            try:
                time_series = pd.to_datetime(df[actual_time_col]).dt.time
                s_time = pd.to_datetime(start_time).time()
                e_time = pd.to_datetime(end_time).time()
                
                # Create boolean mask
                mask = (time_series >= s_time) & (time_series <= e_time)
                
                # Apply mask to nullify data outside the window
                cols_to_nullify = [c for c in df.columns if c != actual_time_col]
                df.loc[~mask, cols_to_nullify] = pd.NA
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to apply time filter on {table}: {e}")
            
    return df
