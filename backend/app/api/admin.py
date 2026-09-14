import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Header
from app.config import settings
from app.core.audit import audit_logger
from app.core.org_policy import org_policy_manager
from app.db.session import AsyncSessionLocal, DBSession, DBActivityEvent, DBOrganization, DBConnectorReview
from app.tools.registry import tool_registry
from pydantic import BaseModel, Field
from sqlalchemy import select, delete

router = APIRouter(prefix="/admin", tags=["admin"])

def _require_admin(x_admin_token: Optional[str]):
    expected = settings.ADMIN_TOKEN or settings.BRIDGE_SECRET
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Admin-Token required.")

class OrganizationPolicyPayload(BaseModel):
    organization_id: str = "default"
    connector_allowlist: List[str] = Field(default_factory=list)
    connector_blocklist: List[str] = Field(default_factory=list)
    retention_days: int = Field(default=30, ge=1, le=3650)
    data_region: str = "local"
    kill_switch: bool = False

class ConnectorReviewPayload(BaseModel):
    version: str = "1.0.0"
    declared_scopes: List[str] = Field(default_factory=list)
    risk_level: str = "medium"
    review_status: str = "approved"

@router.get("/audit/export")
async def export_audit(session_id: Optional[str] = Query(None), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    return audit_logger.export_audit_log(session_id=session_id)

@router.get("/audit/verify")
async def verify_audit_integrity(x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    valid, err = audit_logger.verify_integrity()
    return {
        "integrity_verified": valid,
        "tamper_detected": not valid,
        "error": err
    }

@router.get("/tools")
async def list_tools(x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    return tool_registry.get_all_schemas()

@router.get("/organization/policy")
async def get_organization_policy(organization_id: str = Query("default"), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    policy = org_policy_manager.get(organization_id)
    return {
        "organization_id": organization_id,
        "connector_allowlist": sorted(policy.connector_allowlist),
        "connector_blocklist": sorted(policy.connector_blocklist),
        "retention_days": policy.retention_days,
        "data_region": policy.data_region,
        "kill_switch": policy.kill_switch,
    }

@router.put("/organization/policy")
async def update_organization_policy(payload: OrganizationPolicyPayload, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    policy = org_policy_manager.configure(payload.organization_id, **payload.model_dump(exclude={"organization_id"}))
    async with AsyncSessionLocal() as db:
        org = await db.get(DBOrganization, payload.organization_id)
        if not org:
            org = DBOrganization(id=payload.organization_id, name=payload.organization_id)
            db.add(org)
        org.connector_allowlist_json = json.dumps(payload.connector_allowlist)
        org.connector_blocklist_json = json.dumps(payload.connector_blocklist)
        org.retention_days = payload.retention_days
        org.data_region = payload.data_region
        org.kill_switch = payload.kill_switch
        await db.commit()
    return {"organization_id": payload.organization_id, "kill_switch": policy.kill_switch, "connector_allowlist": sorted(policy.connector_allowlist), "connector_blocklist": sorted(policy.connector_blocklist), "retention_days": policy.retention_days, "data_region": policy.data_region}

@router.get("/usage")
async def organization_usage(x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBSession))
        sessions = result.scalars().all()
    return {
        "session_count": len(sessions),
        "tool_calls": sum(item.tool_calls_count or 0 for item in sessions),
        "estimated_cost_usd": round(sum(item.total_cost_usd or 0.0 for item in sessions), 6),
        "active_sessions": sum(1 for item in sessions if item.status in {"running", "waiting_approval", "paused"}),
    }

@router.get("/marketplace/connectors")
async def list_connector_reviews(x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBConnectorReview).order_by(DBConnectorReview.connector_name.asc()))
        return [{
            "connector_name": row.connector_name,
            "version": row.version,
            "declared_scopes": json.loads(row.declared_scopes_json or "[]"),
            "risk_level": row.risk_level,
            "review_status": row.review_status,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at,
        } for row in result.scalars().all()]

@router.put("/marketplace/connectors/{connector_name}")
async def review_connector(connector_name: str, payload: ConnectorReviewPayload, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    if payload.review_status not in {"pending", "approved", "blocked"}:
        raise HTTPException(status_code=400, detail="review_status must be pending, approved, or blocked")
    async with AsyncSessionLocal() as db:
        row = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))
        review = row.scalar_one_or_none()
        if not review:
            review = DBConnectorReview(id=str(__import__("uuid").uuid4()), connector_name=connector_name)
            db.add(review)
        review.version = payload.version
        review.declared_scopes_json = json.dumps(payload.declared_scopes)
        review.risk_level = payload.risk_level
        review.review_status = payload.review_status
        review.reviewed_by = "admin"
        review.reviewed_at = datetime.now(timezone.utc)
        await db.commit()
    audit_logger.log_event("organization", "connector_reviewed", "admin", {"connector": connector_name, "version": payload.version, "status": payload.review_status, "scopes": payload.declared_scopes})
    return {"connector_name": connector_name, **payload.model_dump(), "reviewed_by": "admin"}

@router.post("/retention/cleanup")
async def retention_cleanup(organization_id: str = Query("default"), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token)
    policy = org_policy_manager.get(organization_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=policy.retention_days)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBSession.id).where(DBSession.workspace_id == organization_id, DBSession.created_at < cutoff))
        session_ids = [row[0] for row in result.all()]
        if session_ids:
            await db.execute(delete(DBActivityEvent).where(DBActivityEvent.session_id.in_(session_ids)))
            await db.execute(delete(DBSession).where(DBSession.id.in_(session_ids)))
            await db.commit()
    audit_logger.log_event("organization", "retention_cleanup", "admin", {"organization_id": organization_id, "deleted_sessions": len(session_ids), "retention_days": policy.retention_days})
    return {"organization_id": organization_id, "deleted_sessions": len(session_ids), "retention_days": policy.retention_days}

@router.post("/kill_all")
async def emergency_kill_switch(x_admin_token: Optional[str] = Header(None)):
    """
    Emergency kill switch suspending all active agent sessions (rules.md §10.2).
    Requires valid X-Admin-Token matching BRIDGE_SECRET.
    """
    _require_admin(x_admin_token)
    from app.engine.session_manager import session_manager
    count = len(session_manager._active_executors)
    for sid, executor in list(session_manager._active_executors.items()):
        executor.cancel()
    return {"status": "emergency_kill_executed", "suspended_sessions": count}
