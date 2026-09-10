from typing import Dict, Any
from app.connectors.base import BaseConnector

class SlackConnector(BaseConnector):
    name = "slack"
    description = "Searches channels, drafts messages, and notifies teams. Sending is gated by approval."
    connector_type = "slack"
    risk_level = "high"
    required_scopes = ["channels:read", "chat:write"]

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
        
        if action == "post_message":
            return {
                "success": True,
                "connector": "slack",
                "status": "posted",
                "channel": channel,
                "preview": msg[:80]
            }
        return {
            "success": True,
            "connector": "slack",
            "channels": ["general", "engineering", "announcements", "product-updates"]
        }

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
        return {
            "success": True,
            "connector": "webhook",
            "endpoint": url,
            "status_code": 200,
            "response": {"received": True, "keys": list(payload.keys())}
        }
