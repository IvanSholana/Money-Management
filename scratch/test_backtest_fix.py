import sys
sys.path.insert(0, '.')
import backtest

tickers = ['BBRI', 'BBCA', 'BMRI', 'ASII', 'UNVR', 'KLBF', 'INDF', 'ICBP']
for tk in tickers:
    try:
        df, h, w = backtest.fetch_raw_yahoo_history(tk, '3y')
        if df.empty:
            print(f"{tk}: No data")
            continue
        res = backtest.run_backtest(df, [], tk, 'General')
        sig = res['signal_distribution']
        print(f"{tk}: Bars={len(df)}, Trades={res['number_of_trades']}, BUY={sig.get('BUY',0)}, PF={res['profit_factor']}, Exp={res['expectancy_percent']}%")
    except Exception as e:
        print(f"{tk}: ERROR {e}")
