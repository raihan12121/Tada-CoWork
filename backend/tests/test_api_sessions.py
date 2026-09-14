import pytest
import httpx
from app.main import app

@pytest.mark.asyncio
async def test_create_session_success():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/v1/sessions", json={
            "task": "Create a financial summary report",
            "model": "gemini-1.5-pro"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["task"] == "Create a financial summary report"
        assert data["status"] in ("created", "pending", "in_progress", "active")
        assert len(data.get("plan", {}).get("steps", [])) >= 1

@pytest.mark.asyncio
async def test_create_session_empty_task_rejected():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Empty string
        resp1 = await client.post("/v1/sessions", json={"task": ""})
        assert resp1.status_code == 422

        # Whitespace-only string
        resp2 = await client.post("/v1/sessions", json={"task": "   \n\t  "})
        assert resp2.status_code == 422

@pytest.mark.asyncio
async def test_get_session_by_id():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create
        created = await client.post("/v1/sessions", json={"task": "Analyze metrics"})
        assert created.status_code == 200
        sid = created.json()["id"]

        # Get existing
        resp = await client.get(f"/v1/sessions/{sid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == sid

        # Get non-existent
        resp_404 = await client.get("/v1/sessions/non-existent-session-id-9999")
        assert resp_404.status_code == 404

@pytest.mark.asyncio
async def test_list_sessions():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/v1/sessions?limit=10")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

@pytest.mark.asyncio
async def test_session_lifecycle_actions_on_nonexistent_session():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        ghost_id = "ghost-session-uuid-0000"
        
        # Pause nonexistent
        p_resp = await client.post(f"/v1/sessions/{ghost_id}/pause")
        assert p_resp.status_code == 404

        # Resume nonexistent
        r_resp = await client.post(f"/v1/sessions/{ghost_id}/resume")
        assert r_resp.status_code == 404

        # Cancel nonexistent
        c_resp = await client.post(f"/v1/sessions/{ghost_id}/cancel")
        assert c_resp.status_code == 404

        # Start nonexistent
        s_resp = await client.post(f"/v1/sessions/{ghost_id}/start")
        assert s_resp.status_code == 404
