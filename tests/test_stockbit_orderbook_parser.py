import unittest
from stockbit_orderbook_parser import parse_number_indonesian, parse_stockbit_html

class TestStockbitOrderbookParser(unittest.TestCase):

    def test_parse_number_indonesian(self):
        # Test basic integers
        self.assertEqual(parse_number_indonesian("100"), 100)
        
        # Test thousand separators
        self.assertEqual(parse_number_indonesian("1.000"), 1000)
        self.assertEqual(parse_number_indonesian("10.000"), 10000)
        self.assertEqual(parse_number_indonesian("100.000"), 100000)
        self.assertEqual(parse_number_indonesian("1.000.000"), 1000000)
        
        # Test comma separators (English style thousands or Indonesian decimals)
        self.assertEqual(parse_number_indonesian("1,000"), 1000)
        self.assertEqual(parse_number_indonesian("1,2M"), 1200000)
        self.assertEqual(parse_number_indonesian("1.2M"), 1200000)
        
        # Test suffixes
        self.assertEqual(parse_number_indonesian("10K"), 10000)
        self.assertEqual(parse_number_indonesian("10 Ribu"), 10000)
        self.assertEqual(parse_number_indonesian("1.000 Lot"), 1000)
        self.assertEqual(parse_number_indonesian("1,5K Lot"), 1500)

    def test_parse_valid_html(self):
        sample_html = """
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
        snapshot = parse_stockbit_html(sample_html, "TLKM")
        self.assertEqual(snapshot.ticker, "TLKM")
        self.assertEqual(snapshot.last_price, 3100)
        self.assertEqual(snapshot.best_bid_price, 3080)
        self.assertEqual(snapshot.best_offer_price, 3100)
        self.assertEqual(snapshot.spread_ticks, 2) # (3100 - 3080) / 10 = 2 ticks
        
        self.assertEqual(len(snapshot.bid_rows), 2)
        self.assertEqual(snapshot.bid_rows[0].price, 3080)
        self.assertEqual(snapshot.bid_rows[0].volume, 10000)
        
        self.assertEqual(len(snapshot.offer_rows), 2)
        self.assertEqual(snapshot.offer_rows[0].price, 3100)
        self.assertEqual(snapshot.offer_rows[0].volume, 5000)

    def test_parse_missing_rows(self):
        # Empty orderbook table
        sample_html = """
        <html>
            <body>
                <div class="symbol-price">3.100</div>
            </body>
        </html>
        """
        snapshot = parse_stockbit_html(sample_html, "TLKM")
        self.assertEqual(snapshot.ticker, "TLKM")
        self.assertEqual(snapshot.last_price, 3100)
        self.assertEqual(len(snapshot.bid_rows), 0)
        self.assertEqual(len(snapshot.offer_rows), 0)
        self.assertTrue(snapshot.read_confidence < 40.0)
        self.assertTrue(any("kosong" in w or "tipis" in w for w in snapshot.parser_warnings))

    def test_parse_malformed_html(self):
        # Completely garbled HTML
        snapshot = parse_stockbit_html("nonsense garbage data", "TLKM")
        self.assertEqual(snapshot.ticker, "TLKM")
        self.assertEqual(len(snapshot.bid_rows), 0)
        self.assertEqual(len(snapshot.offer_rows), 0)
        self.assertTrue(snapshot.read_confidence < 40.0)
