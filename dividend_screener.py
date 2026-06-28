import time
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import dividend_database
import dividend_auto_collector
import dividend_price_provider
import dividend_momentum_engine
from dividend_schema import DividendScanRequest

def get_thesis_info_for_ticker(conn: sqlite3.Connection, ticker: str) -> tuple[List[dict], str, str]:
    """Retrieves fundamental metrics, sector, and syariah status from thesis."""
    cleaned = ticker.strip().upper()
    base_sym = cleaned.replace(".JK", "")
    try:
        row = conn.execute("SELECT data FROM app_state WHERE key = ?", ("monthly-cashflow-tracker-v1",)).fetchone()
        if row:
            state_data = json.loads(row["data"])
            theses = state_data.get("theses", [])
            for thesis in theses:
                t_sym = thesis.get("ticker", "").strip().upper()
                if t_sym == cleaned or t_sym == base_sym:
                    metrics = thesis.get("fundamentalMetrics", [])
                    sector = thesis.get("sector") or "Lainnya"
                    syariah = thesis.get("syariahStatus") or "Not Checked"
                    return metrics, sector, syariah
    except Exception as e:
        print(f"Error fetching thesis details for {ticker}: {e}")
    return [], "Lainnya", "Not Checked"

# We import json here just in case
import json

def scan_dividend_candidates(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for screening dividend momentum candidates.
    Matches symbols, fetches prices, scores momentum, and splits results into
    candidates and rejected candidates.
    """
    scan_time = datetime.now(timezone.utc).isoformat()
    
    # Load parameters
    symbols = request_data.get("symbols")
    syariah_only = request_data.get("syariah_only", True)
    min_yield = request_data.get("min_dividend_yield_percent", 1.0)
    min_days = request_data.get("min_days_to_cum", 2)
    max_days = request_data.get("max_days_to_cum", 30)
    max_results = request_data.get("max_results", 20)
    include_needs_review = request_data.get("include_needs_review", False)
    auto_collect = request_data.get("auto_collect_first", True)
    force_refresh = request_data.get("force_refresh", False)

    conn = dividend_database.get_connection()
    
    # 1. Check Scan Cache if force_refresh is False
    cache_id = f"scan|syariah={int(syariah_only)}|yield={min_yield}|days={min_days}-{max_days}|review={int(include_needs_review)}"
    if not force_refresh:
        cached = dividend_database.get_scan_cache(conn, cache_id)
        if cached:
            conn.close()
            print("Returning cached dividend scan results.")
            return cached

    collection_summary = {}
    # 2. Run auto collector if requested
    if auto_collect:
        try:
            print("Auto-collecting dividend events first...")
            collection_summary = dividend_auto_collector.collect_dividend_events(force_refresh=force_refresh)
        except Exception as e:
            print(f"Failed to auto-collect dividends: {e}")
            collection_summary = {"status": "failed", "errors": [str(e)]}

    # 3. Fetch active events from DB
    events = dividend_database.get_all_dividend_events(conn) if symbols else dividend_database.get_active_dividend_events(conn)
    
    # If symbols filter is active, filter them
    if symbols:
        symbols_upper = [s.strip().upper() for s in symbols]
        events = [e for e in events if e.ticker.upper() in symbols_upper]

    candidates: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    warnings: List[str] = []
    errors: List[str] = []

    # 4. Fetch prices and score each event
    for event in events:
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            if not event.cum_date_regular or not event.ex_date_regular:
                rejected.append({
                    "ticker": event.ticker,
                    "company_name": event.company_name or "Unknown Company",
                    "dividend_per_share": event.dividend_per_share,
                    "final_status": "AVOID",
                    "rejection_reasons": ["Tanggal Cum Date atau Ex Date regular kosong."],
                    "cum_date_regular": event.cum_date_regular,
                    "ex_date_regular": event.ex_date_regular
                })
                continue

            try:
                days_to_cum = dividend_momentum_engine.calculate_days_between(today_str, event.cum_date_regular)
                days_to_ex = dividend_momentum_engine.calculate_days_between(today_str, event.ex_date_regular)
                
                if days_to_cum < 0:
                    rejected.append({
                        "ticker": event.ticker,
                        "company_name": event.company_name or "Unknown Company",
                        "dividend_per_share": event.dividend_per_share,
                        "final_status": "AVOID",
                        "rejection_reasons": ["EVENT_EXPIRED_CUM_DATE_PASSED: Tanggal Cum Date sudah terlewat."],
                        "cum_date_regular": event.cum_date_regular,
                        "ex_date_regular": event.ex_date_regular
                    })
                    continue
                    
                if days_to_ex <= 0:
                    rejected.append({
                        "ticker": event.ticker,
                        "company_name": event.company_name or "Unknown Company",
                        "dividend_per_share": event.dividend_per_share,
                        "final_status": "AVOID",
                        "rejection_reasons": ["EX_DATE_PASSED: Tanggal Ex Date sudah terlewat atau hari ini."],
                        "cum_date_regular": event.cum_date_regular,
                        "ex_date_regular": event.ex_date_regular
                    })
                    continue
                # Also skip days_to_cum outside parameter limits if we don't have symbols filter
                if not symbols and (days_to_cum < min_days or days_to_cum > max_days):
                    rejected.append({
                        "ticker": event.ticker,
                        "company_name": event.company_name or "Unknown Company",
                        "dividend_per_share": event.dividend_per_share,
                        "final_status": "AVOID",
                        "rejection_reasons": [f"Cum date ({days_to_cum} hari) di luar batas pencarian ({min_days}-{max_days} hari)."],
                        "cum_date_regular": event.cum_date_regular,
                        "ex_date_regular": event.ex_date_regular
                    })
                    continue
            except Exception:
                pass

            # Fetch Yahoo Finance prices
            price_metrics, df, price_warning = dividend_price_provider.fetch_price_metrics(event.ticker, event.announcement_date)
            if price_warning:
                warnings.append(price_warning)
                
            if not price_metrics:
                rejected.append({
                    "ticker": event.ticker,
                    "company_name": event.company_name or "Unknown Company",
                    "dividend_per_share": event.dividend_per_share,
                    "final_status": "AVOID",
                    "rejection_reasons": [f"Gagal mengambil harga Yahoo: {price_warning}"],
                    "cum_date_regular": event.cum_date_regular,
                    "ex_date_regular": event.ex_date_regular
                })
                continue

            # Fetch thesis metadata (syariah, sector, fundamentals)
            metrics, sector, syariah = get_thesis_info_for_ticker(conn, event.ticker)
            if event.company_name is None:
                # Update DB record with company name if found
                # but keep the object enriched
                pass

            # Score Candidate
            cand = dividend_momentum_engine.build_momentum_candidate(
                event=event,
                price_metrics=price_metrics,
                syariah_status=syariah,
                fundamental_metrics=metrics,
                syariah_only=syariah_only,
                include_needs_review=include_needs_review
            )

            cand_dict = cand.to_dict()

            # Filter candidates by min yield & days boundaries
            if cand.final_status == "AVOID":
                rejected.append(cand_dict)
            else:
                if cand.dividend_yield_percent < min_yield:
                    cand_dict["final_status"] = "AVOID"
                    cand_dict["rejection_reasons"].append(f"Yield {cand.dividend_yield_percent:.2f}% di bawah filter min {min_yield}%.")
                    rejected.append(cand_dict)
                else:
                    candidates.append(cand_dict)

        except Exception as e:
            err_msg = f"Gagal memproses momentum dividen untuk {event.ticker}: {str(e)}"
            print(err_msg)
            errors.append(err_msg)
            rejected.append({
                "ticker": event.ticker,
                "company_name": event.company_name or "Unknown Company",
                "dividend_per_share": event.dividend_per_share,
                "final_status": "AVOID",
                "rejection_reasons": [err_msg],
                "cum_date_regular": event.cum_date_regular,
                "ex_date_regular": event.ex_date_regular
            })

    # Rank candidates by final score descending
    candidates.sort(key=lambda x: x["final_score"], reverse=True)
    
    # Slice to max results
    candidates = candidates[:max_results]

    result = {
        "status": "success",
        "scan_time": scan_time,
        "collection_summary": collection_summary,
        "total_events": len(events),
        "candidates": candidates,
        "rejected": rejected,
        "warnings": list(set(warnings)),
        "errors": errors
    }

    # Save to cache
    try:
        dividend_database.save_scan_cache(conn, cache_id, request_data, result)
    except Exception as e:
        print(f"Failed to save scan cache: {e}")

    conn.close()
    return result
