import glob
import re
import json

logs = glob.glob(r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\7ea2ed2b-8486-45c8-94e4-779a1e9ac2b5\.system_generated\logs\transcript_full.jsonl")
for log in logs:
    with open(log, "r", encoding="utf-8") as f:
        for line in f:
            if 'rgbBases = [' in line:
                m = re.search(r'<th.*?Acima da Toler.*?</th>(.*?</tr>)', line, re.DOTALL)
                if m:
                    print(m.group(1).replace('\\n', '\n').encode('ascii', 'ignore').decode('ascii'))
                    break
