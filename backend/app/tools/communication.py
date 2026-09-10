from typing import Dict, Any
from app.tools.base import BaseTool

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
        
        return {
            "success": True,
            "status": "sent",
            "message": f"Email successfully dispatched to {recipient}.",
            "details": {
                "recipient": recipient,
                "subject": subject,
                "body_preview": body[:100]
            }
        }

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
        
        return {
            "success": True,
            "status": "posted",
            "message": f"Slack notification delivered to channel #{channel}.",
            "details": {
                "channel": channel,
                "preview": message[:100]
            }
        }
