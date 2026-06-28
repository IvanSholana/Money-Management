from datetime import datetime, date
from typing import Any, Dict, List, Optional
from dividend_schema import DividendEvent, DividendMomentumCandidate

def calculate_days_between(date_str_1: str, date_str_2: str) -> int:
    """Calculates days between date_str_2 (target) and date_str_1 (base)."""
    d1 = datetime.strptime(date_str_1, "%Y-%m-%d").date()
    d2 = datetime.strptime(date_str_2, "%Y-%m-%d").date()
    return (d2 - d1).days

def is_syariah_compliant(status: str) -> bool:
    if not status:
        return False
    normalized = status.strip().upper()
    return any(term in normalized for term in ["DES", "SYARIAH", "APPROVED"])

def score_dividend_momentum(
    event: DividendEvent,
    price_metrics: Dict[str, Any],
    syariah_status: str = "Not Checked",
    fundamental_metrics: Optional[List[dict]] = None,
    syariah_only: bool = True,
    include_needs_review: bool = False
) -> tuple[float, str, Dict[str, float], List[str], List[str]]:
    """
    Computes final momentum score (0-100) and returns:
    (final_score, final_status, score_components, warnings, rejection_reasons)
    """
    warnings: List[str] = []
    rejection_reasons: List[str] = []
    score_components: Dict[str, float] = {}

    current_price = price_metrics.get("current_price", 0.0)
    
    # 1. Hard Rejection Checks
    if current_price <= 0:
        rejection_reasons.append("Harga saat ini tidak valid atau kosong.")
        return 0.0, "AVOID", {}, warnings, rejection_reasons

    # Calculate dividend yield
    yield_percent = (event.dividend_per_share / current_price) * 100
    
    # Calculate days to dates
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    if not event.cum_date_regular or not event.ex_date_regular:
        rejection_reasons.append("Tanggal Cum Date atau Ex Date kosong.")
        return 0.0, "AVOID", {}, warnings, rejection_reasons

    try:
        days_to_cum = calculate_days_between(today_str, event.cum_date_regular)
        days_to_ex = calculate_days_between(today_str, event.ex_date_regular)
    except Exception as e:
        rejection_reasons.append(f"Gagal menghitung selisih tanggal: {e}")
        return 0.0, "AVOID", {}, warnings, rejection_reasons

    # Validate cum date has not passed
    if days_to_cum < 0:
        rejection_reasons.append("EVENT_EXPIRED_CUM_DATE_PASSED: Tanggal Cum Date sudah lewat.")
    if days_to_ex < 0:
        rejection_reasons.append("EX_DATE_PASSED: Tanggal Ex Date sudah lewat.")
    if days_to_cum <= 1:
        rejection_reasons.append(f"H-Cum Date terlalu mepet (days_to_cum = {days_to_cum}). Minimal H-2.")
        
    # Yield threshold
    if yield_percent < 1.0:
        rejection_reasons.append(f"Dividend yield terlalu kecil ({yield_percent:.2f}%). Minimal 1.0%.")
        
    # Syariah compliance filter
    syariah_ok = is_syariah_compliant(syariah_status)
    if syariah_only and not syariah_ok:
        rejection_reasons.append(f"Emiten {event.ticker} tidak berlabel Syariah (Status: {syariah_status}).")
    elif not syariah_ok:
        warnings.append(f"PERINGATAN: Saham non-syariah atau belum terverifikasi syariah (Status: {syariah_status}).")

    # Volume filter
    vol_avg_20d = price_metrics.get("volume_avg_20d", 0.0)
    if vol_avg_20d < 1000:
        rejection_reasons.append(f"Volume rata-rata 20 hari terlalu kecil ({vol_avg_20d:.0f} shares).")

    # Priced in filter (price return since announcement > 15%)
    ret_since_ann = price_metrics.get("price_return_since_announcement", 0.0)
    if ret_since_ann > 0.15:
        rejection_reasons.append(f"Kemungkinan sudah Priced-In. Harga sudah naik {ret_since_ann*100:.2f}% sejak pengumuman.")

    # Overextended alert
    ret_5d = price_metrics.get("price_return_5d", 0.0)
    vol_ratio = price_metrics.get("volume_ratio", 1.0)
    if ret_5d > 0.12 and vol_ratio < 1.0:
        rejection_reasons.append("Harga overextended (naik >12% dalam 5 hari) namun volume transaksi melemah.")
    elif ret_5d > 0.12:
        warnings.append("HATI-HATI: Harga mengalami kenaikan tajam (>12% dalam 5 hari), rawan pullback.")

    # Verification status filter
    if event.verification_status not in ["auto_verified", "manually_verified"] and not include_needs_review:
        rejection_reasons.append(f"Event belum terverifikasi (status: {event.verification_status}) dan include_needs_review = false.")

    if event.dividend_per_share <= 0:
        rejection_reasons.append("Nilai dividen per share kurang dari atau sama dengan 0.")

    if rejection_reasons:
        return 0.0, "AVOID", {}, warnings, rejection_reasons

    # 2. Scoring Logic
    # A. Dividend Yield (Max 20)
    if yield_percent >= 5.0:
        score_yield = 20.0
    elif yield_percent >= 3.0:
        score_yield = 15.0
    elif yield_percent >= 1.5:
        score_yield = 10.0
    elif yield_percent >= 1.0:
        score_yield = 5.0
    else:
        score_yield = 0.0
    score_components["yield_attractiveness"] = score_yield

    # B. Days to Cum Date (Max 15)
    # Target optimal: H-5 sampai H-15.
    if 5 <= days_to_cum <= 15:
        score_days = 15.0
    elif 3 <= days_to_cum <= 4:
        score_days = 10.0
    elif 16 <= days_to_cum <= 30:
        score_days = 8.0
    elif days_to_cum == 2:
        score_days = 5.0
    else:
        score_days = 0.0
    score_components["days_to_cum"] = score_days

    # C. Price Momentum (Max 15)
    score_price = 0.0
    ma5 = price_metrics.get("ma5", 0.0)
    ma20 = price_metrics.get("ma20", 0.0)
    if current_price > ma20 and ma5 > ma20:
        score_price += 10.0
    if 0.0 < ret_5d < 0.08:
        score_price += 5.0
    score_components["price_momentum"] = score_price

    # D. Volume Confirmation (Max 15)
    if vol_ratio >= 2.0:
        score_vol = 15.0
    elif vol_ratio >= 1.5:
        score_vol = 10.0
    elif vol_ratio >= 1.2:
        score_vol = 5.0
    else:
        score_vol = 0.0
    score_components["volume_confirmation"] = score_vol

    # E. Historical Run-Up (Max 15)
    # Defaults to neutral +5 unless we do full backtest. We can provide standard +10 if it's bluechip
    score_hist = 5.0
    if event.ticker in ["TLKM", "BBCA", "ASII"]:
        score_hist = 15.0
    elif event.ticker in ["UNVR", "ADRO"]:
        score_hist = 10.0
    score_components["historical_runup"] = score_hist

    # F. Ex-Date Drop Risk (Max 10)
    # Default to neutral +5.
    score_drop = 5.0
    if event.ticker in ["BBCA", "TLKM"]:
        score_drop = 10.0 # Historically fast recovery
    elif event.ticker in ["ADRO"]:
        score_drop = 3.0 # High dividend trap risk
    score_components["ex_date_drop_risk"] = score_drop

    # G. Fundamental Quality (Max 10)
    # Simple check: if fundamental metrics exist and net profit is healthy
    score_fund = 5.0
    if fundamental_metrics:
        try:
            # Check latest year roe
            latest_metric = fundamental_metrics[0]
            roe = latest_metric.get("roe", 0.0)
            der = latest_metric.get("der", 0.0)
            if roe > 10.0 and der < 1.5:
                score_fund = 10.0
            elif roe > 0.0:
                score_fund = 7.0
            else:
                score_fund = 2.0
        except Exception:
            pass
    elif event.ticker in ["BBCA", "TLKM", "ASII"]:
        score_fund = 10.0 # General knowledge fundamental safety
    score_components["fundamental_quality"] = score_fund

    # 3. Sum final score
    final_score = sum(score_components.values())

    # Determine status
    if final_score < 50.0:
        final_status = "AVOID"
    elif final_score < 65.0:
        final_status = "WATCH"
    elif final_score < 80.0:
        final_status = "DIVIDEND_MOMENTUM_CANDIDATE"
    else:
        final_status = "HIGH_CONVICTION_RUN_UP"

    return final_score, final_status, score_components, warnings, rejection_reasons

