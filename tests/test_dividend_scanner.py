import unittest
import sys
from datetime import datetime, timedelta

# Import target modules
sys.path.append(".")
import dividend_schema
import dividend_event_parser
import dividend_event_validator
import dividend_price_provider
import dividend_momentum_engine
import source_ranker
import catalyst_analyzer
import web_search_provider
import dividend_event_backtest

class TestDividendScanner(unittest.TestCase):

    def test_date_parser(self):
        # Indonesian format
        parsed_id = dividend_event_parser.parse_date_string("15 Juli 2026")
        self.assertEqual(parsed_id, "2026-07-15")
        
        parsed_id_short = dividend_event_parser.parse_date_string("15-07-2026")
        self.assertEqual(parsed_id_short, "2026-07-15")
        
        # English format
        parsed_en = dividend_event_parser.parse_date_string("15 July 2026")
        self.assertEqual(parsed_en, "2026-07-15")
        
        # Raw text extraction
        sample_text = "Pengumuman dividen PT Telkom Indonesia sebesar Rp 150 per saham. Cum date regular: 10 Juli 2026, Ex date: 11-07-2026."
        events = dividend_event_parser.parse_raw_text_to_events(sample_text, "KSEI", "http://example.com")
        self.assertTrue(len(events) >= 1)
        event = events[0]
        self.assertEqual(event.dividend_per_share, 150.0)
        self.assertEqual(event.cum_date_regular, "2026-07-10")
        self.assertEqual(event.ex_date_regular, "2026-07-11")

    def test_validator(self):
        # Valid event
        valid_ev = dividend_schema.DividendEvent(
            id="TEST_1",
            ticker="TEST",
            action_type="CASH_DIVIDEND",
            dividend_per_share=100.0,
            cum_date_regular="2026-07-10",
            ex_date_regular="2026-07-11",
            recording_date="2026-07-12",
            payment_date="2026-07-25",
            confidence_score=90.0
        )
        is_valid, errors, warnings, status = dividend_event_validator.validate_dividend_event(valid_ev)
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)
        self.assertEqual(status, "auto_verified")
        
        # Invalid event (ex date before cum date)
        invalid_ev = dividend_schema.DividendEvent(
            id="TEST_2",
            ticker="TEST",
            action_type="CASH_DIVIDEND",
            dividend_per_share=100.0,
            cum_date_regular="2026-07-12",
            ex_date_regular="2026-07-10",
            confidence_score=90.0
        )
        is_valid, errors, warnings, status = dividend_event_validator.validate_dividend_event(invalid_ev)
        self.assertFalse(is_valid)
        self.assertTrue("Tanggal Cum Date harus sebelum Ex Date." in errors)
        self.assertEqual(status, "rejected")

    def test_momentum_scoring(self):
        event = dividend_schema.DividendEvent(
            id="TEST_1",
            ticker="TLKM",
            action_type="CASH_DIVIDEND",
            dividend_per_share=150.0,
            cum_date_regular="2026-07-15",
            ex_date_regular="2026-07-16",
            verification_status="auto_verified",
            confidence_score=90.0
        )
        # Mock price metrics: yield = (150 / 3000) * 100 = 5%
        price_metrics = {
            "current_price": 3000.0,
            "ma5": 3050.0,
            "ma20": 2900.0,
            "ma50": 2800.0,
            "volume_avg_20d": 5000.0,
            "volume_ratio": 2.5,
            "price_return_5d": 0.05,
            "price_return_10d": 0.08,
            "price_return_since_announcement": 0.04
        }
        
        score, status, components, warnings, rejections = dividend_momentum_engine.score_dividend_momentum(
            event=event,
            price_metrics=price_metrics,
            syariah_status="DES",
            syariah_only=True
        )
        
        self.assertEqual(len(rejections), 0)
        self.assertTrue(score > 50.0)
        self.assertEqual(components["yield_attractiveness"], 20.0) # Yield 5% -> +20
        self.assertEqual(components["volume_confirmation"], 15.0) # Vol ratio 2.5 -> +15

    def test_search_ranking(self):
        results = [
            web_search_provider.SearchResult("KSEI Kalender Rencana Dividen PT Telekomunikasi", "http://ksei.co.id/cal/123", "PT Telekomunikasi Indonesia TLKM membagikan dividen tunai...", "ksei.co.id", "TLKM dividen"),
            web_search_provider.SearchResult("TLKM Spam forum thread", "http://kaskus.co.id/thread/555", "Info dividen TLKM apa ya?", "kaskus.co.id", "TLKM dividen"),
            web_search_provider.SearchResult("Kabar Emiten Bisnis: TLKM Cetak Laba dan RUPS Dividen", "http://bisnis.com/news/123", "PT Telekomunikasi (TLKM) menjadwalkan pembagian dividen dalam RUPS...", "bisnis.com", "TLKM dividen")
        ]
        
        ranked = source_ranker.rank_and_deduplicate_sources(results, "TLKM", "Telekomunikasi Indonesia")
        
        # Check ordering: KSEI (official) first, Bisnis.com (credible) second, spam kaskus third or removed
        self.assertTrue(len(ranked) >= 2)
        self.assertTrue("ksei.co.id" in ranked[0].url)
        self.assertTrue("bisnis.com" in ranked[1].url)

    def test_catalyst_analyzer(self):
        source_pack = {
            "ticker": "TLKM",
            "company_name": "Telekomunikasi Indonesia",
            "sources": [
                {
                    "title": "KSEI: Jadwal Dividen TLKM 2026",
                    "url": "http://ksei.co.id/schedule",
                    "snippet": "Jadwal pembagian dividen tunai TLKM tahun buku 2025. Cum date regular 15 Juli 2026.",
                    "source_name": "ksei.co.id"
                },
                {
                    "title": "Bisnis: TLKM Suspensi perdagangan akibat UMA",
                    "url": "http://bisnis.com/suspensi-tlkm",
                    "snippet": "Bursa Efek Indonesia melakukan suspensi sementara perdagangan saham PT Telekomunikasi Indonesia (TLKM).",
                    "source_name": "bisnis.com"
                }
            ]
        }
        
        analysis = catalyst_analyzer.analyze_source_pack(source_pack)
        self.assertTrue(analysis["has_official_source"])
        self.assertTrue(analysis["has_recent_negative_news"])
        self.assertTrue("suspensi" in analysis["risk_tags"])
        self.assertTrue("dividen" in analysis["catalyst_tags"])
        self.assertEqual(analysis["source_quality"], "official") # high confidence + official source

    def test_future_payment_past_cum_rejected(self):
        # 11. future payment_date but past cum_date must be rejected
        ev = dividend_schema.DividendEvent(
            id="TEST_PAST_CUM",
            ticker="TLKM",
            action_type="CASH_DIVIDEND",
            dividend_per_share=221.0,
            cum_date_regular="2026-06-17",
            ex_date_regular="2026-06-18",
            recording_date="2026-06-19",
            payment_date="2026-07-10",
            confidence_score=95.0,
            verification_status="auto_verified"
        )
        is_valid, errors, warnings, status = dividend_event_validator.validate_dividend_event(ev)
        self.assertFalse(is_valid)
        self.assertTrue(any("EVENT_EXPIRED_CUM_DATE_PASSED" in e for e in errors))

    def test_missing_cum_future_payment_not_candidate(self):
        # 12. missing cum_date_regular but future payment_date must not become candidate
        ev = dividend_schema.DividendEvent(
            id="TEST_MISSING_CUM",
            ticker="TLKM",
            action_type="CASH_DIVIDEND",
            dividend_per_share=221.0,
            cum_date_regular="",
            ex_date_regular="2026-07-13",
            recording_date="2026-07-14",
            payment_date="2026-08-01",
            confidence_score=95.0,
            verification_status="auto_verified"
        )
        is_valid, errors, warnings, status = dividend_event_validator.validate_dividend_event(ev)
        self.assertFalse(is_valid)
        self.assertEqual(status, "rejected")

    def test_tlkm_past_schedule_on_2026_06_27_avoid(self):
        # 13. TLKM schedule on 2026-06-27 returns EVENT_EXPIRED, not DIVIDEND_MOMENTUM_CANDIDATE
        ev = dividend_schema.DividendEvent(
            id="TLKM_PAST_EV",
            ticker="TLKM",
            action_type="CASH_DIVIDEND",
            dividend_per_share=221.0,
            cum_date_regular="2026-06-17",
            ex_date_regular="2026-06-18",
            recording_date="2026-06-19",
            payment_date="2026-07-10",
            confidence_score=95.0,
            verification_status="auto_verified"
        )
        price_metrics = {
            "current_price": 3100.0,
            "ma5": 3150.0,
            "ma20": 3050.0,
            "ma50": 3200.0,
            "volume_avg_20d": 10000.0,
            "volume_ratio": 1.2,
            "price_return_5d": 0.02,
            "price_return_10d": 0.05,
            "price_return_since_announcement": 0.01
        }
        
        score, status, components, warnings, rejections = dividend_momentum_engine.score_dividend_momentum(
            event=ev,
            price_metrics=price_metrics,
            syariah_status="DES",
            syariah_only=True
        )
        self.assertEqual(status, "AVOID")
        self.assertTrue(any("EVENT_EXPIRED_CUM_DATE_PASSED" in r for r in rejections))

if __name__ == "__main__":
    unittest.main()
