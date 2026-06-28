import re
import json
from bs4 import BeautifulSoup
from typing import Any, Dict, List, Optional, Tuple
from orderbook_schema import OrderBookRow, OrderBookSnapshot
from datetime import datetime, timezone
import idx_tick_size

def parse_number_indonesian(text: str) -> int:
    """
    Parses Indonesian/English number notations into integers.
    Supports formats like:
    - 1.000
    - 1,000
    - 1,2M
    - 1.2M
    - 10K
    - 10 Ribu
    - 1.000 Lot
    """
    if not text:
        return 0
        
    cleaned = text.strip().lower()
    # Remove units and clean spacing
    cleaned = cleaned.replace("lot", "").replace("ribu", "k").replace("shrs", "").replace("shares", "").strip()
    
    factor = 1
    if 'm' in cleaned:
        factor = 1000000
        cleaned = cleaned.replace('m', '')
    elif 'k' in cleaned:
        factor = 1000
        cleaned = cleaned.replace('k', '')
        
    # Standardize decimal/thousand separators
    # Indonesian: 1.000 (thousand) or 1,2 (decimal)
    # English: 1,000 (thousand) or 1.2 (decimal)
    if ',' in cleaned and '.' in cleaned:
        # Mixed: assume dot is thousand, comma is decimal (Indonesian)
        # e.g. 1.250,5 -> 1250.5
        cleaned = cleaned.replace('.', '').replace(',', '.')
    elif ',' in cleaned:
        parts = cleaned.split(',')
        # If the last block has exactly 3 digits, it's likely a thousands separator (e.g. 1,000)
        # Otherwise, treat as decimal separator (e.g. 1,2)
        last_part = parts[-1].strip()
        if len(last_part) == 3 and last_part.isdigit():
            cleaned = cleaned.replace(',', '')
        else:
            cleaned = cleaned.replace(',', '.')
    elif '.' in cleaned:
        parts = cleaned.split('.')
        last_part = parts[-1].strip()
        if len(last_part) == 3 and last_part.isdigit():
            cleaned = cleaned.replace('.', '')
            
    try:
        val = float(cleaned)
        return int(round(val * factor))
    except ValueError:
        return 0

