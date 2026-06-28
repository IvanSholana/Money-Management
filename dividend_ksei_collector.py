import urllib.request
import urllib.parse
import time
from typing import Any, Dict, List

def collect_ksei_events(timeout_seconds: int = 10, max_retries: int = 2) -> Dict[str, Any]:
    """
    Attempts to fetch corporate action calendar or announcements from KSEI.
    Fails gracefully if blocked, dynamic page is empty, or connection drops.
    """
    url = "https://www.ksei.co.id/publications/corporate-action-announcements"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
    }
    
    req = urllib.request.Request(url, headers=headers)
    last_error = ""
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Attempt {attempt} fetching KSEI announcements...")
            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                html_bytes = response.read()
                html_content = html_bytes.decode("utf-8", errors="ignore")
                
                # In real life, the page might be dynamic JavaScript. We will check if it contains content.
                # If we get a valid HTML page, return it for parsing.
                # For now, let's return a success result with raw data.
                return {
                    "status": "success",
                    "source": "KSEI",
                    "source_url": url,
                    "raw_html": html_content,
                    "events": [] # We will parse it in parser module
                }
        except urllib.error.HTTPError as e:
            last_error = f"HTTP Error {e.code}"
            print(f"KSEI fetch attempt {attempt} failed with {last_error}")
            if attempt < max_retries:
                time.sleep(1)
        except Exception as e:
            last_error = str(e)
            print(f"KSEI fetch attempt {attempt} failed with error: {last_error}")
            if attempt < max_retries:
                time.sleep(1)
                
    # If all attempts fail, fail gracefully instead of crashing
    return {
        "status": "failed_gracefully",
        "source": "KSEI",
        "source_url": url,
        "events": [],
        "warnings": [f"Unable to collect KSEI page: {last_error}. Fallback to existing database records or retry later."]
    }
