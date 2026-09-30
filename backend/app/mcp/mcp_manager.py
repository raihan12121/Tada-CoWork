import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from sqlalchemy import select, delete

from app.db.session import AsyncSessionLocal, DBMcpServer
from app.models.schemas import McpServerModel, McpServerCreate, RiskLevel
from app.tools.base import BaseTool, ToolSchema
from app.tools.registry import tool_registry

logger = logging.getLogger(__name__)

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

class DynamicMcpTool(BaseTool):
    """Dynamically registered tool from an external MCP server."""

    def __init__(
        self,
        server_id: str,
        name: str,
        description: str,
        parameters_schema: Dict[str, Any],
        endpoint_url: str,
        auth_headers: Optional[Dict[str, str]] = None,
        risk_level: RiskLevel = "medium",
        required_scopes: Optional[List[str]] = None
    ):
        self.server_id = server_id
        self.name = name
        self.description = description or f"MCP tool {name} provided by external server"
        self._parameters_schema = parameters_schema or {"type": "object", "properties": {}}
        self.endpoint_url = endpoint_url
        self.auth_headers = auth_headers or {}
        self.risk_level = risk_level
        self.required_scopes = required_scopes or ["external_mcp"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return self._parameters_schema

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        # JSON-RPC 2.0 tools/call payload
        rpc_payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/call",
            "params": {
                "name": self.name,
                "arguments": kwargs,
                "session_id": session_id
            }
        }
        headers = {"Content-Type": "application/json", **self.auth_headers}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(self.endpoint_url, json=rpc_payload, headers=headers)
                if resp.status_code != 200:
                    return {
                        "success": False,
                        "error": f"MCP server returned HTTP {resp.status_code}: {resp.text[:500]}"
                    }
                data = resp.json()
                if "error" in data:
                    err = data["error"]
                    err_msg = err.get("message") if isinstance(err, dict) else str(err)
                    return {"success": False, "error": f"MCP Tool Error: {err_msg}"}
                result = data.get("result", {})
                if isinstance(result, dict) and "success" not in result:
                    result["success"] = True
                return result if isinstance(result, dict) else {"success": True, "result": result}
        except Exception as exc:
            logger.error("Failed to execute dynamic MCP tool %s: %s", self.name, exc)
            return {"success": False, "error": f"Failed to reach MCP server: {str(exc)}"}

