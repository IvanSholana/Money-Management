import re
import urllib.parse
from typing import Any, Dict, List, Optional
from web_search_provider import SearchResult

# Domain patterns
OFFICIAL_DOMAINS = ["idx.co.id", "ksei.co.id", "ojk.go.id"]
CREDIBLE_MEDIA = [
    "kontan.co.id", "bisnis.com", "cnbcindonesia.com", 
    "investor.id", "antaranews.com", "idnfinancials.com", 
    "investing.com", "detik.com", "kompas.com"
]
SPAM_DOMAINS = ["kaskus.co.id", "facebook.com", "twitter.com", "stockbit.com/stream"]

# Keywords
CATALYST_KEYWORDS = [
    "dividen", "cum date", "ex date", "rups", "laba bersih naik", 
    "pendapatan naik", "kontrak baru", "ekspansi", "akuisisi", "buyback", "laporan keuangan"
]
RISK_KEYWORDS = [
    "uma", "suspensi", "rights issue", "private placement", "rugi bersih", 
    "penurunan laba", "gagal bayar", "pkpu", "korupsi", "investigasi", 
    "denda", "sengketa", "default", "delisting", "arus kas negatif"
]

def score_source(result: SearchResult, ticker: str, company_name: Optional[str] = None) -> float:
    score = 0.0
    
    # 1. Domain Authority Scoring
    domain = result.source_name.lower()
    # Check if domain contains official domains
    if any(od in domain for od in OFFICIAL_DOMAINS) or "investor-relations" in domain or "ir." in domain:
        score += 40.0
    elif any(cm in domain for cm in CREDIBLE_MEDIA):
        score += 25.0
    elif any(sd in domain for sd in SPAM_DOMAINS):
        score -= 20.0

    # 2. Text Relevance Scoring
    title_lower = result.title.lower()
    snippet_lower = result.snippet.lower()
    ticker_lower = ticker.lower()

    # Ticker in title
    if re.search(r"\b" + re.escape(ticker_lower) + r"\b", title_lower):
        score += 20.0
    elif ticker_lower in snippet_lower:
        score += 5.0

    # Company name in title/snippet
    if company_name:
        comp_lower = company_name.lower()
        # Take first 2 words of company name for a more robust match
        comp_parts = [p for p in comp_lower.replace("tbk", "").split() if len(p) > 2]
        if comp_parts and all(part in title_lower for part in comp_parts[:2]):
            score += 10.0
        elif comp_parts and all(part in snippet_lower for part in comp_parts[:2]):
            score += 5.0

    # Keyword presence
    has_keywords = False
    for kw in CATALYST_KEYWORDS + RISK_KEYWORDS:
        if kw in title_lower or kw in snippet_lower:
            has_keywords = True
            break
            
    if has_keywords:
        score += 10.0

    # 3. Snippet quality check
    if not result.snippet or len(result.snippet.strip()) < 20:
        score -= 10.0
        
    return score

def rank_and_deduplicate_sources(
    results: List[SearchResult], 
    ticker: str, 
    company_name: Optional[str] = None
) -> List[SearchResult]:
    """
    Filters, deduplicates, scores and ranks the search results.
    """
    seen_urls = set()
    unique_results: List[SearchResult] = []
    
    for r in results:
        # Normalize URL to avoid duplicates with different queries or hashes
        parsed = urllib.parse.urlparse(r.url)
        norm_url = f"{parsed.netloc}{parsed.path}"
        if norm_url in seen_urls:
            continue
        seen_urls.add(norm_url)
        unique_results.append(r)
        
    # Calculate scores
    for r in unique_results:
        r.relevance_score = score_source(r, ticker, company_name)
        
    # Filter out highly irrelevant spam sources (score < -15)
    filtered = [r for r in unique_results if (r.relevance_score is None or r.relevance_score >= -15.0)]
    
    # Sort by score descending
    filtered.sort(key=lambda x: x.relevance_score if x.relevance_score is not None else 0.0, reverse=True)
    
    return filtered
