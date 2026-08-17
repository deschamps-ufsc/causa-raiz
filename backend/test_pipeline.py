import os
import asyncio
from services.database_service import get_engine, fetch_table_data
from services.excel_service import process_raw_file
import logging

logging.basicConfig(level=logging.INFO)

def test_fetch_and_process():
    engine = get_engine()
    start_date = "2026-06-01"
    end_date = "2026-06-10"
    table = "CTG_CR1X_Pyr_1M"
    usina = "CTG"
    
    print(f"Fetching {table} from {start_date} to {end_date}...")
    df = fetch_table_data(engine, table, start_date, end_date)
    
    print(f"Fetched {len(df)} rows.")
    print("Min date in db:", df['TIMESTAMP'].min())
    print("Max date in db:", df['TIMESTAMP'].max())
    
    results = process_raw_file(df, filename=f"{table}.csv", usina=usina, skip_unmapped=False)
    
    print("Results length:", len(results))
    for r in results:
        print(r)

if __name__ == "__main__":
    test_fetch_and_process()
