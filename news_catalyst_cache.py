import json
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
import dividend_database

CACHE_DURATION_HOURS = 6

def get_cached_news_catalyst(conn: sqlite3.Connection, ticker: str) -> Optional[Dict[str, Any]]:
    """
    Checks if a fresh cache entry exists for the ticker.
    Returns: Dict containing source_pack and catalyst_analysis if fresh, else None.
    """
    try:
        row = conn.execute(
            "SELECT source_pack_json, catalyst_analysis_json, expires_at FROM news_catalyst_cache WHERE ticker = ?",
            (ticker.strip().upper(),)
        ).fetchone()
        
        if row:
            expires_at_str = row["expires_at"]
            expires_dt = datetime.fromisoformat(expires_at_str)
            
            # Check if cache is still active (not expired)
            if datetime.now(timezone.utc) < expires_dt:
                source_pack = json.loads(row["source_pack_json"])
                catalyst_analysis = json.loads(row["catalyst_analysis_json"])
                return {
                    "source_pack": source_pack,
                    "catalyst_analysis": catalyst_analysis,
                    "cached_at": expires_dt - timedelta(hours=CACHE_DURATION_HOURS)
                }
    except Exception as e:
        print(f"Error reading news cache for {ticker}: {e}")
        
    return None

def get_stale_news_catalyst(conn: sqlite3.Connection, ticker: str) -> Optional[Dict[str, Any]]:
    """Retrieves cache entry even if expired (used as fallback when provider fails)."""
    try:
        row = conn.execute(
            "SELECT source_pack_json, catalyst_analysis_json, fetched_at FROM news_catalyst_cache WHERE ticker = ?",
            (ticker.strip().upper(),)
        ).fetchone()
        
        if row:
            source_pack = json.loads(row["source_pack_json"])
            catalyst_analysis = json.loads(row["catalyst_analysis_json"])
            return {
                "source_pack": source_pack,
                "catalyst_analysis": catalyst_analysis,
                "cached_at": row["fetched_at"],
                "is_stale": True
            }
    except Exception as e:
        print(f"Error reading stale news cache for {ticker}: {e}")
        
    return None

def save_news_catalyst_cache(
    conn: sqlite3.Connection,
    ticker: str,
    company_name: Optional[str],
    query_list: list,
    source_pack: dict,
    catalyst_analysis: dict
) -> None:
    """Saves search results and analysis to SQLite cache."""
    now = datetime.now(timezone.utc)
    fetched_at = now.isoformat()
    expires_at = (now + timedelta(hours=CACHE_DURATION_HOURS)).isoformat()
    
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO news_catalyst_cache (
                id, ticker, company_name, query_json, source_pack_json, catalyst_analysis_json, fetched_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticker.strip().upper(),
                ticker.strip().upper(),
                company_name,
                json.dumps(query_list),
                json.dumps(source_pack),
                json.dumps(catalyst_analysis),
                fetched_at,
                expires_at
            )
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving news cache for {ticker}: {e}")
