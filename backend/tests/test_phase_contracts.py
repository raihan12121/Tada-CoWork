from datetime import datetime, timezone

import httpx
import pytest

from app.config import settings
from app.engine.scheduler import scheduler_engine
from app.main import app
from app.models.schemas import SessionCreate
from app.engine.session_manager import session_manager
from app.core.org_policy import org_policy_manager
from app.db.session import AsyncSessionLocal, DBConnectorReview
from sqlalchemy import select
import uuid


@pytest.mark.asyncio
async def test_cron_parser_computes_real_next_occurrence():
    after = datetime(2026, 9, 14, 8, 30, tzinfo=timezone.utc)
    assert scheduler_engine._next_run("0 9 * * 1", after).weekday() == 0
    assert scheduler_engine._next_run("*/15 * * * *", after).minute == 45


@pytest.mark.asyncio
async def test_mcp_cannot_bypass_approval_gate():
    session = await session_manager.create_session(SessionCreate(
        task="Draft a weekly email",
        enabled_tools=["send_email"],
    ))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/mcp/rpc", json={
            "jsonrpc": "2.0",
            "id": "approval-check",
            "method": "tools/call",
            "params": {
                "session_id": session.id,
                "name": "send_email",
                "arguments": {"recipient": "user@example.com", "subject": "Test", "body": "Test"},
            },
        })
    assert response.status_code == 200
    assert response.json()["error"]["code"] == -32005


@pytest.mark.asyncio
async def test_organization_connector_block_is_enforced():
    policy = org_policy_manager.configure("blocked-workspace", connector_blocklist=["web_search"])
    session = await session_manager.create_session(SessionCreate(
        task="Research competitors",
        workspace_id="blocked-workspace",
        enabled_tools=["web_search"],
    ))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/mcp/rpc", json={
            "jsonrpc": "2.0",
            "id": "policy-check",
            "method": "tools/call",
            "params": {"session_id": session.id, "name": "web_search", "arguments": {"query": "test"}},
        })
    assert response.json()["error"]["code"] == -32006
    org_policy_manager.configure("blocked-workspace", connector_blocklist=[])


@pytest.mark.asyncio
async def test_marketplace_review_blocks_unapproved_connector():
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == "github"))
        row = existing.scalar_one_or_none()
        if not row:
            row = DBConnectorReview(id=str(uuid.uuid4()), connector_name="github")
            db.add(row)
        row.review_status = "blocked"
        await db.commit()
    session = await session_manager.create_session(SessionCreate(task="Read GitHub issues", enabled_tools=["github"], granted_scopes=["read:org"]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/mcp/rpc", json={
            "jsonrpc": "2.0", "id": "review-check", "method": "tools/call",
            "params": {"session_id": session.id, "name": "github", "arguments": {"action": "list_issues", "repo": "openai/example"}},
        })
    assert response.json()["error"]["code"] == -32007
    async with AsyncSessionLocal() as db:
        row = await db.get(DBConnectorReview, row.id)
        row.review_status = "approved"
        await db.commit()
