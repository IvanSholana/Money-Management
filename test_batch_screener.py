import unittest
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

import batch_screener


class TestBatchScreener(unittest.TestCase):
    def setUp(self):
        batch_screener.screening_cache.clear()
        dates = pd.date_range(end=pd.Timestamp.now().normalize(), periods=90, freq="B")
        prices = np.linspace(1000, 1250, len(dates))
        self.df = pd.DataFrame(
            {
                "Date": dates,
                "Open": prices - 5,
                "High": prices + 15,
                "Low": prices - 15,
                "Close": prices,
                "Volume": [10_000_000] * len(dates),
            }
        )
        self.fundamentals = [
            {
                "year": "2025",
                "roe": 18.0,
                "der": 0.5,
                "revenue": 1200,
                "netProfit": 200,
                "pe": 10.0,
                "pbv": 1.2,
            },
            {
                "year": "2024",
                "roe": 15.0,
                "der": 0.6,
                "revenue": 1000,
                "netProfit": 150,
                "pe": 12.0,
                "pbv": 1.5,
            },
        ]

    def loader(self, ticker, _syariah_filter):
        return {
            "ticker": ticker,
            "df": self.df.copy(),
            "fundamental_metrics": self.fundamentals,
            "sector": "Consumer",
            "syariah_status": "DES",
            "adjusted_price_status": "known",
            "warnings": [],
        }

    def good_quant(self, ticker="GOOD.JK", **updates):
        result = {
            "ticker": ticker,
            "as_of_date": "2026-06-24",
            "data_quality": "valid",
            "regime": "bullish_trend",
            "quant_signal_type": "pullback",
            "score": 20.0,
            "confidence": "high",
            "entry_range": {"low": 1230.0, "high": 1260.0},
            "target_profit_1": 1350.0,
            "target_profit_2": 1420.0,
            "stop_loss": 1180.0,
            "atr_trailing_stop": 1190.0,
            "risk_reward": 2.2,
            "fundamental_score": 16.0,
            "fundamental_status": "pass",
            "final_signal": "BUY",
            "warnings": [],
        }
        result.update(updates)
        return result

    def good_backtest(self, **updates):
        result = {
            "total_return_percent": 18.0,
            "cagr_percent": 16.0,
            "number_of_trades": 12,
            "win_rate_percent": 58.0,
            "average_gain_percent": 5.0,
            "average_loss_percent": -2.0,
            "profit_factor": 1.8,
            "max_drawdown_percent": 8.0,
            "average_holding_days": 9.0,
            "expectancy_percent": 2.06,
            "false_breakout_count": 1,
            "recent_stability_score": 72.0,
        }
        result.update(updates)
        return result

    def test_parse_tickers_from_list_comma_and_newline(self):
        expected = ["TLKM.JK", "ICBP.JK", "MIKA.JK"]
        self.assertEqual(
            batch_screener.parse_tickers(["tlkm", "ICBP.JK", "MIKA"]),
            expected,
        )
        self.assertEqual(
            batch_screener.parse_tickers("tlkm, ICBP.JK, MIKA"),
            expected,
        )
        self.assertEqual(
            batch_screener.parse_tickers("tlkm\nICBP.JK\nMIKA"),
            expected,
        )

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_rejected_ticker_due_to_stale_data(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant(
            data_quality="stale",
            final_signal="AVOID",
        )
        backtest_mock.return_value = self.good_backtest()
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        ticker = result["all_results"][0]
        self.assertEqual(ticker["screening_status"], "rejected")
        self.assertIn("Kualitas data stale", ticker["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_rejected_ticker_due_to_low_liquidity(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()

        def low_liquidity_loader(ticker, syariah_filter):
            loaded = self.loader(ticker, syariah_filter)
            loaded["df"]["Volume"] = 10
            return loaded

        result = batch_screener.screen_batch(["TLKM"], low_liquidity_loader)
        ticker = result["all_results"][0]
        self.assertEqual(ticker["liquidity_status"], "low")
        self.assertIn("Likuiditas", ticker["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_weak_fundamental_only_adds_risk_overlay(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant(fundamental_status="fail")
        backtest_mock.return_value = self.good_backtest()
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        ticker = result["all_results"][0]
        self.assertNotIn("Fundamental", ticker["rejection_reason"] or "")
        self.assertEqual(ticker["fundamental_status"], "caution")

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_critical_fundamental_red_flag_blocks_buy(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()

        def critical_loader(ticker, syariah_filter):
            loaded = self.loader(ticker, syariah_filter)
            loaded["fundamental_metrics"][0]["equity"] = -100
            return loaded

        result = batch_screener.screen_batch(["TLKM"], critical_loader)
        ticker = result["all_results"][0]
        self.assertEqual(ticker["fundamental_status"], "critical")
        self.assertIn("Ekuitas", ticker["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_rejected_ticker_due_to_poor_risk_reward(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant(risk_reward=1.2)
        backtest_mock.return_value = self.good_backtest()
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        self.assertIn("Risk-reward", result["all_results"][0]["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_rejected_when_price_is_too_extended(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant(
            entry_range={"low": 1000.0, "high": 1100.0},
        )
        backtest_mock.return_value = self.good_backtest()
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        self.assertIn("mengejar harga", result["all_results"][0]["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_ranking_order_uses_candidate_rank_score(self, quant_mock, backtest_mock):
        def quant_side_effect(_df, _fundamentals, ticker, *_args, **_kwargs):
            if ticker == "HIGH.JK":
                return self.good_quant(ticker, confidence="high", risk_reward=2.8)
            return self.good_quant(ticker, confidence="medium", risk_reward=1.6)

        def backtest_side_effect(_df, _fundamentals, ticker, _sector, **_kwargs):
            if ticker == "HIGH.JK":
                return self.good_backtest(profit_factor=2.1, expectancy_percent=2.5)
            return self.good_backtest(profit_factor=1.3, expectancy_percent=0.5)

        quant_mock.side_effect = quant_side_effect
        backtest_mock.side_effect = backtest_side_effect
        result = batch_screener.screen_batch(["LOW", "HIGH"], self.loader, top_n=2)
        self.assertEqual(result["top_candidates"][0]["ticker"], "HIGH.JK")
        self.assertGreater(
            result["top_candidates"][0]["candidate_rank_score"],
            result["top_candidates"][1]["candidate_rank_score"],
        )

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_poor_backtest_performance_is_rejected(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest(
            profit_factor=0.7,
            expectancy_percent=-0.8,
            max_drawdown_percent=35.0,
        )
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        ticker = result["all_results"][0]
        self.assertEqual(ticker["screening_status"], "rejected")
        self.assertIn("Expectancy backtest tidak positif", ticker["rejection_reason"])

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_zero_trade_backtest_has_explicit_status(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest(number_of_trades=0)
        result = batch_screener.screen_batch(["TLKM"], self.loader)
        ticker = result["all_results"][0]
        self.assertEqual(ticker["backtest_status"], "no_trades")
        self.assertEqual(ticker["backtest_summary"]["number_of_trades"], 0)

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_llm_disabled_mode_does_not_call_reviewer(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()
        reviewer = Mock()
        result = batch_screener.screen_batch(
            ["TLKM"],
            self.loader,
            use_ai_review=False,
            ai_reviewer=reviewer,
        )
        reviewer.assert_not_called()
        self.assertEqual(result["top_candidates"][0]["ai_review_status"], "skipped")

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_llm_failure_falls_back_to_local_result(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()
        reviewer = Mock(side_effect=RuntimeError("quota"))
        result = batch_screener.screen_batch(
            ["TLKM"],
            self.loader,
            use_ai_review=True,
            ai_reviewer=reviewer,
        )
        candidate = result["top_candidates"][0]
        self.assertEqual(candidate["quant_signal"], "BUY")
        self.assertEqual(candidate["ai_review_status"], "unavailable")
        self.assertTrue(any("quota" in warning for warning in candidate["warnings"]))

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_stable_schema_when_one_ticker_fails(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()

        def partial_loader(ticker, syariah_filter):
            if ticker == "FAIL.JK":
                return {"error": "network down", "df": pd.DataFrame()}
            return self.loader(ticker, syariah_filter)

        result = batch_screener.screen_batch(["GOOD", "FAIL"], partial_loader)
        self.assertEqual(result["total_input_tickers"], 2)
        self.assertEqual(len(result["all_results"]), 2)
        failed = next(item for item in result["all_results"] if item["ticker"] == "FAIL.JK")
        for key in (
            "screening_status",
            "backtest_summary",
            "candidate_rank_score",
            "entry_status",
            "exit_plan",
            "ai_review_status",
        ):
            self.assertIn(key, failed)

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_no_llm_call_for_rejected_ticker(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant(
            final_signal="AVOID",
            regime="bearish_trend",
        )
        backtest_mock.return_value = self.good_backtest()
        reviewer = Mock()
        result = batch_screener.screen_batch(
            ["TLKM"],
            self.loader,
            use_ai_review=True,
            ai_reviewer=reviewer,
        )
        reviewer.assert_not_called()
        self.assertEqual(result["summary"]["ai_reviewed_candidates"], 0)

    @patch("batch_screener.backtest.run_backtest")
    @patch("batch_screener.signal_engine.run_quant_screening")
    def test_ai_may_downgrade_but_not_create_new_buy(self, quant_mock, backtest_mock):
        quant_mock.return_value = self.good_quant()
        backtest_mock.return_value = self.good_backtest()
        reviewer = Mock(
            return_value=[
                {
                    "ticker": "TLKM.JK",
                    "ai_final_signal": "HOLD",
                    "ai_confidence": "medium",
                    "ai_reason": "Backtest belum cukup stabil.",
                }
            ]
        )
        result = batch_screener.screen_batch(
            ["TLKM"],
            self.loader,
            use_ai_review=True,
            ai_reviewer=reviewer,
        )
        candidate = result["top_candidates"][0]
        self.assertEqual(candidate["quant_signal"], "BUY")
        self.assertEqual(candidate["ai_final_signal"], "HOLD")
        self.assertEqual(candidate["screening_status"], "warning")


if __name__ == "__main__":
    unittest.main()
