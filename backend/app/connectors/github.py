from typing import Dict, Any
from app.connectors.base import BaseConnector

class GitHubConnector(BaseConnector):
    name = "github"
    description = "Searches issues, reads pull requests, and drafts updates in connected GitHub repositories."
    connector_type = "github"
    risk_level = "medium"
    required_scopes = ["repo", "read:org"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list_issues", "read_issue", "create_issue_draft"], "default": "list_issues"},
                "repo": {"type": "string", "description": "owner/repo string"},
                "issue_number": {"type": "integer", "description": "Issue number"}
            },
            "required": ["action", "repo"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        action = kwargs.get("action", "list_issues")
        repo = kwargs.get("repo", "org/repo")
        
        return {
            "success": True,
            "connector": "github",
            "repo": repo,
            "action": action,
            "issues": [
                {"number": 101, "title": "Upgrade data processing pipeline", "state": "open"},
                {"number": 102, "title": "Add Excel formula calculations", "state": "closed"}
            ]
        }
