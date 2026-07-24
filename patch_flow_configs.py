import json
import glob
import os

files = glob.glob(r"e:\Antigravity\Causa Raiz\backend\data\*\flow_config.json")
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    if isinstance(data, dict) and 'nodeConfigs' in data:
        node_configs = data['nodeConfigs']
        if 'pvsyst' not in node_configs:
            node_configs['pvsyst'] = {'type': 'pvsyst'}
            modified = True
        if 'tcel' not in node_configs:
            node_configs['tcel'] = {'type': 'tcel'}
            modified = True
        
        if modified:
            with open(file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Patched {file}")
