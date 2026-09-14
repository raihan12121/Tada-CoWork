import pytest
import httpx
from app.main import app

@pytest.mark.asyncio
async def test_schedules_crud_and_trigger():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create schedule
        create_resp = await client.post("/v1/schedules", json={
            "title": "Weekly Status Update",
            "task_template": "Draft executive status report for team",
            "cron_expression": "0 9 * * 1"
        })
        assert create_resp.status_code == 200
        sched = create_resp.json()
        assert sched["title"] == "Weekly Status Update"
        sched_id = sched["id"]

        # 2. List schedules
        list_resp = await client.get("/v1/schedules")
        assert list_resp.status_code == 200
        assert any(s["id"] == sched_id for s in list_resp.json())

        # 3. Trigger schedule
        trig_resp = await client.post(f"/v1/schedules/{sched_id}/trigger")
        assert trig_resp.status_code == 200
        session_data = trig_resp.json()
        assert "Weekly Status Update" in session_data["task"]

        # 4. Trigger non-existent schedule
        trig_404 = await client.post("/v1/schedules/fake-id-9999/trigger")
        assert trig_404.status_code == 404

        # 5. Delete schedule
        del_resp = await client.delete(f"/v1/schedules/{sched_id}")
        assert del_resp.status_code == 200

@pytest.mark.asyncio
async def test_resolve_nonexistent_approval_returns_404():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/v1/approvals/nonexistent-approval-999/resolve", json={
            "decision": "approved",
            "user_feedback": "Go ahead"
        })
        assert resp.status_code == 404

@pytest.mark.asyncio
async def test_artifacts_download_and_preview():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Non-existent artifact should 404
        dl_resp = await client.get("/v1/artifacts/download/test-session-001/missing.txt")
        assert dl_resp.status_code == 404

        prev_resp = await client.get("/v1/artifacts/preview/test-session-001/missing.txt")
        assert prev_resp.status_code == 404

@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"
