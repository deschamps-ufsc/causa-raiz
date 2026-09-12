import re

log_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\7ea2ed2b-8486-45c8-94e4-779a1e9ac2b5\.system_generated\logs\transcript_full.jsonl"
with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        if 'summaryTableData.map' in line and 'Abaixo da Toler' in line:
            m = re.search(r'<thead>.*?</tbody>', line, re.DOTALL)
            if m:
                # The line is JSON, so we need to handle escaping
                import json
                try:
                    data = json.loads(line)
                    content = data.get('content', '')
                    m2 = re.search(r'<thead>.*?</tbody>', content, re.DOTALL)
                    if m2:
                        print(m2.group(0)[:2000].encode('ascii', 'ignore').decode('ascii'))
                        break
                except:
                    pass
