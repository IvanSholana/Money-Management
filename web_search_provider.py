import os
import urllib.request
import urllib.parse
import json
import time
from typing import Any, Dict, List, Optional

class SearchResult:
    def __init__(
        self,
        title: str,
        url: str,
        snippet: str,
        source_name: str,
        query: str,
        published_at: Optional[str] = None,
        relevance_score: Optional[float] = None
    ):
        self.title = title
        self.url = url
        self.snippet = snippet
        self.source_name = source_name
        self.published_at = published_at
        self.fetched_at = datetime.now().isoformat() if "datetime" in globals() else time.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.query = query
        self.relevance_score = relevance_score

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source_name": self.source_name,
            "published_at": self.published_at,
            "fetched_at": self.fetched_at,
            "query": self.query,
            "relevance_score": self.relevance_score
        }

from datetime import datetime

class WebSearchProvider:
    def __init__(self):
        # Load from environment variables
        self.provider = os.environ.get("WEB_SEARCH_PROVIDER", "DISABLED").upper()
        self.serpapi_key = os.environ.get("SERPAPI_API_KEY")
        self.brave_key = os.environ.get("BRAVE_SEARCH_API_KEY")
        self.bing_key = os.environ.get("BING_SEARCH_API_KEY")
        self.google_cse_key = os.environ.get("GOOGLE_CSE_API_KEY")
        self.google_cse_id = os.environ.get("GOOGLE_CSE_ID")
        self.tavily_key = os.environ.get("TAVILY_API_KEY")
        
        try:
            self.timeout = int(os.environ.get("WEB_SEARCH_TIMEOUT_SECONDS", "10"))
        except ValueError:
            self.timeout = 10
            
        try:
            self.max_results_default = int(os.environ.get("WEB_SEARCH_MAX_RESULTS", "5"))
        except ValueError:
            self.max_results_default = 5

    def search(self, query: str, max_results: Optional[int] = None, freshness_days: Optional[int] = None) -> List[SearchResult]:
        """
        Main search dispatcher. Resilient to network failures and timeout.
        """
        if self.provider == "DISABLED":
            print("Web search provider is disabled or not configured.")
            return []
            
        limit = max_results if max_results is not None else self.max_results_default
        
        try:
            if self.provider == "SERPAPI" and self.serpapi_key:
                return self._search_serpapi(query, limit)
            elif self.provider == "BRAVE_SEARCH" and self.brave_key:
                return self._search_brave(query, limit)
            elif self.provider == "BING_SEARCH" and self.bing_key:
                return self._search_bing(query, limit)
            elif self.provider == "GOOGLE_CSE" and self.google_cse_key and self.google_cse_id:
                return self._search_google_cse(query, limit)
            elif self.provider == "TAVILY" and self.tavily_key:
                return self._search_tavily(query, limit)
            else:
                print(f"Web search provider {self.provider} is configured but missing required API key.")
                return []
        except Exception as e:
            print(f"Error executing web search using {self.provider}: {e}")
            return []

    def _search_serpapi(self, query: str, limit: int) -> List[SearchResult]:
        escaped_query = urllib.parse.quote(query)
        url = f"https://serpapi.com/search.json?q={escaped_query}&api_key={self.serpapi_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "Antigravity/1.0"})
        
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            results = []
            for item in res_json.get("organic_results", [])[:limit]:
                # Extract domain name as source
                domain = urllib.parse.urlparse(item.get("link", "")).netloc
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    source_name=domain or "SerpApi",
                    query=query
                ))
            return results

    def _search_brave(self, query: str, limit: int) -> List[SearchResult]:
        escaped_query = urllib.parse.quote(query)
        url = f"https://api.search.brave.com/res/v1/web/search?q={escaped_query}"
        req = urllib.request.Request(
            url, 
            headers={
                "User-Agent": "Antigravity/1.0",
                "X-Subscription-Token": self.brave_key,
                "Accept": "application/json"
            }
        )
        
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            results = []
            web_results = res_json.get("web", {}).get("results", [])
            for item in web_results[:limit]:
                domain = urllib.parse.urlparse(item.get("url", "")).netloc
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    source_name=domain or "Brave",
                    query=query
                ))
            return results

    def _search_bing(self, query: str, limit: int) -> List[SearchResult]:
        escaped_query = urllib.parse.quote(query)
        url = f"https://api.bing.microsoft.com/v7.0/search?q={escaped_query}&count={limit}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Antigravity/1.0",
                "Ocp-Apim-Subscription-Key": self.bing_key
            }
        )
        
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            results = []
            web_pages = res_json.get("webPages", {}).get("value", [])
            for item in web_pages[:limit]:
                domain = urllib.parse.urlparse(item.get("url", "")).netloc
                results.append(SearchResult(
                    title=item.get("name", ""),
                    url=item.get("url", ""),
                    snippet=item.get("snippet", ""),
                    source_name=domain or "Bing",
                    query=query
                ))
            return results

    def _search_google_cse(self, query: str, limit: int) -> List[SearchResult]:
        escaped_query = urllib.parse.quote(query)
        url = f"https://www.googleapis.com/customsearch/v1?q={escaped_query}&key={self.google_cse_key}&cx={self.google_cse_id}&num={limit}"
        req = urllib.request.Request(url, headers={"User-Agent": "Antigravity/1.0"})
        
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            results = []
            items = res_json.get("items", [])
            for item in items[:limit]:
                domain = urllib.parse.urlparse(item.get("link", "")).netloc
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    source_name=domain or "Google CSE",
                    query=query
                ))
            return results

    def _search_tavily(self, query: str, limit: int) -> List[SearchResult]:
        url = "https://api.tavily.com/search"
        payload = {
            "query": query,
            "api_key": self.tavily_key,
            "max_results": limit,
            "search_depth": "basic",
            "include_answer": False
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Antigravity/1.0"
            }
        )
        
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            results = []
            items = res_json.get("results", [])
            for item in items[:limit]:
                domain = urllib.parse.urlparse(item.get("url", "")).netloc
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    source_name=domain or "Tavily",
                    query=query
                ))
            return results
