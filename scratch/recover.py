import json

log_path = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\.system_generated\logs\transcript_full.jsonl"

print("Searching transcript_full.jsonl for write_to_file or replace_file_content calls...")
with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            step = json.loads(line)
            tool_calls = step.get("tool_calls", [])
            for tc in tool_calls:
                name = tc.get("name")
                args = tc.get("Arguments") or tc.get("args") or {}
                target = args.get("TargetFile") or args.get("Target") or args.get("AbsolutePath") or ""
                if "TradingScanner.tsx" in str(target) and name == "write_to_file":
                    print(f"Step {step.get('step_index')}: write_to_file, len = {len(args.get('CodeContent', ''))}")
        except Exception as e:
            pass
