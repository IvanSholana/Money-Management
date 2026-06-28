import unittest
from browser_safety_guard import validate_url, check_selector_safety, SecurityViolation

class TestBrowserSafetyGuard(unittest.TestCase):
    
    def test_allowed_urls(self):
        # Valid Stockbit secure URLs
        validate_url("https://stockbit.com/symbol/TLKM")
        validate_url("https://main.stockbit.com/symbol/ADRO")
        validate_url("https://stockbit.com/login")
        
        # Test local URLs for testing compatibility
        validate_url("https://localhost:5173")
        validate_url("http://127.0.0.1:8000")

    def test_blocked_urls(self):
        # Unsecure protocol
        with self.assertRaises(SecurityViolation):
            validate_url("http://stockbit.com/symbol/TLKM")
            
        # Non-Stockbit domains
        with self.assertRaises(SecurityViolation):
            validate_url("https://google.com")
            
        with self.assertRaises(SecurityViolation):
            validate_url("https://fake-stockbit.com/symbol/TLKM")
            
        # Empty URL
        with self.assertRaises(SecurityViolation):
            validate_url("")

    def test_safe_selectors(self):
        check_selector_safety(".symbol-price")
        check_selector_safety("table.orderbook tr")
        check_selector_safety("div.title")
        check_selector_safety("#root > div > header")

    def test_blocked_selectors(self):
        # Transactional words
        with self.assertRaises(SecurityViolation):
            check_selector_safety("button#buy-btn")
            
        with self.assertRaises(SecurityViolation):
            check_selector_safety("a.sell-action")
            
        with self.assertRaises(SecurityViolation):
            check_selector_safety("form.order-form")
            
        # Credentials words
        with self.assertRaises(SecurityViolation):
            check_selector_safety("input[name='password']")
            
        with self.assertRaises(SecurityViolation):
            check_selector_safety("input#pin-entry")
            
        with self.assertRaises(SecurityViolation):
            check_selector_safety(".confirm-payment")
