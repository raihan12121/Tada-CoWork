import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.tools.registry import tool_registry

@pytest.mark.asyncio
async def test_browser_api_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/v1/browser/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "alive" in data
        assert "persistent_profile" in data
        assert "url" in data

@pytest.mark.asyncio
async def test_browser_api_action_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Unsupported action
        resp = await client.post("/v1/browser/action", json={"action": "unknown_action"})
        assert resp.status_code == 400

        # Click missing coordinates
        resp = await client.post("/v1/browser/action", json={"action": "click"})
        assert resp.status_code == 400

        # Type missing text
        resp = await client.post("/v1/browser/action", json={"action": "type"})
        assert resp.status_code == 400

@pytest.mark.asyncio
async def test_browser_tool_registered():
    tool = tool_registry.get_tool("browser_automation")
    assert tool is not None
    assert tool.name == "browser_automation"
    schema = tool.get_parameters_schema()
    assert "action" in schema["properties"]
    assert "takeover" in schema["properties"]["action"]["enum"]

@pytest.mark.asyncio
async def test_browser_tool_takeover_action():
    tool = tool_registry.get_tool("browser_automation")
    res = await tool.execute(session_id="test_session", action="takeover", url="https://example.com/checkout")
    assert res.get("success") is True
    assert res.get("takeover_mode") is True
    assert "example.com/checkout" in res.get("url")