def parse_stockbit_html(html_content: str, ticker: str) -> OrderBookSnapshot:
    """
    Parses Stockbit Symbol Page HTML source and extracts Order Book Snapshot.
    It works defensively using multiple fallback strategies to prevent crashing.
    """
    warnings: List[str] = []
    
    if not html_content:
        return OrderBookSnapshot(
            ticker=ticker,
            page_url=f"https://stockbit.com/symbol/{ticker}",
            read_confidence=0.0,
            parser_warnings=["HTML content kosong."]
        )
        
    soup = BeautifulSoup(html_content, "html.parser")
    
    # 1. Try to extract last price
    last_price: Optional[int] = None
    
    # Look for last price classes (e.g. symbol-price, price, text-2xl, etc.)
    price_selectors = [
        ".symbol-price", ".price-last", ".stock-price", 
        "span[class*='price']", "div[class*='price']", 
        "h1[class*='price']", "h2[class*='price']"
    ]
    for selector in price_selectors:
        element = soup.select_one(selector)
        if element:
            txt = element.get_text(strip=True)
            # Find the first sequence of numbers (with dot/comma)
            match = re.search(r"[\d\.,]+", txt)
            if match:
                price_val = parse_number_indonesian(match.group(0))
                if price_val > 0:
                    last_price = price_val
                    break
                    
    # 2. Extract Bid and Offer tables
    # Stockbit typically presents bids and asks in a grid or table.
    # We will search for all table rows and try to detect the bid/ask layout.
    bid_rows: List[OrderBookRow] = []
    offer_rows: List[OrderBookRow] = []
    
    # Let's inspect the tables
    tables = soup.find_all("table")
    orderbook_rows = []
    
    # Also search for table-like div layouts if no table found
    if not tables:
        # Fallback to row divs
        row_divs = soup.find_all("div", class_=re.compile(r"row|grid|item|book", re.I))
        # Filter divs containing numeric data
        for div in row_divs:
            # We look for children that could represent order book columns
            spans = div.find_all(["span", "div"], recursive=False)
            if len(spans) >= 4:
                txts = [s.get_text(strip=True) for s in spans]
                orderbook_rows.append(txts)
    else:
        # Extract rows from tables
        for table in tables:
            rows = table.find_all("tr")
            for r in rows:
                cols = r.find_all(["td", "th"])
                if len(cols) >= 4:
                    txts = [c.get_text(strip=True) for c in cols]
                    orderbook_rows.append(txts)
                    
    # Parse rows: We assume standard order book structure:
    # Column indices could be:
    # [Bid Vol, Bid Price, Offer Price, Offer Vol] (4 columns)
    # [Bid Queue Count, Bid Vol, Bid Price, Offer Price, Offer Vol, Offer Queue Count] (6 columns)
    for row in orderbook_rows:
        try:
            # Skip rows containing no digits at all (typically table headers)
            row_str = " ".join(row).lower()
            if not any(c.isdigit() for c in row_str):
                continue
                
            cells = [c.strip() for c in row if c.strip()]
            if len(cells) == 4:
                bid_vol = parse_number_indonesian(cells[0])
                bid_price = parse_number_indonesian(cells[1])
                offer_price = parse_number_indonesian(cells[2])
                offer_vol = parse_number_indonesian(cells[3])
                
                if bid_price > 0:
                    bid_rows.append(OrderBookRow(price=bid_price, volume=bid_vol, raw_text=cells[1]))
                if offer_price > 0:
                    offer_rows.append(OrderBookRow(price=offer_price, volume=offer_vol, raw_text=cells[2]))
            elif len(cells) >= 6:
                # 6 column layout: [bid_count, bid_vol, bid_price, offer_price, offer_vol, offer_count]
                bid_vol = parse_number_indonesian(cells[1])
                bid_price = parse_number_indonesian(cells[2])
                offer_price = parse_number_indonesian(cells[3])
                offer_vol = parse_number_indonesian(cells[4])
                
                if bid_price > 0:
                    bid_rows.append(OrderBookRow(price=bid_price, volume=bid_vol, raw_text=cells[2]))
                if offer_price > 0:
                    offer_rows.append(OrderBookRow(price=offer_price, volume=offer_vol, raw_text=cells[3]))
        except Exception as e:
            warnings.append(f"Gagal memproses baris orderbook: {e}")
            
    # Deduplicate and sort rows
    # Bids sorted descending (highest price first)
    # Offers sorted ascending (lowest price first)
    bid_rows = sorted({r.price: r for r in bid_rows if r.price > 0}.values(), key=lambda x: x.price, reverse=True)
    offer_rows = sorted({r.price: r for r in offer_rows if r.price > 0}.values(), key=lambda x: x.price)
    
    best_bid_price = bid_rows[0].price if bid_rows else None
    best_offer_price = offer_rows[0].price if offer_rows else None
    
    # Calculate spread
    spread_ticks: Optional[int] = None
    spread_percent: Optional[float] = None
    if best_bid_price and best_offer_price:
        spread_ticks = idx_tick_size.calculate_spread_ticks(best_bid_price, best_offer_price)
        spread_percent = ((best_offer_price - best_bid_price) / best_bid_price) * 100
        
    # Fallback last_price if not found earlier
    if not last_price and best_bid_price and best_offer_price:
        last_price = int((best_bid_price + best_offer_price) / 2)
        warnings.append("Last price tidak ditemukan, menggunakan nilai tengah best bid & offer.")
        
    # Calculate read confidence
    # Standard top 5/top 10 rows check
    confidence = 0.0
    if last_price:
        confidence += 30.0
    if best_bid_price and best_offer_price:
        confidence += 30.0
        
    # Add confidence based on row completeness
    num_rows = len(bid_rows) + len(offer_rows)
    if num_rows >= 10:
        confidence += 40.0
    elif num_rows >= 4:
        confidence += 20.0
    else:
        confidence += 5.0
        warnings.append(f"Data orderbook tipis atau tidak lengkap. Hanya terdeteksi {num_rows} baris.")
        
    # If no data found, return failure
    if not bid_rows or not offer_rows:
        confidence = 10.0
        warnings.append("Data Bid/Offer kosong atau tidak terdeteksi.")
        
    timestamp_read = datetime.now(timezone.utc).isoformat()
    
    return OrderBookSnapshot(
        ticker=ticker,
        page_url=f"https://stockbit.com/symbol/{ticker}",
        last_price=last_price,
        best_bid_price=best_bid_price,
        best_offer_price=best_offer_price,
        spread_ticks=spread_ticks,
        spread_percent=spread_percent,
        bid_rows=bid_rows,
        offer_rows=offer_rows,
        timestamp_read=timestamp_read,
        read_confidence=confidence,
        parser_warnings=warnings
    )
