import json
import os

log_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\.system_generated\logs\transcript_full.jsonl"
base_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_step_2246.tsx"
out_file = r"c:\Users\Asus\OneDrive\Dokumen\Money Management\scratch\TradingScanner_step_2519.tsx"

with open(base_file, "r", encoding="utf-8") as f:
    content = f.read()

with open(log_file, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step_idx = data.get('step_index')
            if step_idx > 2519:
                break
                
            tool_calls = data.get("tool_calls", [])
            for call in tool_calls:
                name = call.get("name") or call.get("ToolName")
                args = call.get("args") or call.get("Arguments") or {}
                if isinstance(args, str):
                    args = json.loads(args)
                target = args.get("TargetFile") or args.get("Target") or args.get("AbsolutePath") or ""
                if "TradingScanner.tsx" in str(target) and name in ("replace_file_content", "multi_replace_file_content", "write_to_file"):
                    if name == "write_to_file":
                        content = args.get("CodeContent")
                    elif name == "replace_file_content":
                        target_str = args.get("TargetContent")
                        repl_str = args.get("ReplacementContent") or ""
                        if target_str in content:
                            content = content.replace(target_str, repl_str)
                        else:
                            content = content.replace(target_str.replace("\r\n", "\n"), repl_str.replace("\r\n", "\n"))
                    elif name == "multi_replace_file_content":
                        for chunk in args.get("ReplacementChunks", []):
                            target_str = chunk.get("TargetContent")
                            repl_str = chunk.get("ReplacementContent") or ""
                            if target_str in content:
                                content = content.replace(target_str, repl_str)
                            else:
                                content = content.replace(target_str.replace("\r\n", "\n"), repl_str.replace("\r\n", "\n"))
        except Exception as e:
            pass

with open(out_file, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Step 2519 file written: {len(content)} bytes, {len(content.splitlines())} lines.")

# Search for key terms
for idx, line in enumerate(content.splitlines()):
    if "autoalerts" in line.lower() or "fetchautoalerts" in line.lower() or "deepseek" in line.lower():
        print(f"L{idx+1}: {line.strip()[:100]}")
