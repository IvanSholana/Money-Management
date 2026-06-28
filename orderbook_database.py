import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from orderbook_schema import OrderBookSnapshot, ExecutionCheckResult

def init_orderbook_db(conn: sqlite3.Connection) -> None:
    """Initializes SQLite tables for storing orderbook snapshots and reviews."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS orderbook_snapshots (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            page_url TEXT,
            snapshot_json TEXT NOT NULL,
            execution_result_json TEXT NOT NULL,
            read_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orderbook_execution_reviews (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            quant_candidate_json TEXT,
            orderbook_snapshot_json TEXT NOT NULL,
            execution_result_json TEXT NOT NULL,
            deepseek_review_json TEXT,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()

def save_orderbook_snapshot(conn: sqlite3.Connection, snapshot: OrderBookSnapshot, result: ExecutionCheckResult) -> str:
    """Saves an orderbook snapshot and its execution check result to the database."""
    snapshot_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    conn.execute(
        """
        INSERT INTO orderbook_snapshots (id, ticker, page_url, snapshot_json, execution_result_json, read_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            snapshot_id,
            snapshot.ticker,
            snapshot.page_url,
            json.dumps(snapshot.to_dict()),
            json.dumps(result.to_dict()),
            snapshot.timestamp_read,
            now
        )
    )
    conn.commit()
    return snapshot_id

def get_latest_orderbook_snapshot(conn: sqlite3.Connection, ticker: str) -> Optional[Tuple[OrderBookSnapshot, ExecutionCheckResult]]:
    """Retrieves the latest saved orderbook snapshot and its result for a symbol."""
    row = conn.execute(
        """
        SELECT snapshot_json, execution_result_json FROM orderbook_snapshots
        WHERE ticker = ?
        ORDER BY read_at DESC LIMIT 1
        """,
        (ticker,)
    ).fetchone()
    
    if not row:
        return None
        
    try:
        snap_dict = json.loads(row["snapshot_json"])
        res_dict = json.loads(row["execution_result_json"])
        
        snapshot = OrderBookSnapshot.from_dict(snap_dict)
        # Parse result
        result = ExecutionCheckResult(
            ticker=res_dict["ticker"],
            execution_status=res_dict["execution_status"],
            execution_score=res_dict["execution_score"],
            orderbook_metrics=res_dict["orderbook_metrics"],
            execution_reasons=res_dict.get("execution_reasons", []),
            execution_warnings=res_dict.get("execution_warnings", []),
            suggested_action=res_dict.get("suggested_action", ""),
            manual_only=res_dict.get("manual_only", True),
            stale_snapshot=res_dict.get("stale_snapshot", False)
        )
        return snapshot, result
    except Exception as e:
        print(f"Error loading snapshot from database: {e}")
        return None

def save_execution_review(
    conn: sqlite3.Connection,
    ticker: str,
    candidate: Optional[dict],
    snapshot: OrderBookSnapshot,
    result: ExecutionCheckResult,
    deepseek_review: Optional[dict] = None
) -> str:
    """Saves an execution check review with optional DeepSeek AI analysis to the database."""
    review_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    conn.execute(
        """
        INSERT INTO orderbook_execution_reviews (
            id, ticker, quant_candidate_json, orderbook_snapshot_json, execution_result_json, deepseek_review_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            review_id,
            ticker,
            json.dumps(candidate) if candidate else None,
            json.dumps(snapshot.to_dict()),
            json.dumps(result.to_dict()),
            json.dumps(deepseek_review) if deepseek_review else None,
            now
        )
    )
    conn.commit()
    return review_id