def generate_entry_plan(event: DividendEvent, price_metrics: Dict[str, Any], score: float) -> str:
    ma5 = price_metrics.get("ma5", 0.0)
    ma20 = price_metrics.get("ma20", 0.0)
    curr = price_metrics.get("current_price", 0.0)
    
    if curr > ma20:
        return f"Entry ideal pada area pullback ke MA5 (kisaran {ma5:.0f}) atau MA20 ({ma20:.0f}). Gunakan porsi masuk bertahap (e.g. 50% di MA5, 50% di MA20). Pastikan volume transaksi mengkonfirmasi pantulan."
    else:
        return "Tunggu harga berhasil breakout dan stabil di atas MA20 sebelum melakukan pembelian. Jangan paksakan entry saat tren harga di bawah MA20."

def generate_exit_plan(event: DividendEvent, price_metrics: Dict[str, Any], yield_pct: float) -> str:
    cum_date = event.cum_date_regular
    return (
        f"KELUAR secara disiplin menjelang Cum Date (ideal H-1 sampai H-3, yaitu kisaran tanggal {cum_date}). "
        f"Take profit jika target capital gain tercapai (Target 1 atau Target 2). "
        "Sangat direkomendasikan untuk menghindari hold melewati Ex-Date demi menghindari risiko Dividend Trap (penurunan tajam harga saham saat ex-date)."
    )

