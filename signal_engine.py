from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

# ==========================================
# CONSTANTS & CONFIGURATION
# ==========================================
ADX_THRESHOLD = 20
BBW_SQUEEZE_THRESHOLD = 0.08
SR_DISTANCE_THRESHOLD = 0.025
ATR_MULTIPLIER = 3.0
MIN_BUY_RR = 1.5
MIN_STRONG_BUY_RR = 2.0
MIN_FUNDAMENTAL_SCORE_FOR_BUY = 8
MIN_DAILY_LIQUIDITY_VALUE = 500_000_000  # 500 million IDR average daily value


def get_idx_tick_size(price: float) -> float:
    """
    Returns the price-dependent tick size according to Indonesia Stock Exchange rules.
    """
    if price <= 0:
        return 1.0
    elif price < 200:
        return 1.0
    elif price < 500:
        return 2.0
    elif price < 2000:
        return 5.0
    elif price < 5000:
        return 10.0
    else:
        return 25.0


# ==========================================
# TECHNICAL INDICATORS
# ==========================================

def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    if len(prices) == 0:
        return pd.Series(dtype=float)
    return prices.rolling(window=period).mean().fillna(prices)


def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    if len(prices) == 0:
        return pd.Series(dtype=float)
    return prices.ewm(span=period, adjust=False).mean().fillna(prices)


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    if len(prices) <= period:
        return pd.Series(50.0, index=prices.index)
    
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).copy()
    loss = (-delta.where(delta < 0, 0)).copy()
    
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    
    # Wilder's smoothing
    for i in range(period, len(prices)):
        avg_gain.iloc[i] = (avg_gain.iloc[i-1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i-1] * (period - 1) + loss.iloc[i]) / period
        
    rs = np.where(avg_loss == 0, 100.0, avg_gain / np.where(avg_loss == 0, 1.0, avg_loss))
    rsi = 100.0 - (100.0 / (1.0 + rs))
    
    rsi = pd.Series(rsi, index=prices.index)
    rsi.iloc[:period] = rsi.iloc[period] if len(rsi) > period else 50.0
    return rsi


