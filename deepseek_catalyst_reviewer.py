import json
import os
from typing import Any, Dict, List, Optional
import app

SYSTEM_INSTRUCTION = (
    "Anda adalah risk reviewer untuk swing trading scanner saham Indonesia. "
    "Anda tidak boleh membuat sinyal BUY baru. Anda hanya boleh menilai apakah kandidat yang "
    "sudah lolos quant engine tetap layak, perlu diturunkan, atau harus dihindari berdasarkan "
    "berita/catalyst/risk source pack yang diberikan. Jangan browsing. Jangan mengarang data. "
    "Kembalikan respon dalam format JSON terstruktur yang valid."
)

USER_PROMPT_TEMPLATE = """
Berikut data kandidat quant, source pack berita terbaru, dan analisis katalis deterministik.
Lakukan review secara skeptis dan hati-hati. Utamakan peringatan risiko daripada optimisme.

[Kandidat Quant]
Ticker: {ticker}
Nama Perusahaan: {company_name}
Sinyal Quant: {quant_signal}
Sektor: {sector}
Penyaringan Status: {screening_status}
Rejection Reasons: {rejection_reasons}

[Source Pack Berita]
{sources_text}

[Analisis Katalis Deterministik]
Catalyst Summary: {catalyst_summary}
Risk Summary: {risk_summary}
Warnings: {warnings_text}
Source Quality: {source_quality}

Aturan Ketat Reviewer:
1. Jika Sinyal Quant input bukan "BUY", Anda DILARANG KERAS mengubahnya menjadi "BUY".
2. Jika status penyaringan quant adalah "rejected", Anda DILARANG KERAS mengeluarkan sinyal "BUY".
3. Anda hanya boleh mempertahankan sinyal "BUY", atau menurunkannya (downgrade) menjadi "WATCH", "HOLD", atau "AVOID".
4. Kembalikan output dalam format JSON terstruktur persis seperti schema berikut:

{{
  "ai_final_signal": "BUY" | "HOLD" | "WATCH" | "AVOID",
  "ai_confidence": 0-100,
  "news_catalyst_summary": "ringkasan katalis positif berdasar berita",
  "risk_summary": "ringkasan risiko negatif berdasar berita",
  "supporting_sources": [
    {{
      "title": "judul berita",
      "url": "link berita",
      "reason": "mengapa berita ini relevan untuk mendukung keputusan"
    }}
  ],
  "risk_flags": ["tag1", "tag2"],
  "catalyst_flags": ["tag1", "tag2"],
  "decision_reason": "alasan lengkap keputusan Anda menggunakan Bahasa Indonesia",
  "downgrade_reason": "alasan jika Anda melakukan downgrade dari BUY (null jika tetap BUY)",
  "missing_information": ["informasi penting yang belum lengkap"],
  "source_quality": "official" | "mixed" | "weak" | "none"
}}
"""

def review_candidate_with_news(
    candidate: Dict[str, Any],
    source_pack: Dict[str, Any],
    catalyst_analysis: Dict[str, Any],
    api_keys: List[str]
) -> Dict[str, Any]:
    """
    Sends candidate details and news context to DeepSeek, parses response,
    and enforces strict non-upgrade logic.
    """
    ticker = candidate.get("symbol", candidate.get("ticker", "Unknown"))
    company_name = candidate.get("name", candidate.get("company_name", "Unknown"))
    quant_signal = candidate.get("algoSignal", candidate.get("final_signal", "HOLD"))
    sector = candidate.get("sector", "Lainnya")
    screening_status = candidate.get("screeningStatus", "passed")
    rejection_reasons = candidate.get("rejectionReason", "")

    # Format sources text
    sources = source_pack.get("sources", [])
    sources_lines = []
    if not sources:
        sources_text = "Tidak ada berita ditemukan."
    else:
        for idx, src in enumerate(sources):
            sources_lines.append(
                f"{idx+1}. [{src.get('source_name')}] {src.get('title')}\n"
                f"   URL: {src.get('url')}\n"
                f"   Ringkasan: {src.get('snippet')}\n"
            )
        sources_text = "\n".join(sources_lines)

    warnings_text = ", ".join(catalyst_analysis.get("warnings", [])) if catalyst_analysis.get("warnings") else "Tidak ada."
    
    prompt = USER_PROMPT_TEMPLATE.format(
        ticker=ticker,
        company_name=company_name,
        quant_signal=quant_signal,
        sector=sector,
        screening_status=screening_status,
        rejection_reasons=rejection_reasons,
        sources_text=sources_text,
        catalyst_summary=catalyst_analysis.get("catalyst_summary", ""),
        risk_summary=catalyst_analysis.get("risk_summary", ""),
        warnings_text=warnings_text,
        source_quality=catalyst_analysis.get("source_quality", "none")
    )

    try:
        # Load DeepSeek configurations
        # We can read DEEPSEEK_MODEL, DEEPSEEK_TEMPERATURE from environment
        model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
        
        # Call rotation API
        # We use a custom call with rotation to prevent leaks
        response_text = app.call_deepseek_with_rotation(prompt, SYSTEM_INSTRUCTION, api_keys)
        
        # Clean response if LLM added markdown formatting
        cleaned_text = response_text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()
        
        review_data = json.loads(cleaned_text)
        
        # ENFORCE NON-UPGRADE RULE
        ai_sig = review_data.get("ai_final_signal", "HOLD")
        
        # If candidate quant signal is not BUY, and DeepSeek tried to upgrade to BUY
        if quant_signal != "BUY" and ai_sig == "BUY":
            print(f"Warning: DeepSeek tried to upgrade {ticker} to BUY from {quant_signal}. Overriding back to {quant_signal}.")
            review_data["ai_final_signal"] = quant_signal
            review_data["decision_reason"] = (
                f"[AI Overridden] {review_data.get('decision_reason', '')} "
                f"(Sinyal quant asli {quant_signal} dipertahankan karena reviewer dilarang melakukan upgrade)."
            )
            
        # Ensure correct keys
        review_data["ticker"] = ticker
        return review_data

    except Exception as e:
        print(f"DeepSeek review API failed for {ticker}: {e}")
        # Return graceful failure response
        return {
            "ai_final_signal": quant_signal,
            "ai_confidence": 0.0,
            "news_catalyst_summary": "Pencarian AI gagal.",
            "risk_summary": f"Gagal memanggil reviewer AI: {str(e)}",
            "supporting_sources": [],
            "risk_flags": ["review_failed"],
            "catalyst_flags": [],
            "decision_reason": f"AI review gagal dijalankan. Sinyal quant {quant_signal} dipertahankan.",
            "downgrade_reason": None,
            "missing_information": [],
            "source_quality": "none"
        }
