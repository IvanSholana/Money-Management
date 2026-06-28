from dataclasses import dataclass, field, asdict
from typing import Any, Optional, List, Dict

@dataclass
class DividendEvent:
    id: str
    ticker: str
    ticker_yahoo: Optional[str] = None
    company_name: Optional[str] = None
    action_type: str = "CASH_DIVIDEND"
    dividend_per_share: float = 0.0
    announcement_date: Optional[str] = None
    cum_date_regular: Optional[str] = None
    ex_date_regular: Optional[str] = None
    cum_date_cash: Optional[str] = None
    ex_date_cash: Optional[str] = None
    recording_date: Optional[str] = None
    payment_date: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    raw_text: Optional[str] = None
    raw_html: Optional[str] = None
    confidence_score: float = 0.0
    verification_status: str = "collected"  # collected, auto_verified, needs_review, rejected, manually_verified, stale
    parser_warnings: List[str] = field(default_factory=list)
    validation_errors: List[str] = field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_collected_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Serialize lists to JSON string or leave as is (database handler will handle JSON serialization)
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DividendEvent":
        # Handle parsed warnings/errors if they are stored as JSON string or raw lists
        warnings = d.get("parser_warnings")
        if warnings is None:
            warnings = []
        elif isinstance(warnings, str):
            import json
            try:
                warnings = json.loads(warnings)
            except Exception:
                warnings = [warnings] if warnings else []
        if not isinstance(warnings, list):
            warnings = [warnings] if warnings else []
        
        errors = d.get("validation_errors")
        if errors is None:
            errors = []
        elif isinstance(errors, str):
            import json
            try:
                errors = json.loads(errors)
            except Exception:
                errors = [errors] if errors else []
        if not isinstance(errors, list):
            errors = [errors] if errors else []

        return cls(
            id=d["id"],
            ticker=d["ticker"],
            ticker_yahoo=d.get("ticker_yahoo"),
            company_name=d.get("company_name"),
            action_type=d.get("action_type", "CASH_DIVIDEND"),
            dividend_per_share=float(d.get("dividend_per_share") or 0.0),
            announcement_date=d.get("announcement_date"),
            cum_date_regular=d.get("cum_date_regular"),
            ex_date_regular=d.get("ex_date_regular"),
            cum_date_cash=d.get("cum_date_cash"),
            ex_date_cash=d.get("ex_date_cash"),
            recording_date=d.get("recording_date"),
            payment_date=d.get("payment_date"),
            source_name=d.get("source_name"),
            source_url=d.get("source_url"),
            raw_text=d.get("raw_text"),
            raw_html=d.get("raw_html"),
            confidence_score=float(d.get("confidence_score") or 0.0),
            verification_status=d.get("verification_status", "collected"),
            parser_warnings=warnings,
            validation_errors=errors,
            created_at=d.get("created_at"),
            updated_at=d.get("updated_at"),
            last_collected_at=d.get("last_collected_at")
        )

@dataclass
class DividendCollectionRequest:
    source: Optional[str] = "all"  # all | ksei | idx
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    action_type: str = "CASH_DIVIDEND"
    max_pages: Optional[int] = None
    force_refresh: bool = False

@dataclass
class DividendCollectionResult:
    status: str
    source_results: List[Dict[str, Any]] = field(default_factory=list)
    collected_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    duplicate_count: int = 0
    rejected_count: int = 0
    needs_review_count: int = 0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class DividendScanRequest:
    symbols: Optional[List[str]] = None
    syariah_only: bool = True
    min_dividend_yield_percent: float = 1.0
    min_days_to_cum: int = 2
    max_days_to_cum: int = 30
    max_results: int = 20
    include_needs_review: bool = False
    auto_collect_first: bool = True

@dataclass
class DividendMomentumCandidate:
    ticker: str
    ticker_yahoo: str
    company_name: str
    dividend_per_share: float
    current_price: float
    dividend_yield_percent: float
    announcement_date: Optional[str]
    cum_date_regular: str
    ex_date_regular: str
    recording_date: Optional[str]
    payment_date: Optional[str]
    days_to_cum: int
    days_to_ex: int
    price_return_since_announcement: float
    price_return_5d: float
    price_return_10d: float
    volume_ratio_20d: float
    distance_to_ma20_percent: float
    historical_runup_score: float
    ex_date_drop_risk_score: float
    fundamental_quality_score: float
    syariah_status: str
    final_score: float
    final_status: str  # AVOID | WATCH | DIVIDEND_MOMENTUM_CANDIDATE | HIGH_CONVICTION_RUN_UP
    score_components: Dict[str, float]
    entry_plan: str
    exit_plan: str
    warnings: List[str]
    rejection_reasons: List[str]
    source_name: str
    source_url: Optional[str]
    verification_status: str
    confidence_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
