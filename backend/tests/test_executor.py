import pytest
import asyncio
from app.engine.session_manager import session_manager
from app.engine.approval_gate import approval_gate_manager
from app.models.schemas import SessionCreate

@pytest.mark.asyncio
async def test_end_to_end_autonomous_execution():
    session = await session_manager.create_session(SessionCreate(
        task="Research top AI cowork tools and create a summary markdown report"
    ))
    session_id = session.id
    
    # Pre-approve medium risk so create_document runs autonomously
    approval_gate_manager.pre_approve_class(session_id, "all_medium")

    # Start execution
    await session_manager.start_execution(session_id)

    # Wait for execution to finish
    for _ in range(30):
        await asyncio.sleep(0.5)
        current = await session_manager.get_session(session_id)
        if current and current.status in ("completed", "failed"):
            break

    final_session = await session_manager.get_session(session_id)
    assert final_session is not None
    assert final_session.status == "completed"
    assert len(final_session.artifacts) >= 1
    assert final_session.tool_calls_count >= 1

@pytest.mark.asyncio
async def test_executor_approval_gate_blocking():
    session = await session_manager.create_session(SessionCreate(
        task="Compile support tickets into a digest and send weekly email to team"
    ))
    session_id = session.id
    
    # Pre-approve medium for creation steps, but high-risk send_email MUST block!
    approval_gate_manager.pre_approve_class(session_id, "all_medium")

    await session_manager.start_execution(session_id)

    # Poll until it reaches waiting_approval or pending approval
    pending = None
    for _ in range(40):
        await asyncio.sleep(0.3)
        pending = await approval_gate_manager.get_pending_approval(session_id)
        if pending:
            break

    assert pending is not None
    assert pending.action_type == "send_email"
    assert pending.risk_level == "high"

    # Resolve approval as approved
    resolved = await approval_gate_manager.resolve_approval(
        approval_id=pending.id,
        decision="approved"
    )
    assert resolved is True

    # Wait for completion
    for _ in range(30):
        await asyncio.sleep(0.3)
        current = await session_manager.get_session(session_id)
        if current and current.status == "completed":
            break

    done_session = await session_manager.get_session(session_id)
    assert done_session is not None
    assert done_session.status == "completed"
