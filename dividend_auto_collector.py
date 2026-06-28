import json
import uuid
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import dividend_database
import dividend_ksei_collector
import dividend_idx_collector
import dividend_event_parser
import dividend_event_validator
from dividend_schema import DividendEvent, DividendCollectionResult

def get_company_info_from_theses(conn: sqlite3.Connection, ticker: str) -> tuple[Optional[str], str]:
    """Retrieves company name and syariah status from existing theses in app_state."""
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
                    return thesis.get("companyName"), thesis.get("syariahStatus", "Not Checked")
    except Exception as e:
        print(f"Error fetching company info from theses for {ticker}: {e}")
    return None, "Not Checked"

def collect_dividend_events(
    source: str = "all",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Main orchestration routine.
    Fetches raw pages from KSEI and/or IDX, parses events, validates them,
    and updates the SQLite database.
    """
    started_at = datetime.now(timezone.utc).isoformat()
    run_id = str(uuid.uuid4())
    conn = dividend_database.get_connection()
    
    collected_events: List[DividendEvent] = []
    warnings: List[str] = []
    errors: List[str] = []
    source_results: List[Dict[str, Any]] = []

    # 1. Fetch from KSEI
    if source.lower() in ("all", "ksei"):
        try:
            ksei_res = dividend_ksei_collector.collect_ksei_events()
            source_results.append({
                "source": "KSEI",
                "status": ksei_res["status"],
                "warnings": ksei_res.get("warnings", []),
                "errors": ksei_res.get("errors", [])
            })
            if ksei_res.get("warnings"):
                warnings.extend(ksei_res["warnings"])
            if ksei_res.get("errors"):
                errors.extend(ksei_res["errors"])
                
            if ksei_res["status"] == "success":
                # Parse raw HTML or text if present
                raw_html = ksei_res.get("raw_html", "")
                raw_text = ksei_res.get("raw_text", "")
                parsed = dividend_event_parser.parse_raw_text_to_events(raw_html or raw_text, "KSEI", ksei_res["source_url"])
                collected_events.extend(parsed)
        except Exception as e:
            err_msg = f"KSEI orchestrator error: {str(e)}"
            print(err_msg)
            errors.append(err_msg)
            source_results.append({"source": "KSEI", "status": "failed_gracefully", "errors": [err_msg]})

    # 2. Fetch from IDX
    if source.lower() in ("all", "idx"):
        try:
            idx_res = dividend_idx_collector.collect_idx_disclosures()
            source_results.append({
                "source": "IDX",
                "status": idx_res["status"],
                "warnings": idx_res.get("warnings", []),
                "errors": idx_res.get("errors", [])
            })
            if idx_res.get("warnings"):
                warnings.extend(idx_res["warnings"])
            if idx_res.get("errors"):
                errors.extend(idx_res["errors"])
                
            if idx_res["status"] == "success":
                # If we got JSON back (e.g. from GetAnnouncement)
                if idx_res.get("raw_json"):
                    # Process announcement items
                    # For demo or basic implementation, try to extract description text or items
                    items = idx_res["raw_json"].get("items", [])
                    for item in items:
                        desc = item.get("Description", "") or item.get("Title", "")
                        parsed = dividend_event_parser.parse_raw_text_to_events(desc, "IDX", idx_res["source_url"])
                        collected_events.extend(parsed)
                else:
                    raw_html = idx_res.get("raw_html", "")
                    parsed = dividend_event_parser.parse_raw_text_to_events(raw_html, "IDX", idx_res["source_url"])
                    collected_events.extend(parsed)
        except Exception as e:
            err_msg = f"IDX orchestrator error: {str(e)}"
            print(err_msg)
            errors.append(err_msg)
            source_results.append({"source": "IDX", "status": "failed_gracefully", "errors": [err_msg]})

    # 3. Process, validate, and store events
    counts = {
        "collected": len(collected_events),
        "inserted": 0,
        "updated": 0,
        "duplicate": 0,
        "rejected": 0,
        "needs_review": 0
    }

    # Deduplicate within the same run session by (ticker + cum_date_regular + dividend_per_share)
    seen_keys = set()
    unique_collected: List[DividendEvent] = []
    for ev in collected_events:
        key = (ev.ticker, ev.cum_date_regular, ev.dividend_per_share)
        if key in seen_keys:
            counts["duplicate"] += 1
            continue
        seen_keys.add(key)
        unique_collected.append(ev)

    for ev in unique_collected:
        # Enrich event with company name from theses
        comp_name, syariah_status = get_company_info_from_theses(conn, ev.ticker)
        if comp_name:
            ev.company_name = comp_name

        # Run Validator
        is_valid, val_errors, val_warnings, recommended_status = dividend_event_validator.validate_dividend_event(ev, conn)
        
        # Merge warnings & errors
        ev.parser_warnings.extend(val_warnings)
        ev.validation_errors.extend(val_errors)
        ev.verification_status = recommended_status

        if recommended_status == "rejected":
            counts["rejected"] += 1
        elif recommended_status == "needs_review":
            counts["needs_review"] += 1
        
        # Save to DB if not rejected
        if recommended_status != "rejected" or force_refresh:
            # Check existing for auditing
            old_ev = dividend_database.get_dividend_event(conn, ev.id)
            is_inserted = dividend_database.save_dividend_event(conn, ev)
            
            if is_inserted:
                counts["inserted"] += 1
                dividend_database.log_audit(conn, ev.id, "INSERT", None, ev.to_dict())
            else:
                counts["updated"] += 1
                dividend_database.log_audit(conn, ev.id, "UPDATE", old_ev.to_dict() if old_ev else None, ev.to_dict())

    # Log collection run summary
    status = "success" if not errors else "partial_failure"
    if all(r["status"] == "failed_gracefully" for r in source_results):
        status = "failed"
        
    dividend_database.log_collection_run(
        conn, run_id, source, status, counts, warnings, errors, started_at
    )
    conn.close()

    result = DividendCollectionResult(
        status=status,
        source_results=source_results,
        collected_count=counts["collected"],
        inserted_count=counts["inserted"],
        updated_count=counts["updated"],
        duplicate_count=counts["duplicate"],
        rejected_count=counts["rejected"],
        needs_review_count=counts["needs_review"],
        warnings=warnings,
        errors=errors
    )
    return result.to_dict()
