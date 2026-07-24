import json
transcript_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\04ecee82-8593-49db-824c-7926366ac9bd\.system_generated\logs\transcript.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            tool_calls = data.get('tool_calls', [])
            for tc in tool_calls:
                if tc.get('name') == 'run_command':
                    cmd = tc.get('args', {}).get('CommandLine', '')
                    if 'git' in cmd:
                        print(f"Step {data.get('step_index')}: {cmd}")
        except: pass
