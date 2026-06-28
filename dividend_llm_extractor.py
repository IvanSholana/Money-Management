import json
import uuid
import app
from typing import Any, Dict, List, Optional
from dividend_schema import DividendEvent

SYSTEM_INSTRUCTION = (
    "You are a financial document parser. Extract dividend event fields from the raw text. "
    "Return strict JSON only. If a field is not present, return null. Do not infer dates. "
    "Do not invent facts or guess values."
)

PROMPT_TEMPLATE = """
Extract dividend event fields from this raw disclosure text.
Raw text:
\"\"\"
{raw_text}
\"\"\"

Output strict JSON schema matching the following structure:
{{
  "ticker": "4 letter stock symbol, e.g. BBCA or null",
  "dividend_per_share": 123.45 (float value or null),
  "announcement_date": "YYYY-MM-DD or null",
  "cum_date_regular": "YYYY-MM-DD or null",
  "ex_date_regular": "YYYY-MM-DD or null",
  "recording_date": "YYYY-MM-DD or null",
  "payment_date": "YYYY-MM-DD or null"
}}
"""

def extract_dividend_from_messy_text(raw_text: str, api_keys: List[str]) -> Optional[Dict[str, Any]]:
    """
    Invokes DeepSeek LLM to extract dividend fields from messy/unstructured text disclosures.
    """
    if not raw_text or not api_keys:
        return None

    prompt = PROMPT_TEMPLATE.format(raw_text=raw_text)

    try:
        response_text = app.call_deepseek_with_rotation(prompt, SYSTEM_INSTRUCTION, api_keys)
        
        cleaned_text = response_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()
        
        parsed_json = json.loads(cleaned_text)
        return parsed_json
    except Exception as e:
        print(f"DeepSeek dividend text extractor failed: {e}")
        return None
