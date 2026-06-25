import json
import os
import subprocess
import shutil

log_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\.system_generated\logs\transcript_full.jsonl"
base_file = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_step_2246.tsx"
target_file = r"src\pages\TradingScanner.tsx"

with open(base_file, "r", encoding="utf-8") as f:
    content = f.read()

steps = []
with open(log_file, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step_idx = data.get('step_index')
            tool_calls = data.get("tool_calls", [])
            has_mod = False
            for call in tool_calls:
                name = call.get("name") or call.get("ToolName")
                args = call.get("Arguments") or call.get("args") or {}
                if isinstance(args, str):
                    args = json.loads(args)
                target = args.get("TargetFile") or args.get("Target") or args.get("AbsolutePath") or ""
                if "TradingScanner.tsx" in str(target) and name in ("replace_file_content", "multi_replace_file_content", "write_to_file"):
                    has_mod = True
            if has_mod:
                steps.append((step_idx, data))
        except Exception as e:
            pass

print(f"Found {len(steps)} steps modifying TradingScanner.tsx after base setup.")

# We will apply steps one by one and test compilation
for step_idx, data in steps:
    if step_idx <= 2246:
        continue
    
    tool_calls = data.get("tool_calls", [])
    for call in tool_calls:
        name = call.get("name")
        args = call.get("args") or call.get("Arguments") or {}
        if isinstance(args, str):
            args = json.loads(args)
            
        if name == "write_to_file":
            content = args.get("CodeContent")
        elif name == "replace_file_content":
            target_str = args.get("TargetContent")
            repl_str = args.get("ReplacementContent") or ""
            if target_str in content:
                content = content.replace(target_str, repl_str)
            else:
                # normalize line endings
                t_norm = target_str.replace("\r\n", "\n")
                c_norm = content.replace("\r\n", "\n")
                if t_norm in c_norm:
                    content = c_norm.replace(t_norm, repl_str.replace("\r\n", "\n"))
                else:
                    print(f"Step {step_idx}: target not found for replace_file_content")
        elif name == "multi_replace_file_content":
            for chunk in args.get("ReplacementChunks", []):
                target_str = chunk.get("TargetContent")
                repl_str = chunk.get("ReplacementContent") or ""
                if target_str in content:
                    content = content.replace(target_str, repl_str)
                else:
                    t_norm = target_str.replace("\r\n", "\n")
                    c_norm = content.replace("\r\n", "\n")
                    if t_norm in c_norm:
                        content = c_norm.replace(t_norm, repl_str.replace("\r\n", "\n"))
                    else:
                        print(f"Step {step_idx}: chunk target not found")
                        
    # Save and test compile
    with open(target_file, "w", encoding="utf-8") as f:
        f.write(content)
        
    # Check lines and has 'return ('
    lines = content.splitlines()
    has_return = any("return (" in l for l in lines)
    print(f"Step {step_idx}: len = {len(content)}, lines = {len(lines)}, has_return = {has_return}")
    
    # Run tsc check
    res = subprocess.run(["npx", "tsc", "--noEmit"], capture_output=True, text=True, shell=True)
    if res.returncode == 0:
        print(f"  --> Step {step_idx} COMPILES CLEANLY!")
    else:
        # print first few lines of error
        err_lines = [l for l in res.stderr.splitlines() if l.strip()]
        if not err_lines:
            err_lines = [l for l in res.stdout.splitlines() if l.strip()]
        print(f"  --> Step {step_idx} compile failed. Error: {err_lines[:2]}")