class McpManager:
    def __init__(self):
        self._server_tools: Dict[str, List[str]] = {}

    async def discover_tools(self, server_url: str, auth_headers: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """Query an external MCP server for available tools."""
        headers = {"Content-Type": "application/json", **(auth_headers or {})}
        # Attempt 1: Standard JSON-RPC tools/list
        rpc_payload = {
            "jsonrpc": "2.0",
            "id": "discover-1",
            "method": "tools/list",
            "params": {}
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    resp = await client.post(server_url, json=rpc_payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        tools = data.get("result", {}).get("tools", [])
                        if tools:
                            return tools
                except Exception:
                    pass

                # Attempt 2: REST GET /tools if URL or base supports it
                tools_url = server_url.rstrip("/")
                if not tools_url.endswith("/tools"):
                    tools_url = f"{tools_url}/tools"
                resp = await client.get(tools_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    tools = data.get("result", {}).get("tools", []) or data.get("tools", [])
                    if isinstance(tools, list):
                        return tools
        except Exception as exc:
            logger.warning("Could not discover tools from %s: %s", server_url, exc)
        return []

    async def list_servers(self, workspace_id: str = "default") -> List[McpServerModel]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(DBMcpServer).where(DBMcpServer.workspace_id == workspace_id))
            records = result.scalars().all()
            return [
                McpServerModel(
                    id=r.id,
                    workspace_id=r.workspace_id,
                    name=r.name,
                    server_url=r.server_url,
                    transport=r.transport or "http",
                    status=r.status or "connected",
                    last_synced_at=r.last_synced_at,
                    tools_count=r.tools_count or 0,
                    discovered_tools=json.loads(r.discovered_tools_json or "[]"),
                    created_at=r.created_at,
                    updated_at=r.updated_at
                )
                for r in records
            ]

    async def register_server(self, payload: McpServerCreate) -> McpServerModel:
        server_id = str(uuid.uuid4())
        # Discover tools
        discovered = await self.discover_tools(payload.server_url, payload.auth_headers)
        
        async with AsyncSessionLocal() as db:
            record = DBMcpServer(
                id=server_id,
                workspace_id=payload.workspace_id,
                name=payload.name,
                server_url=payload.server_url,
                transport=payload.transport,
                auth_header_json=json.dumps(payload.auth_headers or {}),
                status="connected",
                last_synced_at=_utc_now(),
                tools_count=len(discovered),
                discovered_tools_json=json.dumps(discovered),
                created_at=_utc_now(),
                updated_at=_utc_now()
            )
            db.add(record)
            await db.commit()

        # Register discovered tools into tool_registry
        registered_names: List[str] = []
        for t in discovered:
            t_name = t.get("name")
            if not t_name:
                continue
            dynamic_tool = DynamicMcpTool(
                server_id=server_id,
                name=t_name,
                description=t.get("description", ""),
                parameters_schema=t.get("parameters") or t.get("inputSchema") or {"type": "object", "properties": {}},
                endpoint_url=payload.server_url,
                auth_headers=payload.auth_headers,
                risk_level=t.get("risk_level", "medium"),
                required_scopes=t.get("required_scopes", ["external_mcp"])
            )
            tool_registry.register_tool(dynamic_tool)
            registered_names.append(t_name)

        self._server_tools[server_id] = registered_names

        return McpServerModel(
            id=server_id,
            workspace_id=payload.workspace_id,
            name=payload.name,
            server_url=payload.server_url,
            transport=payload.transport,
            status="connected",
            last_synced_at=_utc_now(),
            tools_count=len(discovered),
            discovered_tools=discovered,
            created_at=_utc_now(),
            updated_at=_utc_now()
        )

    async def sync_server(self, server_id: str) -> Optional[McpServerModel]:
        async with AsyncSessionLocal() as db:
            record = (await db.execute(select(DBMcpServer).where(DBMcpServer.id == server_id))).scalar_one_or_none()
            if not record:
                return None
            
            auth_headers = json.loads(record.auth_header_json or "{}")
            discovered = await self.discover_tools(record.server_url, auth_headers)
            
            # Unregister previous
            for old_name in self._server_tools.get(server_id, []):
                tool_registry.unregister_tool(old_name)

            # Register new
            registered_names: List[str] = []
            for t in discovered:
                t_name = t.get("name")
                if not t_name:
                    continue
                dynamic_tool = DynamicMcpTool(
                    server_id=server_id,
                    name=t_name,
                    description=t.get("description", ""),
                    parameters_schema=t.get("parameters") or t.get("inputSchema") or {"type": "object", "properties": {}},
                    endpoint_url=record.server_url,
                    auth_headers=auth_headers,
                    risk_level=t.get("risk_level", "medium"),
                    required_scopes=t.get("required_scopes", ["external_mcp"])
                )
                tool_registry.register_tool(dynamic_tool)
                registered_names.append(t_name)

            self._server_tools[server_id] = registered_names
            record.tools_count = len(discovered)
            record.discovered_tools_json = json.dumps(discovered)
            record.last_synced_at = _utc_now()
            record.updated_at = _utc_now()
            await db.commit()

            return McpServerModel(
                id=record.id,
                workspace_id=record.workspace_id,
                name=record.name,
                server_url=record.server_url,
                transport=record.transport or "http",
                status="connected",
                last_synced_at=record.last_synced_at,
                tools_count=record.tools_count,
                discovered_tools=discovered,
                created_at=record.created_at,
                updated_at=record.updated_at
            )

    async def delete_server(self, server_id: str) -> bool:
        # Unregister tools
        for old_name in self._server_tools.get(server_id, []):
            tool_registry.unregister_tool(old_name)
        self._server_tools.pop(server_id, None)

        async with AsyncSessionLocal() as db:
            result = await db.execute(delete(DBMcpServer).where(DBMcpServer.id == server_id))
            await db.commit()
            return result.rowcount > 0

    async def sync_all_servers(self):
        """Bootstraps all configured external MCP servers into the tool registry."""
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(DBMcpServer))
                servers = result.scalars().all()
                for s in servers:
                    auth_headers = json.loads(s.auth_header_json or "{}")
                    tools = json.loads(s.discovered_tools_json or "[]")
                    registered_names: List[str] = []
                    for t in tools:
                        t_name = t.get("name")
                        if not t_name:
                            continue
                        dynamic_tool = DynamicMcpTool(
                            server_id=s.id,
                            name=t_name,
                            description=t.get("description", ""),
                            parameters_schema=t.get("parameters") or t.get("inputSchema") or {"type": "object", "properties": {}},
                            endpoint_url=s.server_url,
                            auth_headers=auth_headers,
                            risk_level=t.get("risk_level", "medium"),
                            required_scopes=t.get("required_scopes", ["external_mcp"])
                        )
                        tool_registry.register_tool(dynamic_tool)
                        registered_names.append(t_name)
                    self._server_tools[s.id] = registered_names
                    logger.info("Registered %d tools from MCP server %s", len(registered_names), s.name)
        except Exception as exc:
            logger.warning("Failed to sync MCP servers on startup: %s", exc)

mcp_manager = McpManager()
