import unittest
import pandas as pd
import numpy as np
import signal_engine

class TestSignalEngine(unittest.TestCase):

    def setUp(self):
        # Create a default base dataframe with 60 periods of data ending today to avoid stale gate
        self.dates = pd.date_range(end=pd.Timestamp.now().strftime('%Y-%m-%d'), periods=60, freq="D")
        self.base_df = pd.DataFrame({
            "Date": self.dates,
            "Open": np.linspace(1000, 1100, 60),
            "High": np.linspace(1020, 1120, 60),
            "Low": np.linspace(980, 1080, 60),
            "Close": np.linspace(1000, 1100, 60),
            "Volume": [1000000] * 60
        })
        self.good_fundamental = [
            {
                "year": "2025",
                "roe": 18.0,
                "der": 0.5,
                "revenue": 1200,
                "netProfit": 200,
                "pe": 10.0,
                "pbv": 1.2
            },
            {
                "year": "2024",
                "roe": 15.0,
                "der": 0.6,
                "revenue": 1000,
                "netProfit": 150,
                "pe": 12.0,
                "pbv": 1.5
            }
        ]

    # ==========================================
    # TEST 1: IDX TICK-SIZE BOUNDARIES
    # ==========================================
    def test_idx_tick_size_boundaries(self):
        self.assertEqual(signal_engine.get_idx_tick_size(150), 1.0)
        self.assertEqual(signal_engine.get_idx_tick_size(200), 2.0)
        self.assertEqual(signal_engine.get_idx_tick_size(500), 5.0)
        self.assertEqual(signal_engine.get_idx_tick_size(2000), 10.0)
        self.assertEqual(signal_engine.get_idx_tick_size(5000), 25.0)  # Critical boundary check!
        self.assertEqual(signal_engine.get_idx_tick_size(7500), 25.0)
        self.assertEqual(signal_engine.get_idx_tick_size(-10), 1.0)

    # ==========================================
    # TEST 2: REGIME CLASSIFICATION
    # ==========================================
    def test_regime_classification_bullish(self):
        # Strong uptrend
        df = self.base_df.copy()
        # Ensure ADX is high and +DI > -DI
        for i in range(15, 60):
            df.loc[i, "High"] = df.loc[i-1, "High"] + 10
            df.loc[i, "Low"] = df.loc[i-1, "Low"] + 8
            df.loc[i, "Close"] = df.loc[i-1, "Close"] + 9
            
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["regime"], "bullish_trend")

    def test_regime_classification_bearish(self):
        # Strong downtrend
        df = self.base_df.copy()
        for i in range(15, 60):
            df.loc[i, "High"] = df.loc[i-1, "High"] - 8
            df.loc[i, "Low"] = df.loc[i-1, "Low"] - 10
            df.loc[i, "Close"] = df.loc[i-1, "Close"] - 9
            
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["regime"], "bearish_trend")
        self.assertIn(res["final_signal"], ["SELL", "AVOID"])

    # ==========================================
    # TEST 3: RATCHET TRAILING STOP BEHAVIOR
    # ==========================================
    def test_ratchet_trailing_stop_never_decreases(self):
        # Create a series where price goes up then crashes down
        closes = [1000 + i*10 for i in range(30)] + [1300 - i*30 for i in range(10)]
        highs = [c + 10 for c in closes]
        lows = [c - 10 for c in closes]
        volumes = [1000000] * len(closes)
        dates = pd.date_range(end=pd.Timestamp.now().strftime('%Y-%m-%d'), periods=len(closes), freq="D")
        
        df = pd.DataFrame({
            "Date": dates,
            "Open": closes,
            "High": highs,
            "Low": lows,
            "Close": closes,
            "Volume": volumes
        })
        
        atr, stops = signal_engine.calculate_atr_and_trailing_stop(df, 14, 3.0)
        
        # Verify that trailing stop never decreases before it is breached
        for i in range(1, 31):
            self.assertGreaterEqual(stops.iloc[i], stops.iloc[i-1])

    # ==========================================
    # TEST 4: RISK-REWARD DOWNGRADE
    # ==========================================
    def test_poor_risk_reward_downgrade(self):
        # If stop loss is very far (high volatility/ATR), RR should be low and downgrade signal to HOLD
        closes = [1000] * 59 + [1010]
        highs = [1200] * 60  # Large high-low range creates huge ATR
        lows = [800] * 60
        df = pd.DataFrame({
            "Date": self.dates,
            "Open": closes,
            "High": highs,
            "Low": lows,
            "Close": closes,
            "Volume": [1000000] * 60
        })
        
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        # Technical indicators might suggest a sideways bounce or minor uptick, but ATR stop is extremely far
        # Ensure it is downgraded or remains HOLD
        self.assertEqual(res["quant_signal"], "HOLD")
        self.assertLess(res["risk_reward"], 1.5)

    # ==========================================
    # TEST 5: FUNDAMENTAL HARD GATES
    # ==========================================
    def test_fundamental_gate_fail(self):
        # High DER and negative ROE will fail Health score (< 8)
        bad_fundamental = [{
            "year": "2025",
            "roe": -5.0,
            "der": 4.0,
            "revenue": 1000,
            "netProfit": -100,
            "pe": -10.0,
            "pbv": 5.0
        }]
        
        df = self.base_df.copy()
        res = signal_engine.run_quant_screening(df, bad_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["fundamental_status"], "fail")
        self.assertIn(res["final_signal"], ["HOLD", "AVOID"])

    def test_fundamental_gate_unavailable(self):
        # Empty fundamental data should block BUY signal
        df = self.base_df.copy()
        res = signal_engine.run_quant_screening(df, [], "TLKM.JK", "Financial Services")
        self.assertEqual(res["fundamental_status"], "unavailable")
        self.assertNotEqual(res["final_signal"], "BUY")

    def test_fundamental_negative_profit_gate(self):
        # Even if other metrics are okay, negative profit blocks BUY
        neg_profit_fundamental = [{
            "year": "2025",
            "roe": 15.0,  # Faked good roe
            "der": 0.5,
            "revenue": 1000,
            "netProfit": -50,  # Negative earnings
            "pe": -10.0,
            "pbv": 1.0
        }]
        df = self.base_df.copy()
        res = signal_engine.run_quant_screening(df, neg_profit_fundamental, "TLKM.JK", "Financial Services")
        self.assertIn(res["final_signal"], ["HOLD", "AVOID"])

    # ==========================================
    # TEST 6: NaN & STALE DATA HANDLING
    # ==========================================
    def test_nan_handling(self):
        df = self.base_df.copy()
        # Introduce some NaNs
        df.loc[10:12, "Close"] = np.nan
        df.loc[30:31, "High"] = np.nan
        
        # Screening should handle it (fill NaNs and succeed)
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["data_quality"], "valid")

    def test_stale_data_gate(self):
        # Dates far in the past
        old_dates = pd.date_range(start="2020-01-01", periods=60, freq="D")
        df = self.base_df.copy()
        df["Date"] = old_dates
        
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["data_quality"], "stale")
        self.assertEqual(res["final_signal"], "AVOID")

    # ==========================================
    # TEST 7: LIQUIDITY & INSUFFICIENT DATA GATES
    # ==========================================
    def test_low_liquidity_gate(self):
        df = self.base_df.copy()
        # Drop Volume to make daily value very small
        df["Volume"] = 100  # 100 shares * 1000 IDR = 100,000 IDR (< 500 million IDR)
        
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["final_signal"], "AVOID")
        self.assertEqual(res["main_risk"], "Likuiditas Rendah")

    def test_insufficient_historical_data_gate(self):
        # Only 20 days of data
        short_df = self.base_df.iloc[:20].copy()
        res = signal_engine.run_quant_screening(short_df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["data_quality"], "incomplete")
        self.assertEqual(res["final_signal"], "AVOID")

    def test_constant_price_series_gate(self):
        df = self.base_df.copy()
        df["Close"] = 1000.0  # Flat close
        res = signal_engine.run_quant_screening(df, self.good_fundamental, "TLKM.JK", "Financial Services")
        self.assertEqual(res["final_signal"], "AVOID")

    # ==========================================
    # TEST 8: MALFORMED FUNDAMENTAL DATA
    # ==========================================
    def test_malformed_fundamental_data(self):
        # Passing wrong types or missing expected fields
        malformed = [
            {
                "year": "2025",
                "roe": "invalid_roe_string",
                "der": "invalid_der"
            }
        ]
        df = self.base_df.copy()
        res = signal_engine.run_quant_screening(df, malformed, "TLKM.JK", "Financial Services")
        # Should gracefully return failed/weak fundamental status, but not raise an exception
        self.assertIn(res["fundamental_status"], ["fail", "weak"])


if __name__ == "__main__":
    unittest.main()
