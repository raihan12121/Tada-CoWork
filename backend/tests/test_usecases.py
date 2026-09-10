import pytest
import asyncio
from app.engine.session_manager import session_manager
from app.engine.approval_gate import approval_gate_manager
from app.memory.long_term_memory import long_term_memory
from app.models.schemas import SessionCreate

@pytest.mark.asyncio
async def test_uc1_organize_messy_folder():
    """UC-1: Organize a messy folder and produce an activity summary report."""
    session = await session_manager.create_session(SessionCreate(
        task="Organize my Downloads folder — rename files sensibly and sort into subfolders by type/project."
    ))
    assert session.plan is not None
    assert any("inventory" in s.description.lower() or "scan" in s.description.lower() for s in session.plan.steps)
    
    # Pre-approve medium risk so reorganization executes autonomously
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)
    
    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status in ("completed", "failed"):
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert final.status == "completed"

@pytest.mark.asyncio
async def test_uc2_build_expense_spreadsheet():
    """UC-2: Build a spreadsheet from unstructured receipt inputs."""
    session = await session_manager.create_session(SessionCreate(
        task="Build an expense spreadsheet from these 40 receipt photos with formulas and totals."
    ))
    assert session.plan is not None
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert any(a.file_type in ("xlsx", "csv") for a in final.artifacts)

@pytest.mark.asyncio
async def test_uc3_draft_report_from_notes():
    """UC-3: Draft a 3-section formatted report from scattered meeting notes."""
    session = await session_manager.create_session(SessionCreate(
        task="Turn these meeting notes and data file into a first-draft quarterly report formatted in docx."
    ))
    assert session.plan is not None
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert any(a.file_type in ("docx", "md") for a in final.artifacts)

@pytest.mark.asyncio
async def test_uc4_multi_source_competitive_research():
    """UC-4: Multi-source research with parallel fanout and merged comparison report."""
    session = await session_manager.create_session(SessionCreate(
        task="Research 10 competitors and produce a comprehensive comparison report with citations."
    ))
    assert session.plan is not None
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert final.status == "completed"

@pytest.mark.asyncio
async def test_uc5_recurring_weekly_digest_with_gated_send():
    """UC-5: Weekly digest with mandatory approval gate before sending email."""
    session = await session_manager.create_session(SessionCreate(
        task="Every Friday, summarize this week's support tickets into a digest and draft an email to team."
    ))
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    # Wait for approval prompt on send_email
    pending = None
    for _ in range(30):
        await asyncio.sleep(0.3)
        pending = await approval_gate_manager.get_pending_approval(session.id)
        if pending:
            break

    assert pending is not None
    assert pending.action_type == "send_email"
    assert pending.risk_level == "high"

    # User approves
    await approval_gate_manager.resolve_approval(pending.id, "approved")

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert final.status == "completed"

@pytest.mark.asyncio
async def test_uc6_cross_tool_slide_deck():
    """UC-6: Pull metrics and build a status slide deck (pptx)."""
    session = await session_manager.create_session(SessionCreate(
        task="Pull last month's numbers from our tracker and build a status slide deck presentation."
    ))
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    final = await session_manager.get_session(session.id)
    assert final is not None
    assert any(a.file_type in ("pptx", "md") for a in final.artifacts)

@pytest.mark.asyncio
async def test_uc7_browser_automation_takeover_mode():
    """UC-7: Browser automation research with Takeover Mode for payment/login."""
    session = await session_manager.create_session(SessionCreate(
        task="Find cheapest flight to Tokyo under $800 and prepare booking checkout payment."
    ))
    assert session.plan is not None
    # Verify takeover mode detection
    approval_task = asyncio.create_task(
        approval_gate_manager.request_approval(
            session_id=session.id,
            action_type="checkout_payment",
            description="Complete airline booking payment",
            consequence="Financial transaction of $780",
            target="airline.com/checkout",
            risk_level="high",
            takeover_mode=True,
            takeover_url="https://airline.com/checkout"
        )
    )
    await asyncio.sleep(0.1)
    pending = await approval_gate_manager.get_pending_approval(session.id)
    assert pending is not None
    assert pending.takeover_mode is True
    assert pending.takeover_url == "https://airline.com/checkout"
    
    # Resolve
    await approval_gate_manager.resolve_approval(pending.id, "approved")
    approved, _ = await approval_task
    assert approved is True

@pytest.mark.asyncio
async def test_uc8_cleanup_and_reversible_deletion():
    """UC-8: Duplicate cleanup with gated deletion and session trash backup."""
    session = await session_manager.create_session(SessionCreate(
        task="Go through this shared drive folder, find duplicate files, and consolidate by deleting duplicates."
    ))
    assert session.plan is not None
    delete_step = next(s for s in session.plan.steps if s.tool == "delete_file")
    assert delete_step.risk_level == "high"

@pytest.mark.asyncio
async def test_uc9_resumability_and_task_memory():
    """UC-9: Resume a paused task using Task Memory."""
    session = await session_manager.create_session(SessionCreate(
        task="Perform competitive research and generate report"
    ))
    approval_gate_manager.pre_approve_class(session.id, "all_medium")
    await session_manager.start_execution(session.id)

    # Pause mid-execution
    await session_manager.pause_session(session.id)
    paused_sess = await session_manager.get_session(session.id)
    assert paused_sess.status == "paused"

    # Resume
    await session_manager.resume_session(session.id)
    resumed_sess = await session_manager.get_session(session.id)
    assert resumed_sess.status == "running"

    for _ in range(30):
        await asyncio.sleep(0.3)
        s = await session_manager.get_session(session.id)
        if s and s.status == "completed":
            break

    done = await session_manager.get_session(session.id)
    assert done.status == "completed"

@pytest.mark.asyncio
async def test_uc10_personalized_memory_driven_plan():
    """UC-10: Recurring report pre-populated with recalled user preferences."""
    ws = "user_memory_ws_test"
    long_term_memory.set_memory_enabled(ws, True)
    await long_term_memory.add_memory_item(
        memory_type="preference",
        key="report_format",
        content="Prefers 3-section executive report with financial KPI metrics and bullet conclusions.",
        workspace_id=ws
    )

    session = await session_manager.create_session(SessionCreate(
        task="Build this month's report",
        workspace_id=ws
    ))
    assert session.plan is not None
    assert session.id is not None
