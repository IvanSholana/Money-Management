import sqlite3
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Dict
from dividend_schema import DividendEvent

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "money_management.db"

def get_connection(db_path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def init_dividend_db(conn: sqlite3.Connection) -> None:
    """Creates the tables and indexes if they do not exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS dividend_events (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            ticker_yahoo TEXT,
            company_name TEXT,
            action_type TEXT,
            dividend_per_share REAL,
            announcement_date TEXT,
            cum_date_regular TEXT,
            ex_date_regular TEXT,
            cum_date_cash TEXT,
            ex_date_cash TEXT,
            recording_date TEXT,
            payment_date TEXT,
            source_name TEXT,
            source_url TEXT,
            raw_text TEXT,
            raw_html TEXT,
            confidence_score REAL,
            verification_status TEXT,
            parser_warnings TEXT,
            validation_errors TEXT,
            created_at TEXT,
            updated_at TEXT,
            last_collected_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_div_events_ticker ON dividend_events(ticker);
        CREATE INDEX IF NOT EXISTS idx_div_events_ticker_yahoo ON dividend_events(ticker_yahoo);
        CREATE INDEX IF NOT EXISTS idx_div_events_action_type ON dividend_events(action_type);
        CREATE INDEX IF NOT EXISTS idx_div_events_cum_date_reg ON dividend_events(cum_date_regular);
        CREATE INDEX IF NOT EXISTS idx_div_events_ex_date_reg ON dividend_events(ex_date_regular);
        CREATE INDEX IF NOT EXISTS idx_div_events_payment_date ON dividend_events(payment_date);
        CREATE INDEX IF NOT EXISTS idx_div_events_verif_status ON dividend_events(verification_status);
        CREATE INDEX IF NOT EXISTS idx_div_events_source_name ON dividend_events(source_name);

        CREATE TABLE IF NOT EXISTS dividend_collection_runs (
            id TEXT PRIMARY KEY,
            started_at TEXT,
            finished_at TEXT,
            source TEXT,
            status TEXT,
            collected_count INTEGER,
            inserted_count INTEGER,
            updated_count INTEGER,
            duplicate_count INTEGER,
            rejected_count INTEGER,
            needs_review_count INTEGER,
            warnings_json TEXT,
            errors_json TEXT
        );

        CREATE TABLE IF NOT EXISTS dividend_event_audit_log (
            id TEXT PRIMARY KEY,
            event_id TEXT,
            action TEXT,
            old_value_json TEXT,
            new_value_json TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS dividend_scan_cache (
            id TEXT PRIMARY KEY,
            scan_time TEXT,
            request_json TEXT,
            result_json TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS news_catalyst_cache (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            company_name TEXT,
            query_json TEXT,
            source_pack_json TEXT,
            catalyst_analysis_json TEXT,
            fetched_at TEXT,
            expires_at TEXT
        );
        """
    )
    conn.commit()
    seed_initial_dividends(conn)

