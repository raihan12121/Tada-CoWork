from typing import Dict, Any
import httpx
from app.tools.base import BaseTool
from app.config import settings


class BrowserAutomationTool(BaseTool):
    name = "browser_automation"
    description = "Requests a scoped navigate, click, type, or screenshot action from the user's connected browser bridge. Login, payment, and CAPTCHA actions require takeover mode."
    risk_level = "medium"
    required_scopes = ["browser:control"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["navigate", "click", "type", "screenshot", "takeover"]},
                "url": {"type": "string"},
                "selector": {"type": "string"},
                "text": {"type": "string"},
            },
            "required": ["action"],
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        action = kwargs.get("action", "")
        if action not in {"navigate", "click", "type", "screenshot", "takeover"}:
            return {"success": False, "error": f"Unsupported browser action: {action}"}
        if not settings.BRIDGE_AGENT_URL:
            return {"success": False, "status": "bridge_offline", "error": "Browser bridge is not configured; no browser action was performed."}
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
