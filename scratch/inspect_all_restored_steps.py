import json
import os

log_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\.system_generated\logs\transcript_full.jsonl"
base_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_step_2246.tsx"

with open(base_file, "r", encoding="utf-8") as f:
    content = f.read()

print("Base file: len =", len(content), "lines =", len(content.splitlines()))

# Let's track the content at each step
steps_to_track = [2258, 2469, 2517, 2519]
with open(log_file, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get('step_index')
            if step not in steps_to_track:
                continue
                
            tool_calls = data.get("tool_calls", [])
            for call in tool_calls:
                name = call.get("name")
                args = call.get("args")
                if isinstance(args, str):
                    args = json.loads(args)
                if not isinstance(args, dict):
                    continue
                if "TradingScanner.tsx" not in args.get("TargetFile", ""):
                    continue
                    
                if name == "replace_file_content":
                    target_str = args.get("TargetContent")
                    repl_str = args.get("ReplacementContent") or ""
                    if target_str in content:
                        content = content.replace(target_str, repl_str)
                    else:
                        print(f"Step {step} Warning: target not found")
                elif name == "multi_replace_file_content":
                    for chunk in args.get("ReplacementChunks", []):
                        target_str = chunk.get("TargetContent")
                        repl_str = chunk.get("ReplacementContent") or ""
                        if target_str in content:
                            content = content.replace(target_str, repl_str)
                        else:
                            print(f"Step {step} Warning: chunk target not found")
            
            # Print status
            lines = content.splitlines()
            print(f"After Step {step}: len = {len(content)}, lines = {len(lines)}")
            # Let's search for return (
            has_return = any("return (" in l for l in lines)
            print(f"  Has 'return (': {has_return}")
            # If not, let's see when it disappeared
        except Exception as e:
            print("Error:", e)