def seed_initial_dividends(conn: sqlite3.Connection) -> None:
    """Seeds initial upcoming dividend events if table is empty."""
    # Always correct old incorrect seed data if it exists in the database
    try:
        conn.execute(
            """
            UPDATE dividend_events 
            SET cum_date_regular = '2026-06-17', ex_date_regular = '2026-06-18', 
                recording_date = '2026-06-19', payment_date = '2026-07-10', 
                dividend_per_share = 221.0, verification_status = 'rejected'
            WHERE ticker = 'TLKM' AND cum_date_regular = '2026-07-10'
            """
        )
        conn.commit()
    except Exception as e:
        print(f"Error migrating seed data: {e}")

    row = conn.execute("SELECT count(*) as count FROM dividend_events").fetchone()
    if row and row["count"] > 0:
        return

    # Seed data: assume current date is June 27, 2026. Seed dividends for July 2026.
    seed_events = [
        {
            "id": str(uuid.uuid4()),
            "ticker": "TLKM",
            "ticker_yahoo": "TLKM.JK",
            "company_name": "Telkom Indonesia (Persero) Tbk",
            "action_type": "CASH_DIVIDEND",
            "dividend_per_share": 221.0,
            "announcement_date": "2026-06-01",
            "cum_date_regular": "2026-06-17",
            "ex_date_regular": "2026-06-18",
            "recording_date": "2026-06-19",
            "payment_date": "2026-07-10",
            "source_name": "KSEI (Seeded)",
            "source_url": "https://www.ksei.co.id",
            "raw_text": "Seeded TLKM dividend information.",
            "confidence_score": 95.0,
            "verification_status": "rejected"
        },
        {
            "id": str(uuid.uuid4()),
            "ticker": "BBCA",
            "ticker_yahoo": "BBCA.JK",
            "company_name": "Bank Central Asia Tbk",
            "action_type": "CASH_DIVIDEND",
            "dividend_per_share": 220.0,
            "announcement_date": "2026-06-20",
            "cum_date_regular": "2026-07-15",
            "ex_date_regular": "2026-07-16",
            "recording_date": "2026-07-17",
            "payment_date": "2026-08-05",
            "source_name": "KSEI (Seeded)",
            "source_url": "https://www.ksei.co.id",
            "raw_text": "Seeded BBCA dividend information.",
            "confidence_score": 95.0,
            "verification_status": "auto_verified"
        },
        {
            "id": str(uuid.uuid4()),
            "ticker": "ASII",
            "ticker_yahoo": "ASII.JK",
            "company_name": "Astra International Tbk",
            "action_type": "CASH_DIVIDEND",
            "dividend_per_share": 350.0,
            "announcement_date": "2026-06-10",
            "cum_date_regular": "2026-07-08",
            "ex_date_regular": "2026-07-09",
            "recording_date": "2026-07-10",
            "payment_date": "2026-07-30",
            "source_name": "KSEI (Seeded)",
            "source_url": "https://www.ksei.co.id",
            "raw_text": "Seeded ASII dividend information.",
            "confidence_score": 95.0,
            "verification_status": "auto_verified"
        },
        {
            "id": str(uuid.uuid4()),
            "ticker": "UNVR",
            "ticker_yahoo": "UNVR.JK",
            "company_name": "Unilever Indonesia Tbk",
            "action_type": "CASH_DIVIDEND",
            "dividend_per_share": 80.0,
            "announcement_date": "2026-06-22",
            "cum_date_regular": "2026-07-20",
            "ex_date_regular": "2026-07-21",
            "recording_date": "2026-07-22",
            "payment_date": "2026-08-12",
            "source_name": "KSEI (Seeded)",
            "source_url": "https://www.ksei.co.id",
            "raw_text": "Seeded UNVR dividend information.",
            "confidence_score": 95.0,
            "verification_status": "auto_verified"
        },
        {
            "id": str(uuid.uuid4()),
            "ticker": "ADRO",
            "ticker_yahoo": "ADRO.JK",
            "company_name": "Adaro Energy Indonesia Tbk",
            "action_type": "CASH_DIVIDEND",
            "dividend_per_share": 180.0,
            "announcement_date": "2026-06-25",
            "cum_date_regular": "2026-07-22",
            "ex_date_regular": "2026-07-23",
            "recording_date": "2026-07-24",
            "payment_date": "2026-08-15",
            "source_name": "IDX (Seeded)",
            "source_url": "https://www.idx.co.id",
            "raw_text": "Seeded ADRO dividend information for review queue.",
            "confidence_score": 75.0,
            "verification_status": "needs_review"
        }
    ]

    timestamp = now_iso()
    for ev in seed_events:
        conn.execute(
            """
            INSERT INTO dividend_events (
                id, ticker, ticker_yahoo, company_name, action_type, dividend_per_share,
                announcement_date, cum_date_regular, ex_date_regular, recording_date,
                payment_date, source_name, source_url, raw_text, confidence_score,
                verification_status, created_at, updated_at, last_collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ev["id"], ev["ticker"], ev["ticker_yahoo"], ev["company_name"], ev["action_type"],
                ev["dividend_per_share"], ev["announcement_date"], ev["cum_date_regular"],
                ev["ex_date_regular"], ev["recording_date"], ev["payment_date"],
                ev["source_name"], ev["source_url"], ev["raw_text"], ev["confidence_score"],
                ev["verification_status"], timestamp, timestamp, timestamp
            )
        )
    conn.commit()
    print("Database seeded with 5 initial dividend events.")

def save_dividend_event(conn: sqlite3.Connection, event: DividendEvent) -> bool:
    """Inserts or updates a dividend event, returning True if inserted, False if updated."""
    timestamp = now_iso()
    event_dict = event.to_dict()
    
    # Check if already exists
    existing = conn.execute("SELECT id, verification_status FROM dividend_events WHERE id = ?", (event.id,)).fetchone()
    
    parser_warnings = json.dumps(event.parser_warnings)
    validation_errors = json.dumps(event.validation_errors)
    
    if existing:
        # Avoid overwriting manually verified with auto collection if forced is False
        # But we will update the other fields
        conn.execute(
            """
            UPDATE dividend_events SET
                ticker_yahoo = ?, company_name = ?, action_type = ?, dividend_per_share = ?,
                announcement_date = ?, cum_date_regular = ?, ex_date_regular = ?,
                cum_date_cash = ?, ex_date_cash = ?, recording_date = ?, payment_date = ?,
                source_name = ?, source_url = ?, raw_text = ?, raw_html = ?, confidence_score = ?,
                verification_status = ?, parser_warnings = ?, validation_errors = ?,
                updated_at = ?, last_collected_at = ?
            WHERE id = ?
            """,
            (
                event.ticker_yahoo, event.company_name, event.action_type, event.dividend_per_share,
                event.announcement_date, event.cum_date_regular, event.ex_date_regular,
                event.cum_date_cash, event.ex_date_cash, event.recording_date, event.payment_date,
                event.source_name, event.source_url, event.raw_text, event.raw_html, event.confidence_score,
                event.verification_status, parser_warnings, validation_errors,
                timestamp, timestamp, event.id
            )
        )
        conn.commit()
        return False
    else:
        conn.execute(
            """
            INSERT INTO dividend_events (
                id, ticker, ticker_yahoo, company_name, action_type, dividend_per_share,
                announcement_date, cum_date_regular, ex_date_regular, cum_date_cash, ex_date_cash,
                recording_date, payment_date, source_name, source_url, raw_text, raw_html,
                confidence_score, verification_status, parser_warnings, validation_errors,
                created_at, updated_at, last_collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id, event.ticker, event.ticker_yahoo, event.company_name, event.action_type,
                event.dividend_per_share, event.announcement_date, event.cum_date_regular,
                event.ex_date_regular, event.cum_date_cash, event.ex_date_cash,
                event.recording_date, event.payment_date, event.source_name, event.source_url,
                event.raw_text, event.raw_html, event.confidence_score, event.verification_status,
                parser_warnings, validation_errors, timestamp, timestamp, timestamp
            )
        )
        conn.commit()
        return True

