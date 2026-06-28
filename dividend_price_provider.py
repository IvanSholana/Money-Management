import pandas as pd
import numpy as np
from datetime import datetime
from typing import Any, Dict, Optional, Tuple
import backtest

def normalize_ticker_yahoo(ticker: str) -> str:
    cleaned = ticker.strip().upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
    return cleaned

def fetch_price_metrics(ticker: str, announcement_date: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], Optional[pd.DataFrame], str]:
    """
    Downloads historical data for the ticker and computes technical indicators.
    Returns: (metrics_dict, full_dataframe, warning_message)
    """
    symbol = normalize_ticker_yahoo(ticker)
    
    # 1. Download price history (1 year daily data)
    df, has_adj, warning_msg = backtest.fetch_raw_yahoo_history(symbol, range_val="1y")
    
    if df.empty or len(df) < 50:
        return None, None, f"Data harga tidak cukup untuk {symbol} (minimal 50 hari perdagangan)."

    # The returned df has Open, High, Low, Close, Volume, and Date (integer timestamp)
    # Let's ensure columns are floats and calculate indicators
    df["Close"] = df["Close"].astype(float)
    df["Open"] = df["Open"].astype(float)
    df["High"] = df["High"].astype(float)
    df["Low"] = df["Low"].astype(float)
    df["Volume"] = df["Volume"].astype(float)

    # 2. Compute Moving Averages
    df["MA5"] = df["Close"].rolling(window=5).mean()
    df["MA20"] = df["Close"].rolling(window=20).mean()
    df["MA50"] = df["Close"].rolling(window=50).mean()
    df["VolMA20"] = df["Volume"].rolling(window=20).mean()

    # 3. Get latest values
    last_row = df.iloc[-1]
    current_price = float(last_row["Close"])
    ma5 = float(last_row["MA5"]) if not pd.isna(last_row["MA5"]) else current_price
    ma20 = float(last_row["MA20"]) if not pd.isna(last_row["MA20"]) else current_price
    ma50 = float(last_row["MA50"]) if not pd.isna(last_row["MA50"]) else current_price
    
    vol_avg_20d = float(last_row["VolMA20"]) if not pd.isna(last_row["VolMA20"]) else 1.0
    latest_volume = float(last_row["Volume"])
    volume_ratio = latest_volume / vol_avg_20d if vol_avg_20d > 0 else 1.0

    # 4. Compute price returns
    price_return_5d = 0.0
    if len(df) >= 6:
        price_5d_ago = float(df["Close"].iloc[-6])
        if price_5d_ago > 0:
            price_return_5d = (current_price - price_5d_ago) / price_5d_ago

    price_return_10d = 0.0
    if len(df) >= 11:
        price_10d_ago = float(df["Close"].iloc[-11])
        if price_10d_ago > 0:
            price_return_10d = (current_price - price_10d_ago) / price_10d_ago

    # 5. Price return since announcement
    price_return_since_announcement = 0.0
    if announcement_date:
        try:
            # Date in df is unix timestamps. Let's convert announcement_date (YYYY-MM-DD) to timestamp.
            ann_dt = datetime.strptime(announcement_date, "%Y-%m-%d")
            # Find the row closest to the announcement date
            # Convert df['Date'] to datetime objects
            df_dates = pd.to_datetime(df["Date"], unit="s")
            
            # Find index of closest date
            closest_idx = (df_dates - ann_dt).abs().idxmin()
            ann_row = df.loc[closest_idx]
            ann_price = float(ann_row["Close"])
            
            # Verify the closest date is within a reasonable range (e.g. 5 days)
            diff_days = abs((df_dates.loc[closest_idx] - ann_dt).days)
            if diff_days <= 5 and ann_price > 0:
                price_return_since_announcement = (current_price - ann_price) / ann_price
        except Exception as e:
            print(f"Error calculating return since announcement for {ticker}: {e}")

    metrics = {
        "current_price": current_price,
        "ma5": ma5,
        "ma20": ma20,
        "ma50": ma50,
        "volume_avg_20d": vol_avg_20d,
        "volume_ratio": volume_ratio,
        "price_return_5d": price_return_5d,
        "price_return_10d": price_return_10d,
        "price_return_since_announcement": price_return_since_announcement
    }

    return metrics, df, warning_msg
