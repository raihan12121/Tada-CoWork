from typing import Dict, Any
from app.connectors.base import BaseConnector
from app.config import settings
import httpx

class GitHubConnector(BaseConnector):
    name = "github"
    description = "Searches issues, reads pull requests, and drafts updates in connected GitHub repositories."
    connector_type = "github"
    risk_level = "medium"
    required_scopes = ["repo", "read:org"]

    def get_required_scopes(self, input_params=None):
        action = (input_params or {}).get("action", "list_issues")
        return ["repo"] if action == "create_issue_draft" else ["read:org"]

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
        
        if not settings.GITHUB_TOKEN:
            return {"success": False, "connector": "github", "error": "GitHub token is not configured."}
        headers = {"Authorization": f"Bearer {settings.GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                if action == "list_issues":
                    response = await client.get(f"https://api.github.com/repos/{repo}/issues", headers=headers, params={"state": "all"})
                    response.raise_for_status()
                    return {"success": True, "connector": "github", "repo": repo, "action": action, "issues": response.json()}
                if action == "read_issue":
                    issue_number = kwargs.get("issue_number")
                    if not issue_number:
                        return {"success": False, "connector": "github", "error": "issue_number is required."}
                    response = await client.get(f"https://api.github.com/repos/{repo}/issues/{issue_number}", headers=headers)
                    response.raise_for_status()
                    return {"success": True, "connector": "github", "issue": response.json()}
                return {"success": False, "connector": "github", "error": "Creating issues is intentionally disabled until an explicit write-scope grant is implemented."}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": "github", "error": f"GitHub request failed: {exc}"}
