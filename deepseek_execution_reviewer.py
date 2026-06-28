import json
import os
from typing import Any, Dict, List, Optional
import app
from orderbook_schema import ExecutionCheckResult

SYSTEM_INSTRUCTION = (
    "Anda adalah risk reviewer eksekusi order book untuk swing trading saham Indonesia.\n"
    "Tugas Anda adalah meninjau kesiapan eksekusi kandidat trading yang sudah lolos scanner deterministik.\n"
    "Anda HANYA boleh bertindak sebagai risk reviewer (menganalisis antrean bid/offer, spread, dan risiko).\n"
    "Anda TIDAK boleh membuat sinyal BUY baru.\n"
    "Aturan keras: Jika status eksekusi deterministik dari engine adalah AVOID_EXECUTION, "
    "Anda DILARANG keras mengubahnya menjadi EXECUTION_OK. Anda harus mempertahankan AVOID_EXECUTION."
)

USER_PROMPT_TEMPLATE = """
Berikut data order book snapshot, metrik eksekusi, penilaian engine, dan data kandidat quant.
Lakukan analisis risiko eksekusi secara mendalam.

[Kandidat Quant]
Ticker: {ticker}
Sinyal Quant: {quant_signal}
Sektor: {sector}

[Order Book Snapshot]
Harga Terakhir: {last_price}
Best Bid: {best_bid_price}
Best Offer: {best_offer_price}
Spread Ticks: {spread_ticks}
Spread Percent: {spread_percent}%
Read Confidence: {read_confidence}%
Parser Warnings: {parser_warnings}

[Penilaian Engine Eksekusi]
Status Eksekusi Engine: {engine_status}
Skor Eksekusi Engine: {engine_score}
Metrik Order Book: {metrics}
Reasons: {reasons}
Warnings: {warnings}
Saran Tindakan: {suggested_action}

Aturan Penilaian AI:
1. Jika status eksekusi engine adalah "AVOID_EXECUTION", Anda harus mengembalikan status "AVOID_EXECUTION". Anda dilarang keras mengubahnya menjadi "EXECUTION_OK".
2. Nilai apakah ketebalan bid/offer dan volume spread mendukung eksekusi virtual/manual sekarang atau perlu ditunda.
3. Kembalikan output dalam format JSON terstruktur persis seperti schema berikut:

{{
  "ai_execution_status": "EXECUTION_OK" | "AVOID_EXECUTION" | "MANUAL_REVIEW",
  "ai_confidence": 0-100,
  "summary": "Ringkasan penilaian risiko order book",
  "execution_risks": ["risiko1", "risiko2"],
  "supporting_factors": ["faktor pendukung1", "faktor pendukung2"],
  "blocking_factors": ["faktor penghambat1", "faktor penghambat2"],
  "manual_checklist": ["checklist langkah manual sebelum klik beli/jual"],
  "final_note": "Catatan kesimpulan akhir Anda dalam Bahasa Indonesia"
}}
"""

def review_execution_readiness(
    ticker: str,
    eval_result: ExecutionCheckResult,
    snapshot_data: dict,
    candidate: Optional[Dict[str, Any]],
    api_keys: List[str]
) -> dict:
    """
    Calls DeepSeek to review order book execution readiness and returns structured review metrics.
    """
    quant_signal = "WATCH"
    sector = "Lainnya"
    if candidate:
        quant_signal = candidate.get("final_signal") or candidate.get("quant_signal") or "WATCH"
        sector = candidate.get("sector") or "Lainnya"
        
    prompt = USER_PROMPT_TEMPLATE.format(
        ticker=ticker,
        quant_signal=quant_signal,
        sector=sector,
        last_price=snapshot_data.get("last_price", 0),
        best_bid_price=snapshot_data.get("best_bid_price", 0),
        best_offer_price=snapshot_data.get("best_offer_price", 0),
        spread_ticks=snapshot_data.get("spread_ticks", 0),
        spread_percent=snapshot_data.get("spread_percent", 0.0),
        read_confidence=snapshot_data.get("read_confidence", 0.0),
        parser_warnings=", ".join(snapshot_data.get("parser_warnings", [])) or "None",
        engine_status=eval_result.execution_status,
        engine_score=eval_result.execution_score,
        metrics=json.dumps(eval_result.orderbook_metrics),
        reasons=", ".join(eval_result.execution_reasons) or "None",
        warnings=", ".join(eval_result.execution_warnings) or "None",
        suggested_action=eval_result.suggested_action or "None"
    )
    
    try:
        # Call deepseek with rotation
        response_text = app.call_deepseek_with_rotation(prompt, SYSTEM_INSTRUCTION, api_keys)
        
        # Clean response markup if any
        cleaned_text = response_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()
        
        review_data = json.loads(cleaned_text)
        
        # ENFORCE ENGINE AVOID_EXECUTION CONSTRAINT
        ai_status = review_data.get("ai_execution_status", "MANUAL_REVIEW")
        if eval_result.execution_status == "AVOID_EXECUTION" and ai_status == "EXECUTION_OK":
            print(f"Warning: DeepSeek tried to override AVOID_EXECUTION for {ticker} to EXECUTION_OK. Overriding back to AVOID_EXECUTION.")
            review_data["ai_execution_status"] = "AVOID_EXECUTION"
            review_data["final_note"] = (
                f"[AI Overridden] {review_data.get('final_note', '')} "
                f"(Status eksekusi AVOID_EXECUTION dipertahankan karena reviewer AI dilarang keras mengubah status penolakan engine)."
            )
            
        return review_data
        
    except Exception as e:
        print(f"DeepSeek execution review failed for {ticker}: {e}")
        return {
            "ai_execution_status": "MANUAL_REVIEW" if eval_result.execution_status != "AVOID_EXECUTION" else "AVOID_EXECUTION",
            "ai_confidence": 0.0,
            "summary": "Gagal menjalankan review AI.",
            "execution_risks": [f"Review error: {str(e)}"],
            "supporting_factors": [],
            "blocking_factors": ["ai_call_failed"],
            "manual_checklist": ["Cek antrean order book secara manual di aplikasi sekuritas Anda."],
            "final_note": f"Reviewer AI gagal dipanggil. Silakan verifikasi manual."
        }
