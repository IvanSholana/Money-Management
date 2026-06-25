with open(r"C:\Users\Asus\.gemini\antigravity\brain\aa8b3b7d-e03f-4cf0-8519-634bacb37b68\scratch\TradingScanner_restored.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "activetab" in line.lower():
        print(f"L{idx+1}: {line.strip()[:120]}")