def calculate_macd(prices: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    if len(prices) < 26:
        zero_series = pd.Series(0.0, index=prices.index)
        return zero_series, zero_series, zero_series
        
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    
    macd_line = ema12 - ema26
    signal_line = calculate_ema(macd_line, 9)
    hist = macd_line - signal_line
    
    return macd_line, signal_line, hist


def calculate_adx(df: pd.DataFrame, period: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    """
    Computes ADX, +DI, and -DI. Handles NaNs and constant price series.
    """
    length = len(df)
    if length <= period:
        neutral = pd.Series(0.0, index=df.index)
        return neutral, neutral, neutral
        
    prev_close = df['Close'].shift(1)
    tr0 = (df['High'] - df['Low']).abs()
    tr1 = (df['High'] - prev_close).abs()
    tr2 = (df['Low'] - prev_close).abs()
    df_tr = pd.concat([tr0, tr1, tr2], axis=1).max(axis=1)
    
    up_move = df['High'] - df['High'].shift(1)
    down_move = df['Low'].shift(1) - df['Low']
    
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    
    tr_smooth = df_tr.ewm(alpha=1/period, adjust=False).mean()
    plus_dm_smooth = pd.Series(plus_dm, index=df.index).ewm(alpha=1/period, adjust=False).mean()
    minus_dm_smooth = pd.Series(minus_dm, index=df.index).ewm(alpha=1/period, adjust=False).mean()
    
    # Safe division
    tr_smooth_denom = np.where(tr_smooth == 0, 1.0, tr_smooth)
    plus_di = 100.0 * (plus_dm_smooth / tr_smooth_denom)
    minus_di = 100.0 * (minus_dm_smooth / tr_smooth_denom)
    
    di_sum = plus_di + minus_di
    di_sum_denom = np.where(di_sum == 0, 1.0, di_sum)
    dx = 100.0 * (abs(plus_di - minus_di) / di_sum_denom)
    
    adx = pd.Series(dx, index=df.index).ewm(alpha=1/period, adjust=False).mean()
    return adx, plus_di, minus_di


def calculate_bollinger_bands(prices: pd.Series, period: int = 20, std_dev: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    middle = prices.rolling(window=period).mean().fillna(prices)
    std = prices.rolling(window=period).std().fillna(0.0)
    upper = middle + (std_dev * std)
    lower = middle - (std_dev * std)
    bandwidth = (upper - lower) / np.where(middle == 0, 1.0, middle)
    return upper, middle, lower, bandwidth


def calculate_stochastic(df: pd.DataFrame, period: int = 14, smooth_k: int = 3) -> tuple[pd.Series, pd.Series]:
    if len(df) < period:
        neutral = pd.Series(50.0, index=df.index)
        return neutral, neutral
        
    lowest_low = df['Low'].rolling(window=period).min().fillna(df['Low'])
    highest_high = df['High'].rolling(window=period).max().fillna(df['High'])
    
    range_hl = highest_high - lowest_low
    range_hl_denom = np.where(range_hl == 0, 1.0, range_hl)
    
    pct_k = 100.0 * ((df['Close'] - lowest_low) / range_hl_denom)
    pct_d = pct_k.rolling(window=smooth_k).mean().fillna(pct_k)
    return pct_k, pct_d


def calculate_atr_and_trailing_stop(df: pd.DataFrame, period: int = 14, multiplier: float = 3.0) -> tuple[pd.Series, pd.Series]:
    if len(df) == 0:
        return pd.Series(dtype=float), pd.Series(dtype=float)
        
    prev_close = df['Close'].shift(1)
    tr0 = (df['High'] - df['Low']).abs()
    tr1 = (df['High'] - prev_close).abs()
    tr2 = (df['Low'] - prev_close).abs()
    df_tr = pd.concat([tr0, tr1, tr2], axis=1).max(axis=1)
    
    atr = df_tr.ewm(alpha=1/period, adjust=False).mean()
    
    # Calculate stateful ratchet trailing stop
    ts_list = []
    if len(df) > 0:
        curr_stop = df['Close'].iloc[0] - (multiplier * atr.iloc[0])
        ts_list.append(curr_stop)
        
        for i in range(1, len(df)):
            prev_close_val = df['Close'].iloc[i-1]
            prev_stop = ts_list[-1]
            basic_stop = df['Close'].iloc[i] - (multiplier * atr.iloc[i])
            
            if prev_close_val > prev_stop:
                curr_stop = max(basic_stop, prev_stop)
            else:
                curr_stop = basic_stop
            ts_list.append(curr_stop)
            
    return atr, pd.Series(ts_list, index=df.index)


def calculate_volume_profile_and_kmeans(df: pd.DataFrame, lookback: int = 150) -> tuple[float, list[dict[str, float]]]:
    """
    Computes the estimated Volume Profile POC and K-Means support/resistance levels.
    Uses rolling lookback window of 120-250 days (defaults to 150 days).
    """
    if len(df) < 10:
        price = float(df['Close'].iloc[-1]) if len(df) > 0 else 0.0
        return price, [{'support': price, 'resistance': price}]
        
    df_lookback = df.iloc[-min(lookback, len(df)):].copy()
    price_min = float(df_lookback['Low'].min())
    price_max = float(df_lookback['High'].max())
    
    if price_max == price_min:
        price_max = price_min + 1.0
        
    # 1. Volume Profile POC
    num_bins = 50
    bin_size = (price_max - price_min) / num_bins
    price_bins = np.arange(price_min, price_max + bin_size, bin_size)
    vol_profile = np.zeros(len(price_bins) - 1)
    
    for _, row in df_lookback.iterrows():
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
    
    # 2. K-Means S&R Clustering (Deterministic random_state=42)
    prices = df_lookback['Close'].values.reshape(-1, 1)
    sr_levels = []
    
    try:
        k_clusters = min(5, max(3, len(prices) - 2))
        if k_clusters < 2:
            k_clusters = 2
            
        kmeans = KMeans(
            n_clusters=k_clusters,
            random_state=42,
            n_init=1,
            max_iter=50,
        )
        clusters = kmeans.fit_predict(prices)
        
        for i in range(k_clusters):
            cluster_prices = prices[clusters == i]
            if len(cluster_prices) > 0:
                cluster_max = float(cluster_prices.max())
                cluster_min = float(cluster_prices.min())
                sr_levels.append({'support': cluster_min, 'resistance': cluster_max})
    except Exception:
        sr_levels = [{'support': price_min, 'resistance': price_max}]
        
    if not sr_levels:
        sr_levels = [{'support': price_min, 'resistance': price_max}]
        
    return poc_price, sr_levels


# ==========================================
# FUNDAMENTAL SAFETY SHIELD
# ==========================================

def calculate_fundamental_score(metrics_list: list[dict], sector: str = None) -> tuple[float, str, list[str]]:
    """
    Computes a fundamental score out of 20.
    Returns: (score, status, warnings)
    Status is one of: "pass", "weak", "fail", "unavailable"
    """
    warnings = []
    if not metrics_list:
        return 0.0, "unavailable", ["Data fundamental tidak tersedia."]
        
    try:
        sorted_metrics = sorted(metrics_list, key=lambda x: str(x.get("year", "")), reverse=True)
        latest = sorted_metrics[0]
        prev = sorted_metrics[1] if len(sorted_metrics) > 1 else None
        
        score = 0.0
        is_financial = sector in ["Financial Services", "Finance", "Bank", "Banks"]
        
        # 1. ROE (5 points)
        roe = latest.get("roe")
        if roe is None:
            warnings.append("ROE tidak tersedia.")
        else:
            roe_val = float(roe)
            if roe_val >= 15.0 or (0.15 <= roe_val < 1.0):
                score += 5.0
            elif roe_val >= 12.0 or (0.12 <= roe_val < 0.15):
                score += 3.0
            elif roe_val > 0:
                score += 1.0
                
        # 2. DER (4 points)
        der = latest.get("der")
        if is_financial:
            car = latest.get("car")
            if car is not None:
                car_val = float(car)
                if car_val >= 18.0:
                    score += 4.0
                elif car_val >= 12.0:
                    score += 2.0
                else:
                    warnings.append("CAR berada di bawah 12%.")
            else:
                score += 2.0
                warnings.append(
                    "DER tidak dipakai sebagai hard score untuk sektor finansial; "
                    "CAR tidak tersedia sehingga diberikan skor netral."
                )
        elif der is None:
            warnings.append("DER tidak tersedia.")
        else:
            der_val = float(der)
            if der_val <= 1.0:
                score += 4.0
            elif der_val <= 1.5:
                score += 2.0
            elif der_val <= 2.0:
                score += 1.0
                
        # 3. Revenue Growth YoY (3 points)
        rev_latest = latest.get("revenue")
        rev_prev = prev.get("revenue") if prev else None
        if rev_latest is None or rev_prev is None:
            warnings.append("Revenue Growth YoY tidak dapat dihitung.")
        else:
            rev_growth = (float(rev_latest) - float(rev_prev)) / float(rev_prev) if float(rev_prev) != 0 else 0.0
            if rev_growth > 0:
                score += 3.0
                
        # 4. Net Profit Growth YoY (3 points)
        profit_latest = latest.get("netProfit")
        profit_prev = prev.get("netProfit") if prev else None
        if profit_latest is None or profit_prev is None:
            warnings.append("Net Profit Growth YoY tidak dapat dihitung.")
        else:
            profit_growth = (float(profit_latest) - float(profit_prev)) / float(profit_prev) if float(profit_prev) != 0 else 0.0
            if profit_growth > 0:
                score += 3.0
                
        # 5. Stable or improving margin (2 points)
        if rev_latest and profit_latest and rev_prev and profit_prev:
            margin_latest = float(profit_latest) / float(rev_latest) if float(rev_latest) != 0 else 0.0
            margin_prev = float(profit_prev) / float(rev_prev) if float(rev_prev) != 0 else 0.0
            if margin_latest >= margin_prev:
                score += 2.0
        else:
            warnings.append("Marginal trend tidak dapat dihitung.")
            
        # 6. Valuation (3 points) - Sector-sensitive
        pe = latest.get("pe")
        pbv = latest.get("pbv")
        
        pe_val = float(pe) if pe is not None else None
        pbv_val = float(pbv) if pbv is not None else None
        
        val_points = 0.0
        if is_financial:
            if pbv_val is not None:
                if pbv_val < 1.0:
                    val_points = 3.0
                elif pbv_val < 1.8:
                    val_points = 2.0
                elif pbv_val < 2.5:
                    val_points = 1.0
            elif pe_val is not None:
                if pe_val < 10.0:
                    val_points = 3.0
                elif pe_val < 15.0:
                    val_points = 2.0
                elif pe_val < 20.0:
                    val_points = 1.0
        else:
            if pe_val is not None:
                if 0 < pe_val < 12.0:
                    val_points = 3.0
                elif 12.0 <= pe_val < 18.0:
                    val_points = 2.0
                elif 18.0 <= pe_val < 25.0:
                    val_points = 1.0
            elif pbv_val is not None:
                if pbv_val < 1.5:
                    val_points = 2.0
                elif pbv_val < 3.0:
                    val_points = 1.0
                    
        score += val_points
        cash_flow = (
            latest.get("freeCashFlow")
            if latest.get("freeCashFlow") is not None
            else latest.get("operatingCashFlow", latest.get("cashFlow"))
        )
        if cash_flow is not None and float(cash_flow) < 0:
            score = max(0.0, score - 2.0)
            warnings.append("Arus kas operasi/free cash flow periode terbaru negatif.")
        if not sector:
            warnings.append("Kategori sektor kosong - menerapkan estimasi valuasi kasar (rough valuation).")
            
        if score >= 12.0:
            status = "pass"
        elif score >= 8.0:
            status = "weak"
        else:
            status = "fail"
            
        return score, status, warnings
        
    except Exception as e:
        return 0.0, "fail", [f"Gagal memproses data fundamental: {str(e)}"]


def parse_date_safely(val) -> datetime:
    """
    Parses date value from Date column which could be Unix timestamp (seconds),
    string, or datetime/Timestamp. Returns a timezone-aware datetime object in UTC.
    """
    if isinstance(val, (int, float, np.integer, np.floating)):
        return datetime.fromtimestamp(float(val), timezone.utc)
    try:
        dt = pd.to_datetime(val)
        if dt.tzinfo is None:
            dt = dt.tz_localize(timezone.utc)
        else:
            dt = dt.tz_convert(timezone.utc)
        return dt.to_pydatetime()
    except Exception:
        return datetime.now(timezone.utc)


# ==========================================
# RISK-REWARD & SCORING TREE
# ==========================================

def run_quant_screening(
    df: pd.DataFrame, 
    fundamental_metrics: list[dict], 
    ticker: str, 
    sector: str = None,
    syariah_only: bool = False,
    syariah_status: str = "Not Checked",
    is_backtest: bool = False,
    apply_fundamental_gate: bool = True,
) -> dict[str, Any]:
    """
    Executes the entire quantitative stock signal pipeline.
    This is purely quantitative and Gemini-independent.
    """
    warnings = []
    as_of_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if len(df) > 0:
        try:
            as_of_date = parse_date_safely(df['Date'].iloc[-1]).strftime('%Y-%m-%d')
        except Exception:
            pass

    result_template = {
        "ticker": ticker,
        "as_of_date": as_of_date,
        "data_quality": "valid",
        "regime": "sideways",
        "regime_details": {
            "adx": 0.0,
            "plus_di": 0.0,
            "minus_di": 0.0,
            "bollinger_bandwidth": 0.0
        },
        "quant_signal": "HOLD",
        "quant_signal_type": "neutral",
        "score": 0.0,
        "confidence": "medium",
        "entry_range": {"low": 0.0, "high": 0.0},
        "target_profit_1": 0.0,
        "target_profit_2": 0.0,
        "stop_loss": 0.0,
        "atr_14": 0.0,
        "atr_trailing_stop": 0.0,
        "risk_reward": 0.0,
        "fundamental_score": 0.0,
        "fundamental_status": "unavailable",
        "final_signal": "HOLD",
        "final_reason": "Data tidak cukup.",
        "main_risk": "Resiko Data Terbatas",
        "ai_status": "skipped",
        "warnings": warnings
    }

    if syariah_only and syariah_status not in ["DES", "DES (Daftar Efek Syariah)"]:
        result_template["quant_signal"] = "AVOID"
        result_template["final_signal"] = "AVOID"
        result_template["final_reason"] = f"Emiten {ticker} di luar universe syariah (Status: {syariah_status})."
        result_template["main_risk"] = "Resiko Kepatuhan Syariah"
        warnings.append("Emiten tidak bersertifikat syariah (DES).")
        return result_template

    if len(df) < 30:
        result_template["data_quality"] = "incomplete"
        result_template["quant_signal"] = "AVOID"
        result_template["final_signal"] = "AVOID"
        result_template["final_reason"] = "Data historis terlalu pendek (butuh minimal 30 trading days)."
        return result_template
        
    try:
        last_date = parse_date_safely(df['Date'].iloc[-1])
        if not is_backtest and (datetime.now(timezone.utc) - last_date).days > 10:
            result_template["data_quality"] = "stale"
            result_template["quant_signal"] = "AVOID"
            result_template["final_signal"] = "AVOID"
            result_template["final_reason"] = "Data bursa stale (ketinggalan zaman/lebih dari 10 hari tidak aktif)."
            warnings.append("Data harga stale/terlambat di-update.")
            return result_template
    except Exception:
        pass
        
    if df['Close'].std() == 0:
        result_template["quant_signal"] = "AVOID"
        result_template["final_signal"] = "AVOID"
        result_template["final_reason"] = "Pergerakan harga mati/konstan (flat price series)."
        warnings.append("Harga saham konstan (tidak bergerak).")
        return result_template

    ohlc_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    for col in ohlc_cols:
        if df[col].isnull().sum() > len(df) * 0.1:
            result_template["data_quality"] = "incomplete"
            result_template["quant_signal"] = "AVOID"
            result_template["final_signal"] = "AVOID"
            result_template["final_reason"] = "Terdapat terlalu banyak data kosong (NaN) di baris historis."
            warnings.append("Deteksi lubang data NaN di bursa.")
            return result_template
            
    for col in ohlc_cols:
        df[col] = df[col].ffill().bfill()

    avg_vol = df['Volume'].iloc[-20:].mean()
    avg_price = df['Close'].iloc[-20:].mean()
    avg_daily_value = avg_vol * avg_price
    if avg_daily_value < MIN_DAILY_LIQUIDITY_VALUE:
        result_template["quant_signal"] = "AVOID"
        result_template["final_signal"] = "AVOID"
        result_template["final_reason"] = f"Likuiditas harian terlalu rendah (Rata-rata transaksi harian: Rp {int(avg_daily_value):,} < Rp {MIN_DAILY_LIQUIDITY_VALUE:,})."
        result_template["main_risk"] = "Likuiditas Rendah"
        warnings.append("Saham tidak likuid.")
        return result_template

    close_series = df['Close']
    macd_line, sig_line, macd_hist = calculate_macd(close_series)
    adx_series, plus_di, minus_di = calculate_adx(df, 14)
    bb_upper, bb_mid, bb_lower, bb_bandwidth = calculate_bollinger_bands(close_series, 20, 2.0)
    stoch_k, stoch_d = calculate_stochastic(df, 14, 3)
    atr_series, trailing_stop_series = calculate_atr_and_trailing_stop(df, 14, ATR_MULTIPLIER)
    
    poc_price, kmeans_levels = calculate_volume_profile_and_kmeans(df, lookback=150)
    
    price = float(close_series.iloc[-1])
    curr_adx = float(adx_series.iloc[-1])
    curr_plus_di = float(plus_di.iloc[-1])
    curr_minus_di = float(minus_di.iloc[-1])
    curr_bandwidth = float(bb_bandwidth.iloc[-1])
    curr_k = float(stoch_k.iloc[-1])
    curr_d = float(stoch_d.iloc[-1])
    curr_atr = float(atr_series.iloc[-1])
    curr_ts = float(trailing_stop_series.iloc[-1])
    
    is_squeeze = curr_bandwidth < BBW_SQUEEZE_THRESHOLD
    
    if curr_adx < ADX_THRESHOLD and is_squeeze:
        regime = "squeeze"
    elif curr_adx < ADX_THRESHOLD:
        regime = "sideways"
    elif curr_plus_di > curr_minus_di:
        regime = "bullish_trend"
    else:
        regime = "bearish_trend"
        
    is_exhaustion = False
    if curr_adx > 40:
        rsi_14 = calculate_rsi(close_series, 14).iloc[-1]
        if rsi_14 > 75 or curr_k > 80:
            is_exhaustion = True
            warnings.append("Resiko Trend Exhaustion (ADX > 40 & Overbought).")

    score = 0.0
    signal = "HOLD"
    signal_type = "neutral"
    reasons = []
    entry_anchor = price
    
    if regime == "squeeze":
        signal = "HOLD"
        signal_type = "neutral"
        score = 0.0
        reasons.append("Konsolidasi Bollinger Squeeze terdeteksi. Harap tunggu breakout volume.")
        
    elif regime == "sideways":
        nearest_sup = None
        for lvl in sorted([x['support'] for x in kmeans_levels], reverse=True):
            if lvl < price:
                nearest_sup = lvl
                break
        if nearest_sup is None:
            nearest_sup = min([x['support'] for x in kmeans_levels]) if kmeans_levels else price * 0.95
            
        nearest_res = None
        for lvl in sorted([x['resistance'] for x in kmeans_levels]):
            if lvl > price:
                nearest_res = lvl
                break
        if nearest_res is None:
            nearest_res = max([x['resistance'] for x in kmeans_levels]) if kmeans_levels else price * 1.05
            
        dist_to_sup = (price - nearest_sup) / nearest_sup
        dist_to_res = (nearest_res - price) / price
        
        prev_bandwidth = float(bb_bandwidth.iloc[-2]) if len(bb_bandwidth) > 1 else curr_bandwidth
        is_breakout_starting = (curr_bandwidth > prev_bandwidth * 1.1) and (price > bb_mid.iloc[-1]) and (df['Volume'].iloc[-1] > df['Volume'].iloc[-20:].mean() * 1.2)
        
        if dist_to_sup <= SR_DISTANCE_THRESHOLD and curr_k < 20:
            score = 20.0
            signal = "BUY"
            signal_type = "mean_reversion"
            entry_anchor = nearest_sup
            reasons.append("Sideways: Harga memantul dari Support K-Means dengan Stochastic oversold.")
        elif dist_to_res <= SR_DISTANCE_THRESHOLD or curr_k > 80:
            if is_breakout_starting:
                score = 0.0
                signal = "HOLD"
                signal_type = "neutral"
                reasons.append("Sideways: Harga di area resistance, tetapi terdeteksi potensi breakout.")
            else:
                score = -20.0
                signal = "SELL"
                signal_type = "bearish_exit"
                reasons.append("Sideways: Harga mendekati Resistance K-Means dengan Stochastic overbought.")
        else:
            score = 0.0
            signal = "HOLD"
            signal_type = "neutral"
            reasons.append("Sideways: Harga berada di tengah rentang konsolidasi.")
            
    elif regime == "bullish_trend":
        volume_ma20 = df['Volume'].iloc[-20:].mean()
        is_vol_confirmed = df['Volume'].iloc[-1] > 1.3 * volume_ma20
        
        if price >= bb_upper.iloc[-1] and is_vol_confirmed and not is_exhaustion:
            score = 25.0
            signal = "BUY"
            signal_type = "breakout"
            entry_anchor = price
            reasons.append("Bullish: Breakout Bollinger Bands terkonfirmasi volume.")
        elif abs(price - poc_price) / poc_price <= SR_DISTANCE_THRESHOLD:
            score = 20.0
            signal = "BUY"
            signal_type = "pullback"
            entry_anchor = poc_price
            reasons.append("Bullish: Pullback sehat ke area POC volume tinggi.")
        elif abs(price - bb_mid.iloc[-1]) / bb_mid.iloc[-1] <= SR_DISTANCE_THRESHOLD:
            score = 20.0
            signal = "BUY"
            signal_type = "pullback"
            entry_anchor = float(bb_mid.iloc[-1])
            reasons.append("Bullish: Pullback sehat ke dynamic Support MA20.")
        elif macd_hist.iloc[-1] > 0 and macd_hist.iloc[-1] > macd_hist.iloc[-2]:
            score = 15.0
            signal = "BUY"
            signal_type = "momentum"
            entry_anchor = float(bb_mid.iloc[-1])
            reasons.append("Bullish: Momentum positif dari histogram MACD.")
        else:
            score = 5.0
            signal = "HOLD"
            signal_type = "neutral"
            reasons.append("Bullish: Tren naik aktif tetapi momentum jangka pendek melambat.")
            
    else:  # bearish_trend
        score = -20.0
        signal = "SELL"
        signal_type = "bearish_exit"
        reasons.append("Bearish: Terjadi tren turun yang kuat (ADX >= 20, -DI > +DI).")
        
        if price < curr_ts or price < calculate_ema(close_series, 50).iloc[-1]:
            score = -25.0
            signal = "AVOID"
            reasons.append("Bearish: Harga di bawah trailing stop / EMA50.")

    nearest_res_val = None
    for lvl in sorted([x['resistance'] for x in kmeans_levels]):
        if lvl > price:
            nearest_res_val = lvl
            break
            
    target_1 = nearest_res_val if nearest_res_val else price * 1.075
    target_1 = max(price * 1.05, min(price * 1.15, target_1))
    target_2 = target_1 + (price * 0.05)
    
    stop_loss = curr_ts
    stop_distance = price - stop_loss
    
    tick_size = get_idx_tick_size(price)
    if stop_distance <= 0:
        stop_loss = price - (3.0 * tick_size)
        stop_distance = price - stop_loss
        
    rr = (target_1 - price) / stop_distance
    
    if signal == "BUY":
        if rr < MIN_BUY_RR:
            signal = "HOLD"
            score = 5.0
            warnings.append(f"Downgrade: Rasio Risk-Reward tidak menarik ({rr:.2f} < {MIN_BUY_RR}).")
            reasons.append(f"Sinyal diturunkan ke HOLD karena rasio Risk-Reward ({rr:.2f}) kurang dari 1.5.")

    fund_score, fund_status, fund_warnings = calculate_fundamental_score(fundamental_metrics, sector)
    warnings.extend(fund_warnings)
    
    if apply_fundamental_gate and fund_status == "unavailable" and signal == "BUY":
        signal = "HOLD"
        score = 5.0
        warnings.append("Sinyal BUY diblokir karena data fundamental tidak tersedia.")
        reasons.append("Sinyal BUY diturunkan ke HOLD karena data fundamental unavailable.")
        
    if apply_fundamental_gate and fund_status == "fail" and signal == "BUY":
        signal = "AVOID"
        score = -10.0
        warnings.append("Sinyal BUY diblokir oleh Fundamental Safety Gate (skor < 8/20).")
        reasons.append("Sinyal BUY diturunkan ke AVOID karena kesehatan fundamental gagal (fail).")
        
    if apply_fundamental_gate and fundamental_metrics:
        sorted_metrics = sorted(fundamental_metrics, key=lambda x: str(x.get("year", "")), reverse=True)
        latest_fund = sorted_metrics[0]
        net_profit = latest_fund.get("netProfit")
        if net_profit is not None and float(net_profit) <= 0 and signal == "BUY":
            signal = "AVOID"
            score = -10.0
            warnings.append("Sinyal BUY diblokir karena emiten rugi bersih periode terakhir.")
            reasons.append("Sinyal BUY diturunkan ke AVOID karena emiten membukukan rugi bersih.")

    confidence = "medium"
    if signal == "BUY":
        if rr >= MIN_STRONG_BUY_RR and fund_status == "pass":
            confidence = "high"
        elif rr < 1.7 or fund_status == "weak":
            confidence = "low"
            
    final_reason = " | ".join(reasons)
    entry_half_width = max(1.5 * tick_size, 0.25 * curr_atr)
    entry_low = round((entry_anchor - entry_half_width) / tick_size) * tick_size
    entry_high = round((entry_anchor + entry_half_width) / tick_size) * tick_size
    
    final_output = {
        "ticker": ticker,
        "as_of_date": as_of_date,
        "data_quality": "valid",
        "regime": regime,
        "regime_details": {
            "adx": round(curr_adx, 2),
            "plus_di": round(curr_plus_di, 2),
            "minus_di": round(curr_minus_di, 2),
            "bollinger_bandwidth": round(curr_bandwidth, 3)
        },
        "quant_signal": signal,
        "quant_signal_type": signal_type,
        "score": round(score, 1),
        "confidence": confidence,
        "entry_range": {
            "low": round(max(tick_size, entry_low), 0),
            "high": round(max(tick_size, entry_high), 0)
        },
        "target_profit_1": round(target_1, 0),
        "target_profit_2": round(target_2, 0),
        "stop_loss": round(stop_loss, 0),
        "atr_14": round(curr_atr, 2),
        "atr_trailing_stop": round(curr_ts, 0),
        "risk_reward": round(rr, 2),
        "fundamental_score": round(fund_score, 1),
        "fundamental_status": fund_status,
        "final_signal": signal,
        "final_reason": final_reason,
        "main_risk": "Resiko Volatilitas Pasar" if signal == "BUY" else "Resiko Penurunan Harga",
        "ai_status": "skipped",
        "warnings": warnings
    }
    
    return final_output
