import pytest
import httpx
from app.main import app

@pytest.mark.asyncio
async def test_memory_crud_workflow():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create memory item
        create_res = await client.post("/v1/memory", json={
            "type": "fact",
            "content": "User prefers financial reports in XLSX format",
            "key": "report_pref",
            "workspace_id": "test_ws"
        })
        assert create_res.status_code == 200
        mem_item = create_res.json()
        assert mem_item["content"] == "User prefers financial reports in XLSX format"
        mem_id = mem_item["id"]

        # List memories
        list_res = await client.get("/v1/memory?workspace_id=test_ws")
        assert list_res.status_code == 200
        items = list_res.json()
        assert any(it["id"] == mem_id for it in items)

        # Delete memory item
        del_res = await client.delete(f"/v1/memory/{mem_id}")
        assert del_res.status_code == 200

@pytest.mark.asyncio
async def test_memory_empty_content_rejected():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/v1/memory", json={
            "type": "fact",
            "content": "    ",
            "workspace_id": "test_ws"
        })
        assert res.status_code == 422

@pytest.mark.asyncio
async def test_delete_memory_nonexistent_returns_404():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.delete("/v1/memory/nonexistent-mem-id-9999")
        assert res.status_code == 404
