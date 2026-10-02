import pytest
import json
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import AsyncSessionLocal, DBConnector
from sqlalchemy import select

@pytest.mark.asyncio
async def test_connectors_catalog_listing():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/v1/connectors")
        assert resp.status_code == 200
        connectors = resp.json()
        assert len(connectors) >= 8
        ids = [c["id"] for c in connectors]
        assert "gmail" in ids
        assert "github" in ids
        assert "slack" in ids

@pytest.mark.asyncio
async def test_connectors_configuration_and_secret_encryption():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Configure github connector with a sensitive token
        secret_token = "ghp_secureTestingToken9876543210zyxwvutsrq"
        payload = {
            "connected": True,
            "permissions": ["repo:status", "pull_requests:write"],
            "allowed_bots": ["all"],
            "config": {
                "token": secret_token,
                "owner": "test-org"
            }
        }
        resp = await client.post("/v1/connectors/github/configure", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "github"
        assert data["connected"] is True

        # Verify the database persistence: raw plaintext token should NOT be stored naked in the config_json
        async with AsyncSessionLocal() as db:
            row = await db.get(DBConnector, "github")
            assert row is not None
            # The config_json must either be encrypted, referenced via DPAPI secret_ref, or have the secret token masked/encrypted
            assert secret_token not in (row.config_json or ""), "Raw plaintext API secret token found in database row!"

@pytest.mark.asyncio
async def test_connectors_test_connection_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Non-existent connector returns 404
        bad_resp = await client.post("/v1/connectors/non_existent_connector_xyz/test")
        assert bad_resp.status_code == 404

        # 2. Test connection with an invalid/unconfigured connector should not return a fake mock success
        test_resp = await client.post("/v1/connectors/clickup/test")
        # Should either return connected: False or raise an error/status indicating unconfigured or invalid credentials
        test_data = test_resp.json()
        assert test_data.get("connected") is False or test_resp.status_code in (400, 502) or test_data.get("status") in ("unconfigured", "disconnected", "error"), \
            f"Test connection should not return a fake hardcoded success: {test_data}"

@pytest.mark.asyncio
async def test_connectors_disconnect_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Disconnect github
        resp = await client.post("/v1/connectors/github/disconnect")
        assert resp.status_code == 200
        assert resp.json()["status"] == "disconnected"

        # Check list confirms disconnected
        list_resp = await client.get("/v1/connectors")
        assert list_resp.status_code == 200
        github = next(c for c in list_resp.json() if c["id"] == "github")
        assert github["connected"] is False
