import glob
import re

logs = glob.glob(r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\*\.system_generated\logs\transcript_full.jsonl")
found = False
for log in logs:
    with open(log, "r", encoding="utf-8") as f:
        for line in f:
            if 'summaryTableData.map' in line and 'rgba' in line and 'val / total' in line:
                m = re.search(r'<tbody>.*?</tbody>', line, re.DOTALL)
                if m:
                    print("Found in", log)
                    print(m.group(0)[:1000].encode('ascii', 'ignore').decode('ascii'))
                    found = True
                    break
    if found:
        break
