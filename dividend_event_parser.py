import re
import uuid
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dividend_schema import DividendEvent

INDONESIAN_MONTHS = {
    "januari": "01", "jan": "01", "january": "01",
    "februari": "02", "feb": "02", "february": "02",
    "maret": "03", "mar": "03", "march": "03",
    "april": "04", "apr": "04",
    "mei": "05", "may": "05",
    "juni": "06", "jun": "06", "june": "06",
    "juli": "07", "jul": "07", "july": "07",
    "agustus": "08", "agu": "08", "agt": "08", "aug": "08", "august": "08",
    "september": "09", "sep": "09",
    "oktober": "10", "okt": "10", "oct": "10", "october": "10",
    "november": "11", "nov": "11",
    "desember": "12", "des": "12", "dec": "12", "december": "12"
}

def clean_text_spacing(text: str) -> str:
    if not text:
        return ""
    # Replace multiple whitespaces and newlines with a single space
    return re.sub(r"\s+", " ", text).strip()

def parse_date_string(date_str: str) -> Optional[str]:
    """
    Parses Indonesian/English date formats and returns ISO YYYY-MM-DD.
    Supported formats:
    - 2026-07-10
    - 10/07/2026 or 10-07-2026
    - 10 Juli 2026 or 10 Jul 2026 or 10 July 2026
    """
    if not date_str:
        return None
    
    cleaned = clean_text_spacing(date_str).lower()
    
    # 1. Matches YYYY-MM-DD
    iso_match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", cleaned)
    if iso_match:
        year, month, day = iso_match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
        
    # 2. Matches DD/MM/YYYY or DD-MM-YYYY
    slash_match = re.search(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b", cleaned)
    if slash_match:
        day, month, year = slash_match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    # 3. Matches DD Month YYYY (e.g. 10 Juli 2026 or 10 Jul 2026)
    month_match = re.search(r"\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b", cleaned)
    if month_match:
        day, month_name, year = month_match.groups()
        month_num = INDONESIAN_MONTHS.get(month_name)
        if month_num:
            return f"{year}-{month_num}-{int(day):02d}"
            
    return None

def parse_dividend_value(text: str) -> float:
    """
    Extracts numerical dividend per share.
    E.g. "Rp 150", "Rp. 220,00", "Rp 350.5", "180"
    """
    if not text:
        return 0.0
    
    cleaned = clean_text_spacing(text)
    # Search for number pattern after optional Rp/Rp.
    # Pattern matches digits, optionally followed by . or , and more digits
    match = re.search(r"(?:rp\.?\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{2})?", cleaned, re.IGNORECASE)
    if match:
        val_str = match.group(1)
        # Remove thousands dots
        if "." in val_str and len(val_str.split(".")[-1]) == 3:
            val_str = val_str.replace(".", "")
        return float(val_str)
    
    # Simple fallback: find any float
    match_float = re.search(r"(\d+(?:\.\d+)?)", cleaned)
    if match_float:
        return float(match_float.group(1))
        
    return 0.0

def parse_ticker(text: str) -> Optional[str]:
    """Finds 4-letter uppercase code (e.g. TLKM, BBCA)."""
    if not text:
        return None
    # Look for exact 4 letters code
    match = re.search(r"\b([A-Z]{4})\b", text)
    if match:
        return match.group(1)
    return None

def calculate_confidence(event: DividendEvent) -> float:
    """
    Calculates parser confidence score (0-100).
    +20 if ticker found
    +20 if action_type is CASH_DIVIDEND
    +20 if dividend_per_share found
    +15 if cum_date_regular found
    +15 if ex_date_regular found
    +5 if recording_date found
    +5 if payment_date found
    """
    score = 0.0
    if event.ticker and len(event.ticker) == 4:
        score += 20
    if event.action_type == "CASH_DIVIDEND":
        score += 20
    if event.dividend_per_share > 0:
        score += 20
    if event.cum_date_regular:
        score += 15
    if event.ex_date_regular:
        score += 15
    if event.recording_date:
        score += 5
    if event.payment_date:
        score += 5
    return score

def parse_raw_text_to_events(raw_text: str, source_name: str, source_url: Optional[str] = None) -> List[DividendEvent]:
    """
    Parses unstructured text/HTML from disclosures to identify dividend event candidates.
    Uses regex rules to locate key parameters.
    """
    events: List[DividendEvent] = []
    if not raw_text:
        return events

    # Clean text to single line for easier regex scans
    flat_text = clean_text_spacing(raw_text)
    
    # Try parsing patterns (this is a deterministic parser)
    # 1. Find ticker
    ticker = parse_ticker(flat_text)
    if not ticker:
        # Check lowercase or text like "saham TLKM" or "kode TLKM" or "(TLKM)"
        ticker_match = re.search(r"\b([a-zA-Z]{4})\b", flat_text)
        if ticker_match:
            ticker = ticker_match.group(1).upper()
            
    if not ticker:
        return [] # Can't parse without a ticker candidate
    
    # 2. Extract values and dates
    # Dividend per share
    dps = 0.0
    dps_match = re.search(r"(?:dividen|pembagian)\s+(?:tunai\s+)?(?:sebesar\s+)?(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)", flat_text, re.IGNORECASE)
    if dps_match:
        dps = parse_dividend_value(dps_match.group(1))
    else:
        # Fallback to any number near "dividen"
        dps_near = re.search(r"dividen[^0-9]+(\d+(?:[.,]\d+)?)", flat_text, re.IGNORECASE)
        if dps_near:
            dps = parse_dividend_value(dps_near.group(1))

    # Parse dates using keyword anchors
    cum_date = None
    ex_date = None
    rec_date = None
    pay_date = None
    ann_date = None

    # Date regex to find dates like "10 Juli 2026", "2026-07-10", etc.
    date_regex = r"(\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})"

    # Cum date
    cum_match = re.search(r"(?:cum\s+date|cum\s+dividen|cum\s+div)[^0-9]{1,30}" + date_regex, flat_text, re.IGNORECASE)
    if cum_match:
        cum_date = parse_date_string(cum_match.group(1))
        
    # Ex date
    ex_match = re.search(r"(?:ex\s+date|ex\s+dividen|ex\s+div)[^0-9]{1,30}" + date_regex, flat_text, re.IGNORECASE)
    if ex_match:
        ex_date = parse_date_string(ex_match.group(1))
        
    # Recording date
    rec_match = re.search(r"(?:recording\s+date|daftar\s+pemegang\s+saham|dps)[^0-9]{1,30}" + date_regex, flat_text, re.IGNORECASE)
    if rec_match:
        rec_date = parse_date_string(rec_match.group(1))
        
    # Payment date
    pay_match = re.search(r"(?:payment\s+date|tanggal\s+pembayaran|dibayarkan)[^0-9]{1,30}" + date_regex, flat_text, re.IGNORECASE)
    if pay_match:
        pay_date = parse_date_string(pay_match.group(1))

    # Announcement date
    ann_match = re.search(r"(?:tanggal\s+pengumuman|diumumkan)[^0-9]{1,30}" + date_regex, flat_text, re.IGNORECASE)
    if ann_match:
        ann_date = parse_date_string(ann_match.group(1))

    # If cum date is missing but ex date is there, ex-1 is cum date
    if not cum_date and ex_date:
        # In general, cum is 1 trading day before ex. For simplicity, we can guess ex - 1 calendar day
        # Parser warning will flag this
        pass

    warnings = []
    if not cum_date:
        warnings.append("Tanggal Cum Date tidak ditemukan.")
    if not ex_date:
        warnings.append("Tanggal Ex Date tidak ditemukan.")
    if dps <= 0:
        warnings.append("Nilai dividen per lembar tidak valid atau 0.")

    event = DividendEvent(
        id=str(uuid.uuid4()),
        ticker=ticker,
        ticker_yahoo=f"{ticker}.JK",
        company_name=None, # Will be enriched from thesis
        action_type="CASH_DIVIDEND",
        dividend_per_share=dps,
        announcement_date=ann_date,
        cum_date_regular=cum_date,
        ex_date_regular=ex_date,
        recording_date=rec_date,
        payment_date=pay_date,
        source_name=source_name,
        source_url=source_url,
        raw_text=raw_text[:1000] if raw_text else None, # Truncate raw text to save space
        confidence_score=0.0,
        verification_status="collected",
        parser_warnings=warnings
    )
    
    event.confidence_score = calculate_confidence(event)
    events.append(event)
    return events
