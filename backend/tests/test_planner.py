import pytest
from app.engine.planner import planner_engine
from app.engine.session_manager import session_manager
from app.models.schemas import SessionCreate

@pytest.mark.asyncio
async def test_planner_generation():
    session = await session_manager.create_session(SessionCreate(
        task="Build an expense spreadsheet from these 40 receipt photos and calculate totals"
    ))
    assert session.id is not None
    assert session.plan is not None
    assert len(session.plan.steps) >= 3
    assert any(s.tool in ("create_document", "execute_code") for s in session.plan.steps)

@pytest.mark.asyncio
async def test_planner_replanning():
    session = await session_manager.create_session(SessionCreate(
        task="Clean up duplicate files and remove extras"
    ))
    plan = session.plan
    assert plan is not None
    step_to_skip = plan.steps[0].id

    revised = await planner_engine.revise_plan(
        session_id=session.id,
        current_plan=plan,
        reason="Testing dynamic replan",
        failed_or_denied_step_id=step_to_skip
    )
    assert revised.version == 2
    skipped_step = next(s for s in revised.steps if s.id == step_to_skip)
    assert skipped_step.status == "skipped"
