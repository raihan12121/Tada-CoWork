import urllib.parse
import html
import re
from typing import Dict, Any, List
import httpx
from app.tools.base import BaseTool
from app.core.safety import safety_engine
from app.config import settings

class WebSearchTool(BaseTool):
    name = "web_search"
    description = "Searches the web for competitor information, documentation, and industry data."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords or topic."}
            },
            "required": ["query"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        query = kwargs.get("query", "")
        if not query:
            return {"success": False, "error": "Query cannot be empty."}

        # Query DuckDuckGo Instant Answer API or return structured fallback results
        results: List[Dict[str, str]] = []
        try:
            encoded_query = urllib.parse.quote(query)
            url = f"https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1&skip_disambig=1"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    abstract = data.get("AbstractText", "")
                    if abstract:
                        results.append({
                            "title": data.get("Heading", query),
                            "url": data.get("AbstractURL", f"https://duckduckgo.com/?q={encoded_query}"),
                            "snippet": abstract
                        })
                    for topic in data.get("RelatedTopics", [])[:4]:
                        if "Text" in topic:
                            results.append({
                                "title": topic.get("Text", "").split(" - ")[0],
                                "url": topic.get("FirstURL", ""),
                                "snippet": topic.get("Text", "")
                            })
        except Exception:
            pass

        if not results:
            # The Instant Answer endpoint often has no entries for ordinary
            # queries. Use DuckDuckGo's public HTML result page as a second
            # live source before reporting that search is unavailable.
            try:
                encoded_query = urllib.parse.quote(query)
                url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "Coagent/1.0"})
                if resp.status_code == 200:
                    links = re.findall(r'class="result__a" href="([^"]+)"[^>]*>(.*?)</a>', resp.text, flags=re.IGNORECASE | re.DOTALL)
                    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a?>', resp.text, flags=re.IGNORECASE | re.DOTALL)
                    for idx, (link, title_html) in enumerate(links[:5]):
                        title = re.sub(r"<[^>]+>", "", html.unescape(title_html)).strip()
                        snippet_html = snippets[idx] if idx < len(snippets) else "Live DuckDuckGo result"
                        snippet = re.sub(r"<[^>]+>", "", html.unescape(snippet_html)).strip()
                        results.append({"title": title, "url": html.unescape(link), "snippet": snippet})
            except Exception:
                pass

        if not results:
            # Bing is a second live provider for environments where DuckDuckGo
            # is rate-limited. Results are still parsed as untrusted data and
            # never replaced by local fixtures.
            try:
                encoded_query = urllib.parse.quote(query)
                url = f"https://www.bing.com/search?q={encoded_query}"
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "Coagent/1.0"})
                if resp.status_code == 200:
                    entries = re.findall(r'<li class="b_algo".*?<h2><a href="([^"]+)"[^>]*>(.*?)</a>.*?(?:<p>(.*?)</p>)?', resp.text, flags=re.IGNORECASE | re.DOTALL)
                    for link, title_html, snippet_html in entries[:5]:
                        results.append({
                            "title": re.sub(r"<[^>]+>", "", html.unescape(title_html)).strip(),
                            "url": html.unescape(link),
                            "snippet": re.sub(r"<[^>]+>", "", html.unescape(snippet_html or "")).strip(),
                        })
            except Exception:
                pass

        # Never fabricate research results. Fixtures are available only when
        # an explicit demo flag is enabled for UI development.
        if not results:
            if not settings.ALLOW_DEMO_FIXTURES:
                return {"success": False, "query": query, "error": "No live search results were available."}
            results = [
                {
                    "title": f"Industry Analysis: {query}",
                    "url": "https://trusted-sources.org/market-overview",
                    "snippet": f"Market analysis and benchmarks for '{query}'. Top providers show strong growth in automated workflows and enterprise tooling."
                },
                {
                    "title": f"Feature Matrix & Offerings for {query}",
                    "url": "https://benchmarks.io/specs",
                    "snippet": "Leading competitors offer tier-based pricing, modular plugin ecosystems, and sandboxed execution environments."
                }
            ]

        # Wrap in untrusted boundary
        formatted_snippets = "\n".join(f"- [{r['title']}]({r['url']}): {r['snippet']}" for r in results)
        safe_output = safety_engine.wrap_untrusted_content("Web Search Results", formatted_snippets)

        return {
            "success": True,
            "query": query,
            "results_count": len(results),
            "results": results,
            "sanitized_view": safe_output
        }
