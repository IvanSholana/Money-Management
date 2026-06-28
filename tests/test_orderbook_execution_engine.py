import unittest
from datetime import datetime, timezone, timedelta
from orderbook_schema import OrderBookSnapshot, OrderBookRow
from orderbook_execution_engine import evaluate_execution_readiness

class TestOrderbookExecutionEngine(unittest.TestCase):

    def setUp(self):
        # Setup base candidate and snapshot
        self.candidate = {
            "candidate_id": "CANDIDATE_123",
            "ticker": "TLKM",
            "quant_signal": "BUY",
            "screening_status": "passed",
            "current_price": 3100.0,
            "entry_range": {"low": 3000.0, "high": 3150.0},
            "target_profit_1": 3500.0,
            "stop_loss": 2900.0
        }
        
        # 1 tick spread: bid 3095, offer 3100 (for price 3095, tick size is 10)
        # Wait, let's make sure the prices align with IDX tick rules:
        # Price 3000 to 4990 has tick size = 10.
        # So 3090 -> 3100 is 1 tick.
        self.snapshot = OrderBookSnapshot(
            ticker="TLKM",
            page_url="https://stockbit.com/symbol/TLKM",
            last_price=3100,
            best_bid_price=3090,
            best_offer_price=3100,
            spread_ticks=1,
            spread_percent=0.32,
            bid_rows=[
                OrderBookRow(price=3090, volume=1000),
                OrderBookRow(price=3080, volume=2000),
                OrderBookRow(price=3070, volume=3000),
                OrderBookRow(price=3060, volume=4000),
                OrderBookRow(price=3050, volume=5000),
            ],
            offer_rows=[
                OrderBookRow(price=3100, volume=800),
                OrderBookRow(price=3110, volume=1000),
                OrderBookRow(price=3120, volume=1200),
                OrderBookRow(price=3130, volume=1400),
                OrderBookRow(price=3140, volume=1600),
            ],
            timestamp_read=datetime.now(timezone.utc).isoformat(),
            read_confidence=95.0
        )

    def test_ideal_conditions_execution_ok(self):
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res.execution_status, "EXECUTION_OK")
        self.assertTrue(res.execution_score >= 80.0)

    def test_spread_rejections(self):
        # 2 ticks spread (3080 to 3100 is 2 ticks for TLKM)
        self.snapshot.best_bid_price = 3080
        self.snapshot.spread_ticks = 2
        res2 = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertTrue(res2.execution_score < 100.0) # lower score than 1 tick

        # >3 ticks spread
        self.snapshot.best_bid_price = 3050
        self.snapshot.spread_ticks = 5
        res_wide = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res_wide.execution_status, "SPREAD_TOO_WIDE")

    def test_weak_bid_depth(self):
        # Total bid top 5 is 15000 lot.
        # Let's plan a very large buy of 20000 lot. Bids are thin relative to this order.
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=20000)
        self.assertEqual(res.execution_status, "AVOID_EXECUTION")
        self.assertTrue(any("tipis" in r for r in res.execution_reasons))

    def test_offer_wall_reduces_score(self):
        # Create an offer wall: offers top 5 is very thick (e.g. 50000 lot vs bids 15000 lot)
        self.snapshot.offer_rows[0].volume = 50000
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        # Offer pressure gives 0/15 points, reducing score
        self.assertTrue(res.execution_score < 80.0)

    def test_entry_outside_range(self):
        # Price is far above entry range high (Rp 3150 * 1.05 = 3307.5)
        self.snapshot.best_offer_price = 3400
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res.execution_status, "AVOID_EXECUTION")
        self.assertTrue(any("zona entry" in r for r in res.execution_reasons))

    def test_realistic_rr_below_threshold(self):
        # Set stop loss close to entry to make RR poor (Target 3500, Entry 3100, Stop Loss 3000 -> RR = 4)
        # But if target profit is set to 3110 (Entry 3100, SL 2900 -> RR = 10/200 = 0.05)
        self.candidate["target_profit_1"] = 3110.0
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res.execution_status, "AVOID_EXECUTION")

    def test_low_read_confidence(self):
        self.snapshot.read_confidence = 35.0
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res.execution_status, "MANUAL_REVIEW")

    def test_stale_snapshot(self):
        # Set timestamp to 70 seconds ago
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=70)
        self.snapshot.timestamp_read = stale_time.isoformat()
        res = evaluate_execution_readiness(self.snapshot, self.candidate, planned_order_lots=100)
        self.assertEqual(res.execution_status, "AVOID_EXECUTION")
        self.assertTrue(res.stale_snapshot)
