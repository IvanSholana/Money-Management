from stockbit_orderbook_parser import parse_stockbit_html

html = """
<html>
    <body>
        <div class="symbol-price">Rp 3.100</div>
        <div class="orderbook-container">
            <table>
                <tr>
                    <td>10.000 Lot</td>
                    <td>3.080</td>
                    <td>3.100</td>
                    <td>5.000 Lot</td>
                </tr>
                <tr>
                    <td>20.000</td>
                    <td>3.060</td>
                    <td>3.120</td>
                    <td>15.000</td>
                </tr>
            </table>
        </div>
    </body>
</html>
"""

snapshot = parse_stockbit_html(html, "TLKM")
print("Bids:")
for r in snapshot.bid_rows:
    print(f"  Price: {r.price}, Vol: {r.volume}")
print("Offers:")
for r in snapshot.offer_rows:
    print(f"  Price: {r.price}, Vol: {r.volume}")
print("Best Bid:", snapshot.best_bid_price)
print("Best Offer:", snapshot.best_offer_price)
print("Spread Ticks:", snapshot.spread_ticks)
print("Confidence:", snapshot.read_confidence)
print("Warnings:", snapshot.parser_warnings)
