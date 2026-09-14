import ipaddress
import re
import socket
from urllib.parse import urlparse
from typing import Dict, Any, Tuple, Optional
import httpx
from app.tools.base import BaseTool
from app.core.safety import safety_engine

def is_ssrf_safe_url(url: str) -> Tuple[bool, Optional[str]]:
    try:
        parsed = urlparse(url)
    except Exception as e:
        return False, f"Invalid URL format: {e}"

    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Security Error: Unsupported scheme '{parsed.scheme}'. Only HTTP and HTTPS are allowed."

    hostname = parsed.hostname
    if not hostname:
        return False, "Security Error: URL must contain a valid hostname."

    # Direct check for localhost / loopback aliases
    if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return False, "Security Error: Access to localhost or loopback addresses is blocked (SSRF protection)."

    # Resolve IP addresses for hostname
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in addr_infos:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                return False, f"Security Error: Access to private/internal/cloud metadata IP '{ip_str}' is blocked (SSRF protection)."
    except socket.gaierror:
        # Unresolvable host will naturally fail in HTTP client
        pass
    except Exception as e:
        return False, f"Security Error: Failed to validate host security: {e}"

    return True, None

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
        url = kwargs.get("url", "").strip()
        if not url:
            return {"success": False, "error": "URL cannot be empty."}

        is_safe, security_err = is_ssrf_safe_url(url)
        if not is_safe:
            return {"success": False, "error": security_err}

        raw_text = ""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Coagent/1.0"}
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return {"success": False, "error": f"HTTP {resp.status_code}: Failed to fetch '{url}'."}
                html = resp.text
                # Strip script and style tags
                cleaned = re.sub(r"<(script|style).*?>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
                # Strip remaining tags
                text = re.sub(r"<[^>]+>", " ", cleaned)
                # Normalize whitespace
                raw_text = " ".join(text.split())[:8000] # Limit to 8KB
        except Exception as e:
            return {"success": False, "error": f"Failed to fetch '{url}': {str(e)}"}

        if not raw_text:
            return {"success": False, "error": f"No extractable text found at '{url}'."}

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
