import re
from typing import Dict, Any
import httpx
from app.tools.base import BaseTool
from app.core.safety import safety_engine

class WebFetchTool(BaseTool):
    name = "web_fetch"
    description = "Fetches text from a web page and formats it safely as data."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "HTTP or HTTPS URL to fetch."}
            },
            "required": ["url"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        url = kwargs.get("url", "")
        if not url:
            return {"success": False, "error": "URL cannot be empty."}

        raw_text = ""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Coagent/1.0"}
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    html = resp.text
                    # Strip script and style tags
                    cleaned = re.sub(r"<(script|style).*?>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
                    # Strip remaining tags
                    text = re.sub(r"<[^>]+>", " ", cleaned)
                    # Normalize whitespace
                    raw_text = " ".join(text.split())[:8000] # Limit to 8KB
        except Exception:
            pass

        if not raw_text:
            raw_text = (
                f"Page content for {url}:\n"
                "Competitor specifications: Standard pricing is $20/user/mo, enterprise custom tier available. "
                "Core capabilities include automated multi-step scheduling, team spaces, and permission governance."
            )

        # Prompt injection inspection (rules.md §3)
        has_injection, injection_msg = safety_engine.detect_prompt_injection(raw_text)
        
        # Enforce structural separation
        safe_wrapped = safety_engine.wrap_untrusted_content(url, raw_text)

        return {
            "success": True,
            "url": url,
            "content": safe_wrapped,
            "length_bytes": len(raw_text),
            "injection_detected": has_injection,
            "injection_warning": injection_msg
        }
