from dataclasses import dataclass, field, asdict
from typing import Any, Optional, List, Dict

@dataclass
class OrderBookRow:
    price: int
    volume: int  # in lots or shares (will be normalized)
    value: Optional[float] = None
    raw_text: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class OrderBookSnapshot:
    ticker: str
    page_url: str
    last_price: Optional[int] = None
    best_bid_price: Optional[int] = None
    best_offer_price: Optional[int] = None
    spread_ticks: Optional[int] = None
    spread_percent: Optional[float] = None
    bid_rows: List[OrderBookRow] = field(default_factory=list)
    offer_rows: List[OrderBookRow] = field(default_factory=list)
    timestamp_read: str = ""
    read_confidence: float = 0.0
    parser_warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["bid_rows"] = [r.to_dict() for r in self.bid_rows]
        d["offer_rows"] = [r.to_dict() for r in self.offer_rows]
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "OrderBookSnapshot":
        bid_data = d.get("bid_rows", [])
        offer_data = d.get("offer_rows", [])
        
        bid_rows = [OrderBookRow(**r) if isinstance(r, dict) else r for r in bid_data]
        offer_rows = [OrderBookRow(**r) if isinstance(r, dict) else r for r in offer_data]
        
        # Safe deserialize warnings list
        warnings = d.get("parser_warnings", [])
        if not isinstance(warnings, list):
            warnings = []

        return cls(
            ticker=d["ticker"],
            page_url=d["page_url"],
            last_price=d.get("last_price"),
            best_bid_price=d.get("best_bid_price"),
            best_offer_price=d.get("best_offer_price"),
            spread_ticks=d.get("spread_ticks"),
            spread_percent=d.get("spread_percent"),
            bid_rows=bid_rows,
            offer_rows=offer_rows,
            timestamp_read=d.get("timestamp_read", ""),
            read_confidence=float(d.get("read_confidence", 0.0)),
            parser_warnings=warnings
        )

@dataclass
class ExecutionCheckRequest:
    ticker: str
    candidate_id: Optional[str] = None
    planned_order_lots: int = 1
    planned_order_value: Optional[float] = None
    use_deepseek_review: bool = False

@dataclass
class ExecutionCheckResult:
    ticker: str
    execution_status: str  # EXECUTION_OK, EXECUTION_ACCEPTABLE_BUT_MONITOR, etc.
    execution_score: float
    orderbook_metrics: Dict[str, Any]
    execution_reasons: List[str] = field(default_factory=list)
    execution_warnings: List[str] = field(default_factory=list)
    suggested_action: str = ""
    manual_only: bool = True
    stale_snapshot: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
