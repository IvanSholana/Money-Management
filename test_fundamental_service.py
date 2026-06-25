import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

import fundamental_service


class TestFundamentalService(unittest.TestCase):
    def sample_raw(self):
        return {
            "resolved_symbol": "TLKM:IDX",
            "income_statement": {
                "income_statement": [
                    {
                        "fiscal_date": "2025-12-31",
                        "total_revenue": "1000",
                        "net_income": "120",
                        "diluted_eps": "12",
                    },
                    {
                        "fiscal_date": "2024-12-31",
                        "total_revenue": "900",
                        "net_income": "100",
                        "diluted_eps": "10",
                    },
                ]
            },
            "balance_sheet": {
                "balance_sheet": [
                    {
                        "fiscal_date": "2025-12-31",
                        "total_shareholders_equity": "600",
                        "total_debt": "300",
                    },
                    {
                        "fiscal_date": "2024-12-31",
                        "total_shareholders_equity": "550",
                        "total_debt": "320",
                    },
                ]
            },
            "cash_flow": {
                "cash_flow": [
                    {
                        "fiscal_date": "2025-12-31",
                        "operating_cash_flow": "180",
                        "free_cash_flow": "130",
                    }
                ]
            },
            "statistics": {"statistics": {"valuations_metrics": {"pe_ratio": "14", "price_to_book": "2"}}},
        }

    def test_provider_snapshot_is_cached_and_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "test.db"
            with patch("fundamental_service._fetch_provider_payload", return_value=(self.sample_raw(), [])) as fetch:
                first = fundamental_service.fetch_fundamental_snapshot(db_path, "TLKM.JK", "key")
                second = fundamental_service.fetch_fundamental_snapshot(db_path, "TLKM.JK", "key")
            self.assertEqual(first["source"], "twelve_data")
            self.assertEqual(second["freshness"], "fresh")
            self.assertEqual(fetch.call_count, 1)

    def test_partial_payload_returns_normalized_metrics(self):
        metrics, as_of, warnings = fundamental_service._normalize_payload(self.sample_raw())
        self.assertEqual(as_of, "2025-12-31")
        self.assertEqual(len(metrics), 2)
        self.assertAlmostEqual(metrics[0]["roe"], 20.0)
        self.assertAlmostEqual(metrics[0]["der"], 0.5)
        self.assertEqual(warnings, [])

    def test_critical_overlay_detects_negative_equity(self):
        overlay = fundamental_service.evaluate_risk_overlay(
            [{"year": "2025", "equity": -1, "netProfit": 10, "der": -2}],
            14,
            "pass",
        )
        self.assertEqual(overlay["status"], "critical")
        self.assertTrue(any("Ekuitas" in flag for flag in overlay["red_flags"]))

    def test_unavailable_overlay_does_not_create_red_flag(self):
        overlay = fundamental_service.evaluate_risk_overlay([], 0, "unavailable")
        self.assertEqual(overlay["status"], "unavailable")
        self.assertEqual(overlay["red_flags"], [])

    @patch("fundamental_service.yf.Ticker")
    def test_yfinance_payload_normalizes_idx_statements(self, ticker_mock):
        columns = [pd.Timestamp("2025-12-31"), pd.Timestamp("2024-12-31")]
        income = pd.DataFrame(
            [[1000, 900], [120, 100], [12, 10]],
            index=["Total Revenue", "Net Income", "Diluted EPS"],
            columns=columns,
        )
        balance = pd.DataFrame(
            [[600, 550], [300, 320]],
            index=["Stockholders Equity", "Total Debt"],
            columns=columns,
        )
        cashflow = pd.DataFrame(
            [[180, 160], [130, 110]],
            index=["Operating Cash Flow", "Free Cash Flow"],
            columns=columns,
        )
        ticker_mock.return_value = SimpleNamespace(
            income_stmt=income,
            balance_sheet=balance,
            cashflow=cashflow,
            get_info=lambda: {"trailingPE": 14, "priceToBook": 2},
        )
        metrics, as_of, warnings = fundamental_service.fetch_yfinance_payload("TLKM")
        self.assertEqual(as_of, "2025-12-31")
        self.assertEqual(len(metrics), 2)
        self.assertAlmostEqual(metrics[0]["roe"], 20)
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
