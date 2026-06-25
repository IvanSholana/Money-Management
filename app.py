from __future__ import annotations

import json
import sqlite3
import urllib.request
import urllib.parse
import threading
import time
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, Response, g, jsonify, request

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from kneed import KneeLocator
import backtest
import batch_screener
import fundamental_service
import signal_engine


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "money_management.db"
APP_STATE_KEY = "monthly-cashflow-tracker-v1"

app = Flask(__name__)

auto_scan_state = {
    "is_running": False,
    "total": 0,
    "current": 0,
    "current_ticker": "",
    "last_run_time": None
}
auto_scan_lock = threading.Lock()

def update_auto_scan_state(**kwargs):
    with auto_scan_lock:
        auto_scan_state.update(kwargs)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_error: Exception | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def get_thesis_for_symbol(symbol: str) -> tuple[list[dict], str, str]:
    cleaned_sym = symbol.strip().upper()
    base_sym = cleaned_sym.replace(".JK", "")
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT data FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
        conn.close()
        if row:
            state_data = json.loads(row["data"])
            theses = state_data.get("theses", [])
            for thesis in theses:
                t_sym = thesis.get("ticker", "").strip().upper()
                if t_sym == cleaned_sym or t_sym == base_sym:
                    metrics = thesis.get("fundamentalMetrics", [])
                    sector = thesis.get("sector") or "Lainnya"
                    syariah_status = thesis.get("syariahStatus") or "Not Checked"
                    return metrics, sector, syariah_status
    except Exception as e:
        print(f"Error fetching thesis for {symbol}: {e}")
    return [], "Lainnya", "Not Checked"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auto_scan_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            price REAL NOT NULL,
            change_percent REAL NOT NULL,
            market_regime TEXT NOT NULL,
            algo_signal TEXT NOT NULL,
            score REAL NOT NULL,
            gemini_recommendation TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    fundamental_service.init_fundamental_cache(db)
    db.commit()


@app.before_request
def ensure_database() -> None:
    init_db()


@app.after_request
def add_local_api_headers(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, OPTIONS"
    return response


@app.get("/api/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok", "database": str(DB_PATH)}, 200


@app.get("/api/data")
def get_data() -> tuple[Any, int]:
    row = get_db().execute("SELECT data, updated_at FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
    if row is None:
        return jsonify({"exists": False, "data": None, "updatedAt": None}), 200

    try:
        data = json.loads(row["data"])
    except json.JSONDecodeError:
        data = None
    return jsonify({"exists": True, "data": data, "updatedAt": row["updated_at"]}), 200


@app.put("/api/data")
def save_data() -> tuple[dict[str, Any], int]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "Payload JSON tidak valid."}, 400

    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    timestamp = now_iso()
    db = get_db()
    db.execute(
        """
        INSERT INTO app_state (key, data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        """,
        (APP_STATE_KEY, serialized, timestamp, timestamp),
    )
    db.commit()
    return {"ok": True, "updatedAt": timestamp}, 200


@app.route("/api/data", methods=["OPTIONS"])
def data_options() -> tuple[str, int]:
    return "", 204


def _fetch_yahoo_data_direct(symbol: str) -> dict[str, Any]:
    try:
        # 1. Fetch Search (for long name & sector)
        search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(symbol)}"
        req1 = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        name = symbol
        sector = "Lainnya"
        
        try:
            with urllib.request.urlopen(req1, timeout=5) as response:
                search_data = json.loads(response.read().decode())
                if search_data.get("quotes"):
                    q = search_data["quotes"][0]
                    name = q.get("longname") or q.get("shortname") or symbol
                    sector = q.get("sector") or "Lainnya"
        except Exception:
            pass

        # 2. Fetch Chart (for price & currency)
        chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?interval=1d&range=1d"
        req2 = urllib.request.Request(chart_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        
        price = 0.0
        prev_close = 0.0
        currency = "USD"
        
        with urllib.request.urlopen(req2, timeout=5) as response:
            chart_data = json.loads(response.read().decode())
            if chart_data.get("chart", {}).get("result"):
                meta = chart_data["chart"]["result"][0]["meta"]
                price = meta.get("regularMarketPrice", 0.0)
                prev_close = meta.get("previousClose") or meta.get("chartPreviousClose") or 0.0
                currency = meta.get("currency", "USD")

        return {
            "symbol": symbol,
            "name": name,
            "price": price,
            "prevClose": prev_close,
            "sector": sector,
            "currency": currency,
            "success": True
        }
    except Exception as e:
        return {
            "symbol": symbol,
            "success": False,
            "error": str(e)
        }


def fetch_yahoo_data(symbol: str) -> dict[str, Any]:
    cleaned = symbol.strip().upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
    return _fetch_yahoo_data_direct(cleaned)


@app.get("/api/yahoo/quote")
def get_yahoo_quote() -> tuple[Any, int]:
    symbol = request.args.get("symbol", "").strip()
    if not symbol:
        return jsonify({"error": "Symbol parameter wajib diisi."}), 400
    
    res = fetch_yahoo_data(symbol)
    if not res.get("success"):
        return jsonify(res), 500
    return jsonify(res), 200


@app.route("/api/yahoo/sync", methods=["POST", "OPTIONS"])
def sync_yahoo_quotes() -> tuple[Any, int] | Response:
    if request.method == "OPTIONS":
        return "", 204
        
    payload = request.get_json(silent=True) or {}
    symbols = payload.get("symbols")
    if not symbols or not isinstance(symbols, list):
        return jsonify({"error": "Payload symbols harus berupa array."}), 400
    
    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_yahoo_data, sym): sym for sym in symbols}
        for future in futures:
            res = future.result()
            if res.get("success"):
                results[res["symbol"]] = {
                    "price": res["price"],
                    "prevClose": res["prevClose"],
                    "name": res["name"],
                    "sector": res["sector"],
                    "currency": res["currency"]
                }
            else:
                results[res["symbol"]] = None

    return jsonify({"quotes": results}), 200


# ==========================================
# TECHNICAL ANALYSIS & SCANNER ENGINES
# ==========================================

def calculate_sma(prices: list[float], period: int) -> list[float]:
    if not prices:
        return []
    sma_vals = []
    for i in range(len(prices)):
        if i < period - 1:
            sma_vals.append(prices[i])
        else:
            sma_vals.append(sum(prices[i - period + 1 : i + 1]) / period)
    return sma_vals


def calculate_ema(prices: list[float], period: int) -> list[float]:
    if not prices:
        return []
    ema_vals = []
    multiplier = 2.0 / (period + 1.0)
    sma_seed = sum(prices[:period]) / period if len(prices) >= period else prices[0]
    
    for i in range(len(prices)):
        if i < period - 1:
            ema_vals.append(prices[i])
        elif i == period - 1:
            ema_vals.append(sma_seed)
        else:
            val = (prices[i] - ema_vals[-1]) * multiplier + ema_vals[-1]
            ema_vals.append(val)
    return ema_vals


def calculate_rsi(prices: list[float], period: int = 14) -> list[float]:
    if len(prices) <= period:
        return [50.0] * len(prices)
    
    rsi_vals = [50.0] * len(prices)
    gains = []
    losses = []
    
    for i in range(1, len(prices)):
        diff = prices[i] - prices[i-1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))
        
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    if avg_loss == 0.0:
        rsi_vals[period] = 100.0 if avg_gain > 0.0 else 50.0
    else:
        rs = avg_gain / avg_loss
        rsi_vals[period] = 100.0 - (100.0 / (1.0 + rs))
        
    for i in range(period + 1, len(prices)):
        current_gain = gains[i-1]
        current_loss = losses[i-1]
        avg_gain = (avg_gain * (period - 1) + current_gain) / period
        avg_loss = (avg_loss * (period - 1) + current_loss) / period
        
        if avg_loss == 0.0:
            rsi_vals[i] = 100.0 if avg_gain > 0.0 else 50.0
        else:
            rs = avg_gain / avg_loss
            rsi_vals[i] = 100.0 - (100.0 / (1.0 + rs))
            
    first_valid = rsi_vals[period]
    for i in range(period):
        rsi_vals[i] = first_valid
        
    return rsi_vals


