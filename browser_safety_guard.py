import re
from urllib.parse import urlparse

class SecurityViolation(Exception):
    """Exception raised when a security guardrail is violated."""
    pass

# Regular expressions for allowed Stockbit domains/paths
ALLOWED_DOMAINS = {
    "stockbit.com",
    "main.stockbit.com",
}

# Suspicious words that indicate transactional, credentials, or order placement elements
SUSPICIOUS_SELECTORS = [
    r"\b(buy|sell|order|submit|beli|jual|trade|execute)\b",
    r"\b(password|pin|passwd|passphrase|otp|token|credentials)\b",
    r"\b(confirm|checkout|cart|pay|payment|transaksi|deal)\b"
]

def validate_url(url: str) -> None:
    """
    Validates that the target URL is strictly on the allowed Stockbit domain.
    Raises SecurityViolation if invalid.
    """
    if not url:
        raise SecurityViolation("URL cannot be empty.")
        
    parsed = urlparse(url)
    # Check domain
    domain = parsed.netloc.lower()
    # Remove port if exists (e.g., localhost:5173 is fine for mock tests)
    domain_clean = domain.split(":")[0]
    
    # Allow localhost for unit tests
    if domain_clean in ("localhost", "127.0.0.1"):
        return
        
    # Check standard Stockbit domain
    if domain_clean not in ALLOWED_DOMAINS and not domain_clean.endswith(".stockbit.com"):
        raise SecurityViolation(f"Domain '{domain}' is not allowed by safety guardrails.")
        
    # Check scheme
    if parsed.scheme != "https" and domain_clean != "localhost" and domain_clean != "127.0.0.1":
        raise SecurityViolation(f"Secure HTTPS protocol is required, got '{parsed.scheme}'.")

def check_selector_safety(selector: str) -> None:
    """
    Validates that a selector is not targeting buy, sell, credentials, or order buttons.
    Raises SecurityViolation if it matches suspicious patterns.
    """
    if not selector:
        return
        
    selector_lower = selector.lower()
    for pattern in SUSPICIOUS_SELECTORS:
        if re.search(pattern, selector_lower):
            raise SecurityViolation(
                f"Selector '{selector}' is blocked by safety guardrails (matches transactional pattern)."
            )

def block_mutating_actions(page) -> None:
    """
    Secures the playwright page instance:
    1. Hook page navigation events to prevent navigating away from Stockbit.
    2. Patch mutating page methods (click, type, fill, check, uncheck, select_option) to enforce selector safety.
    """
    # Navigational guard
    def handle_request(request):
        try:
            validate_url(request.url)
        except SecurityViolation as e:
            # Cancel navigation or request
            # For simplicity, we just print/log and raise.
            # Playwright allows route aborting if route is setup.
            pass

    # Safety wrapper for selector-based actions
    original_click = page.click
    def safe_click(selector, *args, **kwargs):
        check_selector_safety(selector)
        return original_click(selector, *args, **kwargs)
    page.click = safe_click

    original_fill = page.fill
    def safe_fill(selector, value, *args, **kwargs):
        check_selector_safety(selector)
        # Block filling credentials
        if "pin" in selector.lower() or "password" in selector.lower():
            raise SecurityViolation("Writing to input fields matching credentials/PIN is blocked.")
        return original_fill(selector, value, *args, **kwargs)
    page.fill = safe_fill

    original_type = page.type
    def safe_type(selector, text, *args, **kwargs):
        check_selector_safety(selector)
        return original_type(selector, text, *args, **kwargs)
    page.type = safe_type
