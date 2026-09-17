from datetime import datetime, timezone
from pathlib import Path
import hashlib
import hmac
import io
import json
import zipfile

import httpx
import pytest

from app.config import settings
from app.engine.scheduler import scheduler_engine
from app.engine.executor import ExecutorSession
from app.main import app
from app.models.schemas import SessionCreate
from app.engine.session_manager import session_manager
from app.core.org_policy import org_policy_manager
from app.core.llm import OfflineHeuristicProvider
from app.db.session import AsyncSessionLocal, DBConnectorReview, DBExecutionJob, DBSession
from app.api.bridge import _bridge_state
from app.sandbox.process_sandbox import sandbox_manager
from sqlalchemy import select
import uuid


@pytest.mark.asyncio
async def test_session_input_upload_is_authenticated_quota_and_path_safe(monkeypatch):
    session = await session_manager.create_session(SessionCreate(task="input upload contract"))
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/v1/sessions/{session.id}/inputs",
                files={"file": ("notes.txt", b"meeting notes", "text/plain")},
            )
            assert response.status_code == 200
            assert response.json()["path"] == "inputs/notes.txt"
            assert response.json()["size"] == 13
            assert sandbox_manager.get_existing(session.id).resolve_path("inputs/notes.txt").read_text() == "meeting notes"

            traversal = await client.post(
                f"/v1/sessions/{session.id}/inputs",
                files={"file": ("../escape.txt", b"blocked", "text/plain")},
            )
            assert traversal.status_code == 400

            monkeypatch.setattr(settings, "DEFAULT_MAX_INPUT_BYTES", 3)
            oversized = await client.post(
                f"/v1/sessions/{session.id}/inputs",
                files={"file": ("large.txt", b"1234", "text/plain")},
            )
            assert oversized.status_code == 413
    finally:
        sandbox_manager.remove(session.id)


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


@pytest.mark.asyncio
async def test_marketplace_review_rejects_scope_creep():
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == "github"))
        row = existing.scalar_one_or_none()
        if not row:
            row = DBConnectorReview(id=str(uuid.uuid4()), connector_name="github")
            db.add(row)
        row.review_status = "approved"
        row.declared_scopes_json = json.dumps(["read:org"])
        await db.commit()
    session = await session_manager.create_session(SessionCreate(task="Read GitHub issues", enabled_tools=["github"], granted_scopes=["repo"]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/mcp/rpc", json={
            "jsonrpc": "2.0", "id": "scope-creep", "method": "tools/call",
            "params": {"session_id": session.id, "name": "github", "arguments": {"action": "create_issue_draft", "repo": "openai/example"}},
        })
    assert response.json()["error"]["code"] == -32007
    async with AsyncSessionLocal() as db:
        row = await db.get(DBConnectorReview, row.id)
        row.review_status = "approved"
        row.declared_scopes_json = json.dumps([])
        await db.commit()


@pytest.mark.asyncio
async def test_marketplace_submission_validates_and_persists_manifest():
    connector_name = "submitted_connector_contract"
    payload = {
        "version": "2.1.0",
        "declared_scopes": ["read:items", "write:items"],
        "risk_level": "medium",
        "package_url": "https://example.com/connectors/submitted_connector_contract-2.1.0.tgz",
        "package_sha256": "a" * 64,
        "signature": "sig:test",
        "data_access": ["items", "account_metadata"],
    }
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/submit",
            headers={"X-Admin-Token": settings.BRIDGE_SECRET},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["review_status"] == "pending"

        invalid = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/submit",
            headers={"X-Admin-Token": settings.BRIDGE_SECRET},
            json={**payload, "package_url": "http://example.com/package.tgz"},
        )
        assert invalid.status_code == 400

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))).scalar_one()
        assert row.review_status == "pending"
        assert row.package_sha256 == "a" * 64
        assert json.loads(row.data_access_json) == ["items", "account_metadata"]
        await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_approved_marketplace_manifest_requires_resubmission_for_changes():
    connector_name = "approved_manifest_immutability_contract"
    base_payload = {
        "version": "1.0.0",
        "declared_scopes": ["read:items"],
        "risk_level": "low",
        "package_url": "https://example.com/connectors/approved_manifest-1.0.0.tgz",
        "package_sha256": "b" * 64,
        "signature": "sig:approved",
        "data_access": ["items"],
    }
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"X-Admin-Token": settings.BRIDGE_SECRET}
        submitted = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/submit",
            headers=headers,
            json=base_payload,
        )
        assert submitted.status_code == 200
        approved = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**base_payload, "review_status": "approved"},
        )
        assert approved.status_code == 200
        changed = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**base_payload, "review_status": "approved", "declared_scopes": ["read:items", "write:items"]},
        )
        assert changed.status_code == 409
        resubmitted = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/submit",
            headers=headers,
            json={**base_payload, "declared_scopes": ["read:items", "write:items"]},
        )
        assert resubmitted.status_code == 200
        assert resubmitted.json()["review_status"] == "pending"

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))).scalar_one()
        await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_marketplace_approval_verifies_signed_manifest(monkeypatch):
    monkeypatch.setattr(settings, "MARKETPLACE_SIGNING_SECRET", "marketplace-contract-secret")
    connector_name = "signed_manifest_contract"
    payload = {
        "version": "1.0.0",
        "declared_scopes": ["read:items"],
        "risk_level": "low",
        "package_url": "https://example.com/connectors/signed_manifest-1.0.0.tgz",
        "package_sha256": "c" * 64,
        "data_access": ["items"],
    }
    manifest = {"connector_name": connector_name, **payload}
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(b"marketplace-contract-secret", canonical, hashlib.sha256).hexdigest()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"X-Admin-Token": settings.BRIDGE_SECRET}
        response = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**payload, "signature": f"hmac-sha256:{signature}", "review_status": "approved"},
        )
        assert response.status_code == 200
        invalid = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**payload, "signature": "hmac-sha256:invalid", "review_status": "approved"},
        )
        assert invalid.status_code == 400

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))).scalar_one()
        await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_workspace_data_region_is_enforced_at_session_creation(monkeypatch):
    monkeypatch.setattr(settings, "DEPLOYMENT_REGION", "us-east")
    org_policy_manager.configure("residency-contract", data_region="eu-west")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/sessions",
            json={"task": "Create a region-bound report", "workspace_id": "residency-contract"},
        )
    assert response.status_code == 409
    assert "requires data region" in response.json()["detail"]
    org_policy_manager.configure("residency-contract", data_region="local")


