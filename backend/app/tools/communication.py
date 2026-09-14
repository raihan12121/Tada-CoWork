import asyncio
import smtplib
from email.message import EmailMessage
from typing import Dict, Any
from app.tools.base import BaseTool
from app.config import settings

class SendEmailTool(BaseTool):
    name = "send_email"
    description = "Prepares and sends an email to external recipients. Always gated by human approval."
    risk_level = "high"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "recipient": {"type": "string", "description": "Email address of recipient."},
                "subject": {"type": "string", "description": "Email subject line."},
                "body": {"type": "string", "description": "Email body content."}
            },
            "required": ["recipient", "subject", "body"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        recipient = kwargs.get("recipient", "")
        subject = kwargs.get("subject", "")
        body = kwargs.get("body", "")
        
        if settings.DELIVERY_MODE != "live":
            return {
                "success": True,
                "status": "prepared_not_sent",
                "message": "Email prepared for review; delivery is disabled in preview mode.",
                "details": {"recipient": recipient, "subject": subject, "body_preview": body[:100]},
            }
        if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
            return {"success": False, "status": "not_configured", "message": "Live email delivery requires SMTP host and sender configuration."}
        message = EmailMessage()
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)

        def send() -> None:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as client:
                client.starttls()
                if settings.SMTP_USERNAME:
                    client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                client.send_message(message)

        try:
            await asyncio.to_thread(send)
            return {"success": True, "status": "sent", "recipient": recipient, "subject": subject}
        except Exception as exc:
            return {"success": False, "status": "delivery_failed", "error": str(exc)}

class SendSlackMessageTool(BaseTool):
    name = "send_slack_message"
    description = "Posts a message to a Slack channel. Always gated by human approval."
    risk_level = "high"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Channel name or ID."},
                "message": {"type": "string", "description": "Message text to post."}
            },
            "required": ["channel", "message"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        channel = kwargs.get("channel", "")
        message = kwargs.get("message", "")
        
        if settings.DELIVERY_MODE != "live":
            return {
                "success": True,
                "status": "prepared_not_sent",
                "message": "Slack message prepared for review; delivery is disabled in preview mode.",
                "details": {"channel": channel, "preview": message[:100]},
            }
        return {
            "success": False,
            "status": "not_configured",
            "message": "Live Slack delivery requires a connector adapter and explicit production configuration.",
            "details": {
                "channel": channel,
                "preview": message[:100]
            }
        }
