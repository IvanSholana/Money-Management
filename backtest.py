import json
import urllib.request
import urllib.parse
import time
import math
from datetime import datetime, timezone
import pandas as pd
import numpy as np
import signal_engine


def fetch_raw_yahoo_history(symbol: str, range_val: str = "1y") -> tuple[pd.DataFrame, bool, str]:
    """
    Downloads history chart from Yahoo Finance and extracts both unadjusted and adjusted closes.
    Returns: (DataFrame, is_adjusted_aware, warning_msg)
    """
    cleaned = symbol.strip().upper()
    if not cleaned.endswith(".JK"):
        cleaned = f"{cleaned}.JK"
        
    chart_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(cleaned)}?interval=1d&range={range_val}"
    req = urllib.request.Request(chart_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            chart_data = json.loads(response.read().decode())
            
        if not chart_data.get("chart", {}).get("result"):
            raise Exception("No result returned from Yahoo Finance.")
            
        res = chart_data["chart"]["result"][0]
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
            c = raw_close[i]
            o = raw_open[i]
            h = raw_high[i]
            l = raw_low[i]
            v = raw_volume[i]
            
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
                    
        df = pd.DataFrame({
            "Date": clean_ts,
            "Open": clean_open,
            "High": clean_high,
            "Low": clean_low,
            "Close": clean_close,
            "Volume": clean_volume
        })
        
        warning_msg = ""
        if mismatch_found:
            warning_msg = (
                "WARNING: Detected difference between close price and adjusted close price. "
                "This indicates corporate actions (splits, dividends) occurred in this period. "
                "Since standard calculations use unadjusted closes, backtest results may have anomalies."
            )
        elif not has_adj:
            warning_msg = "WARNING: Adjusted close price data not available. Historical split adjustments cannot be verified."
            
        return df, has_adj, warning_msg
        
    except Exception as e:
        print(f"Error fetching data for {cleaned}: {e}")
        return pd.DataFrame(), False, f"Failed to download history: {str(e)}"


def run_backtest(
    df: pd.DataFrame,
    fundamental_metrics: list[dict],
    ticker: str,
    sector: str = None,
    max_holding_days: int = 40,
    entry_evaluation_step: int = 5,
) -> dict:
    """
    Simulates a daily swing trading backtest bar-by-bar to avoid look-ahead bias.
    Entry happens at Day T+1 Open. Exits include commission and IDX tick slippage.
    Stateful ATR trailing stop is implemented.
    """
    if len(df) < 40:
        return {"error": f"Insufficient historical data for backtesting {ticker} (minimum 40 days required)."}
        
    # Transaction variables
    buy_commission_rate = 0.0015  # 0.15%
    sell_commission_rate = 0.0025 # 0.25%
    
    position_active = False
    entry_price = 0.0
    entry_idx = 0
    target_price = 0.0
    max_stop = 0.0
    
    trades = []
    signals_count = {"BUY": 0, "HOLD": 0, "SELL": 0, "AVOID": 0}
    
    # Calculate indicators once on the whole df (to be able to read ATR in slice efficiently,
    # but slicing df_slice for signals to avoid look-ahead bias in decision tree).
    atr_series, trailing_stops = signal_engine.calculate_atr_and_trailing_stop(df, 14, signal_engine.ATR_MULTIPLIER)
    df_with_atr = df.copy()
    df_with_atr['ATR'] = atr_series
    
    # Iterate bar-by-bar
    # Start at 30 to allow indicators to form
    for t in range(30, len(df) - 1):
        # If position is active, monitor exits daily without recalculating the
        # expensive entry model. New entry opportunities are evaluated weekly.
        if position_active:
            next_day = df.iloc[t+1]
            next_low = float(next_day['Low'])
            next_high = float(next_day['High'])
            next_open = float(next_day['Open'])
            next_close = float(next_day['Close'])
            
            # Update stateful trailing stop using Day T close values
            # Stop distance = 3x ATR below Close
            day_t_atr = float(df_with_atr['ATR'].iloc[t])
            day_t_close = float(df_with_atr['Close'].iloc[t])
            new_stop = day_t_close - (signal_engine.ATR_MULTIPLIER * day_t_atr)
            max_stop = max(max_stop, new_stop)  # Stateful stop never decreases
            
            exit_triggered = False
            exit_price = 0.0
            exit_reason = ""
            
            # Check Stop Loss breach
            if next_low <= max_stop:
                exit_triggered = True
                # If open is already below stop, exit at open (gap down)
                exit_price = min(next_open, max_stop)
                exit_reason = "Stop Loss Dinamis (ATR)"
            # Check Target Profit reach
            elif next_high >= target_price:
                exit_triggered = True
                exit_price = target_price
                exit_reason = "Target Profit 1"
            elif (t + 1) - entry_idx >= max_holding_days:
                exit_triggered = True
                exit_price = next_close
                exit_reason = f"Time Stop ({max_holding_days} Hari)"
                
            if exit_triggered:
                # Apply slippage (subtract 1 IDX tick)
                tick = signal_engine.get_idx_tick_size(exit_price)
                exit_price_slipped = exit_price - tick
                
                # Apply commission
                net_exit_val = exit_price_slipped * (1.0 - sell_commission_rate)
                gross_return = (net_exit_val - entry_price) / entry_price
                
                trades.append({
                    "entry_date": signal_engine.parse_date_safely(df['Date'].iloc[entry_idx]).strftime('%Y-%m-%d'),
                    "exit_date": signal_engine.parse_date_safely(next_day['Date']).strftime('%Y-%m-%d'),
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price_slipped, 2),
                    "exit_reason": exit_reason,
                    "holding_days": (t + 1) - entry_idx,
                    "return": round(gross_return * 100, 2),
                    "profit": (net_exit_val - entry_price) > 0
                })
                position_active = False

            continue

        if (t - 30) % max(1, entry_evaluation_step) != 0:
            continue

        df_slice = df.iloc[max(0, t - 251):t + 1].copy()
        res = signal_engine.run_quant_screening(
            df_slice,
            fundamental_metrics,
            ticker,
            sector,
            is_backtest=True,
            apply_fundamental_gate=False,
        )
        sig = res["final_signal"]
        signals_count[sig] = signals_count.get(sig, 0) + 1

        # Sinyal BUY didapat di Close hari T, entri di Open hari T+1.
        if sig == "BUY":
            next_day = df.iloc[t+1]
            raw_entry = float(next_day['Open'])
            
            # Apply slippage (add 1 IDX tick)
            tick = signal_engine.get_idx_tick_size(raw_entry)
            entry_price_slipped = raw_entry + tick
            
            # Add buying commission
            entry_price = entry_price_slipped * (1.0 + buy_commission_rate)
            entry_idx = t + 1
            
            # Initialize stateful targets
            target_price = float(res["target_profit_1"])
            
            # Initial stop
            day_t_atr = float(df_with_atr['ATR'].iloc[t])
            day_t_close = float(df_with_atr['Close'].iloc[t])
            max_stop = day_t_close - (signal_engine.ATR_MULTIPLIER * day_t_atr)

            execution_risk = entry_price_slipped - max_stop
            execution_reward = target_price - entry_price_slipped
            execution_rr = execution_reward / execution_risk if execution_risk > 0 else -1.0
            # Use a relaxed R:R threshold (1.0) for backtest to get enough
            # trade samples for statistical confidence.  The live trading
            # gate (MIN_BUY_RR = 1.5) remains unchanged.
            BACKTEST_MIN_RR = 1.0
            if execution_rr < BACKTEST_MIN_RR:
                entry_price = 0.0
                target_price = 0.0
                max_stop = 0.0
                continue

            position_active = True
            
    # Force close any open position at the end of backtest period
    if position_active:
        last_day = df.iloc[-1]
        exit_price = float(last_day['Close'])
        tick = signal_engine.get_idx_tick_size(exit_price)
        exit_price_slipped = exit_price - tick
        net_exit_val = exit_price_slipped * (1.0 - sell_commission_rate)
        gross_return = (net_exit_val - entry_price) / entry_price
        
        trades.append({
            "entry_date": signal_engine.parse_date_safely(df['Date'].iloc[entry_idx]).strftime('%Y-%m-%d'),
            "exit_date": signal_engine.parse_date_safely(last_day['Date']).strftime('%Y-%m-%d'),
            "entry_price": round(entry_price, 2),
            "exit_price": round(exit_price_slipped, 2),
            "exit_reason": "Force Close (End of Data)",
            "holding_days": (len(df) - 1) - entry_idx,
            "return": round(gross_return * 100, 2),
            "profit": (net_exit_val - entry_price) > 0
        })
        
    # Calculate performance metrics
    num_trades = len(trades)
    total_ret = 0.0
    win_rate = 0.0
    avg_gain = 0.0
    avg_loss = 0.0
    profit_factor = 0.0
    max_dd = 0.0
    avg_holding = 0.0
    expectancy = 0.0
    cagr = 0.0
    false_breakout_count = 0
    recent_stability_score = 50.0
    
    if num_trades > 0:
        returns = [tr["return"] for tr in trades]
        # Cumulative compounding return simulation
        portfolio_val = 1.0
        portfolio_series = [1.0]
        
        for r in returns:
            portfolio_val *= (1.0 + (r / 100.0))
            portfolio_series.append(portfolio_val)
            
        total_ret = (portfolio_val - 1.0) * 100
        
        # Max Drawdown
        peak = 1.0
        drawdowns = []
        for v in portfolio_series:
            if v > peak:
                peak = v
            dd = (peak - v) / peak if peak != 0 else 0.0
            drawdowns.append(dd)
        max_dd = max(drawdowns) * 100
        
        # Wins/Losses
        wins = [r for r in returns if r > 0]
        losses = [r for r in returns if r <= 0]
        
        win_rate = (len(wins) / num_trades) * 100
        avg_gain = sum(wins) / len(wins) if wins else 0.0
        avg_loss = sum(losses) / len(losses) if losses else 0.0
        win_probability = len(wins) / num_trades
        expectancy = (win_probability * avg_gain) - ((1.0 - win_probability) * abs(avg_loss))
        
        sum_wins = sum(wins)
        sum_losses = abs(sum(losses))
        profit_factor = sum_wins / sum_losses if sum_losses != 0 else (999.9 if sum_wins > 0 else 0.0)
        avg_holding = sum([tr["holding_days"] for tr in trades]) / num_trades
        false_breakout_count = len(
            [
                trade
                for trade in trades
                if trade["exit_reason"] == "Stop Loss Dinamis (ATR)"
                and trade["holding_days"] <= 5
                and trade["return"] < 0
            ]
        )
        recent_sample = returns[-min(5, len(returns)):]
        recent_average = sum(recent_sample) / len(recent_sample) if recent_sample else 0.0
        overall_average = sum(returns) / len(returns)
        recent_stability_score = max(
            0.0,
            min(
                100.0,
                50.0
                + (recent_average * 8.0)
                - (abs(recent_average - overall_average) * 6.0),
            ),
        )

        start_date = signal_engine.parse_date_safely(df["Date"].iloc[0])
        end_date = signal_engine.parse_date_safely(df["Date"].iloc[-1])
        years = max((end_date - start_date).days / 365.25, 1 / 365.25)
        if portfolio_val > 0:
            cagr = ((portfolio_val ** (1.0 / years)) - 1.0) * 100
        
    return {
        "ticker": ticker,
        "total_return_percent": round(total_ret, 2),
        "cagr_percent": round(cagr, 2),
        "number_of_trades": num_trades,
        "win_rate_percent": round(win_rate, 2),
        "average_gain_percent": round(avg_gain, 2),
        "average_loss_percent": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2),
        "max_drawdown_percent": round(max_dd, 2),
        "average_holding_days": round(avg_holding, 1),
        "expectancy_percent": round(expectancy, 2),
        "false_breakout_count": false_breakout_count,
        "recent_stability_score": round(recent_stability_score, 2),
        "fundamental_gate_applied": False,
        "methodology_note": (
            "Backtest mengukur aturan teknikal tanpa fundamental gate historis "
            "untuk menghindari look-ahead dari data fundamental terbaru. "
            f"Peluang entry dievaluasi setiap {max(1, entry_evaluation_step)} trading days "
            "dan posisi aktif dimonitor setiap hari."
        ),
        "signal_distribution": signals_count,
        "trades": trades
    }


