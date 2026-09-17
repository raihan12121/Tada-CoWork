import asyncio

import httpx
import pytest

from app.main import app
from app.models.schemas import SessionCreate
from app.engine.session_manager import session_manager
from app.sandbox.process_sandbox import SandboxSession


@pytest.mark.asyncio
async def test_session_persists_tool_grant_and_activity_events():
    session = await session_manager.create_session(SessionCreate(task="Create a short report"))
    assert session.enabled_tools

    await session_manager.start_execution(session.id)
    for _ in range(40):
        await asyncio.sleep(0.1)
        current = await session_manager.get_session(session.id)
        if current and current.status in ("completed", "failed"):
            break

    events = await session_manager.get_activity_events(session.id)
    assert events
    assert any(event.event_type == "narration" for event in events)


@pytest.mark.asyncio
async def test_plan_edit_api_supports_add_and_remove():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/v1/sessions", json={"task": "Create a short report"})
        assert created.status_code == 200
        session = created.json()
        original_steps = session["plan"]["steps"]

        added = await client.post(
            f"/v1/sessions/{session['id']}/plan/edit",
            json={"action": "add", "description": "Write a completion note", "tool": "write_file", "risk_level": "medium"},
        )
        assert added.status_code == 200
        assert len(added.json()["steps"]) == len(original_steps) + 1
        added_step_id = added.json()["steps"][-1]["id"]

        removed = await client.post(
            f"/v1/sessions/{session['id']}/plan/edit",
            json={"action": "remove", "step_id": added_step_id},
        )
        assert removed.status_code == 200
        assert len(removed.json()["steps"]) == len(original_steps)


@pytest.mark.asyncio
async def test_local_sandbox_caps_code_payload():
    sandbox = SandboxSession("phase0-cap-test")
    try:
        result = await sandbox.execute_code("x = '" + ("a" * 300000) + "'")
        assert result["success"] is False
        assert "limit" in result["stderr"].lower()
    finally:
        sandbox.destroy()


def test_sandbox_path_boundary_does_not_use_string_prefixes():
    sandbox = SandboxSession("prefix-boundary-test")
    try:
        with pytest.raises(PermissionError):
            sandbox.resolve_path("../prefix-boundary-test-sibling/secret.txt")
    finally:
        sandbox.destroy()
