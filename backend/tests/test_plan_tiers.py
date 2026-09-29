import pytest
from app.core.plan_tier import plan_tier_manager, PLAN_TIERS
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.schemas import SessionCreate
from app.engine.session_manager import session_manager

@pytest.mark.asyncio
async def test_plan_tier_manager_basics():
    # 1. Default tier
    tier = plan_tier_manager.get_tier("test_ws")
    assert tier in PLAN_TIERS

    # 2. Get details
    details = await plan_tier_manager.get_tier_details("test_ws")
    assert "plan_tier" in details
    assert "monthly_task_limit" in details
    assert "tasks_used_this_month" in details
    assert details["tasks_remaining"] >= 0 or details["monthly_task_limit"] == -1

    # 3. Change tier
    updated = await plan_tier_manager.set_tier("enterprise", "test_ws")
    assert updated["plan_tier"] == "enterprise"
    assert updated["monthly_task_limit"] == -1

    # Restore to pro
    await plan_tier_manager.set_tier("pro", "test_ws")

@pytest.mark.asyncio
async def test_plan_tier_api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Get status
        res = await client.get("/v1/sessions/plan-tier/status?workspace_id=default")
        assert res.status_code == 200
        data = res.json()
        assert "plan_tier" in data
        assert "available_tiers" in data
        assert len(data["available_tiers"]) == 3

        # 2. Update tier
        put_res = await client.put("/v1/sessions/plan-tier/update?tier=pro&workspace_id=default")
        assert put_res.status_code == 200
        assert put_res.json()["plan_tier"] == "pro"

        # Restore to enterprise
        await client.put("/v1/sessions/plan-tier/update?tier=enterprise&workspace_id=default")

@pytest.mark.asyncio
async def test_rich_artifact_previews():
    from app.sandbox.process_sandbox import sandbox_manager
    from app.tools.doc_gen import CreateDocumentTool
    
    await plan_tier_manager.set_tier("enterprise", "default")
    # Create actual session in DB
    sess = await session_manager.create_session(SessionCreate(task="Test rich previews", workspace_id="default"))
    session_id = sess.id
    sandbox = sandbox_manager.get_or_create(session_id)
    doc_tool = CreateDocumentTool()

    # Generate XLSX
    await doc_tool.execute(
        session_id=session_id,
        title="Test Sheet",
        document_type="xlsx",
        data=[{"Name": "Alice", "Score": 95}, {"Name": "Bob", "Score": 88}]
    )

    # Generate DOCX
    await doc_tool.execute(
        session_id=session_id,
        title="Test Doc",
        document_type="docx",
        content="Executive summary text for doc preview test."
    )

    # Generate PPTX
    await doc_tool.execute(
        session_id=session_id,
        title="Test Slides",
        document_type="pptx",
        content="Key findings: 100% test coverage."
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check XLSX preview
        res_xlsx = await client.get(f"/v1/artifacts/preview/{session_id}/Test_Sheet.xlsx")
        assert res_xlsx.status_code == 200
        xlsx_data = res_xlsx.json()
        assert xlsx_data["type"] == "xlsx"
        assert len(xlsx_data["sheets"]) >= 1
        assert len(xlsx_data["sheets"][0]["rows"]) >= 2

        # Check DOCX preview
        res_docx = await client.get(f"/v1/artifacts/preview/{session_id}/Test_Doc.docx")
        assert res_docx.status_code == 200
        docx_data = res_docx.json()
        assert docx_data["type"] == "docx"
        assert len(docx_data["sections"]) >= 1

        # Check PPTX preview
        res_pptx = await client.get(f"/v1/artifacts/preview/{session_id}/Test_Slides.pptx")
        assert res_pptx.status_code == 200
        pptx_data = res_pptx.json()
        assert pptx_data["type"] == "pptx"
        assert len(pptx_data["slides"]) >= 1