def calculate_macd(prices: list[float]) -> tuple[list[float], list[float], list[float]]:
    if len(prices) < 26:
        return [0.0] * len(prices), [0.0] * len(prices), [0.0] * len(prices)
        
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    
    macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
    signal_line = calculate_ema(macd_line, 9)
    hist = [m - s for m, s in zip(macd_line, signal_line)]
    
    return macd_line, signal_line, hist


def calculate_volume_profile_and_kmeans(df: pd.DataFrame, num_bins: int = 50) -> dict[str, Any]:
    price_min = float(df['Low'].min())
    price_max = float(df['High'].max())
    if price_max == price_min:
        price_max = price_min + 1.0
        
    bin_size = (price_max - price_min) / num_bins
    price_bins = np.arange(price_min, price_max + bin_size, bin_size)
    vol_profile = np.zeros(len(price_bins) - 1)
    
    for _, row in df.iterrows():
        low_idx = int((row['Low'] - price_min) / bin_size)
        high_idx = int((row['High'] - price_min) / bin_size)
        
        low_idx = max(0, min(low_idx, len(vol_profile) - 1))
        high_idx = max(0, min(high_idx, len(vol_profile) - 1))
        
        if high_idx == low_idx:
            vol_profile[low_idx] += row['Volume']
        else:
            vol_per_bin = row['Volume'] / (high_idx - low_idx + 1)
            for i in range(low_idx, high_idx + 1):
                if i < len(vol_profile):
                    vol_profile[i] += vol_per_bin

    poc_idx = np.argmax(vol_profile)
    poc_price = float((price_bins[poc_idx] + price_bins[poc_idx+1]) / 2)
    
    # K-Means S&R Clustering
    prices = df['Close'].values.reshape(-1, 1)
    sr_levels = []
    
    try:
        K_range = range(2, min(10, len(prices)))
        if len(K_range) >= 2:
            sum_of_squared_distances = []
            for k in K_range:
                km = KMeans(n_clusters=k, random_state=42, n_init=10)
                km.fit(prices)
                sum_of_squared_distances.append(km.inertia_)
                
            kn = KneeLocator(K_range, sum_of_squared_distances, curve="convex", direction="decreasing")
            optimal_k = kn.knee if kn.knee else 5
            if optimal_k >= len(prices):
                optimal_k = max(2, len(prices) - 1)
                
            kmeans = KMeans(n_clusters=optimal_k, random_state=42, n_init=10)
            clusters = kmeans.fit_predict(prices)
            
            for i in range(optimal_k):
                cluster_prices = prices[clusters == i]
                if len(cluster_prices) > 0:
                    cluster_max = float(cluster_prices.max())
                    cluster_min = float(cluster_prices.min())
                    sr_levels.append({'support': cluster_min, 'resistance': cluster_max})
    except Exception as e:
        print("Error during K-Means S&R clustering:", e)
        sr_levels = [{'support': price_min, 'resistance': price_max}]
        
    if not sr_levels:
        sr_levels = [{'support': price_min, 'resistance': price_max}]
        
    return {
        'poc': poc_price,
        'volume_profile': list(zip(price_bins[:-1], vol_profile)),
        'kmeans_levels': sr_levels
    }