def build_momentum_candidate(
    event: DividendEvent,
    price_metrics: Dict[str, Any],
    syariah_status: str = "Not Checked",
    fundamental_metrics: Optional[List[dict]] = None,
    syariah_only: bool = True,
    include_needs_review: bool = False
) -> DividendMomentumCandidate:
    """Orchestrates candidate validation, scoring, plans, and builds a candidate object."""
    score, status, components, warnings, rejections = score_dividend_momentum(
        event, price_metrics, syariah_status, fundamental_metrics, syariah_only, include_needs_review
    )
    
    current_price = price_metrics.get("current_price", 0.0)
    yield_percent = (event.dividend_per_share / current_price) * 100 if current_price > 0 else 0.0
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    days_to_cum = 0
    days_to_ex = 0
    try:
        days_to_cum = calculate_days_between(today_str, event.cum_date_regular)
        days_to_ex = calculate_days_between(today_str, event.ex_date_regular)
    except Exception:
        pass

    # Target profits and stop loss rules
    # target_gain_1 = max(1.5%, min(dividend_yield_percent * 0.5, 3%))
    # target_gain_2 = min(dividend_yield_percent, 6%)
    # stop_loss = 3% sampai 5%
    tg1 = max(1.5, min(yield_percent * 0.5, 3.0))
    tg2 = min(yield_percent, 6.0)
    sl = 3.5 # Standard SL is 3.5%
    
    # We can also compute MA20 distance
    ma20 = price_metrics.get("ma20", current_price)
    dist_ma20 = ((current_price - ma20) / ma20) * 100 if ma20 > 0 else 0.0
    
    entry_plan = generate_entry_plan(event, price_metrics, score)
    exit_plan = generate_exit_plan(event, price_metrics, yield_percent)

    candidate = DividendMomentumCandidate(
        ticker=event.ticker,
        ticker_yahoo=event.ticker_yahoo or f"{event.ticker}.JK",
        company_name=event.company_name or "Unknown Company",
        dividend_per_share=event.dividend_per_share,
        current_price=current_price,
        dividend_yield_percent=yield_percent,
        announcement_date=event.announcement_date,
        cum_date_regular=event.cum_date_regular,
        ex_date_regular=event.ex_date_regular,
        recording_date=event.recording_date,
        payment_date=event.payment_date,
        days_to_cum=days_to_cum,
        days_to_ex=days_to_ex,
        price_return_since_announcement=price_metrics.get("price_return_since_announcement", 0.0),
        price_return_5d=price_metrics.get("price_return_5d", 0.0),
        price_return_10d=price_metrics.get("price_return_10d", 0.0),
        volume_ratio_20d=price_metrics.get("volume_ratio", 1.0),
        distance_to_ma20_percent=dist_ma20,
        historical_runup_score=components.get("historical_runup", 0.0),
        ex_date_drop_risk_score=components.get("ex_date_drop_risk", 0.0),
        fundamental_quality_score=components.get("fundamental_quality", 0.0),
        syariah_status=syariah_status,
        final_score=score,
        final_status=status,
        score_components=components,
        entry_plan=entry_plan,
        exit_plan=exit_plan,
        warnings=warnings,
        rejection_reasons=rejections,
        source_name=event.source_name or "Unknown",
        source_url=event.source_url,
        verification_status=event.verification_status,
        confidence_score=event.confidence_score
    )
    return candidate
