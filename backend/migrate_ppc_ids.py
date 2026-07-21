import os
import json
import pandas as pd
from pathlib import Path

def migrate_json_file(file_path):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Substituir energia_pmi temporariamente para não confundir com energia
    content = content.replace('energia_pmi', 'TMP_ENERGIA_PMI')
    
    # Renomear potencia_ppc -> referencia_ppc
    content = content.replace('potencia_ppc', 'referencia_ppc')
    
    # Renomear energia -> potencia_ppc
    content = content.replace('"energia"', '"potencia_ppc"')
    content = content.replace('energia_semTR', 'potencia_ppc_semTR')
    
    # Restaurar energia_pmi
    content = content.replace('TMP_ENERGIA_PMI', 'energia_pmi')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Migrado JSON: {file_path}")

def migrate_parquet_file(file_path):
    if not os.path.exists(file_path):
        return
    df = pd.read_parquet(file_path)
    
    rename_map = {}
    for col in df.columns:
        if col.startswith('potencia_ppc'):
            rename_map[col] = col.replace('potencia_ppc', 'referencia_ppc')
        elif col.startswith('energia') and not col.startswith('energia_pmi'):
            rename_map[col] = col.replace('energia', 'potencia_ppc')
            
    if rename_map:
        df = df.rename(columns=rename_map)
        df.to_parquet(file_path)
        print(f"Migrado Parquet: {file_path} (renomeadas: {rename_map})")

def main():
    data_dir = Path("backend/data")
    if not data_dir.exists():
        print("Diretório backend/data não encontrado.")
        return

    for item in data_dir.iterdir():
        if item.is_dir():
            print(f"--- Verificando pasta {item.name} ---")
            migrate_json_file(item / "flow_config.json")
            migrate_json_file(item / "series_map.json")
            migrate_json_file(item / "visualizations.json")
            
            processed_dir = item / "processed"
            if processed_dir.exists():
                for pq_file in processed_dir.glob("*.parquet"):
                    migrate_parquet_file(pq_file)

if __name__ == "__main__":
    main()