@pytest.mark.asyncio
async def test_marketplace_package_upload_scans_before_production_approval(monkeypatch):
    monkeypatch.setattr(settings, "MARKETPLACE_REQUIRE_PACKAGE_SCAN", True)
    connector_name = "package_scan_contract"
    package_buffer = io.BytesIO()
    with zipfile.ZipFile(package_buffer, "w") as archive:
        archive.writestr("connector.py", "def register(): pass\n")
        archive.writestr("manifest.json", "{}")
    package_bytes = package_buffer.getvalue()
    payload = {
        "version": "1.0.0",
        "declared_scopes": ["read:items"],
        "risk_level": "low",
        "package_url": "https://example.com/connectors/package_scan-1.0.0.zip",
        "package_sha256": hashlib.sha256(package_bytes).hexdigest(),
        "signature": "sig:scan",
        "data_access": ["items"],
    }
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"X-Admin-Token": settings.BRIDGE_SECRET}
        submitted = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/submit",
            headers=headers,
            json=payload,
        )
        assert submitted.status_code == 200
        blocked = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**payload, "review_status": "approved"},
        )
        assert blocked.status_code == 409
        scanned = await client.post(
            f"/v1/admin/marketplace/connectors/{connector_name}/package",
            headers=headers,
            files={"file": ("connector.zip", package_bytes, "application/zip")},
        )
        assert scanned.status_code == 200
        assert scanned.json()["scan_status"] == "passed"
        approved = await client.put(
            f"/v1/admin/marketplace/connectors/{connector_name}",
            headers=headers,
            json={**payload, "review_status": "approved"},
        )
        assert approved.status_code == 200

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == connector_name))).scalar_one()
        if row.package_path:
            Path(row.package_path).unlink(missing_ok=True)
        await db.delete(row)
        await db.commit()


@pytest.mark.asyncio
async def test_execution_jobs_are_requeued_after_restart():
    session_id = "durable-job-recovery-contract"
    job_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        db.add(DBSession(id=session_id, task="durable recovery contract", workspace_id="default", status="running"))
        db.add(DBExecutionJob(id=job_id, session_id=session_id, status="running", worker_id="stale-worker", attempts=1))
        await db.commit()

    await session_manager.recover_interrupted_sessions()

    async with AsyncSessionLocal() as db:
        session = await db.get(DBSession, session_id)
        job = await db.get(DBExecutionJob, job_id)
        assert session.status == "paused"
        assert job.status == "queued"
        assert job.worker_id is None
        assert "restart" in (job.last_error or "")
        await db.delete(job)
        await db.delete(session)
        await db.commit()


@pytest.mark.asyncio
async def test_repeated_step_failures_emit_replan_required():
    session = await session_manager.create_session(SessionCreate(task="repeated failure contract"))
    events = []

    async def capture(event):
        events.append(event)

    executor = ExecutorSession(session.id, event_callback=capture)
    step = session.plan.steps[0]
    await executor._record_step_failure(step, session.plan, "provider unavailable")
    await executor._record_step_failure(step, session.plan, "provider unavailable")
    assert any(event.event_type == "replan_required" for event in events)
    assert session.plan.version == 2


@pytest.mark.asyncio
async def test_orchestrator_never_reads_local_bridge_files_without_agent_transport(monkeypatch):
    monkeypatch.setattr(settings, "BRIDGE_AGENT_URL", "")
    _bridge_state["is_connected"] = True
    _bridge_state["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
    _bridge_state["session_grants"]["bridge-test"] = ["D:/granted"]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/bridge/request",
            headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
            json={"session_id": "bridge-test", "folder": "D:/granted", "relative_file": "secret.txt", "action": "read"},
        )
    assert response.status_code == 503
    assert "transport is not configured" in response.json()["detail"]
    _bridge_state["session_grants"].pop("bridge-test", None)


@pytest.mark.asyncio
async def test_bridge_registration_issues_session_scoped_transport_token():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/bridge/register",
            headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
            json={
                "client_name": "test-bridge",
                "granted_folders": ["D:/granted"],
                "allow_browser_control": False,
                "session_id": "token-test",
            },
        )
    assert response.status_code == 200
    token = response.json().get("session_token")
    assert token and token != settings.BRIDGE_SECRET
    assert _bridge_state["session_tokens"]["token-test"] == token
    _bridge_state["session_tokens"].pop("token-test", None)
    _bridge_state["session_grants"].pop("token-test", None)


def test_downloads_plan_uses_bridge_tools_when_transport_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "BRIDGE_AGENT_URL", "http://127.0.0.1:8765")
    plan = OfflineHeuristicProvider().generate_plan_sync("Organize my Downloads folder")
    assert plan["steps"][0]["tool"] == "bridge_list_files"
    assert plan["steps"][2]["tool"] == "bridge_move_file"
