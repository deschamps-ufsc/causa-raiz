import glob
import json
import re

logs = glob.glob(r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\*\.system_generated\logs\transcript_full.jsonl")
for log in logs:
    with open(log, "r", encoding="utf-8") as f:
        for line in f:
            if 'summaryTableData.map' in line and '<table' in line:
                m = re.search(r'<thead>.*?</tbody>', line, re.DOTALL)
                if m:
                    # just print a snippet of the table headers to see colors
                    s = m.group(0)[:1000]
                    if 'color: \'var(--text-secondary)\'' not in s:
                        print("Found in", log)
                        print(s.encode('ascii', 'ignore').decode('ascii'))
                        print('-'*40)
                        break
