import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_bot_input_boundaries_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Excessively long name should be rejected
        huge_name_payload = {
            "name": "A" * 200,  # exceeds reasonable limit (e.g. 100)
            "avatar": "🤖",
            "role_tag": "Tester",
            "description": "Valid description",
        }
        resp = await client.post("/v1/bots", json=huge_name_payload)
        # Should be rejected with 422 Unprocessable Entity
        assert resp.status_code == 422

        # 2. Excessively long description should be rejected
        huge_desc_payload = {
            "name": "ValidName",
            "avatar": "🤖",
            "role_tag": "Tester",
            "description": "B" * 20000,  # exceeds reasonable limit (e.g. 5000)
        }
        resp = await client.post("/v1/bots", json=huge_desc_payload)
        assert resp.status_code == 422

@pytest.mark.asyncio
async def test_bot_lifecycle_and_prompt_revision():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a bot
        create_resp = await client.post("/v1/bots", json={
            "name": "QA Sentinel",
            "avatar": "🛡️",
            "role_tag": "Quality Bot",
            "description": "Performs automated quality audits",
            "folder_name": "QA",
            "pinned": False,
            "is_hidden": False,
            "workspace_id": "default",
            "enabled_tools": ["code_exec"],
            "individual_memory": ["Strict validation rules enabled"]
        })
        assert create_resp.status_code == 200
        bot_id = create_resp.json()["id"]

        # Retrieve specific bot
        bot_get = await client.get(f"/v1/bots/{bot_id}")
        assert bot_get.status_code == 200
        assert bot_get.json()["name"] == "QA Sentinel"

        # Update bot fields
        update_resp = await client.patch(f"/v1/bots/{bot_id}", json={
            "name": "QA Sentinel Elite",
            "role_tag": "Lead Quality Bot",
            "pinned": True,
            "individual_memory": ["Strict validation rules enabled", "Zero tolerance for cleartext tokens"]
        })
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "QA Sentinel Elite"
        assert update_resp.json()["pinned"] is True

        # Non-existent bot returns 404
        non_existent = await client.get("/v1/bots/non_existent_id_12345")
        assert non_existent.status_code == 404