def calculate_atr_and_trailing_stop(df: pd.DataFrame, period: int = 14, multiplier: float = 3.0) -> pd.DataFrame:
    df['prev_close'] = df['Close'].shift(1)
    df['tr0'] = (df['High'] - df['Low']).abs()
    df['tr1'] = (df['High'] - df['prev_close']).abs()
    df['tr2'] = (df['Low'] - df['prev_close']).abs()
    df['TR'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
    
    # Wilder's Smoothing (alpha=1/period)
    df['ATR'] = df['TR'].ewm(alpha=1/period, adjust=False).mean()
    
    # Basic stop
    df['basic_stop'] = df['Close'] - (multiplier * df['ATR'])
    
    # Ratchet Trailing Stop
    trailing_stops = []
    if len(df) > 0:
        current_ts = df['basic_stop'].iloc[0]
        trailing_stops.append(current_ts)
        
        for i in range(1, len(df)):
            prev_close = df['Close'].iloc[i-1]
            prev_stop = trailing_stops[-1]
            basic_stop = df['basic_stop'].iloc[i]
            
            if prev_close > prev_stop:
                current_ts = max(basic_stop, prev_stop)
            else:
                current_ts = basic_stop
            trailing_stops.append(current_ts)
    df['trailing_stop'] = trailing_stops
    return df


def calculate_adx(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    df['up_move'] = df['High'] - df['High'].shift(1)
    df['down_move'] = df['Low'].shift(1) - df['Low']
    
    df['plus_dm'] = np.where((df['up_move'] > df['down_move']) & (df['up_move'] > 0), df['up_move'], 0.0)
    df['minus_dm'] = np.where((df['down_move'] > df['up_move']) & (df['down_move'] > 0), df['down_move'], 0.0)
    
    df['TR_smooth'] = df['TR'].ewm(alpha=1/period, adjust=False).mean()
    tr_smooth = np.where(df['TR_smooth'] == 0, 1.0, df['TR_smooth'])
    df['plus_di'] = 100 * (df['plus_dm'].ewm(alpha=1/period, adjust=False).mean() / tr_smooth)
    df['minus_di'] = 100 * (df['minus_dm'].ewm(alpha=1/period, adjust=False).mean() / tr_smooth)
    
    di_sum = df['plus_di'] + df['minus_di']
    df['DX'] = 100 * (abs(df['plus_di'] - df['minus_di']) / np.where(di_sum == 0, 1.0, di_sum))
    df['ADX'] = df['DX'].ewm(alpha=1/period, adjust=False).mean()
    return df


def calculate_bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    df['bb_mid'] = df['Close'].rolling(window=period).mean()
    df['bb_std'] = df['Close'].rolling(window=period).std()
    df['bb_upper'] = df['bb_mid'] + (std_dev * df['bb_std'])
    df['bb_lower'] = df['bb_mid'] - (std_dev * df['bb_std'])
    
    df['bb_mid'] = df['bb_mid'].fillna(df['Close'])
    df['bb_upper'] = df['bb_upper'].fillna(df['Close'])
    df['bb_lower'] = df['bb_lower'].fillna(df['Close'])
    df['bb_bandwidth'] = (df['bb_upper'] - df['bb_lower']) / np.where(df['bb_mid'] == 0, 1.0, df['bb_mid'])
    return df


def calculate_stochastic(df: pd.DataFrame, period: int = 14, smooth_k: int = 3) -> pd.DataFrame:
    df['lowest_low'] = df['Low'].rolling(window=period).min()
    df['highest_high'] = df['High'].rolling(window=period).max()
    df['lowest_low'] = df['lowest_low'].fillna(df['Low'])
    df['highest_high'] = df['highest_high'].fillna(df['High'])
    
    range_hl = df['highest_high'] - df['lowest_low']
    df['%K'] = 100 * ((df['Close'] - df['lowest_low']) / np.where(range_hl == 0, 1.0, range_hl))
    df['%D'] = df['%K'].rolling(window=smooth_k).mean().fillna(df['%K'])
    return df


def get_macro_data(stock_df: pd.DataFrame) -> tuple[float, float]:
    vix_val = 15.0
    correlation_val = 0.5
    
    try:
        # Fetch S&P 500 (^GSPC)
        gspc_url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1y"
        req_gspc = urllib.request.Request(gspc_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_gspc, timeout=5) as response:
            gspc_data = json.loads(response.read().decode())
            if gspc_data.get("chart", {}).get("result"):
                gspc_res = gspc_data["chart"]["result"][0]
                gspc_ts = gspc_res.get("timestamp", [])
                gspc_close = gspc_res.get("indicators", {}).get("quote", [{}])[0].get("close", [])
                
                s_ts = pd.to_datetime(stock_df['Date'], unit='s')
                stock_dates = s_ts.dt.date if hasattr(s_ts, 'dt') else s_ts.date
                g_ts = pd.to_datetime(gspc_ts, unit='s')
                gspc_dates = g_ts.dt.date if hasattr(g_ts, 'dt') else g_ts.date
                
                df_stock = pd.DataFrame({'Close_Stock': stock_df['Close'].values}, index=stock_dates)
                df_gspc = pd.DataFrame({'Close_GSPC': gspc_close}, index=gspc_dates)
                
                merged = pd.merge(df_stock, df_gspc, left_index=True, right_index=True, how='inner')
                if len(merged) > 10:
                    daily_returns = merged.pct_change().dropna()
                    if len(daily_returns) > 10:
                        correlation_val = float(
                            daily_returns["Close_Stock"].corr(daily_returns["Close_GSPC"])
                        )
    except Exception as e:
        print("Error getting S&P 500 correlation:", e)
        
    try:
        # Fetch VIX (^VIX)
        vix_url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d"
        req_vix = urllib.request.Request(vix_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_vix, timeout=5) as response:
            vix_data = json.loads(response.read().decode())
            if vix_data.get("chart", {}).get("result"):
                vix_res = vix_data["chart"]["result"][0]
                vix_val = float(vix_res.get("meta", {}).get("regularMarketPrice", 15.0))
    except Exception as e:
        print("Error getting VIX:", e)
        
    if np.isnan(correlation_val) or np.isinf(correlation_val):
        correlation_val = 0.5
    if np.isnan(vix_val) or np.isinf(vix_val):
        vix_val = 15.0
        
    return correlation_val, vix_val


def get_stable_fallback(symbol: str, error_msg: str, include_signal: bool) -> dict[str, Any]:
    cleaned = symbol.strip().upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
        
    fallback = {
        "symbol": cleaned,
        "name": cleaned,
        "price": 0.0,
        "prevClose": 0.0,
        "changePercent": 0.0,
        "currency": "IDR" if cleaned.endswith(".JK") else "USD",
        "sector": "Lainnya",
        "success": False,
        "error": error_msg,
        "warnings": [error_msg],
        "chartPoints": []
    }
    
    if include_signal:
        fallback.update({
            "rsi": 50.0,
            "macd": {"macd": 0.0, "signal": 0.0, "hist": 0.0},
            "sma50": 0.0,
            "sma200": 0.0,
            "supports": [],
            "resistances": [],
            "nearestSupport": None,
            "nearestResistance": None,
            "poc": 0.0,
            "volumeProfile": [],
            "kmeansLevels": [],
            "adx": 0.0,
            "plusDi": 0.0,
            "minusDi": 0.0,
            "stochasticK": 50.0,
            "stochasticD": 50.0,
            "bbUpper": 0.0,
            "bbLower": 0.0,
            "bbMid": 0.0,
            "atr": 0.0,
            "trailingStop": 0.0,
            "vix": 15.0,
            "sp500Correlation": 0.5,
            "marketRegime": "Lainnya",
            "algoSignal": "HOLD",
            "algoReason": f"Gagal memproses sinyal: {error_msg}"
        })
    return fallback


def _fetch_yahoo_history_direct(
    symbol: str, 
    range_val: str = "1y", 
    include_signal: bool = False, 
    syariah_only: bool = False
) -> dict[str, Any]:
    try:
        # 1. Fetch search for company info (sector, long name)
        search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(symbol)}"
        req1 = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        name = symbol
        sector = "Lainnya"
        try:
            with urllib.request.urlopen(req1, timeout=5) as response:
                search_data = json.loads(response.read().decode())
                if search_data.get("quotes"):
                    q = search_data["quotes"][0]
                    name = q.get("longname") or q.get("shortname") or symbol
                    sector = q.get("sector") or "Lainnya"
        except Exception:
            pass

        # 2. Fetch history chart
        chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?interval=1d&range={range_val}"
        req2 = urllib.request.Request(chart_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        
        with urllib.request.urlopen(req2, timeout=5) as response:
            chart_data = json.loads(response.read().decode())
            if not chart_data.get("chart", {}).get("result"):
                return get_stable_fallback(symbol, "No chart data found from Yahoo Finance.", include_signal)
                
            res = chart_data["chart"]["result"][0]
            meta = res.get("meta", {})
            currency = meta.get("currency", "USD")
            
            timestamps = res.get("timestamp", [])
            quotes = res.get("indicators", {}).get("quote", [{}])[0]
            raw_close = quotes.get("close", [])
            raw_open = quotes.get("open", [])
            raw_high = quotes.get("high", [])
            raw_low = quotes.get("low", [])
            raw_volume = quotes.get("volume", [])
            
            # Check for adjusted close
            adj_close = []
            has_adj = False
            adj_indicators = res.get("indicators", {}).get("adjclose")
            if adj_indicators and len(adj_indicators) > 0:
                adj_close = adj_indicators[0].get("adjclose", [])
                if len(adj_close) == len(raw_close):
                    has_adj = True
                    
            clean_ts = []
            clean_open = []
            clean_high = []
            clean_low = []
            clean_close = []
            clean_volume = []
            
            mismatch_found = False
            for i in range(len(timestamps)):
                c = raw_close[i] if i < len(raw_close) else None
                o = raw_open[i] if i < len(raw_open) else None
                h = raw_high[i] if i < len(raw_high) else None
                l = raw_low[i] if i < len(raw_low) else None
                v = raw_volume[i] if i < len(raw_volume) else None
                
                if c is None or o is None or h is None or l is None:
                    continue
                clean_ts.append(timestamps[i])
                clean_open.append(float(o))
                clean_high.append(float(h))
                clean_low.append(float(l))
                clean_close.append(float(c))
                clean_volume.append(int(v) if v is not None else 0)
                
                if has_adj and adj_close[i] is not None:
                    if abs(float(c) - float(adj_close[i])) > 0.01:
                        mismatch_found = True
                        
            if not clean_close or len(clean_close) < 26:
                return get_stable_fallback(symbol, "Insufficient price history returned (need at least 26 trading days).", include_signal)
                
            price = clean_close[-1]
            prev_close = meta.get("previousClose") or (clean_close[-2] if len(clean_close) > 1 else price)
            change_pct = ((price - prev_close) / prev_close) * 100 if prev_close else 0.0
            
            # Build DataFrame
            df = pd.DataFrame({
                "Date": clean_ts,
                "Open": clean_open,
                "High": clean_high,
                "Low": clean_low,
                "Close": clean_close,
                "Volume": clean_volume
            })
            
            warnings = []
            if mismatch_found:
                warnings.append(
                    "WARNING: Detected difference between close price and adjusted close price. "
                    "This indicates corporate actions (splits, dividends) occurred in this period. "
                    "Since standard calculations use unadjusted closes, backtest results may have anomalies."
                )
            elif not has_adj:
                warnings.append("WARNING: Adjusted close price data not available. Historical split adjustments cannot be verified.")
                
            # If include_signal is True, run the heavy technical indicators and quant screening
            if include_signal:
                # Fetch database theses details
                thesis_metrics, db_sector, syariah_status = get_thesis_for_symbol(symbol)
                
                # Resolve fundamental metrics using yfinance cache or live fetch if necessary
                snapshot = fundamental_service.read_cached_snapshot(DB_PATH, symbol)
                if (
                    not snapshot
                    or snapshot.get("freshness") != "fresh"
                    or snapshot.get("source") != "yfinance"
                ):
                    snapshot = None
                    try:
                        snapshot = fundamental_service.fetch_yfinance_snapshot(DB_PATH, symbol)
                    except Exception as exc:
                        print(f"Yahoo fundamental fallback failed for {symbol}: {exc}")

                if snapshot and snapshot.get("metrics"):
                    fundamental_metrics = snapshot["metrics"]
                elif thesis_metrics:
                    fundamental_metrics = thesis_metrics
                else:
                    fundamental_metrics = []
                
                # Execute quantitative screening
                quant_res = signal_engine.run_quant_screening(
                    df=df,
                    fundamental_metrics=fundamental_metrics,
                    ticker=symbol,
                    sector=db_sector,
                    syariah_only=syariah_only,
                    syariah_status=syariah_status
                )
                
                # Add technical warnings
                for w in quant_res.get("warnings", []):
                    if w not in warnings:
                        warnings.append(str(w))
                        
                # Precalculate indicators for chartPoints
                macd_line, signal_line, hist = signal_engine.calculate_macd(df['Close'])
                rsi = signal_engine.calculate_rsi(df['Close'])
                adx, plus_di, minus_di = signal_engine.calculate_adx(df)
                upper, middle, lower, bandwidth = signal_engine.calculate_bollinger_bands(df['Close'])
                pct_k, pct_d = signal_engine.calculate_stochastic(df)
                atr, trailing_stop = signal_engine.calculate_atr_and_trailing_stop(df)
                poc_price, kmeans_levels = signal_engine.calculate_volume_profile_and_kmeans(df, lookback=150)
                
                correlation_val, vix_val = get_macro_data(df)
                
                # Nearest support & resistance
                nearest_support = None
                for s in sorted([x['support'] for x in kmeans_levels], reverse=True):
                    if s < price:
                        nearest_support = s
                        break
                if nearest_support is None and kmeans_levels:
                    nearest_support = min([x['support'] for x in kmeans_levels])
                    
                nearest_resistance = None
                for r in sorted([x['resistance'] for x in kmeans_levels]):
                    if r > price:
                        nearest_resistance = r
                        break
                if nearest_resistance is None and kmeans_levels:
                    nearest_resistance = max([x['resistance'] for x in kmeans_levels])
                    
                # Format historical chart points (last 90 trading days)
                chart_points = []
                limit = min(90, len(df))
                for i in range(len(df) - limit, len(df)):
                    dt_str = signal_engine.parse_date_safely(df['Date'].iloc[i]).strftime('%Y-%m-%d')
                    chart_points.append({
                        "date": dt_str,
                        "close": float(df['Close'].iloc[i]),
                        "high": float(df['High'].iloc[i]),
                        "low": float(df['Low'].iloc[i]),
                        "rsi": round(float(rsi.iloc[i]), 1) if not rsi.empty else 50.0,
                        "macd": round(float(macd_line.iloc[i]), 2) if not macd_line.empty else 0.0,
                        "macdSignal": round(float(signal_line.iloc[i]), 2) if not signal_line.empty else 0.0,
                        "macdHist": round(float(hist.iloc[i]), 2) if not hist.empty else 0.0,
                        "atr": round(float(atr.iloc[i]), 2) if not atr.empty else 0.0,
                        "trailingStop": round(float(trailing_stop.iloc[i]), 2) if not trailing_stop.empty else 0.0,
                        "bbUpper": round(float(upper.iloc[i]), 2) if not upper.empty else 0.0,
                        "bbLower": round(float(lower.iloc[i]), 2) if not lower.empty else 0.0,
                        "bbMid": round(float(middle.iloc[i]), 2) if not middle.empty else 0.0,
                        "stochK": round(float(pct_k.iloc[i]), 1) if not pct_k.empty else 50.0,
                        "stochD": round(float(pct_d.iloc[i]), 1) if not pct_d.empty else 50.0
                    })
                    
                # Format Volume Profile
                price_min = float(df['Low'].iloc[-150:].min()) if len(df) >= 150 else float(df['Low'].min())
                price_max = float(df['High'].iloc[-150:].max()) if len(df) >= 150 else float(df['High'].max())
                bin_size = (price_max - price_min) / 50 if price_max != price_min else 1.0
                price_bins = np.arange(price_min, price_max + bin_size, bin_size)
                vol_profile = np.zeros(len(price_bins) - 1)
                for idx_row in range(max(0, len(df) - 150), len(df)):
                    row_low = df['Low'].iloc[idx_row]
                    row_high = df['High'].iloc[idx_row]
                    row_vol = df['Volume'].iloc[idx_row]
                    low_idx = int((row_low - price_min) / bin_size) if bin_size else 0
                    high_idx = int((row_high - price_min) / bin_size) if bin_size else 0
                    low_idx = max(0, min(low_idx, len(vol_profile) - 1))
                    high_idx = max(0, min(high_idx, len(vol_profile) - 1))
                    if high_idx == low_idx:
                        vol_profile[low_idx] += row_vol
                    else:
                        vol_per_bin = row_vol / (high_idx - low_idx + 1)
                        for bin_i in range(low_idx, high_idx + 1):
                            if bin_i < len(vol_profile):
                                vol_profile[bin_i] += vol_per_bin
                                
                volume_profile_json = [{"price": float((price_bins[j] + price_bins[j+1]) / 2), "volume": float(vol_profile[j])} for j in range(len(vol_profile))]
                
                return {
                    "symbol": symbol,
                    "name": name,
                    "price": price,
                    "prevClose": prev_close,
                    "changePercent": round(change_pct, 2),
                    "currency": currency,
                    "sector": sector,
                    "rsi": round(float(rsi.iloc[-1]), 1) if not rsi.empty else 50.0,
                    "macd": {
                        "macd": round(float(macd_line.iloc[-1]), 2) if not macd_line.empty else 0.0,
                        "signal": round(float(signal_line.iloc[-1]), 2) if not signal_line.empty else 0.0,
                        "hist": round(float(hist.iloc[-1]), 2) if not hist.empty else 0.0
                    },
                    "sma50": round(float(df['Close'].rolling(50).mean().fillna(price).iloc[-1]), 2),
                    "sma200": round(float(df['Close'].rolling(200).mean().fillna(price).iloc[-1]), 2),
                    "supports": [float(x['support']) for x in kmeans_levels],
                    "resistances": [float(x['resistance']) for x in kmeans_levels],
                    "nearestSupport": nearest_support,
                    "nearestResistance": nearest_resistance,
                    "poc": float(poc_price),
                    "volumeProfile": volume_profile_json,
                    "kmeansLevels": kmeans_levels,
                    "adx": round(float(adx.iloc[-1]), 2) if not adx.empty else 0.0,
                    "plusDi": round(float(plus_di.iloc[-1]), 2) if not plus_di.empty else 0.0,
                    "minusDi": round(float(minus_di.iloc[-1]), 2) if not minus_di.empty else 0.0,
                    "stochasticK": round(float(pct_k.iloc[-1]), 2) if not pct_k.empty else 50.0,
                    "stochasticD": round(float(pct_d.iloc[-1]), 2) if not pct_d.empty else 50.0,
                    "bbUpper": round(float(upper.iloc[-1]), 2) if not upper.empty else 0.0,
                    "bbLower": round(float(lower.iloc[-1]), 2) if not lower.empty else 0.0,
                    "bbMid": round(float(middle.iloc[-1]), 2) if not middle.empty else 0.0,
                    "atr": round(float(atr.iloc[-1]), 2) if not atr.empty else 0.0,
                    "trailingStop": round(float(trailing_stop.iloc[-1]), 2) if not trailing_stop.empty else 0.0,
                    "vix": round(vix_val, 2),
                    "sp500Correlation": round(correlation_val, 2),
                    "marketRegime": quant_res.get("regime", "sideways"),
                    "algoSignal": quant_res.get("final_signal", "HOLD"),
                    "algoReason": quant_res.get("final_reason", ""),
                    "score": quant_res.get("score", 0.0),
                    "confidence": quant_res.get("confidence", "low"),
                    "riskReward": quant_res.get("risk_reward", 0.0),
                    "entryRange": quant_res.get("entry_range", {"low": 0.0, "high": 0.0}),
                    "targetProfit1": quant_res.get("target_profit_1", 0.0),
                    "targetProfit2": quant_res.get("target_profit_2", 0.0),
                    "stopLoss": quant_res.get("stop_loss", 0.0),
                    "fundamentalScore": quant_res.get("fundamental_score", 0.0),
                    "fundamentalStatus": quant_res.get("fundamental_status", "unavailable"),
                    "dataQuality": quant_res.get("data_quality", "error"),
                    "chartPoints": chart_points,
                    "success": True,
                    "warnings": warnings
                }
            else:
                # Lightweight history chart points (last 90 trading days)
                chart_points = []
                limit = min(90, len(df))
                for i in range(len(df) - limit, len(df)):
                    dt_str = signal_engine.parse_date_safely(df['Date'].iloc[i]).strftime('%Y-%m-%d')
                    chart_points.append({
                        "date": dt_str,
                        "close": float(df['Close'].iloc[i]),
                        "high": float(df['High'].iloc[i]),
                        "low": float(df['Low'].iloc[i]),
                        "volume": float(df['Volume'].iloc[i])
                    })
                return {
                    "symbol": symbol,
                    "name": name,
                    "price": price,
                    "prevClose": prev_close,
                    "changePercent": round(change_pct, 2),
                    "currency": currency,
                    "sector": sector,
                    "chartPoints": chart_points,
                    "success": True,
                    "warnings": warnings
                }
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        return get_stable_fallback(symbol, str(e), include_signal)


def fetch_yahoo_history(symbol: str, range_val: str = "1y", include_signal: bool = False, syariah_only: bool = False) -> dict[str, Any]:
    cleaned = symbol.strip().upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
    return _fetch_yahoo_history_direct(cleaned, range_val, include_signal, syariah_only)


def load_batch_screening_data(ticker: str, _syariah_filter: bool) -> dict[str, Any]:
    df, has_adjusted_data, adjusted_warning = backtest.fetch_raw_yahoo_history(ticker, "3y")
    if df.empty:
        return {
            "ticker": ticker,
            "df": df,
            "error": adjusted_warning or "Data OHLCV tidak tersedia.",
        }

    warnings = [adjusted_warning] if adjusted_warning else []
    thesis_metrics, sector, syariah_status = get_thesis_for_symbol(ticker)
    settings_conn = sqlite3.connect(DB_PATH)
    settings_conn.row_factory = sqlite3.Row
    state_row = settings_conn.execute(
        "SELECT data FROM app_state WHERE key = ?",
        (APP_STATE_KEY,),
    ).fetchone()
    settings_conn.close()
    app_data = json.loads(state_row["data"]) if state_row else {}
    settings = app_data.get("settings", {})
    snapshot = fundamental_service.read_cached_snapshot(DB_PATH, ticker)
    if (
        not snapshot
        or snapshot.get("freshness") != "fresh"
        or snapshot.get("source") != "yfinance"
    ):
        snapshot = None
        try:
            snapshot = fundamental_service.fetch_yfinance_snapshot(DB_PATH, ticker)
        except Exception as exc:
            warnings.append(f"Yahoo fundamental gagal: {exc}")

    if snapshot and snapshot.get("metrics"):
        fundamental_metrics = snapshot["metrics"]
        fundamental_source = snapshot.get("source", "twelve_data")
        fundamental_as_of = snapshot.get("as_of")
        fundamental_freshness = snapshot.get("freshness", "fresh")
        warnings.extend(snapshot.get("warnings", []))
    elif thesis_metrics:
        fundamental_metrics = thesis_metrics
        fundamental_source = "thesis"
        fundamental_as_of = max(
            (str(metric.get("year", "")) for metric in thesis_metrics),
            default=None,
        )
        fundamental_freshness = "manual"
    else:
        fundamental_metrics = []
        fundamental_source = "unavailable"
        fundamental_as_of = None
        fundamental_freshness = "unavailable"
        warnings.append(
            "Fundamental otomatis Yahoo tidak tersedia; scanner memakai teknikal tanpa hard block fundamental."
        )
    return {
        "ticker": ticker,
        "df": df,
        "fundamental_metrics": fundamental_metrics,
        "fundamental_source": fundamental_source,
        "fundamental_as_of": fundamental_as_of,
        "fundamental_freshness": fundamental_freshness,
        "sector": sector,
        "syariah_status": syariah_status,
        "adjusted_price_status": "known" if has_adjusted_data else "unknown",
        "warnings": warnings,
    }


@app.get("/api/fundamentals/<ticker>")
def get_fundamental_snapshot(ticker: str) -> tuple[Any, int]:
    snapshot = fundamental_service.read_cached_snapshot(DB_PATH, ticker)
    if not snapshot:
        return jsonify({"exists": False, "ticker": ticker.upper()}), 404
    return jsonify({"exists": True, "ticker": ticker.upper(), **snapshot}), 200


@app.post("/api/fundamentals/<ticker>/copy-to-thesis")
def copy_fundamental_to_thesis(ticker: str) -> tuple[Any, int]:
    snapshot = fundamental_service.read_cached_snapshot(DB_PATH, ticker)
    if not snapshot or not snapshot.get("metrics"):
        return jsonify({"error": "Snapshot fundamental belum tersedia."}), 404

    db = get_db()
    row = db.execute("SELECT data FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
    if not row:
        return jsonify({"error": "Data aplikasi belum tersedia."}), 404
    app_data = json.loads(row["data"])
    normalized = ticker.upper().replace(".JK", "")
    thesis = next(
        (
            item for item in app_data.get("theses", [])
            if str(item.get("ticker", "")).upper().replace(".JK", "") == normalized
        ),
        None,
    )
    if thesis is None:
        return jsonify({"error": "Buat Tesis untuk ticker ini terlebih dahulu."}), 404

    thesis["fundamentalMetrics"] = [
        {
            "year": str(metric.get("year", "")),
            "revenue": metric.get("revenue") or 0,
            "netProfit": metric.get("netProfit") or 0,
            "eps": metric.get("eps") or 0,
            "roe": metric.get("roe") or 0,
            "der": metric.get("der") or 0,
            "pe": metric.get("pe"),
            "pbv": metric.get("pbv"),
        }
        for metric in snapshot["metrics"]
    ]
    thesis["updatedAt"] = now_iso()
    serialized = json.dumps(app_data, ensure_ascii=False, separators=(",", ":"))
    db.execute(
        "UPDATE app_state SET data = ?, updated_at = ? WHERE key = ?",
        (serialized, now_iso(), APP_STATE_KEY),
    )
    db.commit()
    return jsonify({
        "ok": True,
        "ticker": ticker.upper(),
        "source": snapshot.get("source"),
        "asOf": snapshot.get("as_of"),
    }), 200


def get_deepseek_keys_from_settings(settings: dict[str, Any]) -> list[str]:
    configured = settings.get("deepseekApiKeys", [])
    single_key = settings.get("deepseekApiKey")
    keys = [key.strip() for key in configured if isinstance(key, str) and key.strip()]
    if isinstance(single_key, str) and single_key.strip() and single_key.strip() not in keys:
        keys.append(single_key.strip())
    env_key = os.environ.get("DEEPSEEK_API_KEY")
    if env_key and env_key.strip() and env_key.strip() not in keys:
        keys.append(env_key.strip())
    return keys


def review_batch_candidates_with_deepseek(
    candidates: list[dict[str, Any]],
    api_keys: list[str],
) -> list[dict[str, Any]]:
    if not api_keys:
        raise RuntimeError("Kunci API DeepSeek tidak tersedia.")

    review_input = []
    for candidate in candidates:
        review_input.append({
            "ticker": candidate["ticker"],
            "quant_signal": candidate["quant_signal"],
            "confidence": candidate["confidence"],
            "candidate_rank_score": candidate["candidate_rank_score"],
            "ranking_components": candidate["ranking_components"],
            "regime": candidate["regime"],
            "risk_reward": candidate["risk_reward"],
            "entry_status": candidate["entry_status"],
            "entry_range": candidate["entry_range"],
            "exit_plan": candidate["exit_plan"],
            "liquidity_status": candidate["liquidity_status"],
            "fundamental_status": candidate["fundamental_status"],
            "fundamental_score": candidate["fundamental_score"],
            "backtest_status": candidate["backtest_status"],
            "backtest_summary": candidate["backtest_summary"],
            "warnings": candidate["warnings"],
        })

    prompt = json.dumps({
        "rules": [
            "Gunakan hanya data JSON yang diberikan. Jangan mengarang data.",
            "Mesin kuantitatif adalah pemilih utama.",
            "Jangan meng-upgrade HOLD, SELL, atau AVOID menjadi BUY.",
            "Jangan menciptakan BUY jika quant_signal bukan BUY.",
            "Anda boleh mempertahankan BUY atau menurunkannya menjadi HOLD, SELL, atau AVOID.",
            "Pertimbangkan kontradiksi risk-reward, fundamental, likuiditas, dan kualitas backtest.",
            "Kembalikan JSON valid saja.",
        ],
        "candidates": review_input,
        "output_schema": {
            "reviews": [
                {
                    "ticker": "string",
                    "ai_final_signal": "BUY | HOLD | SELL | AVOID",
                    "ai_confidence": "low | medium | high",
                    "ai_reason": "string",
                    "ai_risk_note": "string",
                    "ai_entry_comment": "string",
                    "ai_exit_comment": "string",
                }
            ]
        },
    }, ensure_ascii=False)
    response_text = call_deepseek_with_rotation(
        prompt,
        (
            "Kamu adalah reviewer risiko lapis kedua untuk scanner saham Indonesia. "
            "Jangan invent data dan jangan meng-upgrade keputusan mesin kuantitatif. "
            "Kembalikan JSON valid saja."
        ),
        api_keys,
    )
    parsed = json.loads(response_text)
    reviews = parsed.get("reviews", []) if isinstance(parsed, dict) else []
    if not isinstance(reviews, list):
        raise ValueError("Format review DeepSeek tidak valid.")
    return reviews



@app.get("/api/yahoo/history")
def get_yahoo_history() -> tuple[Any, int]:
    symbol = request.args.get("symbol", "").strip()
    range_val = request.args.get("range", "1y").strip()
    include_signal = request.args.get("include_signal", "false").strip().lower() == "true"
    syariah_filter = request.args.get("syariah_filter", "false").strip().lower() == "true"
    if not symbol:
        return jsonify({"error": "Symbol parameter wajib diisi."}), 400
        
    res = fetch_yahoo_history(symbol, range_val, include_signal, syariah_filter)
    return jsonify(res), 200


@app.route("/api/yahoo/multi_scan", methods=["POST", "OPTIONS"])
def multi_scan_quotes() -> tuple[Any, int] | Response:
    if request.method == "OPTIONS":
        return "", 204
        
    payload = request.get_json(silent=True) or {}
    symbols = payload.get("symbols")
    syariah_filter = payload.get("syariah_filter", False)
    if not symbols or not isinstance(symbols, list):
        return jsonify({"error": "Payload symbols harus berupa array."}), 400
        
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_yahoo_history, sym, "1y", True, syariah_filter): sym for sym in symbols}
        for future in futures:
            res = future.result()
            res_small = {k: v for k, v in res.items() if k != "chartPoints" and k != "volumeProfile"}
            results.append(res_small)
                
    return jsonify({"results": results}), 200


@app.route("/api/yahoo/screen_batch", methods=["POST", "OPTIONS"])
def screen_batch_quotes() -> tuple[Any, int] | Response:
    if request.method == "OPTIONS":
        return "", 204

    json_payload = request.get_json(silent=True)
    if isinstance(json_payload, dict):
        payload = json_payload
        ticker_input = payload.get("tickers", payload.get("symbols", []))
    elif isinstance(json_payload, list):
        payload = {}
        ticker_input = json_payload
    else:
        payload = {}
        ticker_input = request.get_data(as_text=True)

    tickers = batch_screener.parse_tickers(ticker_input)
    if not tickers:
        return jsonify({
            "error": "Ticker wajib diisi sebagai array JSON atau teks yang dipisahkan koma/baris baru."
        }), 400
    if len(tickers) > 100:
        return jsonify({"error": "Maksimal 100 ticker per batch."}), 400

    state_row = get_db().execute(
        "SELECT data FROM app_state WHERE key = ?",
        (APP_STATE_KEY,),
    ).fetchone()
    app_data = json.loads(state_row["data"]) if state_row else {}
    settings = app_data.get("settings", {})
    api_keys = get_deepseek_keys_from_settings(settings)
    use_ai_review = bool(payload.get("use_ai_review", False))

    ai_reviewer = None
    if use_ai_review:
        ai_reviewer = lambda candidates: review_batch_candidates_with_deepseek(
            candidates,
            api_keys,
        )

    result = batch_screener.screen_batch(
        tickers,
        load_batch_screening_data,
        top_n=payload.get("top_n", 5),
        syariah_filter=bool(payload.get("syariah_filter", False)),
        use_ai_review=use_ai_review,
        run_backtest=bool(payload.get("run_backtest", True)),
        min_risk_reward=float(payload.get("min_risk_reward", 1.5)),
        max_candidates_for_ai=payload.get("max_candidates_for_ai", 10),
        time_stop_days=payload.get("time_stop_days", 30),
        ai_reviewer=ai_reviewer,
    )
    return jsonify(result), 200



@app.get("/api/yahoo/scan_one")
def scan_one_quote() -> tuple[Any, int]:
    symbol = request.args.get("symbol", "").strip()
    syariah_filter = request.args.get("syariah_filter", "false").strip().lower() == "true"
    if not symbol:
        return jsonify({"error": "Symbol parameter wajib diisi."}), 400
    res = fetch_yahoo_history(symbol, "1y", include_signal=True, syariah_only=syariah_filter)
    if res.get("success"):
        res_small = {k: v for k, v in res.items() if k != "chartPoints" and k != "volumeProfile"}
        return jsonify(res_small), 200
    else:
        return jsonify(res), 200


@app.route("/api/yahoo/review_single", methods=["POST", "OPTIONS"])
def review_single_quote() -> tuple[Any, int] | Response:
    if request.method == "OPTIONS":
        return "", 204
        
    payload = request.get_json(silent=True) or {}
    symbol = payload.get("symbol", "").strip()
    syariah_filter = bool(payload.get("syariah_filter", False))
    if not symbol:
        return jsonify({"error": "Symbol parameter wajib diisi."}), 400
        
    cleaned = symbol.upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
        
    # Get DB/settings and api_keys
    state_row = get_db().execute(
        "SELECT data FROM app_state WHERE key = ?",
        (APP_STATE_KEY,),
    ).fetchone()
    app_data = json.loads(state_row["data"]) if state_row else {}
    settings = app_data.get("settings", {})
    api_keys = get_deepseek_keys_from_settings(settings)
    if not api_keys:
        return jsonify({"error": "Kunci API DeepSeek belum dikonfigurasi di Pengaturan."}), 400

    try:
        # Load and screen ticker
        candidate = batch_screener.screen_ticker(
            cleaned,
            load_batch_screening_data,
            syariah_filter=syariah_filter,
            run_backtest=True,
            min_risk_reward=1.0,  # use relaxed R:R so it scans nicely
            time_stop_days=30,
        )
        
        reviews = review_batch_candidates_with_deepseek([candidate], api_keys)
        if reviews:
            return jsonify({"success": True, "review": reviews[0]}), 200
        else:
            return jsonify({"error": "DeepSeek tidak mengembalikan review."}), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Gagal menjalankan AI review: {str(e)}"}), 500


def call_deepseek_with_rotation(prompt: str, system_instruction: str, api_keys: list[str]) -> str:
    if not api_keys:
        raise Exception("Tidak ada API Key DeepSeek yang terkonfigurasi.")
        
    for i, api_key in enumerate(api_keys):
        try:
            print(f"Trying DeepSeek API call with key index {i}...")
            url = "https://api.deepseek.com/chat/completions"
            
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            payload = {
                "model": "deepseek-chat",
                "messages": messages,
                "response_format": {"type": "json_object"}
            }
            
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}"
                }
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                text_response = res_json["choices"][0]["message"]["content"]
                return text_response
                
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            print(f"DeepSeek API key index {i} failed with HTTP {e.code}: {err_body}")
            if e.code == 429:
                print("Rate limit (429) hit. Rotating key...")
                continue
            else:
                continue
        except Exception as e:
            print(f"DeepSeek API key index {i} failed with error: {e}")
            continue
            
    raise Exception("Seluruh API Key DeepSeek gagal atau terkena rate limit.")


