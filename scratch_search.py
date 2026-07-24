import json

transcript_path = r"C:\Users\Eduardo M.Des\.gemini\antigravity\brain\04ecee82-8593-49db-824c-7926366ac9bd\.system_generated\logs\transcript.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            if content and 'Irradiância maior que 600' in content:
                print(f"Found in step {data.get('step_index')}:")
                # print snippet
                idx = content.find('Irradiância maior que 600')
                print(content[max(0, idx-100):idx+500])
                print("-" * 80)
            
            # also check tool calls
            tool_calls = data.get('tool_calls', [])
            for tc in tool_calls:
                args = tc.get('args', {})
                for k, v in args.items():
                    if isinstance(v, str) and 'Irradiância maior que 600' in v:
                        print(f"Found in tool call step {data.get('step_index')}, file {args.get('TargetFile')}:")
                        idx = v.find('Irradiância maior que 600')
                        print(v[max(0, idx-100):idx+500])
                        print("-" * 80)
        except Exception as e:
            pass
