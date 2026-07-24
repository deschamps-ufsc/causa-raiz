import json
transcript_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\04ecee82-8593-49db-824c-7926366ac9bd\.system_generated\logs\transcript.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT':
                print(data.get('content'))
                print("-" * 40)
        except: pass
