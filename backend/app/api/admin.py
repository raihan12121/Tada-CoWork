import json
import re
import hashlib
import hmac
import io
import zipfile
import tarfile
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Header, Request, UploadFile, File
from app.config import settings
from app.core.audit import audit_logger
from app.core.org_policy import org_policy_manager
from app.db.session import AsyncSessionLocal, DBSession, DBActivityEvent, DBOrganization, DBConnectorReview
from app.tools.registry import tool_registry
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, update
from app.core.identity import Principal, identity_verification_configured

router = APIRouter(prefix="/admin", tags=["admin"])

_DANGEROUS_PACKAGE_SUFFIXES = {".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".ps1", ".scr", ".com"}


def _scan_package_bytes(package_bytes: bytes) -> dict:
    """Perform a dependency-free, non-executing package safety scan."""
    names: list[str] = []
    archive_type = None
    try:
        with zipfile.ZipFile(io.BytesIO(package_bytes)) as archive:
            archive_type = "zip"
            for entry in archive.infolist():
                name = entry.filename.replace("\\", "/")
                names.append(name)
                if name.startswith("/") or any(part == ".." for part in Path(name).parts):
                    return {"status": "rejected", "reason": "archive path traversal", "archive_type": archive_type}
                mode = (entry.external_attr >> 16) & 0o170000
                if mode == 0o120000:
                    return {"status": "rejected", "reason": "archive symlink is not allowed", "archive_type": archive_type}
    except (zipfile.BadZipFile, OSError):
        try:
            with tarfile.open(fileobj=io.BytesIO(package_bytes), mode="r:*") as archive:
                archive_type = "tar"
                for entry in archive.getmembers():
                    name = entry.name.replace("\\", "/")
                    names.append(name)
                    if name.startswith("/") or any(part == ".." for part in Path(name).parts):
                        return {"status": "rejected", "reason": "archive path traversal", "archive_type": archive_type}
                    if entry.issym() or entry.islnk():
                        return {"status": "rejected", "reason": "archive links are not allowed", "archive_type": archive_type}
        except (tarfile.TarError, OSError):
            return {"status": "rejected", "reason": "package is not a supported ZIP or TAR archive"}
    dangerous = sorted(name for name in names if Path(name).suffix.lower() in _DANGEROUS_PACKAGE_SUFFIXES)
    if dangerous:
        return {"status": "rejected", "reason": "dangerous executable file in package", "files": dangerous[:20], "archive_type": archive_type}
    return {"status": "passed", "archive_type": archive_type, "file_count": len(names), "files": names[:200]}

def _require_admin(x_admin_token: Optional[str], request: Optional[Request] = None):
    expected = settings.ADMIN_TOKEN or settings.BRIDGE_SECRET
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Admin-Token required.")
    if identity_verification_configured() and request is not None:
        principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset(), frozenset()))
        if not principal.is_admin:
            raise HTTPException(status_code=403, detail="Organization administrator role required.")

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
    package_url: Optional[str] = None
    package_sha256: Optional[str] = None
    signature: Optional[str] = None
    data_access: List[str] = Field(default_factory=list)


