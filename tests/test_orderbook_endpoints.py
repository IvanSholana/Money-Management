import json
import unittest
from unittest.mock import patch, MagicMock
import app
from orderbook_schema import OrderBookSnapshot, ExecutionCheckResult

class TestOrderbookEndpoints(unittest.TestCase):

    def setUp(self):
        # Configure app for testing
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()
        
        # Push application context
        self.app_context = app.app.app_context()
        self.app_context.push()
        
        # Mock database initialization so we don't break existing data
        self.db_conn = app.get_db()
        app.init_db()

        # Inject a dummy candidate into batch_screener cache so we can pass lookup checks
        import batch_screener
        import time
        from batch_screener import screening_cache
        
        self.candidate_id = "test-cand-123"
        self.candidate = {
            "candidate_id": self.candidate_id,
            "symbol": "TLKM.JK",
            "ticker": "TLKM",
            "name": "Telkom Indonesia",
            "quant_signal": "BUY",
            "algoSignal": "BUY",
            "final_signal": "BUY",
            "screening_status": "passed",
            "price": 3100,
            "currency": "IDR",
            "sector": "Infrastruktur",
            "adx": 30,
            "stochasticK": 15,
            "bbUpper": 3200,
            "bbLower": 3000,
            "bbMid": 3100,
            "atr": 50,
            "trailingStop": 2950
        }
        
        # Save to cache
        with screening_cache._lock:
            screening_cache._items["TLKM.JK"] = (time.time(), self.candidate)

    def tearDown(self):
        self.app_context.pop()

    @patch("stockbit_orderbook_reader.read_stockbit_symbol_html")
    def test_orderbook_check_endpoint(self, mock_reader):
        # Mock reader response
        mock_html = """
        <html>
            <body>
                <div class="symbol-price">Rp 3.100</div>
                <div class="orderbook-container">
                    <table>
                        <tr>
                            <td>1.500 Lot</td>
                            <td>3.090</td>
                            <td>3.100</td>
                            <td>2.000 Lot</td>
                        </tr>
                    </table>
                </div>
            </body>
        </html>
        """
        mock_reader.return_value = (mock_html, "https://stockbit.com/symbol/TLKM")
        
        # Call API check endpoint
        response = self.client.post(
            "/api/execution/orderbook/check",
            data=json.dumps({
                "ticker": "TLKM",
                "candidate_id": self.candidate_id,
                "planned_order_lots": 5,
                "headless": True
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertEqual(data["status"], "success")
        self.assertIn("snapshot_id", data)
        self.assertIn("review_id", data)
        
        # Verify snapshot structures
        snapshot = data["snapshot"]
        self.assertEqual(snapshot["ticker"], "TLKM")
        self.assertEqual(snapshot["last_price"], 3100)
        self.assertEqual(snapshot["best_bid_price"], 3090)
        self.assertEqual(snapshot["best_offer_price"], 3100)
        self.assertEqual(snapshot["spread_ticks"], 1)
        
        # Verify evaluation
        evaluation = data["evaluation"]
        self.assertEqual(evaluation["ticker"], "TLKM")
        self.assertEqual(evaluation["execution_status"], "EXECUTION_OK")
        self.assertGreater(evaluation["execution_score"], 50)

    @patch("app.call_deepseek_with_rotation")
    def test_orderbook_review_endpoint(self, mock_deepseek):
        # Mock DeepSeek API response
        mock_ai_json = """
        {
          "ai_execution_status": "EXECUTION_OK",
          "ai_confidence": 85,
          "summary": "AI believes liquidity is strong.",
          "execution_risks": [],
          "supporting_factors": ["High volume bid"],
          "blocking_factors": [],
          "manual_checklist": ["Check index momentum"],
          "final_note": "Approved."
        }
        """
        mock_deepseek.return_value = mock_ai_json
        
        # Pre-populate snapshot in db first (so get_latest_orderbook_snapshot doesn't return None)
        import orderbook_database
        from orderbook_schema import OrderBookSnapshot, OrderBookRow
        
        snap = OrderBookSnapshot(
            ticker="TLKM",
            page_url="https://stockbit.com/symbol/TLKM",
            last_price=3100,
            best_bid_price=3090,
            best_offer_price=3100,
            spread_ticks=1,
            spread_percent=0.32,
            bid_rows=[OrderBookRow(price=3090, volume=1500)],
            offer_rows=[OrderBookRow(price=3100, volume=2000)],
            timestamp_read="2026-06-28T00:00:00Z",
            read_confidence=100.0
        )
        
        res = ExecutionCheckResult(
            ticker="TLKM",
            execution_status="EXECUTION_OK",
            execution_score=90.0,
            orderbook_metrics={},
            execution_reasons=["Valid spread"],
            execution_warnings=[]
        )
        
        orderbook_database.save_orderbook_snapshot(self.db_conn, snap, res)
        
        # Call API review endpoint
        response = self.client.post(
            "/api/execution/orderbook/review",
            data=json.dumps({
                "ticker": "TLKM",
                "candidate_id": self.candidate_id
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertEqual(data["status"], "success")
        self.assertIn("review_id", data)
        self.assertEqual(data["ai_review"]["ai_execution_status"], "EXECUTION_OK")
        self.assertEqual(data["ai_review"]["final_note"], "Approved.")
