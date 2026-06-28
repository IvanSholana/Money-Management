import unittest
from unittest.mock import patch
from orderbook_schema import ExecutionCheckResult
from deepseek_execution_reviewer import review_execution_readiness

class TestDeepseekExecutionReviewer(unittest.TestCase):
    
    def setUp(self):
        self.eval_ok = ExecutionCheckResult(
            ticker="TLKM",
            execution_status="EXECUTION_OK",
            execution_score=85.0,
            orderbook_metrics={"spread_ticks": 1},
            execution_reasons=["Spread normal"],
            execution_warnings=[]
        )
        self.eval_avoid = ExecutionCheckResult(
            ticker="TLKM",
            execution_status="AVOID_EXECUTION",
            execution_score=10.0,
            orderbook_metrics={"spread_ticks": 4},
            execution_reasons=["Spread terlalu lebar"],
            execution_warnings=[]
        )
        self.snapshot = {
            "last_price": 3100,
            "best_bid_price": 3090,
            "best_offer_price": 3100,
            "spread_ticks": 1,
            "spread_percent": 0.32,
            "read_confidence": 100.0,
            "parser_warnings": []
        }
        self.candidate = {
            "ticker": "TLKM",
            "quant_signal": "BUY",
            "sector": "Infrastruktur"
        }

    @patch("app.call_deepseek_with_rotation")
    def test_review_success(self, mock_rotation):
        # Mock successful AI JSON response
        mock_rotation.return_value = """
        {
          "ai_execution_status": "EXECUTION_OK",
          "ai_confidence": 90,
          "summary": "Kondisi bid ask sangat stabil.",
          "execution_risks": [],
          "supporting_factors": ["Antrean tebal"],
          "blocking_factors": [],
          "manual_checklist": ["Verifikasi volume"],
          "final_note": "Aman eksekusi."
        }
        """
        review = review_execution_readiness(
            ticker="TLKM",
            eval_result=self.eval_ok,
            snapshot_data=self.snapshot,
            candidate=self.candidate,
            api_keys=["key1"]
        )
        self.assertEqual(review["ai_execution_status"], "EXECUTION_OK")
        self.assertEqual(review["ai_confidence"], 90)
        self.assertEqual(review["final_note"], "Aman eksekusi.")

    @patch("app.call_deepseek_with_rotation")
    def test_avoid_override_protection(self, mock_rotation):
        # AI tries to return EXECUTION_OK, but engine was AVOID_EXECUTION
        mock_rotation.return_value = """
        {
          "ai_execution_status": "EXECUTION_OK",
          "ai_confidence": 95,
          "summary": "AI mencoba mengabaikan penolakan engine.",
          "execution_risks": [],
          "supporting_factors": [],
          "blocking_factors": [],
          "manual_checklist": [],
          "final_note": "Loloskan saja."
        }
        """
        review = review_execution_readiness(
            ticker="TLKM",
            eval_result=self.eval_avoid,
            snapshot_data=self.snapshot,
            candidate=self.candidate,
            api_keys=["key1"]
        )
        # MUST BE AVOID_EXECUTION
        self.assertEqual(review["ai_execution_status"], "AVOID_EXECUTION")
        self.assertIn("[AI Overridden]", review["final_note"])

    @patch("app.call_deepseek_with_rotation")
    def test_review_failure_fallback(self, mock_rotation):
        # Simulate API exception
        mock_rotation.side_effect = Exception("API limit exceeded")
        
        review = review_execution_readiness(
            ticker="TLKM",
            eval_result=self.eval_ok,
            snapshot_data=self.snapshot,
            candidate=self.candidate,
            api_keys=["key1"]
        )
        # Should fallback to MANUAL_REVIEW safely without crashing
        self.assertEqual(review["ai_execution_status"], "MANUAL_REVIEW")
        self.assertEqual(review["ai_confidence"], 0.0)
        self.assertIn("Reviewer AI gagal dipanggil", review["final_note"])
