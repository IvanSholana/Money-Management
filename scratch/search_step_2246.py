import os

files = [
    r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_step_2246.tsx",
    r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_restored.tsx"
]

for fp in files:
    if os.path.exists(fp):
        with open(fp, "r", encoding="utf-8") as f:
            lines = f.readlines()
        print(f"\n=== {os.path.basename(fp)} (Lines: {len(lines)}) ===")
        for idx, line in enumerate(lines):
            if "pindai" in line.lower() or "auto" in line.lower() or "deepseek" in line.lower() or "alert" in line.lower():
                print(f"L{idx+1}: {line.strip()[:100]}")
