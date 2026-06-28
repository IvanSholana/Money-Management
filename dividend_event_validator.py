from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dividend_schema import DividendEvent

def validate_dividend_event(event: DividendEvent, conn: Any = None) -> Tuple[bool, List[str], List[str], str]:
    """
    Validates a dividend event candidate and recommends a verification status.
    Returns: (is_valid, errors, warnings, recommended_status)
    """
    errors: List[str] = []
    warnings: List[str] = []
    
    # 1. Basic field checks
    if not event.ticker or len(event.ticker.strip()) < 4:
        errors.append("Ticker tidak valid atau kosong.")
    
    if event.action_type != "CASH_DIVIDEND":
        errors.append(f"Tipe aksi korporasi bukan CASH_DIVIDEND: {event.action_type}")
        
    if event.dividend_per_share <= 0:
        errors.append("Nilai dividen per saham (dividend_per_share) harus lebih dari 0.")
        
    if not event.cum_date_regular:
        errors.append("Tanggal Cum Date Regular kosong.")
        
    if not event.ex_date_regular:
        errors.append("Tanggal Ex Date Regular kosong.")

    # 2. Date comparisons and expiration checks against today
    # (Assuming local Jakarta today is June 27, 2026 for consistency, but defaults to current date)
    today = datetime.now().date()
    
    # Check if payment_date is used as a fallback for cum_date (must never happen)
    # We ensure they are distinct and payment date is after cum/ex dates
    if event.payment_date and event.cum_date_regular:
        if event.payment_date == event.cum_date_regular:
            errors.append("DATA_INCONSISTENT: Tanggal Payment Date sama dengan Cum Date.")

    if event.cum_date_regular:
        try:
            cum_dt = datetime.strptime(event.cum_date_regular, "%Y-%m-%d").date()
            if today > cum_dt:
                errors.append("EVENT_EXPIRED_CUM_DATE_PASSED: Tanggal Cum Date sudah terlewat.")
        except ValueError:
            errors.append("Format tanggal Cum Date Regular tidak valid.")

    if event.ex_date_regular:
        try:
            ex_dt = datetime.strptime(event.ex_date_regular, "%Y-%m-%d").date()
            if today >= ex_dt:
                errors.append("EX_DATE_PASSED: Tanggal Ex Date sudah terlewat atau hari ini.")
        except ValueError:
            errors.append("Format tanggal Ex Date Regular tidak valid.")

    # 3. Date logic consistency checks
    if event.cum_date_regular and event.ex_date_regular:
        try:
            cum_dt = datetime.strptime(event.cum_date_regular, "%Y-%m-%d").date()
            ex_dt = datetime.strptime(event.ex_date_regular, "%Y-%m-%d").date()
            if cum_dt >= ex_dt:
                errors.append("Tanggal Cum Date harus sebelum Ex Date.")
        except ValueError:
            pass

    if event.ex_date_regular and event.recording_date:
        try:
            ex_dt = datetime.strptime(event.ex_date_regular, "%Y-%m-%d").date()
            rec_dt = datetime.strptime(event.recording_date, "%Y-%m-%d").date()
            if rec_dt < ex_dt:
                errors.append("DATA_INCONSISTENT: Tanggal Recording Date sebelum Ex Date.")
        except ValueError:
            errors.append("Format tanggal Recording Date tidak valid.")

    if event.recording_date and event.payment_date:
        try:
            rec_dt = datetime.strptime(event.recording_date, "%Y-%m-%d").date()
            pay_dt = datetime.strptime(event.payment_date, "%Y-%m-%d").date()
            if pay_dt <= rec_dt:
                errors.append("Tanggal Payment Date harus setelah Recording Date.")
        except ValueError:
            errors.append("Format tanggal Payment Date tidak valid.")

    # 4. Check database for overlapping inconsistent entries
    if conn and event.ticker and event.cum_date_regular:
        try:
            # Check duplicates
            dup = conn.execute(
                """
                SELECT id, verification_status FROM dividend_events
                WHERE ticker = ? AND cum_date_regular = ? AND abs(dividend_per_share - ?) < 0.01
                  AND id != ?
                """,
                (event.ticker, event.cum_date_regular, event.dividend_per_share, event.id)
            ).fetchone()
            if dup:
                warnings.append(f"Terdeteksi event duplikat di database dengan ID: {dup['id']}")

            # Check inconsistent overlap (same ticker, close cum date but different DPS or Ex Date)
            other = conn.execute(
                """
                SELECT id, cum_date_regular, dividend_per_share, ex_date_regular, source_name 
                FROM dividend_events
                WHERE ticker = ? AND id != ?
                  AND abs(julianday(cum_date_regular) - julianday(?)) <= 30
                """,
                (event.ticker, event.id, event.cum_date_regular)
            ).fetchall()
            for o in other:
                if abs(o["dividend_per_share"] - event.dividend_per_share) > 0.01 or o["ex_date_regular"] != event.ex_date_regular:
                    warnings.append(f"DATA_INCONSISTENT: Ditemukan data dividen lain untuk {event.ticker} dalam rentang 30 hari dengan nilai/tanggal berbeda.")
        except Exception as e:
            print(f"Error checking database inconsistencies: {e}")

    # 5. Determine recommended status
    is_valid = len(errors) == 0
    
    if not is_valid:
        recommended_status = "rejected"
    elif event.confidence_score >= 85.0 and len(warnings) == 0:
        recommended_status = "auto_verified"
    else:
        recommended_status = "needs_review"
        
    return is_valid, errors, warnings, recommended_status
