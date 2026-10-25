from typing import Dict, Any
import httpx
from app.tools.base import BaseTool
from app.config import settings
from app.sandbox.browser_service import browser_service

class BrowserAutomationTool(BaseTool):
    name = "browser_automation"
    description = "Requests a scoped navigate, click, type, or screenshot action from the agent's dedicated Chromium browser engine. Login, payment, and CAPTCHA actions require takeover mode."
    risk_level = "medium"
    required_scopes = ["browser:control"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["navigate", "click", "type", "screenshot", "takeover", "get_text"]},
                "url": {"type": "string"},
                "selector": {"type": "string"},
                "text": {"type": "string"},
                "x": {"type": "integer"},
                "y": {"type": "integer"}
            },
            "required": ["action"],
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        action = kwargs.get("action", "")
        if action not in {"navigate", "click", "type", "screenshot", "takeover", "get_text"}:
            return {"success": False, "error": f"Unsupported browser action: {action}"}

        if action == "takeover":
            target_url = kwargs.get("url") or "https://example.com/checkout"
            return {
                "success": True,
                "status": "takeover_required",
                "takeover_mode": True,
                "url": target_url,
                "message": f"Sensitive browser step at {target_url} requires human takeover. Control handed back to user."
            }

        # First priority: Native Chromium Browser Service (Agent Computer engine)
        try:
            started = await browser_service.ensure_started()
            if started:
                if action == "navigate":
                    target_url = kwargs.get("url") or "https://www.google.com"
                    nav_res = await browser_service.navigate(target_url)
                    return {
                        "success": nav_res.get("success", False),
                        "url": nav_res.get("url"),
                        "title": nav_res.get("title"),
                        "screenshot": bool(nav_res.get("screenshot"))
                    }
                elif action == "click":
                    x = kwargs.get("x", 640)
                    y = kwargs.get("y", 400)
                    return await browser_service.click(x, y)
                elif action == "type":
                    txt = kwargs.get("text", "")
                    return await browser_service.type_text(txt)
                elif action == "screenshot":
                    data = await browser_service.capture_screenshot()
                    return {"success": True, "screenshot": data}
                elif action == "get_text":
                    txt = await browser_service.get_page_text()
                    return {"success": True, "text": txt[:8000]}
        except Exception as e:
            # Fall back to desktop bridge if native service failed
            pass

        # Fallback: External bridge agent if configured
        if not settings.BRIDGE_AGENT_URL:
            return {"success": False, "status": "bridge_offline", "error": "Browser engine is not running and no bridge agent is configured."}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{settings.ORCHESTRATOR_URL.rstrip('/')}/v1/bridge/browser_request",
                    headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
                    json={"session_id": session_id, "action": action, "url": kwargs.get("url"), "selector": kwargs.get("selector"), "text": kwargs.get("text")},
                )
            return response.json()
        except Exception as exc:
            return {"success": False, "status": "bridge_offline", "error": f"Browser bridge request failed: {exc}"}
