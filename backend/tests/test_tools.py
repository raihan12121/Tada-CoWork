import pytest
import os
from pathlib import Path
from app.sandbox.process_sandbox import sandbox_manager
from app.tools.code_exec import ExecuteCodeTool
from app.tools.file_ops import ReadFileTool, WriteFileTool, ListFilesTool, DeleteFileTool
from app.tools.doc_gen import CreateDocumentTool
from app.tools.web_search import WebSearchTool

@pytest.mark.asyncio
async def test_code_exec_tool():
    tool = ExecuteCodeTool()
    session_id = "test_code_session"
    result = await tool.execute(
        session_id=session_id,
        code="a = 15\nb = 25\nprint(f'SUM={a+b}')",
        language="python"
    )
    assert result["success"] is True
    assert "SUM=40" in result["stdout"]

@pytest.mark.asyncio
async def test_file_ops_with_snapshots_and_trash():
    session_id = "test_file_session"
    sandbox = sandbox_manager.get_or_create(session_id)
    write_tool = WriteFileTool()
    read_tool = ReadFileTool()
    delete_tool = DeleteFileTool()

    # 1. Write file v1
    w1 = await write_tool.execute(session_id=session_id, path="notes.txt", content="Version 1 content")
    assert w1["success"] is True

    # 2. Overwrite file v2 -> snapshot created
    w2 = await write_tool.execute(session_id=session_id, path="notes.txt", content="Version 2 content")
    assert w2["success"] is True
    assert w2["snapshot_created"] is not None

    # Verify versions dir has the backup
    snapshots = list(sandbox.versions_dir.glob("*.bak"))
    assert len(snapshots) >= 1

    # 3. Read file
    r = await read_tool.execute(session_id=session_id, path="notes.txt")
    assert r["success"] is True
    assert r["content"] == "Version 2 content"

    # 4. Safe delete -> moved to trash
    d = await delete_tool.execute(session_id=session_id, path="notes.txt")
    assert d["success"] is True
    trash_items = list(sandbox.trash_dir.glob("*.deleted"))
    assert len(trash_items) >= 1

@pytest.mark.asyncio
async def test_document_generators():
    session_id = "test_doc_session"
    tool = CreateDocumentTool()

    # 1. Markdown
    res_md = await tool.execute(
        session_id=session_id,
        title="Weekly Report",
        document_type="md",
        content="# Weekly Report\n\n- Task 1 done\n- Task 2 done"
    )
    assert res_md["success"] is True
    assert res_md["filename"] == "Weekly_Report.md"

    # 2. Spreadsheet (XLSX)
    res_xlsx = await tool.execute(
        session_id=session_id,
        title="Expense Tracker",
        document_type="xlsx",
        data=[
            {"Date": "2026-09-01", "Vendor": "Office Depot", "Amount": 142.50, "Category": "Supplies"},
            {"Date": "2026-09-02", "Vendor": "Airline", "Amount": 420.00, "Category": "Travel"}
        ]
    )
    assert res_xlsx["success"] is True
    assert res_xlsx["filename"] == "Expense_Tracker.xlsx"

    # 3. Word Document (DOCX)
    res_docx = await tool.execute(
        session_id=session_id,
        title="Executive Briefing",
        document_type="docx",
        content="Coagent executive briefing document for strategic decision makers."
    )
    assert res_docx["success"] is True
    assert res_docx["filename"] == "Executive_Briefing.docx"

    # 4. Presentation Slide Deck (PPTX)
    res_pptx = await tool.execute(
        session_id=session_id,
        title="Quarterly Review",
        document_type="pptx",
        content="Strategic goals achieved: 95% satisfaction, 10x throughput."
    )
    assert res_pptx["success"] is True
    assert res_pptx["filename"] == "Quarterly_Review.pptx"

    # 5. PDF
    res_pdf = await tool.execute(
        session_id=session_id,
        title="Financial Summary",
        document_type="pdf",
        content="Audit report summary for fiscal year 2026."
    )
    assert res_pdf["success"] is True
    assert res_pdf["filename"] == "Financial_Summary.pdf"

@pytest.mark.asyncio
async def test_web_search_tool():
    tool = WebSearchTool()
    session_id = "test_search_session"
    result = await tool.execute(session_id=session_id, query="autonomous AI agents")
    assert result["success"] is True
    assert result["results_count"] > 0
    assert "BEGIN UNTRUSTED DATA" in result["sanitized_view"]
