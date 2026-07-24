import requests
import json

try:
    res = requests.post("http://localhost:8000/flow/run", json={"usina": "Cortez - SPE São Claus 1", "dates": ["2025-11-24"]})
    data = res.json()
    columns = data.get("integrals", {}).get("columns", [])
    print("Columns returned:")
    for col in columns:
        print(col.get("key"), col.get("label"), col.get("type"))
except Exception as e:
    print("Error:", e)