def send_system_notification(title: str, message: str):
    import subprocess
    escaped_title = title.replace("'", "''")
    escaped_message = message.replace("'", "''")
    
    # Modern Windows 10/11 Toast Notification script
    ps_code = f"""
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $toastXml = [xml]$template.GetXml()
    $toastXml.GetElementsByTagName('text')[0].AppendChild($toastXml.CreateTextNode('{escaped_title}')) | Out-Null
    $toastXml.GetElementsByTagName('text')[1].AppendChild($toastXml.CreateTextNode('{escaped_message}')) | Out-Null
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($toastXml.OuterXml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('MoneyManagement').Show($toast)
    """
    try:
        subprocess.run(["powershell", "-Command", ps_code], capture_output=True, text=True, check=True)
    except Exception as e:
        print(f"Failed to send modern OS notification: {e}")
        # Fallback to classic balloon tip with 3s sleep to keep it alive
        ps_fallback = f"""
        [void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
        $icon = New-Object System.Windows.Forms.NotifyIcon
        $icon.Icon = [System.Drawing.SystemIcons]::Information
        $icon.BalloonTipTitle = '{escaped_title}'
        $icon.BalloonTipText = '{escaped_message}'
        $icon.Visible = $true
        $icon.ShowBalloonTip(10000)
        Start-Sleep -Seconds 3
        """
        try:
            subprocess.run(["powershell", "-Command", ps_fallback], capture_output=True, text=True, check=True)
        except Exception as fallback_err:
            print(f"Failed to send fallback notification: {fallback_err}")



