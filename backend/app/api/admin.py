from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.core.audit import audit_logger
from app.tools.registry import tool_registry

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/audit/export")
async def export_audit(session_id: Optional[str] = Query(None)):
    return audit_logger.export_audit_log(session_id=session_id)

@router.get("/audit/verify")
async def verify_audit_integrity():
    valid, err = audit_logger.verify_integrity()
    return {
        "integrity_verified": valid,
        "tamper_detected": not valid,
        "error": err
    }

@router.get("/tools")
async def list_tools():
    return tool_registry.get_all_schemas()

@router.post("/kill_all")
async def emergency_kill_switch():
    """
    Emergency kill switch suspending all active agent sessions (rules.md §10.2).
    """
    from app.engine.session_manager import session_manager
    count = len(session_manager._active_executors)
    for sid, executor in list(session_manager._active_executors.items()):
        executor.cancel()
    return {"status": "emergency_kill_executed", "suspended_sessions": count}
