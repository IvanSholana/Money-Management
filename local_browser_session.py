import os
from pathlib import Path
from playwright.sync_api import sync_playwright, BrowserContext

# Define paths
WORKSPACE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = WORKSPACE_DIR / ".runtime"
PROFILE_DIR = RUNTIME_DIR / "stockbit_browser_profile"

# Ensure directories exist
RUNTIME_DIR.mkdir(exist_ok=True)
PROFILE_DIR.mkdir(exist_ok=True)

def get_profile_dir() -> str:
    """Returns the absolute path to the browser profile directory."""
    return str(PROFILE_DIR.resolve())

def create_browser_context(headless: bool = False) -> BrowserContext:
    """
    Launches and returns a persistent browser context using the dedicated local profile.
    This should be used inside a sync context manager or closed manually.
    """
    playwright = sync_playwright().start()
    
    # Anti-detection arguments and standard setup
    context = playwright.chromium.launch_persistent_context(
        user_data_dir=get_profile_dir(),
        headless=headless,
        channel="chrome",  # Prefer using standard Google Chrome if installed
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--start-maximized"
        ],
        no_viewport=True  # Respect window size
    )
    
    # Inject a getter to reference the playwright object if needed for cleanup
    # We store it in context object itself so the caller can close the playwright instance too
    context._playwright_instance = playwright
    
    # Overwrite close method to clean up playwright instance
    original_close = context.close
    
    def custom_close():
        try:
            original_close()
        finally:
            if hasattr(context, "_playwright_instance"):
                context._playwright_instance.stop()
                
    context.close = custom_close
    return context
