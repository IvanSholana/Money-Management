import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import dividend_database
import web_search_provider
import source_ranker
import catalyst_analyzer
import news_catalyst_cache

def get_news_catalyst_source_pack(
    ticker: str,
    company_name: Optional[str] = None,
    days_back: int = 30,
    max_sources: int = 8,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Ties together the web search provider, ranker, analyzer, and cache.
    Returns: Dict containing source_pack, catalyst_analysis, and warnings/errors.
    """
    ticker_clean = ticker.strip().upper()
    conn = dividend_database.get_connection()
    
    # 1. Check Cache
    if not force_refresh:
        cached = news_catalyst_cache.get_cached_news_catalyst(conn, ticker_clean)
        if cached:
            conn.close()
            return {
                "status": "success",
                "ticker": ticker_clean,
                "source_pack": cached["source_pack"],
                "catalyst_analysis": cached["catalyst_analysis"],
                "cached": True,
                "warnings": [],
                "errors": []
            }

    # 2. Query Search Provider
    provider = web_search_provider.WebSearchProvider()
    
    queries = [
        f"{ticker_clean} dividen RUPS",
        f"{ticker_clean} laporan keuangan UMA suspensi"
    ]
    if company_name:
        # Keep name clean
        clean_name = company_name.replace("Tbk", "").strip()
        queries.append(f"{clean_name} dividen")

    collected_results = []
    warnings = []
    errors = []
    
    if provider.provider == "DISABLED":
        warnings.append("Web search provider is not configured.")
    else:
        for q in queries:
            try:
                res = provider.search(q, max_results=max_sources)
                collected_results.extend(res)
            except Exception as e:
                err_msg = f"Search failed for query '{q}': {e}"
                print(err_msg)
                errors.append(err_msg)

    # 3. Handle Empty Results / Failures by falling back to stale cache if available
    if not collected_results:
        stale = news_catalyst_cache.get_stale_news_catalyst(conn, ticker_clean)
        if stale:
            conn.close()
            return {
                "status": "success",
                "ticker": ticker_clean,
                "source_pack": stale["source_pack"],
                "catalyst_analysis": stale["catalyst_analysis"],
                "cached": True,
                "warnings": warnings + ["Menggunakan data berita kedaluwarsa karena pencarian baru gagal/disabled."],
                "errors": errors
            }

    # 4. Rank and Deduplicate
    ranked_results = source_ranker.rank_and_deduplicate_sources(collected_results, ticker_clean, company_name)
    final_sources = ranked_results[:max_sources]

    # Convert SearchResult objects to dicts
    sources_dict_list = [s.to_dict() for s in final_sources]

    source_pack = {
        "ticker": ticker_clean,
        "company_name": company_name,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "search_status": "success" if collected_results else "disabled",
        "sources": sources_dict_list,
        "warnings": warnings,
        "errors": errors
    }

    # 5. Deterministic analysis
    catalyst_analysis = catalyst_analyzer.analyze_source_pack(source_pack)

    # 6. Save to cache (if search provider was active and returned results)
    if provider.provider != "DISABLED" and collected_results:
        news_catalyst_cache.save_news_catalyst_cache(
            conn, ticker_clean, company_name, queries, source_pack, catalyst_analysis
        )

    conn.close()
    return {
        "status": "success",
        "ticker": ticker_clean,
        "source_pack": source_pack,
        "catalyst_analysis": catalyst_analysis,
        "cached": False,
        "warnings": warnings,
        "errors": errors
    }
