import pandas as pd
import psycopg2

conn = psycopg2.connect(
    host='150.162.142.79', 
    port=5432, 
    dbname='fotovoltaica', 
    user='viewer', 
    password='viewerpassword123'
)

query = """
SELECT CAST("TIMESTAMP" AS DATE) as data, count(*) 
FROM "CTG_CR1X_Pyr_1M" 
WHERE CAST("TIMESTAMP" AS TIMESTAMP) >= CAST('2026-06-01 00:00:00' AS TIMESTAMP) 
AND CAST("TIMESTAMP" AS TIMESTAMP) <= CAST('2026-06-10 23:59:59' AS TIMESTAMP)
GROUP BY CAST("TIMESTAMP" AS DATE)
ORDER BY data
"""

df = pd.read_sql_query(query, conn)
print(df.to_string())
conn.close()
