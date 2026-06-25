from __future__ import annotations

import json
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from numbers import Real
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf


TWELVE_DATA_BASE_URL = "https://api.twelvedata.com"
MARKET_TTL = timedelta(hours=24)
STATEMENT_TTL = timedelta(days=30)


def init_fundamental_cache(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS fundamental_snapshots (
            ticker TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            as_of TEXT,
            fetched_at TEXT NOT NULL,
            market_expires_at TEXT NOT NULL,
            statement_expires_at TEXT NOT NULL,
            metrics_json TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            warnings_json TEXT NOT NULL
        )
        """
    )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, Real):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("%", "").strip()
        if not cleaned or cleaned.lower() in {"none", "null", "n/a", "nan", "-"}:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _find_value(payload: Any, aliases: set[str]) -> Any:
    normalized = {alias.lower().replace("_", "").replace("-", "") for alias in aliases}
    if isinstance(payload, dict):
        for key, value in payload.items():
            candidate = str(key).lower().replace("_", "").replace("-", "")
            if candidate in normalized and value not in (None, ""):
                return value
        for value in payload.values():
            found = _find_value(value, aliases)
            if found not in (None, ""):
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = _find_value(value, aliases)
            if found not in (None, ""):
                return found
    return None


def _statement_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("income_statement", "balance_sheet", "cash_flow", "statements", "data"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _row_period(row: dict[str, Any]) -> str:
    raw = (
        row.get("fiscal_date")
        or row.get("fiscalDate")
        or row.get("date")
        or row.get("year")
        or row.get("fiscal_year")
        or ""
    )
    return str(raw)[:10]


def _request_json(endpoint: str, symbol: str, api_key: str) -> dict[str, Any]:
    params = urllib.parse.urlencode({"symbol": symbol, "apikey": api_key})
    request = urllib.request.Request(
        f"{TWELVE_DATA_BASE_URL}/{endpoint}?{params}",
        headers={"User-Agent": "MonthlyCashflowTracker/1.0"},
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Respons {endpoint} tidak valid.")
    if payload.get("status") == "error" or payload.get("code"):
        raise RuntimeError(str(payload.get("message") or f"Provider menolak {endpoint}."))
    return payload


def _fetch_provider_payload(ticker: str, api_key: str) -> tuple[dict[str, Any], list[str]]:
    base = ticker.upper().replace(".JK", "")
    symbol_candidates = (f"{base}:IDX", base, f"{base}.JK")
    last_error = "Ticker tidak didukung provider."
    for symbol in symbol_candidates:
        raw: dict[str, Any] = {}
        warnings: list[str] = []
        successful = 0
        for endpoint in ("income_statement", "balance_sheet", "cash_flow", "statistics"):
            try:
                raw[endpoint] = _request_json(endpoint, symbol, api_key)
                successful += 1
            except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
                last_error = str(exc)
                warnings.append(f"{endpoint}: {exc}")
        if successful and any(_statement_rows(raw.get(key, {})) for key in raw if key != "statistics"):
            raw["resolved_symbol"] = symbol
            return raw, warnings
    raise RuntimeError(last_error)


def _normalize_payload(raw: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None, list[str]]:
    income_rows = _statement_rows(raw.get("income_statement", {}))
    balance_rows = _statement_rows(raw.get("balance_sheet", {}))
    cash_rows = _statement_rows(raw.get("cash_flow", {}))
    statistics = raw.get("statistics", {})
    periods = sorted({_row_period(row) for row in income_rows if _row_period(row)}, reverse=True)
    metrics: list[dict[str, Any]] = []
    warnings: list[str] = []

    for period in periods[:4]:
        income = next((row for row in income_rows if _row_period(row) == period), {})
        balance = next((row for row in balance_rows if _row_period(row) == period), {})
        cash = next((row for row in cash_rows if _row_period(row) == period), {})
        revenue = _number(_find_value(income, {"total_revenue", "revenue", "sales"}))
        net_profit = _number(_find_value(income, {"net_income", "net_profit", "net_income_common_stockholders"}))
        equity = _number(_find_value(balance, {"total_shareholders_equity", "total_equity", "stockholders_equity"}))
        debt = _number(_find_value(balance, {"total_debt", "short_long_term_debt_total"}))
        operating_cash_flow = _number(_find_value(cash, {"operating_cash_flow", "cash_flow_from_operating_activities"}))
        free_cash_flow = _number(_find_value(cash, {"free_cash_flow"}))
        roe = (net_profit / equity * 100.0) if net_profit is not None and equity not in (None, 0) else None
        der = (debt / equity) if debt is not None and equity not in (None, 0) else None
        metrics.append(
            {
                "year": period[:4],
                "period": period,
                "revenue": revenue,
                "netProfit": net_profit,
                "eps": _number(_find_value(income, {"diluted_eps", "basic_eps", "eps"})),
                "roe": roe,
                "der": der,
                "pe": _number(_find_value(statistics, {"pe_ratio", "price_earnings_ratio", "trailing_pe"})),
                "pbv": _number(_find_value(statistics, {"price_to_book", "price_book_ratio", "pb_ratio"})),
                "equity": equity,
                "totalDebt": debt,
                "operatingCashFlow": operating_cash_flow,
                "freeCashFlow": free_cash_flow,
            }
        )

    if not metrics:
        warnings.append("Provider merespons, tetapi laporan tahunan tidak dapat dinormalisasi.")
    as_of = metrics[0].get("period") if metrics else None
    return metrics, as_of, warnings


def _frame_value(frame: pd.DataFrame, aliases: tuple[str, ...], column: Any) -> float | None:
    if frame.empty:
        return None
    normalized = {
        str(index).lower().replace(" ", "").replace("_", "").replace("-", ""): index
        for index in frame.index
    }
    for alias in aliases:
        key = alias.lower().replace(" ", "").replace("_", "").replace("-", "")
        index = normalized.get(key)
        if index is not None:
            return _number(frame.at[index, column])
    return None


def _safe_yfinance_info(ticker: Any) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    try:
        info = ticker.get_info()
        return info if isinstance(info, dict) else {}, warnings
    except Exception as exc:
        warnings.append(f"Yahoo statistics: {exc}")
        return {}, warnings


def fetch_yfinance_payload(ticker: str) -> tuple[list[dict[str, Any]], str | None, list[str]]:
    symbol = ticker.upper()
    if not symbol.endswith(".JK"):
        symbol = f"{symbol}.JK"
    yahoo = yf.Ticker(symbol)
    warnings: list[str] = []
    try:
        income = yahoo.income_stmt
    except Exception as exc:
        income = pd.DataFrame()
        warnings.append(f"Yahoo income statement: {exc}")
    try:
        balance = yahoo.balance_sheet
    except Exception as exc:
        balance = pd.DataFrame()
        warnings.append(f"Yahoo balance sheet: {exc}")
    try:
        cashflow = yahoo.cashflow
    except Exception as exc:
        cashflow = pd.DataFrame()
        warnings.append(f"Yahoo cash flow: {exc}")
    info, info_warnings = _safe_yfinance_info(yahoo)
    warnings.extend(info_warnings)

    columns = sorted(
        set(income.columns).union(balance.columns).union(cashflow.columns),
        reverse=True,
    )
    metrics: list[dict[str, Any]] = []
    for column in columns[:4]:
        timestamp = pd.Timestamp(column)
        revenue = _frame_value(income, ("Total Revenue", "Operating Revenue"), column)
        net_profit = _frame_value(
            income,
            ("Net Income", "Net Income Common Stockholders", "Net Income Including Noncontrolling Interests"),
            column,
        )
        equity = _frame_value(
            balance,
            ("Stockholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"),
            column,
        )
        debt = _frame_value(balance, ("Total Debt",), column)
        operating_cash_flow = _frame_value(
            cashflow,
            ("Operating Cash Flow", "Total Cash From Operating Activities"),
            column,
        )
        free_cash_flow = _frame_value(cashflow, ("Free Cash Flow",), column)
        roe = (net_profit / equity * 100.0) if net_profit is not None and equity not in (None, 0) else None
        der = (debt / equity) if debt is not None and equity not in (None, 0) else None
        metrics.append(
            {
                "year": str(timestamp.year),
                "period": timestamp.date().isoformat(),
                "revenue": revenue,
                "netProfit": net_profit,
                "eps": _frame_value(income, ("Diluted EPS", "Basic EPS"), column),
                "roe": roe,
                "der": der,
                "pe": _number(info.get("trailingPE") or info.get("forwardPE")),
                "pbv": _number(info.get("priceToBook")),
                "equity": equity,
                "totalDebt": debt,
                "operatingCashFlow": operating_cash_flow,
                "freeCashFlow": free_cash_flow,
            }
        )

    usable = [
        metric for metric in metrics
        if any(metric.get(key) is not None for key in ("revenue", "netProfit", "equity", "operatingCashFlow"))
    ]
    if not usable:
        raise RuntimeError("Yahoo Finance tidak mengembalikan laporan fundamental yang dapat dipakai.")
    completeness = sum(
        value is not None
        for value in usable[0].values()
        if value not in (usable[0].get("year"), usable[0].get("period"))
    )
    if completeness < 5:
        warnings.append("Laporan Yahoo parsial; overlay tidak boleh membuat hard block.")
    return usable, usable[0]["period"], warnings


def read_cached_snapshot(db_path: Path, ticker: str) -> dict[str, Any] | None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    init_fundamental_cache(conn)
    row = conn.execute(
        "SELECT * FROM fundamental_snapshots WHERE ticker = ?",
        (ticker.upper(),),
    ).fetchone()
    conn.close()
    if not row:
        return None
    now = _utcnow()
    market_expiry = _parse_iso(row["market_expires_at"])
    statement_expiry = _parse_iso(row["statement_expires_at"])
    freshness = "fresh" if market_expiry and market_expiry > now else (
        "statement_fresh" if statement_expiry and statement_expiry > now else "stale"
    )
    return {
        "metrics": json.loads(row["metrics_json"]),
        "source": row["source"],
        "as_of": row["as_of"],
        "fetched_at": row["fetched_at"],
        "freshness": freshness,
        "warnings": json.loads(row["warnings_json"]),
    }


def fetch_fundamental_snapshot(db_path: Path, ticker: str, api_key: str) -> dict[str, Any]:
    cached = read_cached_snapshot(db_path, ticker)
    if cached and cached["freshness"] == "fresh":
        return cached

    raw, provider_warnings = _fetch_provider_payload(ticker, api_key)
    metrics, as_of, normalize_warnings = _normalize_payload(raw)
    if not metrics:
        raise RuntimeError("Laporan fundamental provider tidak cukup untuk dihitung.")

    now = _utcnow()
    snapshot = {
        "metrics": metrics,
        "source": "twelve_data",
        "as_of": as_of,
        "fetched_at": now.isoformat(),
        "freshness": "fresh",
        "warnings": provider_warnings + normalize_warnings,
    }
    conn = sqlite3.connect(db_path)
    init_fundamental_cache(conn)
    conn.execute(
        """
        INSERT INTO fundamental_snapshots (
            ticker, source, as_of, fetched_at, market_expires_at,
            statement_expires_at, metrics_json, raw_json, warnings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
            source = excluded.source,
            as_of = excluded.as_of,
            fetched_at = excluded.fetched_at,
            market_expires_at = excluded.market_expires_at,
            statement_expires_at = excluded.statement_expires_at,
            metrics_json = excluded.metrics_json,
            raw_json = excluded.raw_json,
            warnings_json = excluded.warnings_json
        """,
        (
            ticker.upper(),
            snapshot["source"],
            as_of,
            snapshot["fetched_at"],
            (now + MARKET_TTL).isoformat(),
            (now + STATEMENT_TTL).isoformat(),
            json.dumps(metrics, ensure_ascii=False),
            json.dumps(raw, ensure_ascii=False),
            json.dumps(snapshot["warnings"], ensure_ascii=False),
        ),
    )
    conn.commit()
    conn.close()
    return snapshot


def fetch_yfinance_snapshot(db_path: Path, ticker: str) -> dict[str, Any]:
    cached = read_cached_snapshot(db_path, ticker)
    if cached and cached["freshness"] == "fresh" and cached["source"] == "yfinance":
        return cached

    metrics, as_of, warnings = fetch_yfinance_payload(ticker)
    now = _utcnow()
    snapshot = {
        "metrics": metrics,
        "source": "yfinance",
        "as_of": as_of,
        "fetched_at": now.isoformat(),
        "freshness": "fresh",
        "warnings": warnings,
    }
    conn = sqlite3.connect(db_path)
    init_fundamental_cache(conn)
    conn.execute(
        """
        INSERT INTO fundamental_snapshots (
            ticker, source, as_of, fetched_at, market_expires_at,
            statement_expires_at, metrics_json, raw_json, warnings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
            source = excluded.source,
            as_of = excluded.as_of,
            fetched_at = excluded.fetched_at,
            market_expires_at = excluded.market_expires_at,
            statement_expires_at = excluded.statement_expires_at,
            metrics_json = excluded.metrics_json,
            raw_json = excluded.raw_json,
            warnings_json = excluded.warnings_json
        """,
        (
            ticker.upper(),
            "yfinance",
            as_of,
            snapshot["fetched_at"],
            (now + MARKET_TTL).isoformat(),
            (now + STATEMENT_TTL).isoformat(),
            json.dumps(metrics, ensure_ascii=False),
            "{}",
            json.dumps(warnings, ensure_ascii=False),
        ),
    )
    conn.commit()
    conn.close()
    return snapshot


def evaluate_risk_overlay(
    metrics: list[dict[str, Any]],
    base_score: float,
    base_status: str,
) -> dict[str, Any]:
    if not metrics:
        return {"status": "unavailable", "red_flags": [], "warnings": []}
    latest = sorted(metrics, key=lambda item: str(item.get("period") or item.get("year") or ""), reverse=True)[0]
    critical_fields = (latest.get("equity"), latest.get("netProfit"), latest.get("der"))
    allow_critical = sum(value is not None for value in critical_fields) >= 2
    red_flags: list[str] = []
    warnings: list[str] = []
    equity = _number(latest.get("equity"))
    net_profit = _number(latest.get("netProfit"))
    der = _number(latest.get("der"))
    operating_cash_flow = _number(latest.get("operatingCashFlow"))
    free_cash_flow = _number(latest.get("freeCashFlow"))

    if equity is not None and equity <= 0:
        red_flags.append("Ekuitas periode terbaru negatif atau nol.")
    if net_profit is not None and net_profit < 0:
        negative_periods = sum(1 for item in metrics[:3] if (_number(item.get("netProfit")) or 0) < 0)
        if negative_periods >= 2:
            red_flags.append("Rugi bersih terjadi pada sedikitnya dua periode terbaru.")
        else:
            warnings.append("Emiten membukukan rugi bersih pada periode terbaru.")
    if der is not None and der >= 4:
        red_flags.append(f"Leverage kritis dengan DER {der:.2f}.")
    elif der is not None and der >= 2:
        warnings.append(f"Leverage tinggi dengan DER {der:.2f}.")
    if operating_cash_flow is not None and operating_cash_flow < 0:
        warnings.append("Arus kas operasi periode terbaru negatif.")
    if free_cash_flow is not None and free_cash_flow < 0:
        warnings.append("Free cash flow periode terbaru negatif.")

    if red_flags and not allow_critical:
        warnings.extend(f"Data parsial, red flag belum dikonfirmasi: {flag}" for flag in red_flags)
        red_flags = []
    status = "critical" if red_flags else (
        "caution" if warnings or base_status in {"weak", "fail"} or base_score < 12 else "healthy"
    )
    return {"status": status, "red_flags": red_flags, "warnings": warnings}