if __name__ == "__main__":
    import sys
    ticker = sys.argv[1] if len(sys.argv) > 1 else "TLKM"
    print(f"Running backtest for: {ticker}")
    
    # Dummy fundamental data for standalone script run
    metrics = [
        {
            "year": "2025",
            "roe": 15.5,
            "der": 0.8,
            "revenue": 1000000,
            "netProfit": 180000,
            "pe": 13.0,
            "pbv": 2.0
        },
        {
            "year": "2024",
            "roe": 14.8,
            "der": 0.9,
            "revenue": 950000,
            "netProfit": 160000,
            "pe": 14.5,
            "pbv": 2.2
        }
    ]
    
    df, has_adj, warning = fetch_raw_yahoo_history(ticker, "1y")
    if df.empty:
        print("Gagal mengambil data historis saham.")
        sys.exit(1)
        
    print(f"Loaded {len(df)} days of historical OHLCV data.")
    if warning:
        print(f"\n[DATA WARNING]: {warning}\n")
        
    res = run_backtest(df, metrics, ticker, "Telecom")
    if "error" in res:
        print(f"Backtest error: {res['error']}")
    else:
        print("\n===== BACKTEST PERFORMANCE REPORT =====")
        print(f"Ticker: {res['ticker']}")
        print(f"Total return: {res['total_return_percent']}%")
        print(f"Number of trades: {res['number_of_trades']}")
        print(f"Win rate: {res['win_rate_percent']}%")
        print(f"Avg gain: {res['average_gain_percent']}%")
        print(f"Avg loss: {res['average_loss_percent']}%")
        print(f"Profit factor: {res['profit_factor']}")
        print(f"Max drawdown: {res['max_drawdown_percent']}%")
        print(f"Avg holding period: {res['average_holding_days']} trading days")
        print(f"Signal counts: {res['signal_distribution']}")
        print("=======================================\n")
        
        if res['trades']:
            print("Trades history (last 5):")
            for t in res['trades'][-5:]:
                print(f"  Entry: {t['entry_date']} @ {t['entry_price']} | Exit: {t['exit_date']} @ {t['exit_price']} | Return: {t['return']}% | Reason: {t['exit_reason']}")
