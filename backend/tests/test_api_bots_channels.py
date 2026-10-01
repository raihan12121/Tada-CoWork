import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_bots_and_channels_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. List bots (should contain seeded Grokbot-style team: Klaus, Becky, Dev, Motion, Inbox, Dan)
        resp = await client.get("/v1/bots")
        assert resp.status_code == 200
        bots = resp.json()
        assert len(bots) >= 6
        bot_names = [b["name"] for b in bots]
        assert "Klaus" in bot_names
        assert "Becky" in bot_names

        # 2. Create custom bot
        create_payload = {
            "name": "Slice",
            "avatar": "✂️",
            "role_tag": "Video Editor",
            "description": "Edits video frames and stitches clips.",
            "folder_name": "Marketing",
            "pinned": True,
            "is_hidden": False,
            "workspace_id": "default",
            "enabled_tools": ["code_exec"],
            "individual_memory": ["Prefers 1080p 60fps exports."]
        }
        create_resp = await client.post("/v1/bots", json=create_payload)
        assert create_resp.status_code == 200
        new_bot = create_resp.json()
        assert new_bot["name"] == "Slice"
        assert new_bot["role_tag"] == "Video Editor"
        bot_id = new_bot["id"]

        # 3. Duplicate bot
        dup_resp = await client.post(f"/v1/bots/{bot_id}/duplicate")
        assert dup_resp.status_code == 200
        dup_bot = dup_resp.json()
        assert dup_bot["name"] == "Slice (Copy)"

        # 4. Export as template
        template_resp = await client.get(f"/v1/bots/{bot_id}/template")
        assert template_resp.status_code == 200
        template_data = template_resp.json()
        assert template_data["name"] == "Slice"

        # 5. Import template
        import_resp = await client.post("/v1/bots/import-template", json=template_data)
        assert import_resp.status_code == 200
        imported_bot = import_resp.json()
        assert imported_bot["name"] == "Slice"

        # 6. Channels test
        ch_resp = await client.get("/v1/channels")
        assert ch_resp.status_code == 200
        channels = ch_resp.json()
        assert len(channels) >= 2
        ch_names = [c["name"] for c in channels]
        assert "all-hands" in ch_names

        # 7. Create new channel
        new_ch_resp = await client.post("/v1/channels", json={
            "name": "growth-squad",
            "description": "Growth and marketing experiments",
            "bot_ids": [bot_id, "bot_klaus"],
            "workspace_id": "default"
        })
        assert new_ch_resp.status_code == 200
        new_ch = new_ch_resp.json()
        assert new_ch["name"] == "growth-squad"

@pytest.mark.asyncio
async def test_connectors_vault_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. List connectors
        resp = await client.get("/v1/connectors")
        assert resp.status_code == 200
        connectors = resp.json()
        assert len(connectors) >= 6
        ids = [c["id"] for c in connectors]
        assert "gmail" in ids
        assert "github" in ids

        # 2. Configure connector
        conf_resp = await client.post("/v1/connectors/github/configure", json={
            "connected": True,
            "permissions": ["repo:status", "pull_requests:write"],
            "allowed_bots": ["all"],
            "config": {"apiKey": "ghp_mock_token_for_test"}
        })
        assert conf_resp.status_code == 200
        conf_data = conf_resp.json()
        assert conf_data["connected"] is True
        assert "repo:status" in conf_data["permissions"]

        # 3. Test connector handshake
        test_resp = await client.post("/v1/connectors/github/test")
        assert test_resp.status_code == 200
        assert test_resp.json()["status"] == "connected"

        # 4. Disconnect connector
        disc_resp = await client.post("/v1/connectors/github/disconnect")
        assert disc_resp.status_code == 200
        assert disc_resp.json()["status"] == "disconnected"

