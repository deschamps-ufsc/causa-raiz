import glob
import json
import re

logs = glob.glob(r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\*\.system_generated\logs\transcript_full.jsonl")
found = False
for log in logs:
    with open(log, "r", encoding="utf-8") as f:
        for line in f:
            if 'Abaixo da Tol' in line and '<th' in line and ('#ef4444' in line or '#dc2626' in line or 'color:' in line):
                # check if it has the nice colors
                if 'color: \'#ef4444\'' in line or 'color: \'#dc2626\'' in line or 'color: \'#ef4444\'' in line:
                    m = re.search(r'<table.*?</table>', line, re.DOTALL)
                    if m:
                        print("Found in", log)
                        print(m.group(0)[:1000].encode('ascii', 'ignore').decode('ascii'))
                        found = True
                        break
    if found:
        break
