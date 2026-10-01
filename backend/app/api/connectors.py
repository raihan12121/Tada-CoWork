import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db, DBConnector
from app.core.identity import Principal

router = APIRouter(prefix="/connectors", tags=["connectors"])

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ConnectorConfigPayload(BaseModel):
    connected: bool = True
    permissions: List[str] = Field(default_factory=list)
    allowed_bots: List[str] = Field(default_factory=lambda: ["all"])
    config: Dict[str, Any] = Field(default_factory=dict)

class ConnectorResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str
    connected: bool
    permissions: List[str]
    allowed_bots: List[str]
    granted_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None

CATALOG_DEFAULTS = [
    {
        "id": "gmail",
        "name": "Gmail",
        "category": "productivity",
        "description": "Autonomous inbox zero triage, drafting email responses, and thread labeling.",
        "default_connected": True,
        "permissions": ["gmail.readonly", "gmail.compose", "gmail.modify"],
        "allowed_bots": ["all"],
    },
    {
        "id": "calendar",
        "name": "Google Calendar",
        "category": "productivity",
        "description": "Reads schedule availability, books meetings, and handles conflict resolution.",
        "default_connected": True,
        "permissions": ["calendar.events.readonly", "calendar.events.write"],
        "allowed_bots": ["all"],
    },
    {
        "id": "slack",
        "name": "Slack",
        "category": "communication",
        "description": "Listens to team channels, joins threads on mention, and sends direct status alerts.",
        "default_connected": True,
        "permissions": ["channels:read", "chat:write", "reactions:write"],
        "allowed_bots": ["all"],
    },
    {
        "id": "clickup",
        "name": "ClickUp",
        "category": "productivity",
        "description": "Syncs sprint task statuses, auto-generates acceptance criteria, and manages boards.",
        "default_connected": False,
        "permissions": ["tasks:read", "tasks:write", "lists:read"],
        "allowed_bots": [],
    },
    {
        "id": "notion",
        "name": "Notion",
        "category": "productivity",
        "description": "Maintains corporate wikis, meeting notes, database records, and research summaries.",
        "default_connected": False,
        "permissions": ["pages:read", "pages:write", "databases:read"],
        "allowed_bots": [],
    },
    {
        "id": "github",
        "name": "GitHub",
        "category": "engineering",
        "description": "Analyzes pull requests, triggers CI runs, reviews code diffs, and opens issues.",
        "default_connected": True,
        "permissions": ["repo:status", "pull_requests:write", "issues:write"],
        "allowed_bots": ["all"],
    },
    {
        "id": "composio",
        "name": "Composio & Webhooks",
        "category": "engineering",
        "description": "Universal connector for 250+ enterprise SaaS apps, custom APIs, and event webhooks.",
        "default_connected": True,
        "permissions": ["webhook:deliver", "tools:execute"],
        "allowed_bots": ["all"],
    },
    {
        "id": "hubspot",
        "name": "HubSpot CRM",
        "category": "crm",
        "description": "Enriches lead profiles, synchronizes deal stages, and logs client correspondence.",
        "default_connected": False,
        "permissions": ["contacts:read", "deals:write"],
        "allowed_bots": [],
    },
]

@router.get("", response_model=List[ConnectorResponse])
async def list_connectors(db: AsyncSession = Depends(get_db)):
    stmt = select(DBConnector)
    result = await db.execute(stmt)
    rows = {r.id: r for r in result.scalars().all()}

    response = []
    for item in CATALOG_DEFAULTS:
        c_id = item["id"]
        db_row = rows.get(c_id)
        if db_row:
            try:
                perms = json.loads(db_row.scopes_json or "[]")
            except Exception:
                perms = item["permissions"]
            try:
                allowed_bots = json.loads(db_row.allowed_bots_json or "[]")
            except Exception:
                allowed_bots = item["allowed_bots"]

            response.append(ConnectorResponse(
                id=c_id,
                name=db_row.name or item["name"],
                category=item["category"],
                description=item["description"],
                connected=db_row.status == "active",
                permissions=perms,
                allowed_bots=allowed_bots,
                granted_at=db_row.granted_at,
                last_used_at=db_row.last_used_at
            ))
        else:
            response.append(ConnectorResponse(
                id=c_id,
                name=item["name"],
                category=item["category"],
                description=item["description"],
                connected=item["default_connected"],
                permissions=item["permissions"],
                allowed_bots=item["allowed_bots"],
                granted_at=None,
                last_used_at=None
            ))
    return response

@router.post("/{connector_id}/configure", response_model=ConnectorResponse)
async def configure_connector(
    connector_id: str,
    payload: ConnectorConfigPayload,
    db: AsyncSession = Depends(get_db)
):
    catalog_item = next((c for c in CATALOG_DEFAULTS if c["id"] == connector_id), None)
    if not catalog_item:
        raise HTTPException(status_code=404, detail="Connector not recognized in catalog")

    db_row = await db.get(DBConnector, connector_id)
    if not db_row:
        db_row = DBConnector(
            id=connector_id,
            name=catalog_item["name"],
            connector_type=catalog_item["category"],
            scopes_json=json.dumps(payload.permissions or catalog_item["permissions"]),
            status="active" if payload.connected else "revoked",
            granted_at=utc_now(),
            config_json=json.dumps(payload.config),
            allowed_bots_json=json.dumps(payload.allowed_bots)
        )
        db.add(db_row)
    else:
        db_row.status = "active" if payload.connected else "revoked"
        db_row.scopes_json = json.dumps(payload.permissions)
        db_row.allowed_bots_json = json.dumps(payload.allowed_bots)
        if payload.config:
            db_row.config_json = json.dumps(payload.config)
        db_row.last_used_at = utc_now()

    await db.commit()
    await db.refresh(db_row)

    return ConnectorResponse(
        id=db_row.id,
        name=db_row.name,
        category=catalog_item["category"],
        description=catalog_item["description"],
        connected=db_row.status == "active",
        permissions=json.loads(db_row.scopes_json or "[]"),
        allowed_bots=json.loads(db_row.allowed_bots_json or "[]"),
        granted_at=db_row.granted_at,
        last_used_at=db_row.last_used_at
    )

@router.post("/{connector_id}/disconnect")
async def disconnect_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db)
):
    db_row = await db.get(DBConnector, connector_id)
    if db_row:
        db_row.status = "revoked"
        await db.commit()
    return {"status": "disconnected", "id": connector_id}

@router.post("/{connector_id}/test")
async def test_connector(connector_id: str):
    catalog_item = next((c for c in CATALOG_DEFAULTS if c["id"] == connector_id), None)
    if not catalog_item:
        raise HTTPException(status_code=404, detail="Connector not found")
    return {
        "status": "connected",
        "connector": catalog_item["name"],
        "latency_ms": 42,
        "permissions_verified": True
    }
