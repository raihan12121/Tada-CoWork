import pytest
import httpx
from app.main import app
from app.config import settings
from app.sandbox.process_sandbox import SandboxSession

@pytest.mark.asyncio
async def test_admin_kill_all_requires_authorization():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Without authorization header
        resp_unauth = await client.post("/v1/admin/kill_all")
        assert resp_unauth.status_code in (401, 403)

        # With valid authorization header
        resp_auth = await client.post(
            "/v1/admin/kill_all",
            headers={"X-Admin-Token": settings.BRIDGE_SECRET}
        )
        assert resp_auth.status_code == 200
        assert resp_auth.json()["status"] == "emergency_kill_executed"

@pytest.mark.asyncio
async def test_bridge_endpoints_require_authorization():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Without token
        resp_grant = await client.post("/v1/bridge/grant_folder?folder_path=D:/Confidential")
        assert resp_grant.status_code in (401, 403)

        # With valid token
        resp_grant_auth = await client.post(
            "/v1/bridge/grant_folder?folder_path=D:/Confidential",
            headers={"X-Bridge-Token": settings.BRIDGE_SECRET}
        )
        assert resp_grant_auth.status_code == 200

@pytest.mark.asyncio
async def test_sandbox_session_id_path_traversal_prevention():
    # Attempt directory traversal in session_id
    with pytest.raises(ValueError):
        SandboxSession("../../malicious_escape")

    with pytest.raises(ValueError):
        SandboxSession("..\\malicious_escape")

    with pytest.raises(ValueError):
        SandboxSession("bad/slash/id")

@pytest.mark.asyncio
async def test_artifacts_api_path_traversal_rejection():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # URL encoded path traversal in session_id
        resp = await client.get("/v1/artifacts/download/..%2F..%2Fetc/passwd")
        assert resp.status_code in (400, 404)

        resp2 = await client.get("/v1/artifacts/preview/..%2F..%2Fetc/passwd")
        assert resp2.status_code in (400, 404)
