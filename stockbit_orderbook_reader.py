import time
from typing import Tuple, Optional
from playwright.sync_api import Error as PlaywrightError
from local_browser_session import create_browser_context
from browser_safety_guard import block_mutating_actions, validate_url

class StockbitReadError(Exception):
    """Exception raised when reading Stockbit page fails."""
    pass

class NeedsLoginError(StockbitReadError):
    """Exception raised when the session is not logged in."""
    pass

def read_stockbit_symbol_html(
    ticker: str, 
    headless: bool = False, 
    timeout_ms: int = 20000
) -> Tuple[str, str]:
    """
    Navigates to the Stockbit symbol page for a given ticker and returns the page HTML.
    
    Returns:
        Tuple[str, str]: (page_html, page_url)
        
    Raises:
        NeedsLoginError: If the browser is redirected to the login page.
        StockbitReadError: For other navigation or reading failures.
    """
    ticker_clean = ticker.strip().upper()
    if ticker_clean.endswith(".JK"):
        ticker_clean = ticker_clean[:-3]
    url = f"https://stockbit.com/symbol/{ticker_clean}"
    
    # Validate the URL first
    validate_url(url)
    
    context = None
    try:
        # Launch persistent context (keeps session cookies)
        context = create_browser_context(headless=headless)
        page = context.new_page()
        
        # Enforce safety guardrails
        block_mutating_actions(page)
        
        # Set default timeout
        page.set_default_timeout(timeout_ms)
        
        # Navigate to target page
        response = page.goto(url)
        if not response:
            raise StockbitReadError(f"Failed to load URL: {url} (No response)")
            
        if response.status >= 400:
            raise StockbitReadError(f"Stockbit returned HTTP status {response.status} for {url}")
            
        # Give it a moment to resolve redirects or login checks
        page.wait_for_load_state("domcontentloaded")
        
        # Check current URL
        current_url = page.url
        validate_url(current_url)
        
        # Check login state
        is_logged_in = True
        if "/login" in current_url.lower() or page.locator("input[name='username']").is_visible():
            is_logged_in = False
        else:
            try:
                # Try waiting for common order book table or container
                page.wait_for_selector("table, .orderbook-container, .symbol-price", timeout=4000)
            except PlaywrightError:
                # If table is not found, check if we might be on a login wall/overlay
                is_logged_in = False
                
        if not is_logged_in:
            if not headless:
                # Wait for user to log in manually in the opened browser window
                print("Sesi Stockbit belum masuk. Menunggu login manual dari user (maksimal 90 detik)...")
                start_time = time.time()
                while time.time() - start_time < 90:
                    time.sleep(1)
                    try:
                        # Check if the order book table or container is now visible (indicating successful login)
                        if page.locator("table").first.is_visible() or page.locator(".orderbook-container").first.is_visible():
                            is_logged_in = True
                            break
                    except Exception:
                        pass
                if not is_logged_in:
                    raise NeedsLoginError("Batas waktu login manual (90 detik) habis.")
            else:
                raise NeedsLoginError(
                    "Sesi Stockbit belum masuk (NEEDS_LOGIN). Silakan nonaktifkan Headless mode (centang mati Headless) lalu jalankan lagi untuk login manual di browser."
                )
            
        # Get the full page HTML
        html_content = page.content()
        return html_content, current_url
        
    except NeedsLoginError:
        raise
    except PlaywrightError as e:
        raise StockbitReadError(f"Playwright navigation/extraction failed: {str(e)}")
    except Exception as e:
        if not isinstance(e, StockbitReadError):
            raise StockbitReadError(f"Unexpected error reading Stockbit: {str(e)}")
        raise
    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass
