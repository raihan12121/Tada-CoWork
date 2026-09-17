"""Minimal MCP-compatible JSON-RPC surface for local and remote tool hosts.

The internal executor still calls the registry directly for low latency, while
this endpoint gives external tool hosts a stable discovery/call contract. It
does not bypass session allow-lists or approval policy.
"""

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import update

from app.engine.session_manager import session_manager
from app.tools.registry import tool_registry
from app.core.audit import audit_logger
from app.core.safety import safety_engine
from app.core.org_policy import org_policy_manager
from app.db.session import AsyncSessionLocal, DBToolCall, DBSession
from app.config import settings
from app.core.connector_policy import connector_is_allowed
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/mcp", tags=["mcp"])


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str | int
    method: str
    params: Dict[str, Any] = {}


@router.get("/tools")
async def list_mcp_tools():
    return {"jsonrpc": "2.0", "result": {"tools": tool_registry.get_all_schemas()}}


@router.post("/rpc")
async def mcp_rpc(http_request: Request, request: JsonRpcRequest):
    if request.jsonrpc != "2.0":
        raise HTTPException(status_code=400, detail="Only JSON-RPC 2.0 is supported")
    if request.method == "tools/list":
        return {"jsonrpc": "2.0", "id": request.id, "result": {"tools": tool_registry.get_all_schemas()}}
    if request.method != "tools/call":
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32601, "message": "Method not found"}}

    session_id = request.params.get("session_id")
    tool_name = request.params.get("name")
    arguments = request.params.get("arguments", {})
    if not session_id or not tool_name:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32602, "message": "session_id and name are required"}}
    session = await session_manager.get_session(session_id)
    if not session:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32004, "message": "Session not found"}}
    principal = getattr(http_request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    try:
        require_workspace_access(principal, session.workspace_id)
    except PermissionError:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32003, "message": "Workspace access denied"}}
    if tool_name not in session.enabled_tools:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32003, "message": "Tool is not enabled for this session"}}
    if not org_policy_manager.get(session.workspace_id).allows(tool_name):
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32006, "message": "Organization policy blocked this tool"}}
    connector_allowed, connector_reason = await connector_is_allowed(tool_name, arguments)
    if not connector_allowed:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32007, "message": connector_reason}}
    tool = tool_registry.get_tool(tool_name)
    if not tool:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32602, "message": "Unknown tool"}}
    schema = tool.get_schema().model_dump()
    required = schema.get("parameters", {}).get("required", [])
    missing = [name for name in required if name not in arguments]
    if missing:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32602, "message": f"Missing required arguments: {', '.join(missing)}"}}
    required_scopes = set(tool.get_required_scopes(arguments))
    granted_scopes = set(session.granted_scopes)
    if not required_scopes.issubset(granted_scopes):
        missing_scopes = sorted(required_scopes - granted_scopes)
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32004, "message": f"Missing granted scope(s): {', '.join(missing_scopes)}"}}
    if tool_name == "web_fetch":
        arguments["allowed_domains"] = list(session.granted_domains)
    risk, requires_approval, consequence = safety_engine.classify_tool_risk(tool_name, arguments)
    if requires_approval:
        return {"jsonrpc": "2.0", "id": request.id, "error": {"code": -32005, "message": f"Approval required before calling {tool_name}: {consequence}"}}
    audit_logger.log_event(session_id, "mcp_tool_call_start", "mcp", {"tool": tool_name, "params": arguments})
    call_id = str(uuid.uuid4())
    started = time.monotonic()
    async with AsyncSessionLocal() as db:
        db.add(DBToolCall(
            id=call_id,
            session_id=session_id,
            tool=tool_name,
            input_params_json=json.dumps(arguments),
            status="started",
            risk_level=risk,
            timestamp=datetime.now(timezone.utc),
        ))
        await db.commit()
    try:
        result = await tool.execute(session_id=session_id, **arguments)
    except Exception as exc:
        result = {"success": False, "error": str(exc)}
    duration_ms = int((time.monotonic() - started) * 1000)
    async with AsyncSessionLocal() as db:
        await db.execute(update(DBToolCall).where(DBToolCall.id == call_id).values(
            output_data_json=json.dumps(result),
            status="success" if result.get("success") else "failed",
            execution_time_ms=duration_ms,
        ))
        await db.execute(update(DBSession).where(DBSession.id == session_id).values(
            tool_calls_count=DBSession.tool_calls_count + 1,
            total_cost_usd=DBSession.total_cost_usd + settings.ESTIMATED_TOOL_CALL_COST_USD,
            updated_at=datetime.now(timezone.utc),
        ))
        await db.commit()
    audit_logger.log_event(session_id, "mcp_tool_call_end", "mcp", {"tool": tool_name, "risk_level": risk, "success": result.get("success", False)})
    return {"jsonrpc": "2.0", "id": request.id, "result": result}
