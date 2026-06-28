import urllib.request
import urllib.parse
import json
import time
from typing import Any, Dict, List

def collect_idx_disclosures(timeout_seconds: int = 10, max_retries: int = 2) -> Dict[str, Any]:
    """
    Attempts to fetch announcements or disclosures from the IDX portal.
    Fails gracefully if blocked, rate limited, or connection fails.
    """
    # Try querying the public disclosure endpoint if possible, or Announcements page
    url = "https://www.idx.co.id/primaryMenu/GetAnnouncement?indexFrom=1&pageSize=20&keyword=Dividen"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.idx.co.id/id/berita/pengumuman/"
    }
    
    req = urllib.request.Request(url, headers=headers)
    last_error = ""
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Attempt {attempt} fetching IDX disclosures...")
            with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
                content_type = response.headers.get("Content-Type", "")
                raw_data = response.read()
                
                if "application/json" in content_type:
                    data_str = raw_data.decode("utf-8")
                    json_data = json.loads(data_str)
                    return {
                        "status": "success",
                        "source": "IDX",
                        "source_url": url,
                        "raw_json": json_data,
                        "events": [] # We will parse this in parser
                    }
                else:
                    # If it's HTML (maybe a redirect or CF challenge), return it as html text
                    html_content = raw_data.decode("utf-8", errors="ignore")
                    return {
                        "status": "success",
                        "source": "IDX",
                        "source_url": url,
                        "raw_html": html_content,
                        "events": []
                    }
        except urllib.error.HTTPError as e:
            last_error = f"HTTP Error {e.code}"
            print(f"IDX fetch attempt {attempt} failed with {last_error}")
            if attempt < max_retries:
                time.sleep(1)
        except Exception as e:
            last_error = str(e)
            print(f"IDX fetch attempt {attempt} failed with error: {last_error}")
            if attempt < max_retries:
                time.sleep(1)
                
    # Fallback to graceful failure
    return {
        "status": "failed_gracefully",
        "source": "IDX",
        "source_url": "https://www.idx.co.id/id/berita/pengumuman/",
        "events": [],
        "warnings": [f"Unable to collect IDX disclosures: {last_error}. Use database cache or try again later."]
    }
