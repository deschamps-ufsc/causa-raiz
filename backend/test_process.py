import os
import pandas as pd
import numpy as np
from services.excel_service import process_raw_file
import logging

logging.basicConfig(level=logging.INFO)

def test_process():
    dates = pd.to_datetime(['2026-06-01 00:00:00', '2026-06-10 23:59:00'])
    np.random.seed(0)
    random_timestamps = dates[0] + pd.to_timedelta(np.random.rand(13822) * (dates[1] - dates[0]))
    df = pd.DataFrame({'value': np.random.rand(13822), 'timestamp': random_timestamps})
    df['tag'] = 'test_series'
    
    # process_raw_file expects wide format typically, let's make it wide
    df_wide = df.pivot(index='timestamp', columns='tag', values='value').reset_index()
    
    print("Min:", df_wide['timestamp'].min())
    print("Max:", df_wide['timestamp'].max())
    
    # Execute process_raw_file
    results = process_raw_file(df_wide, filename='test.csv', usina='TEST')
    
    print(f"Number of parquets: {len(results)}")
    for r in results:
        print(r)

if __name__ == "__main__":
    test_process()
