import pytest
from app.memory.working_memory import WorkingMemory
from app.memory.long_term_memory import long_term_memory

def test_working_memory_compaction():
    wm = WorkingMemory(session_id="test_wm", max_active_turns=3)
    wm.add_turn("user", "Hello")
    wm.add_turn("assistant", "Hi there")
    wm.add_turn("assistant", "Executing", metadata={"tool": "read_file", "step_id": "step-1"})
    wm.add_turn("user", "Do something")
    wm.add_turn("user", "More info")
    wm.add_turn("assistant", "Finishing")

    # Length of active history should be capped to 3
    assert len(wm.history) == 3
    # Compacted summary should be present
    assert wm.compacted_summary != ""
    assert "Used tool 'read_file'" in wm.compacted_summary

@pytest.mark.asyncio
async def test_long_term_memory_storage_and_recall():
    ws_id = "test_ws_1"
    long_term_memory.set_memory_enabled(ws_id, True)

    # Add memory item
    item = await long_term_memory.add_memory_item(
        memory_type="preference",
        content="User prefers tables formatted with column totals and percentages.",
        workspace_id=ws_id,
        key="table_format"
    )
    assert item.id is not None

    # Retrieve with relevant query
    results = await long_term_memory.retrieve_relevant_memory(
        query="format my expense table with percentages",
        workspace_id=ws_id
    )
    assert len(results) > 0
    assert "percentages" in results[0].content

    # Workspace isolation check: query from different workspace should NOT leak!
    foreign_results = await long_term_memory.retrieve_relevant_memory(
        query="format my expense table with percentages",
        workspace_id="other_company_workspace"
    )
    assert len(foreign_results) == 0
