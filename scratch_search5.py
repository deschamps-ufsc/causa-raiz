import json
transcript_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\04ecee82-8593-49db-824c-7926366ac9bd\.system_generated\logs\transcript.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get('step_index')
            if step > 2642:
                tool_calls = data.get('tool_calls', [])
                for tc in tool_calls:
                    name = tc.get('name')
                    if 'replace_file_content' in name or 'write_to_file' in name:
                        args = tc.get('args', {})
                        print(f"Step {step}: Modified {args.get('TargetFile')}")
        except: pass
