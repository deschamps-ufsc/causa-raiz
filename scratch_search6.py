import json
transcript_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\04ecee82-8593-49db-824c-7926366ac9bd\.system_generated\logs\transcript.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get('step_index')
            if step in [2661, 2665]:
                tool_calls = data.get('tool_calls', [])
                for tc in tool_calls:
                    print(json.dumps(tc.get('args'), indent=2, ensure_ascii=False))
        except: pass
