import json
import os

log_path = r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\.system_generated\logs\transcript_full.jsonl"
target_file_path = "src/pages/TradingScanner.tsx"

print("Reconstructing TradingScanner.tsx from logs...")

file_content = None

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            step = json.loads(line)
            step_idx = step.get("step_index")
            tool_calls = step.get("tool_calls", [])
            for tc in tool_calls:
                name = tc.get("name")
                args = tc.get("Arguments") or tc.get("args") or {}
                target = args.get("TargetFile") or args.get("Target") or args.get("AbsolutePath") or ""
                
                if "TradingScanner.tsx" not in str(target):
                    continue
                
                if name == "write_to_file":
                    file_content = args.get("CodeContent")
                    print(f"Step {step_idx}: Initialized file from write_to_file (len: {len(file_content)})")
                
                elif name == "replace_file_content" and file_content is not None:
                    target_content = args.get("TargetContent")
                    replacement_content = args.get("ReplacementContent")
                    if target_content in file_content:
                        file_content = file_content.replace(target_content, replacement_content, 1)
                        print(f"Step {step_idx}: Applied replace_file_content (len: {len(file_content)})")
                    else:
                        print(f"Step {step_idx}: WARNING: Target content not found for replace_file_content!")
                        # Let's print clean versions for comparison
                        tc_clean = target_content.replace("\r\n", "\n").strip()
                        fc_clean = file_content.replace("\r\n", "\n")
                        if tc_clean in fc_clean:
                            fc_clean = fc_clean.replace(tc_clean, replacement_content.replace("\r\n", "\n").strip(), 1)
                            file_content = fc_clean
                            print(f"Step {step_idx}: Applied replace_file_content with line-ending normalization")
                        else:
                            print(f"Step {step_idx}: ERROR: Truly not found.")
                
                elif name == "multi_replace_file_content" and file_content is not None:
                    chunks = args.get("ReplacementChunks", [])
                    print(f"Step {step_idx}: Applying multi_replace_file_content with {len(chunks)} chunks...")
                    # Sort chunks from bottom to top or apply in order if non-overlapping
                    for chunk in chunks:
                        tc = chunk.get("TargetContent")
                        rc = chunk.get("ReplacementContent")
                        if tc in file_content:
                            file_content = file_content.replace(tc, rc, 1)
                        else:
                            tc_clean = tc.replace("\r\n", "\n").strip()
                            fc_clean = file_content.replace("\r\n", "\n")
                            if tc_clean in fc_clean:
                                fc_clean = fc_clean.replace(tc_clean, rc.replace("\r\n", "\n").strip(), 1)
                                file_content = fc_clean
                            else:
                                print(f"  Chunk WARNING: Target not found.")
        except Exception as e:
            print(f"Error parsing line: {e}")

if file_content:
    out_path = r"c:\Users\Asus\OneDrive\Dokumen\Money Management\src\pages\TradingScanner.tsx"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(file_content)
    print("Successfully reconstructed and saved TradingScanner.tsx!")
else:
    print("Failed: No content reconstructed.")
