from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from orderbook_schema import OrderBookSnapshot, ExecutionCheckResult
import idx_tick_size

def calculate_realistic_risk_reward(best_offer: float, target_profit: float, stop_loss: float) -> float:
    """
    Calculates realistic risk-reward ratio based on the actual best offer price.
    Realistic RR = (Target - Entry) / (Entry - StopLoss)
    """
    if best_offer <= 0 or target_profit <= best_offer or best_offer <= stop_loss:
        return 0.0
    denominator = best_offer - stop_loss
    if denominator <= 0:
        return 0.0
    return (target_profit - best_offer) / denominator

def evaluate_execution_readiness(
    snapshot: OrderBookSnapshot,
    candidate: Optional[Dict[str, Any]],
    planned_order_lots: int = 1,
    minimum_rr_threshold: float = 1.5
) -> ExecutionCheckResult:
    """
    Determines execution readiness status and calculates score (0-100) based on
    OrderBookSnapshot and quantitative candidate data.
    """
    reasons: List[str] = []
    warnings: List[str] = []
    
    # 1. Candidate presence check
    if not candidate:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="CANDIDATE_NOT_FOUND",
            execution_score=0.0,
            orderbook_metrics={},
            execution_reasons=["Kandidat tidak ditemukan di cache backend. Eksekusi memerlukan review manual."],
            suggested_action="Perform manual review."
        )

    # 2. Hard Candidate Rejection checks
    candidate_signal = candidate.get("final_signal") or candidate.get("quant_signal")
    if candidate_signal not in ["BUY", "WATCH"]:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="AVOID_EXECUTION",
            execution_score=0.0,
            orderbook_metrics={},
            execution_reasons=[f"Sinyal quant untuk {snapshot.ticker} adalah {candidate_signal} (bukan BUY/WATCH)."],
            suggested_action="Do not execute. Signal is avoid."
        )

    if candidate.get("screening_status") == "rejected":
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="AVOID_EXECUTION",
            execution_score=0.0,
            orderbook_metrics={},
            execution_reasons=["Kandidat ditolak oleh screening quant awal."],
            suggested_action="Do not execute."
        )

    # 3. Snapshot Staleness check (>60s is hard reject, >30s is warning)
    is_stale = False
    age_seconds = 0.0
    if snapshot.timestamp_read:
        try:
            read_dt = datetime.fromisoformat(snapshot.timestamp_read)
            now_dt = datetime.now(timezone.utc)
            age_seconds = (now_dt - read_dt).total_seconds()
            if age_seconds > 60.0:
                return ExecutionCheckResult(
                    ticker=snapshot.ticker,
                    execution_status="AVOID_EXECUTION",
                    execution_score=0.0,
                    orderbook_metrics={"age_seconds": age_seconds},
                    execution_reasons=[f"Snapshot order book sudah kedaluwarsa ({age_seconds:.0f} detik). Limit 60 detik."],
                    stale_snapshot=True,
                    suggested_action="Please refresh the order book snapshot."
                )
            elif age_seconds > 30.0:
                warnings.append(f"Snapshot order book agak lama ({age_seconds:.0f} detik). Data mungkin berubah.")
        except Exception as e:
            warnings.append(f"Gagal memeriksa umur snapshot: {e}")

    # 4. Parser Confidence check
    if snapshot.read_confidence < 40.0:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="MANUAL_REVIEW",
            execution_score=0.0,
            orderbook_metrics={"read_confidence": snapshot.read_confidence},
            execution_reasons=[f"Kepercayaan parser terlalu rendah ({snapshot.read_confidence:.0f}%). Format tidak dikenal."],
            suggested_action="Manual verification required."
        )

    best_bid = snapshot.best_bid_price
    best_offer = snapshot.best_offer_price
    
    if not best_bid or not best_offer:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="MANUAL_REVIEW",
            execution_score=0.0,
            orderbook_metrics={},
            execution_reasons=["Data best bid atau best offer tidak terdeteksi."],
            suggested_action="Review order book manually."
        )

    # 5. Spread Ticks check
    spread_ticks = snapshot.spread_ticks or 0
    if spread_ticks > 3:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="SPREAD_TOO_WIDE",
            execution_score=0.0,
            orderbook_metrics={"spread_ticks": spread_ticks},
            execution_reasons=[f"Spread bid-ask terlalu lebar ({spread_ticks} tick). Batas maksimal 3 tick."],
            suggested_action="Wait for spread to narrow."
        )
    elif spread_ticks in [2, 3]:
        warnings.append(f"Peringatan: Spread melebar menjadi {spread_ticks} tick.")

    # 6. Bid Depth Volume checks (relative to planned_order_lots)
    bid_vols = [row.volume for row in snapshot.bid_rows[:5]]
    sum_bid_vol_top5 = sum(bid_vols)
    
    if sum_bid_vol_top5 < planned_order_lots:
        return ExecutionCheckResult(
            ticker=snapshot.ticker,
            execution_status="AVOID_EXECUTION",
            execution_score=0.0,
            orderbook_metrics={"sum_bid_vol_top5": sum_bid_vol_top5, "planned_order_lots": planned_order_lots},
            execution_reasons=[f"Likuiditas antrean bid sangat tipis ({sum_bid_vol_top5} lot) dibandingkan dengan lot rencana beli ({planned_order_lots} lot)."],
            suggested_action="Avoid execution due to low liquidity."
        )

    # 7. Offer Wall check
    offer_vols = [row.volume for row in snapshot.offer_rows[:5]]
    sum_offer_vol_top5 = sum(offer_vols)

    # 8. Imbalance check
    total_vol = sum_bid_vol_top5 + sum_offer_vol_top5
    imbalance = (sum_bid_vol_top5 - sum_offer_vol_top5) / total_vol if total_vol > 0 else 0.0

    # 9. Proximity & Entry Range checks
    entry_range = candidate.get("entry_range") or {"low": 0.0, "high": 0.0}
    entry_low = float(entry_range.get("low") or 0.0)
    entry_high = float(entry_range.get("high") or 0.0)
    
    proximity_score = 10.0
    if entry_high > 0:
        # Check hard reject for proximity
        if best_offer > entry_high * 1.05:
            return ExecutionCheckResult(
                ticker=snapshot.ticker,
                execution_status="AVOID_EXECUTION",
                execution_score=0.0,
                orderbook_metrics={"best_offer": best_offer, "entry_high": entry_high},
                execution_reasons=[f"Harga best offer (Rp {best_offer}) sudah naik jauh (>5%) di atas zona entry maksimum (Rp {entry_high})."],
                suggested_action="Do not chase this stock. Entry area missed."
            )
        elif best_offer > entry_high:
            proximity_score = 5.0
            warnings.append(f"Harga penawaran terbaik (Rp {best_offer}) sedikit berada di atas zona entry wajar (Rp {entry_high}).")
        elif best_offer < entry_low:
            proximity_score = 10.0
            warnings.append(f"Harga berada di bawah area entry wajar (Rp {entry_low}). Cek setup pembalikan arah.")

    # 10. Risk-Reward validation
    target_profit = float(candidate.get("target_profit_1") or 0.0)
    stop_loss = float(candidate.get("stop_loss") or 0.0)
    
    realistic_rr = 0.0
    rr_score = 5.0
    if target_profit > 0 and stop_loss > 0:
        realistic_rr = calculate_realistic_risk_reward(best_offer, target_profit, stop_loss)
        if realistic_rr < 1.0:
            return ExecutionCheckResult(
                ticker=snapshot.ticker,
                execution_status="AVOID_EXECUTION",
                execution_score=0.0,
                orderbook_metrics={"realistic_rr": realistic_rr, "target_profit_1": target_profit, "stop_loss": stop_loss},
                execution_reasons=[f"Risk-reward realistis memburuk di bawah batas aman ({realistic_rr:.2f}x)."],
                suggested_action="Do not execute. Risk-reward is too low."
            )
        elif realistic_rr < minimum_rr_threshold:
            rr_score = 0.0
            warnings.append(f"Risk-reward realistis ({realistic_rr:.2f}x) di bawah threshold target ({minimum_rr_threshold}x).")

    # 11. Scoring Component Calculations
    # A. Spread Quality (Max 25)
    score_spread = 0.0
    if spread_ticks == 1:
        score_spread = 25.0
    elif spread_ticks == 2:
        score_spread = 18.0
    elif spread_ticks == 3:
        score_spread = 10.0

    # B. Bid Depth Quality (Max 20)
    score_bid_depth = 0.0
    if sum_bid_vol_top5 >= planned_order_lots * 10:
        score_bid_depth = 20.0
    elif sum_bid_vol_top5 >= planned_order_lots * 3:
        score_bid_depth = 10.0

    # C. Offer Pressure (Max 15)
    score_offer_pressure = 0.0
    if sum_offer_vol_top5 <= sum_bid_vol_top5 * 0.8:
        score_offer_pressure = 15.0
    elif sum_offer_vol_top5 <= sum_bid_vol_top5 * 1.5:
        score_offer_pressure = 8.0

    # D. Bid/Ask Imbalance (Max 15)
    score_imbalance = 0.0
    if imbalance > 0.2:
        score_imbalance = 15.0
    elif -0.2 <= imbalance <= 0.2:
        score_imbalance = 8.0

    # E. Entry Price Proximity (Max 10)
    score_proximity = proximity_score

    # F. Parser/Data Confidence (Max 10)
    score_confidence = 0.0
    if snapshot.read_confidence >= 80.0:
        score_confidence = 10.0
    elif snapshot.read_confidence >= 60.0:
        score_confidence = 5.0

    # G. Risk-Reward Still Valid (Max 5)
    score_rr = rr_score

    # Sum score
    execution_score = (
        score_spread + score_bid_depth + score_offer_pressure +
        score_imbalance + score_proximity + score_confidence + score_rr
    )

    # 12. Final Status Mapping
    if execution_score >= 80.0:
        status = "EXECUTION_OK"
        suggested_action = "Setup may be considered manually for virtual execution."
    elif execution_score >= 65.0:
        status = "EXECUTION_ACCEPTABLE_BUT_MONITOR"
        suggested_action = "Acceptable execution, but monitor price actions closely."
    elif execution_score >= 50.0:
        status = "WAIT_BETTER_ENTRY"
        suggested_action = "Wait for a pull back or more favorable entry price."
    elif execution_score >= 35.0:
        status = "ORDERBOOK_WEAK"
        suggested_action = "Order book queue is weak. Proceed with high caution."
    else:
        status = "AVOID_EXECUTION"
        suggested_action = "Avoid execution due to very poor order book configuration."

    metrics = {
        "spread_ticks": spread_ticks,
        "spread_percent": snapshot.spread_percent,
        "sum_bid_vol_top5": sum_bid_vol_top5,
        "sum_offer_vol_top5": sum_offer_vol_top5,
        "bid_ask_imbalance": imbalance,
        "realistic_rr": realistic_rr,
        "planned_order_lots": planned_order_lots,
        "age_seconds": age_seconds,
        "read_confidence": snapshot.read_confidence
    }

    return ExecutionCheckResult(
        ticker=snapshot.ticker,
        execution_status=status,
        execution_score=execution_score,
        orderbook_metrics=metrics,
        execution_reasons=reasons,
        execution_warnings=warnings,
        suggested_action=suggested_action,
        stale_snapshot=(age_seconds > 60.0)
    )
