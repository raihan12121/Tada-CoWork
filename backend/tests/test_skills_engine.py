import pytest
import httpx
from app.main import app

@pytest.mark.asyncio
async def test_skills_crud_and_lifecycle():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a skill
        create_res = await client.post(
            "/v1/skills",
            json={
                "name": "Competitor Price Watcher",
                "description": "Scrapes competitor pricing and builds an Excel comparison sheet",
                "workspace_id": "default",
                "parameters_schema": {
                    "competitor_url": {"type": "string", "description": "Target website"}
                },
                "steps_definition": [
                    {"step_order": 1, "description": "Fetch pricing data", "tool": "web_fetch", "risk_level": "low"},
                    {"step_order": 2, "description": "Generate summary sheet", "tool": "create_document", "risk_level": "medium"}
                ]
            }
        )
        assert create_res.status_code == 200
        skill = create_res.json()
        skill_id = skill["id"]
        assert skill["name"] == "Competitor Price Watcher"
        assert skill["is_active"] is True

        # 2. List skills
        list_res = await client.get("/v1/skills?workspace_id=default")
        assert list_res.status_code == 200
        skills = list_res.json()
        assert any(s["id"] == skill_id for s in skills)

        # 3. Get single skill
        get_res = await client.get(f"/v1/skills/{skill_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "Competitor Price Watcher"

        # 4. Run skill
        run_res = await client.post(
            f"/v1/skills/{skill_id}/run",
            json={
                "parameters": {"competitor_url": "https://example.com/pricing"}
            }
        )
        assert run_res.status_code == 200
        run_session = run_res.json()
        assert "Competitor Price Watcher" in run_session["task"]

        # 5. Delete skill
        del_res = await client.delete(f"/v1/skills/{skill_id}")
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] is True
