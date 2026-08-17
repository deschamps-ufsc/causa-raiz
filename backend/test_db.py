import pandas as pd
import psycopg2

conn = psycopg2.connect(
    host='150.162.142.79', 
    port=5432, 
    dbname='fotovoltaica', 
    user='viewer', 
    password='db_viewer_pass123'
)

df = pd.read_sql_query('SELECT * FROM "CTG_CR1X_Pyr_1M" LIMIT 20', conn)
print(df.head(20).to_string())

conn.close()