def execute_auto_scan(
    tickers: list[str],
    api_keys: list[str],
    theses: list[dict],
    syariah_only: bool = False,
    already_reserved: bool = False,
):
    idx_tickers = batch_screener.parse_tickers(tickers)
    print(f"Starting conservative batch auto-scan for tickers: {idx_tickers}")
    if not idx_tickers:
        if already_reserved:
            update_auto_scan_state(is_running=False, current=0, current_ticker="")
        return

    with auto_scan_lock:
        if auto_scan_state["is_running"] and not already_reserved:
            print("Auto-Scanner skipped because another scan is still running.")
            return
        auto_scan_state.update(
            is_running=True,
            total=len(idx_tickers),
            current=0,
            current_ticker="",
            last_run_time=now_iso(),
        )

    loaded_count = 0
    progress_lock = threading.Lock()

    def progress_loader(ticker: str, syariah_filter: bool) -> dict[str, Any]:
        nonlocal loaded_count
        with progress_lock:
            loaded_count += 1
            current_count = loaded_count
        update_auto_scan_state(
            current=current_count,
            current_ticker=ticker,
        )
        return load_batch_screening_data(ticker, syariah_filter)

    ai_reviewer = None
    if api_keys:
        ai_reviewer = lambda candidates: review_batch_candidates_with_deepseek(
            candidates,
            api_keys,
        )

    try:
        batch_result = batch_screener.screen_batch(
            idx_tickers,
            progress_loader,
            top_n=min(10, len(idx_tickers)),
            syariah_filter=syariah_only,
            use_ai_review=bool(ai_reviewer),
            run_backtest=True,
            min_risk_reward=1.5,
            max_candidates_for_ai=10,
            ai_reviewer=ai_reviewer,
        )
        alert_candidates = [
            candidate
            for candidate in batch_result["top_candidates"]
            if candidate["quant_signal"] == "BUY"
            and candidate["screening_status"] == "passed"
            and candidate.get("ai_final_signal") in {None, "BUY"}
        ]
        print(
            "Auto-Scanner selected "
            f"{len(alert_candidates)} risk-adjusted BUY candidates: "
            f"{[candidate['ticker'] for candidate in alert_candidates]}"
        )

        for candidate in alert_candidates:
            try:
                conn = sqlite3.connect(DB_PATH)
                recent_alert = conn.execute(
                    "SELECT id FROM auto_scan_alerts WHERE symbol = ? AND datetime(timestamp) > datetime('now', '-2 hours')",
                    (candidate["ticker"],),
                ).fetchone()
                if recent_alert:
                    print(f"Skipping duplicate alert for {candidate['ticker']} (recently analyzed)")
                    conn.close()
                    continue
                conn.close()

                conn = sqlite3.connect(DB_PATH)
                conn.execute(
                    """
                    INSERT INTO auto_scan_alerts 
                    (timestamp, symbol, price, change_percent, market_regime, algo_signal, score, gemini_recommendation, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        datetime.now(timezone.utc).isoformat(),
                        candidate["ticker"],
                        candidate["current_price"],
                        0.0,
                        candidate["regime"],
                        candidate["quant_signal"],
                        candidate["candidate_rank_score"],
                        json.dumps(candidate, ensure_ascii=False),
                        datetime.now(timezone.utc).isoformat()
                    )
                )
                conn.commit()
                conn.close()
                print(f"Auto-Scanner successfully saved alert for {candidate['ticker']}.")

                # Trigger native OS-level notification on Windows
                try:
                    price_val = candidate["current_price"]
                    ticker = candidate["ticker"]
                    if ticker.endswith(".JK"):
                        price_str = f"Rp {int(price_val):,}".replace(",", ".")
                    else:
                        price_str = f"${price_val:.2f}"
                    
                    title = "Algo & AI Trading Alert"
                    message = f"Sinyal BUY terdeteksi untuk {ticker} pada harga {price_str}."
                    ai_sig = candidate.get("ai_final_signal")
                    if ai_sig:
                        message += f" Review DeepSeek: {ai_sig}."
                    send_system_notification(title, message)
                except Exception as notif_err:
                    print(f"Failed to trigger system notification: {notif_err}")

            except Exception as e:
                print(f"Auto-Scanner failed to save candidate {candidate['ticker']}: {e}")
    finally:
        update_auto_scan_state(
            is_running=False,
            current=0,
            current_ticker="",
        )


def run_auto_scanner_loop():
    print("Auto-Scanner background daemon started.")
    last_scan_time = 0
    
    while True:
        try:
            time.sleep(30)
            
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT data FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
            if not row:
                conn.close()
                continue
                
            app_data = json.loads(row["data"])
            conn.close()
            
            settings = app_data.get("settings", {})
            auto_scan_enabled = settings.get("autoScanEnabled", False)
            auto_scan_interval = settings.get("autoScanInterval", 0)
            
            if not auto_scan_enabled or auto_scan_interval <= 0:
                continue
                
            now_sec = time.time()
            if now_sec - last_scan_time < (auto_scan_interval * 60):
                continue
                
            print(f"Auto-Scanner triggered: running periodic scan (interval: {auto_scan_interval}m)...")
            last_scan_time = now_sec
            
            theses = app_data.get("theses", [])
            tickers = list(set([t["ticker"].strip().upper() for t in theses if t.get("ticker")]))
            if not tickers:
                tickers = ["BBRI", "TLKM", "ASII"]
                
            deepseek_api_keys = settings.get("deepseekApiKeys", [])
            single_key = settings.get("deepseekApiKey")
            api_keys = [k.strip() for k in deepseek_api_keys if k and k.strip()]
            if single_key and single_key.strip() and single_key.strip() not in api_keys:
                api_keys.append(single_key.strip())
                
            syariah_filter = settings.get("syariahFilter", False)
            execute_auto_scan(tickers, api_keys, theses, syariah_only=syariah_filter)
            
        except Exception as e:
            print("Error in auto-scanner loop:", e)


@app.get("/api/auto_scan/alerts")
def get_auto_scan_alerts() -> tuple[Any, int]:
    try:
        db = get_db()
        rows = db.execute("SELECT * FROM auto_scan_alerts ORDER BY timestamp DESC").fetchall()
        alerts = []
        for r in rows:
            alerts.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "symbol": r["symbol"],
                "price": r["price"],
                "changePercent": r["change_percent"],
                "marketRegime": r["market_regime"],
                "algoSignal": r["algo_signal"],
                "score": r["score"],
                "deepseekRecommendation": json.loads(r["gemini_recommendation"]),
                "createdAt": r["created_at"]
            })
        return jsonify({"alerts": alerts}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto_scan/alerts", methods=["DELETE"])
def clear_auto_scan_alerts() -> tuple[Any, int]:
    try:
        db = get_db()
        db.execute("DELETE FROM auto_scan_alerts")
        db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto_scan/alerts/<int:alert_id>", methods=["DELETE"])
def delete_auto_scan_alert(alert_id: int) -> tuple[Any, int]:
    try:
        db = get_db()
        db.execute("DELETE FROM auto_scan_alerts WHERE id = ?", (alert_id,))
        db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto_scan/trigger", methods=["POST"])
def trigger_auto_scan() -> tuple[Any, int]:
    try:
        with auto_scan_lock:
            if auto_scan_state["is_running"]:
                return jsonify({
                    "error": "Auto-scan masih berjalan.",
                    "status": dict(auto_scan_state),
                }), 409
            auto_scan_state.update(
                is_running=True,
                current=0,
                current_ticker="Menyiapkan batch scan",
                last_run_time=now_iso(),
            )

        db = get_db()
        row = db.execute("SELECT data FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
        if not row:
            update_auto_scan_state(is_running=False, current=0, current_ticker="")
            return jsonify({"error": "App state belum terinisialisasi."}), 400
            
        app_data = json.loads(row["data"])
        settings = app_data.get("settings", {})
        
        theses = app_data.get("theses", [])
        tickers = list(set([t["ticker"].strip().upper() for t in theses if t.get("ticker")]))
        if not tickers:
            tickers = ["BBRI", "TLKM", "ASII"]
            
        deepseek_api_keys = settings.get("deepseekApiKeys", [])
        single_key = settings.get("deepseekApiKey")
        api_keys = [k.strip() for k in deepseek_api_keys if k and k.strip()]
        if single_key and single_key.strip() and single_key.strip() not in api_keys:
            api_keys.append(single_key.strip())
            
        syariah_filter = settings.get("syariahFilter", False)
        
        def run_manual_trigger():
            try:
                execute_auto_scan(
                    tickers,
                    api_keys,
                    theses,
                    syariah_only=syariah_filter,
                    already_reserved=True,
                )
            except Exception as e:
                print("Error in manually triggered auto-scan:", e)
                update_auto_scan_state(is_running=False, current=0, current_ticker="")
                
        threading.Thread(target=run_manual_trigger).start()
        return jsonify({"success": True, "message": "Auto-scan triggered."}), 200
    except Exception as e:
        update_auto_scan_state(is_running=False, current=0, current_ticker="")
        return jsonify({"error": str(e)}), 500





@app.get("/api/auto_scan/status")
def get_auto_scan_status() -> tuple[Any, int]:
    with auto_scan_lock:
        return jsonify(auto_scan_state), 200


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat() -> tuple[Any, int]:
    try:
        req_data = request.get_json() or {}
        prompt = req_data.get("prompt")
        system_instruction = req_data.get("systemInstruction") or req_data.get("system_instruction")
        
        # Load keys from database
        db = get_db()
        row = db.execute("SELECT data FROM app_state WHERE key = ?", (APP_STATE_KEY,)).fetchone()
        api_keys = []
        if row:
            app_data = json.loads(row["data"])
            settings = app_data.get("settings", {})
            deepseek_api_keys = settings.get("deepseekApiKeys", [])
            single_key = settings.get("deepseekApiKey")
            api_keys = [k.strip() for k in deepseek_api_keys if k and k.strip()]
            if single_key and single_key.strip() and single_key.strip() not in api_keys:
                api_keys.append(single_key.strip())
                
        # fallback to env
        env_key = os.environ.get("VITE_DEEPSEEK_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
        if env_key and env_key.strip() and env_key.strip() not in api_keys:
            api_keys.append(env_key.strip())
            
        if not api_keys:
            return jsonify({"error": "Kunci API DeepSeek belum dikonfigurasi. Harap isi di menu Pengaturan."}), 400
            
        text_response = call_deepseek_with_rotation(prompt, system_instruction, api_keys)
        return jsonify({"text": text_response}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    t = threading.Thread(target=run_auto_scanner_loop, daemon=True)
    t.start()
    app.run(host="127.0.0.1", port=5000, debug=False)