def get_dividend_event(conn: sqlite3.Connection, event_id: str) -> Optional[DividendEvent]:
    row = conn.execute("SELECT * FROM dividend_events WHERE id = ?", (event_id,)).fetchone()
    if row:
        return DividendEvent.from_dict(dict(row))
    return None

def get_active_dividend_events(conn: sqlite3.Connection) -> List[DividendEvent]:
    """Gets active dividend events where cum_date_regular is today or in the future."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    rows = conn.execute(
        """
        SELECT * FROM dividend_events 
        WHERE (cum_date_regular >= ? OR payment_date >= ? OR payment_date IS NULL)
          AND verification_status != 'rejected'
        ORDER BY cum_date_regular ASC
        """,
        (today_str, today_str)
    ).fetchall()
    return [DividendEvent.from_dict(dict(row)) for row in rows]

def get_all_dividend_events(conn: sqlite3.Connection) -> List[DividendEvent]:
    rows = conn.execute("SELECT * FROM dividend_events ORDER BY cum_date_regular ASC").fetchall()
    return [DividendEvent.from_dict(dict(row)) for row in rows]

def log_audit(conn: sqlite3.Connection, event_id: str, action: str, old_val: Optional[dict], new_val: Optional[dict]) -> None:
    audit_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO dividend_event_audit_log (id, event_id, action, old_value_json, new_value_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            audit_id, event_id, action,
            json.dumps(old_val) if old_val else None,
            json.dumps(new_val) if new_val else None,
            now_iso()
        )
    )
    conn.commit()

def log_collection_run(conn: sqlite3.Connection, run_id: str, source: str, status: str, counts: Dict[str, int], warnings: List[str], errors: List[str], started_at: str) -> None:
    conn.execute(
        """
        INSERT INTO dividend_collection_runs (
            id, started_at, finished_at, source, status, collected_count, inserted_count,
            updated_count, duplicate_count, rejected_count, needs_review_count, warnings_json, errors_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id, started_at, now_iso(), source, status,
            counts.get("collected", 0), counts.get("inserted", 0), counts.get("updated", 0),
            counts.get("duplicate", 0), counts.get("rejected", 0), counts.get("needs_review", 0),
            json.dumps(warnings), json.dumps(errors)
        )
    )
    conn.commit()

def get_scan_cache(conn: sqlite3.Connection, cache_id: str) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT * FROM dividend_scan_cache WHERE id = ?", (cache_id,)).fetchone()
    if row:
        # Check if cache is fresh (less than 1 hour old)
        created_at_dt = datetime.fromisoformat(row["created_at"])
        if (datetime.now(timezone.utc) - created_at_dt).total_seconds() < 3600:
            return json.loads(row["result_json"])
    return None

def save_scan_cache(conn: sqlite3.Connection, cache_id: str, request_data: dict, result_data: dict) -> None:
    timestamp = now_iso()
    conn.execute(
        """
        INSERT OR REPLACE INTO dividend_scan_cache (id, scan_time, request_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (cache_id, timestamp, json.dumps(request_data), json.dumps(result_data), timestamp)
    )
    conn.commit()
