"""
Thin wrapper around Tavily's Search and Extract REST APIs (https://docs.tavily.com/).

Tavily exposes two endpoints we use:
  - /search:  one query -> ranked results with content excerpts
  - /extract: specific URLs -> full page content

research.py calls web_search/web_fetch the same way it called the old
Parallel MCP client, and each returns a JSON string shaped like
{"results": [{"url", "title", "excerpts"/"full_content"}]} so the existing
_parse_search_results / _parse_fetch_results in research.py don't need to
change.
"""

import json
import os

import httpx

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")
TAVILY_SEARCH_URL = "https://api.tavily.com/search"
TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"

REQUEST_TIMEOUT_SECONDS = 30
MAX_RESULTS_PER_QUERY = 8


class TavilyError(Exception):
    """Raised when Tavily can't be reached or returns an error."""


async def _post(url: str, payload: dict) -> dict:
    if not TAVILY_API_KEY:
        raise TavilyError("TAVILY_API_KEY is not set.")
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise TavilyError(f"Could not reach Tavily API: {exc}") from exc


async def web_search(objective: str, search_queries: list[str]) -> str:
    """Run each query against Tavily's /search, merging results and keeping first-seen order."""
    merged: dict[str, dict] = {}
    for query in search_queries:
        data = await _post(
            TAVILY_SEARCH_URL,
            {"query": query, "search_depth": "advanced", "max_results": MAX_RESULTS_PER_QUERY},
        )
        for result in data.get("results", []):
            url = result.get("url")
            if not url or url in merged:
                continue
            merged[url] = {
                "url": url,
                "title": result.get("title") or url,
                "excerpts": [result["content"]] if result.get("content") else [],
            }
    return json.dumps({"results": list(merged.values())})


async def web_fetch(urls: list[str], objective: str | None = None) -> str:
    """Fetch full page content for specific URLs via Tavily's /extract."""
    data = await _post(TAVILY_EXTRACT_URL, {"urls": urls, "include_raw_content": True})
    results = [
        {
            "url": result["url"],
            "title": result["url"],
            "full_content": result.get("raw_content") or "",
        }
        for result in data.get("results", [])
        if result.get("url")
    ]
    return json.dumps({"results": results})
