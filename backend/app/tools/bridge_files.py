"""Tools for explicit, session-scoped local bridge file access.

The orchestrator never opens the user's folder itself. Every operation is
forwarded to the registered desktop agent, which performs its own containment
check and returns a structured result.
"""

from typing import Any, Dict

import httpx

from app.config import settings
from app.tools.base import BaseTool


class _BridgeFileTool(BaseTool):
    required_scopes = ["bridge:files"]

    async def _request(self, session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        # The orchestrator endpoint is only useful when a desktop agent has
        # explicitly been configured. Without that transport, fail closed
        # instead of issuing a request to the local API and reporting a
        # misleading HTTP error.
        if not settings.BRIDGE_AGENT_URL or not settings.ORCHESTRATOR_URL:
            return {"success": False, "status": "bridge_offline", "error": "Bridge orchestrator URL is not configured."}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{settings.ORCHESTRATOR_URL.rstrip('/')}/v1/bridge/request",
                    headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
                    json={"session_id": session_id, **payload},
                )
            if response.status_code >= 400:
                try:
                    detail = response.json().get("detail", "Bridge request failed.")
                except Exception:
                    detail = response.text or "Bridge request failed."
                return {"success": False, "status": "bridge_error", "error": detail}
            return {"success": True, **response.json()}
        except Exception as exc:
            return {"success": False, "status": "bridge_offline", "error": f"Bridge request failed: {exc}"}


class BridgeListFilesTool(_BridgeFileTool):
    name = "bridge_list_files"
    description = "Lists files in an explicitly granted local folder through the desktop bridge."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Absolute granted folder path."},
                "relative_file": {"type": "string", "default": ".", "description": "Relative directory inside the granted folder."},
            },
            "required": ["folder"],
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        return await self._request(session_id, {
            "folder": kwargs.get("folder", ""),
            "relative_file": kwargs.get("relative_file", "."),
            "action": "list",
        })


class BridgeReadFileTool(_BridgeFileTool):
    name = "bridge_read_file"
    description = "Reads a file from an explicitly granted local folder through the desktop bridge."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Absolute granted folder path."},
                "relative_file": {"type": "string", "description": "Relative file inside the granted folder."},
            },
            "required": ["folder", "relative_file"],
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        return await self._request(session_id, {
            "folder": kwargs.get("folder", ""),
            "relative_file": kwargs.get("relative_file", ""),
            "action": "read",
        })


class BridgeMoveFileTool(_BridgeFileTool):
    name = "bridge_move_file"
    description = "Moves a file inside an explicitly granted local folder through the desktop bridge."
    risk_level = "medium"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Absolute granted folder path."},
                "relative_file": {"type": "string", "description": "Relative source file."},
                "destination_file": {"type": "string", "description": "Relative destination file."},
            },
            "required": ["folder", "relative_file", "destination_file"],
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        return await self._request(session_id, {
            "folder": kwargs.get("folder", ""),
            "relative_file": kwargs.get("relative_file", ""),
            "destination_file": kwargs.get("destination_file", ""),
            "action": "move",
        })
