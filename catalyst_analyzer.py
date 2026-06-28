from typing import Any, Dict, List, Optional
from source_ranker import OFFICIAL_DOMAINS, CREDIBLE_MEDIA, CATALYST_KEYWORDS, RISK_KEYWORDS

def analyze_source_pack(source_pack: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministically analyzes a source pack to extract tags, identify risks/catalysts,
    and compute a confidence rating.
    """
    ticker = source_pack.get("ticker", "")
    sources = source_pack.get("sources", [])
    
    catalyst_tags = []
    risk_tags = []
    warnings = []
    
    has_official = False
    has_dividend = False
    has_corp_action = False
    has_fin_report = False
    has_negative = False
    
    credible_count = 0
    ticker_title_count = 0
    
    cat_texts = []
    risk_texts = []
    
    for src in sources:
        title = src.get("title", "").lower()
        snippet = src.get("snippet", "").lower()
        url = src.get("url", "").lower()
        domain = src.get("source_name", "").lower()
        
        # Check domain authority
        if any(od in url or od in domain for od in OFFICIAL_DOMAINS):
            has_official = True
            
        if any(cm in url or cm in domain for cm in CREDIBLE_MEDIA):
            credible_count += 1
            
        if ticker.lower() in title:
            ticker_title_count += 1
            
        # Keyword matching
        # 1. Dividend
        if any(kw in title or kw in snippet for kw in ["dividen", "cum date", "ex date"]):
            has_dividend = True
            if "dividen" not in catalyst_tags:
                catalyst_tags.append("dividen")
                
        # 2. Corporate Action
        if any(kw in title or kw in snippet for kw in ["rups", "rights issue", "private placement", "akuisisi", "buyback"]):
            has_corp_action = True
            for kw in ["rups", "rights issue", "private placement", "akuisisi", "buyback"]:
                if kw in title or kw in snippet:
                    if kw not in catalyst_tags:
                        catalyst_tags.append(kw)
                        
        # 3. Financial Report
        if any(kw in title or kw in snippet for kw in ["laba bersih", "pendapatan", "laporan keuangan"]):
            has_fin_report = True
            if "laporan keuangan" not in catalyst_tags:
                catalyst_tags.append("laporan keuangan")
                
        # 4. Negatives/Risks
        for kw in RISK_KEYWORDS:
            if kw in title or kw in snippet:
                has_negative = True
                if kw not in risk_tags:
                    risk_tags.append(kw)

    # Compile summaries
    if has_dividend:
        cat_texts.append("Terdeteksi sentimen positif terkait rencana pembagian dividen tunai.")
    if has_fin_report:
        cat_texts.append("Terdeteksi rilis laporan keuangan atau kinerja laba bersih.")
    if has_corp_action:
        cat_texts.append("Terdeteksi aktivitas aksi korporasi emiten.")
        
    if has_negative:
        risk_texts.append(f"Terdeteksi sentimen negatif/risiko: {', '.join(risk_tags)}.")
    
    # Check UMA or Suspensi specifically
    if any(tag in risk_tags for tag in ["uma", "suspensi"]):
        warnings.append("PENTING: Saham masuk radar pengawasan BEI (UMA) atau sedang terkena suspensi perdagangan!")

    catalyst_summary = " ".join(cat_texts) if cat_texts else "Tidak ada katalis signifikan yang terdeteksi dari ringkasan berita."
    risk_summary = " ".join(risk_texts) if risk_texts else "Tidak ada risiko sentimen negatif spesifik yang terdeteksi dari ringkasan berita."

    # Compute confidence score (0-100)
    conf_score = 30.0 # Base confidence
    if has_official:
        conf_score += 40.0
    if credible_count >= 3:
        conf_score += 20.0
    elif credible_count >= 1:
        conf_score += 10.0
    if ticker_title_count >= 2:
        conf_score += 10.0
        
    conf_score = min(conf_score, 100.0)

    # Source quality label
    if not sources:
        source_quality = "none"
        conf_score = 0.0
    elif has_official and conf_score >= 70.0:
        source_quality = "official"
    elif conf_score >= 40.0:
        source_quality = "mixed"
    else:
        source_quality = "weak"

    return {
        "catalyst_summary": catalyst_summary,
        "risk_summary": risk_summary,
        "catalyst_tags": catalyst_tags,
        "risk_tags": risk_tags,
        "source_quality": source_quality,
        "has_official_source": has_official,
        "has_recent_negative_news": has_negative,
        "has_dividend_event": has_dividend,
        "has_corporate_action": has_corp_action,
        "has_financial_report": has_fin_report,
        "confidence_score": conf_score,
        "warnings": warnings
    }
