from typing import List, Tuple

# Table-driven configuration of IDX tick sizes
# Format: (max_price_threshold, tick_size)
# An entry with float('inf') handles the last catch-all range.
IDX_TICK_SIZE_RULES: List[Tuple[float, int]] = [
    (200.0, 1),
    (500.0, 2),
    (2000.0, 5),
    (5000.0, 10),
    (float('inf'), 25)
]

def get_idx_tick_size(price: float) -> int:
    """
    Calculates the IDX tick size based on a table-driven set of price rules.
    Rules:
    - Price < 200: tick size = 1
    - 200 <= Price < 500: tick size = 2
    - 500 <= Price < 2000: tick size = 5
    - 2000 <= Price < 5000: tick size = 10
    - Price >= 5000: tick size = 25
    """
    if price <= 0:
        return 1
        
    for limit, tick_size in IDX_TICK_SIZE_RULES:
        if price < limit:
            return tick_size
            
    return 25  # Fallback

def calculate_spread_ticks(best_bid: float, best_offer: float) -> int:
    """
    Calculates the spread in ticks using the IDX tick size corresponding to the best bid.
    """
    if best_bid <= 0 or best_offer <= best_bid:
        return 0
    tick_size = get_idx_tick_size(best_bid)
    return int(round((best_offer - best_bid) / tick_size))
