import glob
import json
import re

logs = glob.glob(r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\*\.system_generated\logs\transcript_full.jsonl")
found = False
for log in logs:
    with open(log, "r", encoding="utf-8") as f:
        for line in f:
            if 'Abaixo da Tol' in line and '<th' in line and 'color' in line and '991b1b' in line:
                m = re.search(r'<thead>.*?</tbody>', line, re.DOTALL)
                if m:
                    print("Found in", log)
                    print(m.group(0)[:1000].encode('ascii', 'ignore').decode('ascii'))
                    found = True
                    break
    if found:
        break