def _validate_connector_manifest(connector_name: str, payload: ConnectorReviewPayload, require_approval_manifest: bool = False) -> None:
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$", connector_name):
        raise HTTPException(status_code=400, detail="Invalid connector name")
    if payload.risk_level not in {"low", "medium", "high"}:
        raise HTTPException(status_code=400, detail="risk_level must be low, medium, or high")
    if not payload.version.strip():
        raise HTTPException(status_code=400, detail="version is required")
    if payload.package_url and not payload.package_url.lower().startswith("https://"):
        raise HTTPException(status_code=400, detail="package_url must use HTTPS")
    if payload.package_sha256 and not re.match(r"^[a-fA-F0-9]{64}$", payload.package_sha256):
        raise HTTPException(status_code=400, detail="package_sha256 must be a 64-character SHA-256 digest")
    if len(set(payload.declared_scopes)) != len(payload.declared_scopes):
        raise HTTPException(status_code=400, detail="declared_scopes must not contain duplicates")
    if require_approval_manifest and not payload.declared_scopes:
        raise HTTPException(status_code=400, detail="Approved connectors must declare scopes")
    if require_approval_manifest and settings.MARKETPLACE_SIGNING_SECRET:
        if not payload.package_url or not payload.package_sha256 or not payload.signature:
            raise HTTPException(status_code=400, detail="Approved connectors require a signed package manifest")
        manifest = {
            "connector_name": connector_name,
            "version": payload.version,
            "declared_scopes": payload.declared_scopes,
            "risk_level": payload.risk_level,
            "package_url": payload.package_url,
            "package_sha256": payload.package_sha256.lower(),
            "data_access": payload.data_access,
        }
        canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
        expected = hmac.new(settings.MARKETPLACE_SIGNING_SECRET.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
        supplied = payload.signature.removeprefix("hmac-sha256:").strip().lower()
        if not hmac.compare_digest(supplied, expected):
            raise HTTPException(status_code=400, detail="Connector manifest signature verification failed")
    tool = tool_registry.get_tool(connector_name)
    if tool and require_approval_manifest:
        declared = set(payload.declared_scopes)
        expected = set(getattr(tool, "required_scopes", []) or [])
        if not expected.issubset(declared):
            raise HTTPException(status_code=400, detail="Declared scopes do not cover the connector manifest")

@router.get("/audit/export")
async def export_audit(request: Request, session_id: Optional[str] = Query(None), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
    return audit_logger.export_audit_log(session_id=session_id)

@router.get("/audit/verify")
async def verify_audit_integrity(request: Request, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
    valid, err = audit_logger.verify_integrity()
    return {
        "integrity_verified": valid,
        "tamper_detected": not valid,
        "error": err
    }

@router.get("/tools")
async def list_tools(request: Request, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
    return tool_registry.get_all_schemas()

@router.get("/organization/policy")
async def get_organization_policy(request: Request, organization_id: str = Query("default"), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
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
async def update_organization_policy(request: Request, payload: OrganizationPolicyPayload, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
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
async def organization_usage(request: Request, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
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
async def list_connector_reviews(request: Request, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
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
            "package_url": row.package_url,
            "package_sha256": row.package_sha256,
            "signature": row.signature,
            "data_access": json.loads(row.data_access_json or "[]"),
            "package_path": row.package_path,
            "scan_status": row.scan_status,
            "scan_report": json.loads(row.scan_report_json or "{}"),
        } for row in result.scalars().all()]

@router.put("/marketplace/connectors/{connector_name}")
async def review_connector(request: Request, connector_name: str, payload: ConnectorReviewPayload, x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
    if payload.review_status not in {"pending", "approved", "blocked"}:
        raise HTTPException(status_code=400, detail="review_status must be pending, approved, or blocked")
    _validate_connector_manifest(connector_name, payload, require_approval_manifest=payload.review_status == "approved")
    async with AsyncSessionLocal() as db:
        row = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))
        review = row.scalar_one_or_none()
        previous_package_sha256 = review.package_sha256 if review else None
        if review and review.review_status == "approved" and payload.review_status == "approved":
            existing_manifest = {
                "version": review.version,
                "declared_scopes": json.loads(review.declared_scopes_json or "[]"),
                "risk_level": review.risk_level,
                "package_url": review.package_url,
                "package_sha256": review.package_sha256,
                "signature": review.signature,
                "data_access": json.loads(review.data_access_json or "[]"),
            }
            requested_manifest = payload.model_dump(exclude={"review_status"})
            if existing_manifest != requested_manifest:
                raise HTTPException(
                    status_code=409,
                    detail="Approved connector manifests are immutable; submit the new version for re-approval first.",
                )
        if payload.review_status == "approved" and settings.MARKETPLACE_REQUIRE_PACKAGE_SCAN and payload.package_sha256:
            if not review or review.scan_status != "passed" or review.package_sha256 != payload.package_sha256:
                raise HTTPException(status_code=409, detail="Package must pass the marketplace scan before approval")
        if not review:
            review = DBConnectorReview(id=str(__import__("uuid").uuid4()), connector_name=connector_name)
            db.add(review)
        review.version = payload.version
        review.declared_scopes_json = json.dumps(payload.declared_scopes)
        review.risk_level = payload.risk_level
        review.review_status = payload.review_status
        review.reviewed_by = "admin"
        review.reviewed_at = datetime.now(timezone.utc)
        review.package_url = payload.package_url
        review.package_sha256 = payload.package_sha256
        review.signature = payload.signature
        review.data_access_json = json.dumps(payload.data_access)
        if payload.package_sha256 != previous_package_sha256:
            review.package_path = None
            review.scan_status = "not_submitted"
            review.scan_report_json = "{}"
        await db.commit()
    audit_logger.log_event("organization", "connector_reviewed", "admin", {"connector": connector_name, "version": payload.version, "status": payload.review_status, "scopes": payload.declared_scopes})
    return {"connector_name": connector_name, **payload.model_dump(), "reviewed_by": "admin"}


@router.post("/marketplace/connectors/{connector_name}/submit")
async def submit_connector(request: Request, connector_name: str, payload: ConnectorReviewPayload, x_admin_token: Optional[str] = Header(None)):
    """Register a connector manifest for review without enabling it."""
    _require_admin(x_admin_token, request)
    _validate_connector_manifest(connector_name, payload, require_approval_manifest=False)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))
        review = result.scalar_one_or_none()
        if not review:
            review = DBConnectorReview(id=str(__import__("uuid").uuid4()), connector_name=connector_name)
            db.add(review)
        review.version = payload.version
        review.declared_scopes_json = json.dumps(payload.declared_scopes)
        review.risk_level = payload.risk_level
        review.review_status = "pending"
        review.reviewed_by = None
        review.reviewed_at = None
        review.package_url = payload.package_url
        review.package_sha256 = payload.package_sha256
        review.signature = payload.signature
        review.data_access_json = json.dumps(payload.data_access)
        review.package_path = None
        review.scan_status = "not_submitted"
        review.scan_report_json = "{}"
        await db.commit()
    audit_logger.log_event("organization", "connector_submitted", "admin", {
        "connector": connector_name,
        "version": payload.version,
        "scopes": payload.declared_scopes,
        "risk_level": payload.risk_level,
    })
    return {"connector_name": connector_name, **payload.model_dump(exclude={"review_status"}), "review_status": "pending"}


@router.post("/marketplace/connectors/{connector_name}/package")
async def upload_connector_package(
    request: Request,
    connector_name: str,
    file: UploadFile = File(...),
    x_admin_token: Optional[str] = Header(None),
):
    """Stage and scan a connector package without importing or executing it."""
    _require_admin(x_admin_token, request)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))
        review = result.scalar_one_or_none()
        if not review or review.review_status != "pending":
            raise HTTPException(status_code=409, detail="Connector must have a pending manifest before package upload")
        if not review.package_sha256:
            raise HTTPException(status_code=400, detail="Manifest must declare package_sha256 before upload")
        package_bytes = await file.read(settings.MARKETPLACE_MAX_PACKAGE_BYTES + 1)
        if len(package_bytes) > settings.MARKETPLACE_MAX_PACKAGE_BYTES:
            raise HTTPException(status_code=413, detail="Connector package exceeds the configured size limit")
        digest = hashlib.sha256(package_bytes).hexdigest()
        if not hmac.compare_digest(digest, review.package_sha256.lower()):
            raise HTTPException(status_code=400, detail="Uploaded package digest does not match the submitted manifest")
        scan = _scan_package_bytes(package_bytes)
        review.scan_status = scan["status"]
        review.scan_report_json = json.dumps(scan)
        if scan["status"] == "passed":
            package_dir = settings.DATA_DIR / "marketplace" / "pending" / connector_name
            package_dir.mkdir(parents=True, exist_ok=True)
            safe_name = f"{review.version}-{digest}.package"
            package_path = package_dir / safe_name
            package_path.write_bytes(package_bytes)
            review.package_path = str(package_path)
        else:
            review.package_path = None
        await db.commit()
    audit_logger.log_event("organization", "connector_package_scanned", "admin", {
        "connector": connector_name,
        "version": review.version,
        "scan_status": review.scan_status,
        "digest": review.package_sha256,
    })
    return {"connector_name": connector_name, "scan_status": review.scan_status, "scan_report": scan}

@router.post("/retention/cleanup")
async def retention_cleanup(request: Request, organization_id: str = Query("default"), x_admin_token: Optional[str] = Header(None)):
    _require_admin(x_admin_token, request)
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
async def emergency_kill_switch(request: Request, x_admin_token: Optional[str] = Header(None)):
    """
    Emergency kill switch suspending all active agent sessions (rules.md §10.2).
    Requires valid X-Admin-Token matching BRIDGE_SECRET.
    """
    _require_admin(x_admin_token, request)
    from app.engine.session_manager import session_manager
    count = len(session_manager._active_executors)
    for sid, executor in list(session_manager._active_executors.items()):
        executor.cancel()
    if count:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(DBSession)
                .where(DBSession.id.in_(list(session_manager._active_executors.keys())))
                .where(DBSession.status.in_({"running", "waiting_approval", "paused"}))
                .values(status="cancelled", updated_at=datetime.now(timezone.utc))
            )
            await db.commit()
    audit_logger.log_event("organization", "emergency_kill", "admin", {"suspended_sessions": count})
    return {"status": "emergency_kill_executed", "suspended_sessions": count}
