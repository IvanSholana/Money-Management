from __future__ import annotations

import copy
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd

import backtest
import fundamental_service
import signal_engine


Loader = Callable[[str, bool], dict[str, Any]]
AiReviewer = Callable[[list[dict[str, Any]]], list[dict[str, Any]]]

DEFAULT_MIN_RISK_REWARD = 1.5
DEFAULT_TIME_STOP_DAYS = 30
MIN_RANK_SCORE = 45.0
MIN_BACKTEST_TRADES = 5


class ScreeningCache:
    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            stored_at, value = item
            if time.time() - stored_at > self.ttl_seconds:
                self._items.pop(key, None)
                return None
            return copy.deepcopy(value)

    def set(self, key: str, value: dict[str, Any]) -> None:
        with self._lock:
            self._items[key] = (time.time(), copy.deepcopy(value))

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


screening_cache = ScreeningCache()


def parse_tickers(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_items = re.split(r"[\s,;]+", value)
    elif isinstance(value, (list, tuple, set)):
        raw_items = [str(item) for item in value]
    else:
        return []

    tickers: list[str] = []
    for raw in raw_items:
        cleaned = raw.strip().upper()
        if not cleaned:
            continue
        if not cleaned.endswith(".JK"):
            cleaned = f"{cleaned}.JK"
        if cleaned not in tickers:
            tickers.append(cleaned)
    return tickers


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _liquidity_details(df: pd.DataFrame) -> tuple[str, float]:
    if df.empty or "Volume" not in df or "Close" not in df:
        return "unavailable", 0.0
    average_value = float((df["Volume"].tail(20) * df["Close"].tail(20)).mean())
    if average_value < signal_engine.MIN_DAILY_LIQUIDITY_VALUE:
        return "low", average_value
    if average_value < 5_000_000_000:
        return "medium", average_value
    return "high", average_value


def _empty_backtest_summary() -> dict[str, Any]:
    return {
        "total_return": 0.0,
        "cagr": 0.0,
        "win_rate": 0.0,
        "average_gain": 0.0,
        "average_loss": 0.0,
        "profit_factor": 0.0,
        "max_drawdown": 0.0,
        "number_of_trades": 0,
        "average_holding_period": 0.0,
        "expectancy": 0.0,
        "false_breakout_count": 0,
        "recent_stability_score": 50.0,
    }


def _normalize_backtest(result: dict[str, Any] | None) -> tuple[str, dict[str, Any], list[str]]:
    summary = _empty_backtest_summary()
    warnings: list[str] = []
    if not result or result.get("error"):
        if result and result.get("error"):
            warnings.append(str(result["error"]))
            return "failed", summary, warnings
        return "unavailable", summary, warnings

    summary = {
        "total_return": float(result.get("total_return_percent", 0.0)),
        "cagr": float(result.get("cagr_percent", 0.0)),
        "win_rate": float(result.get("win_rate_percent", 0.0)),
        "average_gain": float(result.get("average_gain_percent", 0.0)),
        "average_loss": float(result.get("average_loss_percent", 0.0)),
        "profit_factor": float(result.get("profit_factor", 0.0)),
        "max_drawdown": float(result.get("max_drawdown_percent", 0.0)),
        "number_of_trades": int(result.get("number_of_trades", 0)),
        "average_holding_period": float(result.get("average_holding_days", 0.0)),
        "expectancy": float(result.get("expectancy_percent", 0.0)),
        "false_breakout_count": int(result.get("false_breakout_count", 0)),
        "recent_stability_score": float(result.get("recent_stability_score", 50.0)),
    }
    if summary["number_of_trades"] == 0:
        warnings.append(
            "Backtest tidak menemukan entry yang memenuhi seluruh aturan strategi pada periode data."
        )
        return "no_trades", summary, warnings
    if summary["number_of_trades"] < MIN_BACKTEST_TRADES:
        warnings.append(
            f"Backtest hanya memiliki {summary['number_of_trades']} trade; confidence statistik rendah."
        )
        return "insufficient_trades", summary, warnings
    return "available", summary, warnings


def _backtest_quality(status: str, summary: dict[str, Any]) -> float:
    if status in {"unavailable", "failed", "no_trades"}:
        return 20.0

    expectancy_score = _clamp(50.0 + (summary["expectancy"] * 20.0))
    profit_factor_score = _clamp((summary["profit_factor"] / 2.0) * 100.0)
    drawdown_score = _clamp(100.0 - (summary["max_drawdown"] * 3.0))
    trade_score = _clamp((summary["number_of_trades"] / 15.0) * 100.0)
    return_score = _clamp(50.0 + (summary["cagr"] * 2.0))
    stability_score = _clamp(summary["recent_stability_score"])
    false_breakout_penalty = min(25.0, summary["false_breakout_count"] * 5.0)

    quality = (
        expectancy_score * 0.30
        + profit_factor_score * 0.25
        + drawdown_score * 0.20
        + trade_score * 0.15
        + return_score * 0.05
        + stability_score * 0.05
        - false_breakout_penalty
    )
    if status == "insufficient_trades":
        quality *= 0.65
    return _clamp(quality)


def _signal_quality(signal: str, confidence: str) -> float:
    if signal == "BUY":
        return {"high": 100.0, "medium": 78.0, "low": 58.0}.get(confidence, 70.0)
    if signal == "HOLD":
        return 25.0
    return 0.0


def _risk_reward_quality(risk_reward: float) -> float:
    if risk_reward < 1.5:
        return 0.0
    if risk_reward >= 3.0:
        return 100.0
    return _clamp(50.0 + ((risk_reward - 1.5) / 1.5) * 50.0)


def _rank_candidate(
    quant: dict[str, Any],
    liquidity_status: str,
    backtest_status: str,
    backtest_summary: dict[str, Any],
) -> tuple[float, dict[str, float]]:
    components = {
        "quant_signal_quality": _signal_quality(
            str(quant.get("final_signal", "HOLD")),
            str(quant.get("confidence", "low")),
        ),
        "risk_reward_quality": _risk_reward_quality(float(quant.get("risk_reward", 0.0))),
        "backtest_profitability_quality": _backtest_quality(backtest_status, backtest_summary),
        "fundamental_safety_quality": (
            40.0  # neutral baseline when no thesis data has been entered
            if str(quant.get("fundamental_status", "unavailable")) == "unavailable"
            else _clamp(
                (float(quant.get("fundamental_score", 0.0)) / 20.0) * 100.0
            )
        ),
        "liquidity_execution_quality": {
            "high": 100.0,
            "medium": 70.0,
            "low": 0.0,
            "unavailable": 20.0,
        }.get(liquidity_status, 20.0),
    }
    score = (
        components["quant_signal_quality"] * 0.30
        + components["risk_reward_quality"] * 0.20
        + components["backtest_profitability_quality"] * 0.25
        + components["fundamental_safety_quality"] * 0.15
        + components["liquidity_execution_quality"] * 0.10
    )
    return round(_clamp(score), 2), {key: round(value, 2) for key, value in components.items()}


def _entry_and_exit_plan(
    quant: dict[str, Any],
    current_price: float,
    time_stop_days: int,
) -> tuple[str, str, dict[str, Any]]:
    entry_range = quant.get("entry_range") or {"low": 0.0, "high": 0.0}
    low = float(entry_range.get("low", 0.0))
    high = float(entry_range.get("high", 0.0))
    signal_type = str(quant.get("quant_signal_type", "neutral"))
    warnings = [str(item) for item in quant.get("warnings", [])]

    if quant.get("final_signal") != "BUY":
        status = "invalid_entry"
        reason = "Sinyal kuantitatif belum BUY; jangan membuka posisi baru."
    elif current_price > high:
        status = "wait_for_pullback"
        reason = "Harga berada di atas area entry; tunggu pullback agar risk-reward tidak rusak."
    elif current_price < low:
        status = "watch_reversal_confirmation"
        reason = "Harga berada di bawah area entry; tunggu konfirmasi reversal sebelum masuk."
    elif signal_type == "breakout" and any("Exhaustion" in warning for warning in warnings):
        status = "invalid_entry"
        reason = "Breakout disertai peringatan exhaustion sehingga entry baru tidak valid."
    else:
        status = "valid_entry_area"
        reason = "Harga berada di area entry dan lolos minimum risk-reward."

    exit_conditions = [
        "Keluar jika harga menyentuh stop loss atau ATR trailing stop.",
        "Downgrade atau keluar jika rezim berubah menjadi bearish_trend.",
        "Jangan menambah posisi jika risk-reward turun di bawah 1.5.",
        f"Evaluasi time stop setelah {time_stop_days} trading days.",
    ]
    return status, reason, {
        "take_profit_1": float(quant.get("target_profit_1", 0.0)),
        "take_profit_2": float(quant.get("target_profit_2", 0.0)),
        "stop_loss": float(quant.get("stop_loss", 0.0)),
        "trailing_stop": float(quant.get("atr_trailing_stop", 0.0)),
        "time_stop_days": time_stop_days,
        "exit_conditions": exit_conditions,
    }


def _failed_result(ticker: str, reason: str) -> dict[str, Any]:
    import uuid
    return {
        "candidate_id": str(uuid.uuid4()),
        "ticker": ticker,
        "as_of_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "screening_status": "rejected",
        "rejection_reason": reason,
        "data_quality": "error",
        "liquidity_status": "unavailable",
        "average_traded_value": 0.0,
        "regime": "sideways",
        "quant_signal": "AVOID",
        "confidence": "low",
        "score": 0.0,
        "risk_reward": 0.0,
        "entry_range": {"low": 0.0, "high": 0.0},
        "target_profit_1": 0.0,
        "target_profit_2": 0.0,
        "stop_loss": 0.0,
        "atr_trailing_stop": 0.0,
        "fundamental_score": 0.0,
        "fundamental_status": "unavailable",
        "backtest_status": "failed",
        "backtest_summary": _empty_backtest_summary(),
        "expected_profitability_score": 0.0,
        "candidate_rank_score": 0.0,
        "ranking_components": {},
        "rank": 0,
        "entry_status": "invalid_entry",
        "entry_reason": reason,
        "exit_plan": {
            "take_profit_1": 0.0,
            "take_profit_2": 0.0,
            "stop_loss": 0.0,
            "trailing_stop": 0.0,
            "time_stop_days": DEFAULT_TIME_STOP_DAYS,
            "exit_conditions": [],
        },
        "ai_review_status": "skipped",
        "ai_final_signal": None,
        "ai_confidence": None,
        "ai_reason": None,
        "ai_risk_note": None,
        "ai_entry_comment": None,
        "ai_exit_comment": None,
        "news_search_status": "skipped",
        "news_catalyst_summary": "",
        "news_risk_summary": "",
        "news_source_quality": "none",
        "news_sources": [],
        "catalyst_flags": [],
        "risk_flags": [],
        "ai_final_signal_with_news": None,
        "ai_news_review_reason": "",
        "news_review_warnings": [],
        "warnings": [reason],
    }


def screen_ticker(
    ticker: str,
    loader: Loader,
    *,
    syariah_filter: bool,
    run_backtest: bool,
    min_risk_reward: float,
    time_stop_days: int,
) -> dict[str, Any]:
    cache_key = (
        f"{ticker}|syariah={int(syariah_filter)}|backtest={int(run_backtest)}"
        f"|rr={min_risk_reward:.2f}|time={time_stop_days}"
    )
    cached = screening_cache.get(cache_key)
    if cached is not None:
        cached["cache_status"] = "hit"
        return cached

    try:
        loaded = loader(ticker, syariah_filter)
        df = loaded.get("df")
        if not isinstance(df, pd.DataFrame) or df.empty:
            result = _failed_result(ticker, str(loaded.get("error") or "Data OHLCV tidak tersedia."))
            screening_cache.set(cache_key, result)
            return result

        fundamental_metrics = loaded.get("fundamental_metrics") or []
        sector = loaded.get("sector") or "Lainnya"
        syariah_status = loaded.get("syariah_status") or "Not Checked"
        # Disable signal_engine's internal fundamental gate so the batch
        # screener's own rejection/warning logic handles it (avoids double-
        # penalty where BUY gets silently downgraded to HOLD before the
        # batch screener even evaluates the candidate).
        quant = signal_engine.run_quant_screening(
            df.copy(),
            fundamental_metrics,
            ticker,
            sector,
            syariah_only=syariah_filter,
            syariah_status=syariah_status,
            apply_fundamental_gate=False,
        )
        liquidity_status, average_traded_value = _liquidity_details(df)
        current_price = float(df["Close"].iloc[-1])

        raw_backtest = (
            backtest.run_backtest(
                df.copy(),
                fundamental_metrics,
                ticker,
                sector,
                max_holding_days=time_stop_days,
            )
            if run_backtest
            else None
        )
        backtest_status, backtest_summary, backtest_warnings = _normalize_backtest(raw_backtest)
        warnings = list(dict.fromkeys(
            [str(item) for item in loaded.get("warnings", [])]
            + [str(item) for item in quant.get("warnings", [])]
            + backtest_warnings
        ))
        warnings.append(
            "Bid-ask spread intraday tidak tersedia dari data OHLCV harian; "
            "execution quality memakai average traded value sebagai proxy."
        )

        rejection_reasons: list[str] = []
        data_quality = str(quant.get("data_quality", "error"))
        final_signal = str(quant.get("final_signal", "AVOID"))
        fundamental_status = str(quant.get("fundamental_status", "unavailable"))
        overlay = fundamental_service.evaluate_risk_overlay(
            fundamental_metrics,
            float(quant.get("fundamental_score", 0.0)),
            fundamental_status,
        )
        overlay_status = str(overlay["status"])
        fundamental_red_flags = [str(item) for item in overlay["red_flags"]]
        fundamental_warnings = [str(item) for item in overlay["warnings"]]
        warnings.extend(fundamental_warnings)
        risk_reward = float(quant.get("risk_reward", 0.0))
        regime = str(quant.get("regime", "sideways"))

        if data_quality != "valid":
            rejection_reasons.append(f"Kualitas data {data_quality}.")
        if liquidity_status == "low":
            rejection_reasons.append("Likuiditas di bawah batas minimum.")
        if liquidity_status == "unavailable":
            rejection_reasons.append("Data likuiditas tidak tersedia.")
        if overlay_status == "critical" and final_signal == "BUY":
            rejection_reasons.append(
                "Fundamental critical: " + " ".join(fundamental_red_flags)
            )
        if overlay_status == "unavailable":
            warnings.append(
                "Data fundamental tidak tersedia dari provider maupun Tesis. "
                "Confidence diturunkan, tetapi sinyal teknikal tetap digunakan."
            )
        if overlay_status == "caution":
            current_confidence = str(quant.get("confidence", "low"))
            quant["confidence"] = {
                "high": "medium",
                "medium": "low",
                "low": "low",
            }.get(current_confidence, "low")
        if final_signal in {"SELL", "AVOID"}:
            rejection_reasons.append(f"Sinyal kuantitatif {final_signal}.")
        if regime == "bearish_trend":
            rejection_reasons.append("Rezim pasar bearish_trend.")
        if final_signal == "BUY" and risk_reward < min_risk_reward:
            rejection_reasons.append(
                f"Risk-reward {risk_reward:.2f} di bawah minimum {min_risk_reward:.2f}."
            )

        rank_score, ranking_components = _rank_candidate(
            quant,
            liquidity_status,
            backtest_status,
            backtest_summary,
        )
        expected_profitability = float(backtest_summary["expectancy"])
        if backtest_status == "available":
            if expected_profitability <= 0:
                rejection_reasons.append("Expectancy backtest tidak positif.")
            if backtest_summary["profit_factor"] < 1.0:
                rejection_reasons.append("Profit factor backtest di bawah 1.0.")
        if final_signal == "BUY" and rank_score < MIN_RANK_SCORE:
            rejection_reasons.append(
                f"Candidate rank score {rank_score:.2f} di bawah batas {MIN_RANK_SCORE:.0f}."
            )

        entry_status, entry_reason, exit_plan = _entry_and_exit_plan(
            quant,
            current_price,
            time_stop_days,
        )
        entry_high = float((quant.get("entry_range") or {}).get("high", 0.0))
        if (
            final_signal == "BUY"
            and entry_status == "wait_for_pullback"
            and entry_high > 0
            and current_price > entry_high * 1.02
        ):
            rejection_reasons.append(
                "Harga lebih dari 2% di atas area entry wajar; risiko mengejar harga terlalu tinggi."
            )
        screening_status = "rejected" if rejection_reasons else (
            "passed" if final_signal == "BUY" else "warning"
        )

        import uuid
        result = {
            "candidate_id": str(uuid.uuid4()),
            "ticker": ticker,
            "as_of_date": str(quant.get("as_of_date")),
            "screening_status": screening_status,
            "rejection_reason": " | ".join(rejection_reasons) or None,
            "data_quality": data_quality,
            "adjusted_price_status": loaded.get("adjusted_price_status", "unknown"),
            "liquidity_status": liquidity_status,
            "average_traded_value": round(average_traded_value, 2),
            "regime": regime,
            "quant_signal": final_signal,
            "quant_signal_type": quant.get("quant_signal_type", "neutral"),
            "confidence": quant.get("confidence", "low"),
            "score": float(quant.get("score", 0.0)),
            "risk_reward": risk_reward,
            "current_price": current_price,
            "entry_range": quant.get("entry_range", {"low": 0.0, "high": 0.0}),
            "target_profit_1": float(quant.get("target_profit_1", 0.0)),
            "target_profit_2": float(quant.get("target_profit_2", 0.0)),
            "stop_loss": float(quant.get("stop_loss", 0.0)),
            "atr_trailing_stop": float(quant.get("atr_trailing_stop", 0.0)),
            "fundamental_score": float(quant.get("fundamental_score", 0.0)),
            "fundamental_status": overlay_status,
            "fundamental_source": loaded.get("fundamental_source", "unavailable"),
            "fundamental_as_of": loaded.get("fundamental_as_of"),
            "fundamental_freshness": loaded.get("fundamental_freshness", "unavailable"),
            "fundamental_warnings": list(dict.fromkeys(fundamental_warnings)),
            "fundamental_red_flags": list(dict.fromkeys(fundamental_red_flags)),
            "backtest_status": backtest_status,
            "backtest_summary": backtest_summary,
            "expected_profitability_score": round(expected_profitability, 2),
            "candidate_rank_score": rank_score,
            "ranking_components": ranking_components,
            "rank": 0,
            "entry_status": entry_status,
            "entry_reason": entry_reason,
            "exit_plan": exit_plan,
            "ai_review_status": "skipped",
            "ai_final_signal": None,
            "ai_confidence": None,
            "ai_reason": None,
            "ai_risk_note": None,
            "ai_entry_comment": None,
            "ai_exit_comment": None,
            "news_search_status": "skipped",
            "news_catalyst_summary": "",
            "news_risk_summary": "",
            "news_source_quality": "none",
            "news_sources": [],
            "catalyst_flags": [],
            "risk_flags": [],
            "ai_final_signal_with_news": None,
            "ai_news_review_reason": "",
            "news_review_warnings": [],
            "warnings": warnings,
            "cache_status": "miss",
        }
        screening_cache.set(cache_key, result)
        return result
    except Exception as exc:
        result = _failed_result(ticker, f"Gagal memproses ticker: {exc}")
        screening_cache.set(cache_key, result)
        return result


def _apply_ai_review(
    candidates: list[dict[str, Any]],
    ai_reviewer: AiReviewer | None,
    max_candidates_for_ai: int,
) -> int:
    eligible = [
        candidate
        for candidate in candidates
        if candidate["screening_status"] == "passed"
        and candidate["quant_signal"] == "BUY"
    ][:max_candidates_for_ai]
    if not eligible or ai_reviewer is None:
        return 0

    try:
        reviews = ai_reviewer(copy.deepcopy(eligible))
        review_map = {
            str(review.get("ticker", "")).upper(): review
            for review in reviews
            if isinstance(review, dict)
        }
        reviewed_count = 0
        for candidate in eligible:
            review = review_map.get(candidate["ticker"].upper())
            if review is None:
                candidate["ai_review_status"] = "unavailable"
                continue

            requested_signal = str(review.get("ai_final_signal", "HOLD")).upper()
            if requested_signal not in {"BUY", "HOLD", "SELL", "AVOID"}:
                requested_signal = "HOLD"
            candidate["ai_review_status"] = "used"
            candidate["ai_final_signal"] = requested_signal
            candidate["ai_confidence"] = str(review.get("ai_confidence", "low"))
            candidate["ai_reason"] = str(review.get("ai_reason", ""))
            candidate["ai_risk_note"] = str(review.get("ai_risk_note", ""))
            candidate["ai_entry_comment"] = str(review.get("ai_entry_comment", ""))
            candidate["ai_exit_comment"] = str(review.get("ai_exit_comment", ""))
            reviewed_count += 1

            if requested_signal != "BUY":
                candidate["screening_status"] = "warning"
                candidate["warnings"].append(
                    f"AI reviewer menurunkan BUY menjadi {requested_signal}; keputusan lokal tidak dinaikkan."
                )
        return reviewed_count
    except Exception as exc:
        for candidate in eligible:
            candidate["ai_review_status"] = "unavailable"
            candidate["warnings"].append(f"AI review gagal; hasil lokal tetap digunakan: {exc}")
        return 0


def screen_batch(
    tickers: Any,
    loader: Loader,
    *,
    top_n: int = 5,
    syariah_filter: bool = False,
    use_ai_review: bool = False,
    run_backtest: bool = True,
    min_risk_reward: float = DEFAULT_MIN_RISK_REWARD,
    max_candidates_for_ai: int = 10,
    time_stop_days: int = DEFAULT_TIME_STOP_DAYS,
    ai_reviewer: AiReviewer | None = None,
    use_news_search: bool = False,
    max_news_candidates: int = 5,
    news_days_back: int = 30,
    force_news_refresh: bool = False,
    deepseek_api_keys: list[str] | None = None,
) -> dict[str, Any]:
    parsed_tickers = parse_tickers(tickers)
    top_n = max(1, min(int(top_n), 50))
    max_candidates_for_ai = max(1, min(int(max_candidates_for_ai), 25))
    time_stop_days = max(5, min(int(time_stop_days), 120))

    def process(ticker: str) -> dict[str, Any]:
        return screen_ticker(
            ticker,
            loader,
            syariah_filter=syariah_filter,
            run_backtest=run_backtest,
            min_risk_reward=float(min_risk_reward),
            time_stop_days=time_stop_days,
        )

    with ThreadPoolExecutor(max_workers=min(3, max(1, len(parsed_tickers)))) as executor:
        results = list(executor.map(process, parsed_tickers))

    rankable = [
        result
        for result in results
        if result["screening_status"] != "rejected"
    ]
    rankable.sort(key=lambda item: item["candidate_rank_score"], reverse=True)
    for index, candidate in enumerate(rankable, start=1):
        candidate["rank"] = index

    top_candidates = rankable[:top_n]
    ai_reviewed = (
        _apply_ai_review(top_candidates, ai_reviewer, max_candidates_for_ai)
        if use_ai_review
        else 0
    )

    # News & Catalyst Review Layer
    if use_news_search and deepseek_api_keys:
        try:
            import news_catalyst_service
            import deepseek_catalyst_reviewer
            
            # Select eligible candidates for news search (BUY/WATCH, not rejected)
            news_eligible = [
                cand for cand in top_candidates
                if cand["quant_signal"] in ("BUY", "WATCH") and cand["screening_status"] != "rejected"
            ][:max_news_candidates]
            
            for candidate in news_eligible:
                ticker = candidate["ticker"]
                company_name = candidate.get("name")
                
                # Fetch news catalyst source pack
                res = news_catalyst_service.get_news_catalyst_source_pack(
                    ticker=ticker,
                    company_name=company_name,
                    days_back=news_days_back,
                    force_refresh=force_news_refresh
                )
                
                source_pack = res.get("source_pack", {})
                catalyst_analysis = res.get("catalyst_analysis", {})
                
                # Run DeepSeek risk reviewer
                review_data = deepseek_catalyst_reviewer.review_candidate_with_news(
                    candidate=candidate,
                    source_pack=source_pack,
                    catalyst_analysis=catalyst_analysis,
                    api_keys=deepseek_api_keys
                )
                
                # Enrich candidate dict
                candidate["news_search_status"] = source_pack.get("search_status", "disabled")
                candidate["news_catalyst_summary"] = review_data.get("news_catalyst_summary", "")
                candidate["news_risk_summary"] = review_data.get("risk_summary", "")
                candidate["news_source_quality"] = review_data.get("source_quality", "none")
                candidate["news_sources"] = review_data.get("supporting_sources", [])
                candidate["catalyst_flags"] = review_data.get("catalyst_flags", [])
                candidate["risk_flags"] = review_data.get("risk_flags", [])
                candidate["ai_final_signal_with_news"] = review_data.get("ai_final_signal", candidate["quant_signal"])
                candidate["ai_news_review_reason"] = review_data.get("decision_reason", "")
                candidate["news_review_warnings"] = catalyst_analysis.get("warnings", [])
                
                # Apply downgrade logic
                ai_sig = review_data.get("ai_final_signal", candidate["quant_signal"])
                if ai_sig != candidate["quant_signal"]:
                    candidate["screening_status"] = "warning"
                    candidate["warnings"].append(
                        f"AI News reviewer men-downgrade signal {candidate['quant_signal']} menjadi {ai_sig}: {review_data.get('downgrade_reason')}"
                    )
        except Exception as e:
            print(f"Error executing news search review for batch: {e}")
    rejected = [result for result in results if result["screening_status"] == "rejected"]

    signal_counts = {
        signal: sum(1 for result in results if result["quant_signal"] == signal)
        for signal in ("BUY", "HOLD", "SELL", "AVOID")
    }
    return {
        "as_of_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "total_input_tickers": len(parsed_tickers),
        "total_valid_tickers": sum(
            1 for result in results if result["data_quality"] == "valid"
        ),
        "total_rejected_tickers": len(rejected),
        "top_n": top_n,
        "use_ai_review": bool(use_ai_review),
        "summary": {
            "buy_candidates": signal_counts["BUY"],
            "hold_candidates": signal_counts["HOLD"],
            "sell_candidates": signal_counts["SELL"],
            "avoid_candidates": signal_counts["AVOID"],
            "ai_reviewed_candidates": ai_reviewed,
        },
        "top_candidates": top_candidates,
        "rejected_candidates": rejected,
        "all_results": results,
    }


def find_candidate_by_id(candidate_id: str) -> dict[str, Any] | None:
    """
    Searches the screening_cache memory to find the candidate with matching candidate_id.
    """
    if not candidate_id:
        return None
    with screening_cache._lock:
        for stored_at, value in list(screening_cache._items.values()):
            if isinstance(value, dict) and value.get("candidate_id") == candidate_id:
                # Check expiration
                if time.time() - stored_at <= screening_cache.ttl_seconds:
                    return copy.deepcopy(value)
    return None
