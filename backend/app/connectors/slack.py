from typing import Dict, Any
from app.connectors.base import BaseConnector
from app.config import settings
import httpx
from app.tools.web_fetch import is_ssrf_safe_url

class SlackConnector(BaseConnector):
    name = "slack"
    description = "Searches channels, drafts messages, and notifies teams. Sending is gated by approval."
    connector_type = "slack"
    risk_level = "high"
    required_scopes = ["channels:read", "chat:write"]

    def get_required_scopes(self, input_params=None):
        return ["channels:read"] if (input_params or {}).get("action", "list_channels") == "list_channels" else ["chat:write"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list_channels", "post_message"], "default": "list_channels"},
                "channel": {"type": "string", "description": "Target channel name"},
                "message": {"type": "string", "description": "Message body"}
            },
            "required": ["action"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        action = kwargs.get("action", "list_channels")
        channel = kwargs.get("channel", "general")
        msg = kwargs.get("message", "")
        
        if not settings.SLACK_TOKEN:
            return {"success": False, "connector": "slack", "error": "Slack token is not configured."}
        headers = {"Authorization": f"Bearer {settings.SLACK_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                if action == "list_channels":
                    response = await client.get("https://slack.com/api/conversations.list", headers=headers)
                    response.raise_for_status()
                    return {"success": True, "connector": "slack", "channels": response.json().get("channels", [])}
                if action == "post_message":
                    if not channel or not msg:
                        return {"success": False, "connector": "slack", "error": "channel and message are required."}
                    response = await client.post("https://slack.com/api/chat.postMessage", headers=headers, json={"channel": channel, "text": msg})
                    response.raise_for_status()
                    payload = response.json()
                    return {"success": bool(payload.get("ok")), "connector": "slack", "result": payload}
                return {"success": False, "connector": "slack", "error": f"Unsupported action: {action}"}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": "slack", "error": f"Slack request failed: {exc}"}

class WebhookConnector(BaseConnector):
    name = "webhook"
    description = "Dispatches structured payloads to external REST webhooks and APIs."
    connector_type = "webhook"
    risk_level = "medium"
    required_scopes = ["http:egress"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Destination endpoint URL"},
                "payload": {"type": "object", "description": "JSON payload"}
            },
            "required": ["url", "payload"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        url = kwargs.get("url", "")
        payload = kwargs.get("payload", {})
        if not url:
            return {"success": False, "connector": "webhook", "error": "Webhook URL is required."}
        safe, reason = is_ssrf_safe_url(url)
        if not safe:
            return {"success": False, "connector": "webhook", "error": reason or "Webhook URL rejected by SSRF policy."}
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
                response = await client.post(url, json=payload)
            return {"success": response.is_success, "connector": "webhook", "endpoint": url, "status_code": response.status_code, "response": response.text[:2000]}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": "webhook", "endpoint": url, "error": f"Webhook request failed: {exc}"}
