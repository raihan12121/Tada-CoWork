import base64
from email.message import EmailMessage
from typing import Dict, Any
import httpx
from app.connectors.base import BaseConnector
from app.config import settings


class GmailConnector(BaseConnector):
    name = "gmail"
    description = "Reads Gmail messages and creates reviewable drafts through the Gmail API."
    connector_type = "gmail"
    risk_level = "high"
    required_scopes = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"]

    def get_required_scopes(self, input_params=None):
        action = (input_params or {}).get("action", "list_messages")
        return ["https://www.googleapis.com/auth/gmail.compose"] if action == "create_draft" else ["https://www.googleapis.com/auth/gmail.readonly"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {"type": "object", "properties": {
            "action": {"type": "string", "enum": ["list_messages", "read_message", "create_draft"]},
            "message_id": {"type": "string"}, "query": {"type": "string"},
            "recipient": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"},
        }, "required": ["action"]}

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        if not settings.GOOGLE_GMAIL_ACCESS_TOKEN:
            return {"success": False, "connector": self.name, "error": "Gmail access token is not configured."}
        action = kwargs.get("action", "list_messages")
        headers = {"Authorization": f"Bearer {settings.GOOGLE_GMAIL_ACCESS_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                if action == "list_messages":
                    response = await client.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", headers=headers, params={"q": kwargs.get("query", ""), "maxResults": 50})
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "messages": response.json().get("messages", [])}
                if action == "read_message":
                    message_id = kwargs.get("message_id")
                    if not message_id:
                        return {"success": False, "connector": self.name, "error": "message_id is required."}
                    response = await client.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}", headers=headers, params={"format": "full"})
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "message": response.json()}
                if action == "create_draft":
                    message = EmailMessage()
                    message["To"] = kwargs.get("recipient", "")
                    message["Subject"] = kwargs.get("subject", "")
                    message.set_content(kwargs.get("body", ""))
                    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
                    response = await client.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts", headers={**headers, "Content-Type": "application/json"}, json={"message": {"raw": raw}})
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "draft": response.json(), "status": "draft_created_not_sent"}
                return {"success": False, "connector": self.name, "error": f"Unsupported action: {action}"}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": self.name, "error": f"Gmail request failed: {exc}"}


class OutlookConnector(BaseConnector):
    name = "outlook"
    description = "Reads Outlook messages and creates reviewable drafts through Microsoft Graph."
    connector_type = "outlook"
    risk_level = "high"
    required_scopes = ["Mail.Read", "Mail.ReadWrite"]

    def get_required_scopes(self, input_params=None):
        return ["Mail.ReadWrite"] if (input_params or {}).get("action") == "create_draft" else ["Mail.Read"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {"type": "object", "properties": {
            "action": {"type": "string", "enum": ["list_messages", "read_message", "create_draft"]},
            "message_id": {"type": "string"}, "query": {"type": "string"},
            "recipient": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"},
        }, "required": ["action"]}

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        if not settings.MICROSOFT_GRAPH_TOKEN:
            return {"success": False, "connector": self.name, "error": "Microsoft Graph token is not configured."}
        action = kwargs.get("action", "list_messages")
        headers = {"Authorization": f"Bearer {settings.MICROSOFT_GRAPH_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                if action == "list_messages":
                    response = await client.get("https://graph.microsoft.com/v1.0/me/messages", headers=headers, params={"$top": "50", "$search": kwargs.get("query", "")})
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "messages": response.json().get("value", [])}
                if action == "read_message":
                    message_id = kwargs.get("message_id")
                    if not message_id:
                        return {"success": False, "connector": self.name, "error": "message_id is required."}
                    response = await client.get(f"https://graph.microsoft.com/v1.0/me/messages/{message_id}", headers=headers)
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "message": response.json()}
                if action == "create_draft":
                    payload = {"subject": kwargs.get("subject", ""), "body": {"contentType": "Text", "content": kwargs.get("body", "")}, "toRecipients": [{"emailAddress": {"address": kwargs.get("recipient", "")}}]}
                    response = await client.post("https://graph.microsoft.com/v1.0/me/messages", headers={**headers, "Content-Type": "application/json"}, json=payload)
                    response.raise_for_status()
                    return {"success": True, "connector": self.name, "draft": response.json(), "status": "draft_created_not_sent"}
                return {"success": False, "connector": self.name, "error": f"Unsupported action: {action}"}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": self.name, "error": f"Microsoft Graph request failed: {exc}"}
