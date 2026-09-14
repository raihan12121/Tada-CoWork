import pytest
from app.tools.web_fetch import WebFetchTool

@pytest.mark.asyncio
async def test_web_fetch_ssrf_blocked():
    tool = WebFetchTool()
    
    # Block loopback
    res_loopback = await tool.execute(session_id="test_ssrf", url="http://127.0.0.1:8000/v1/admin/kill_all")
    assert res_loopback["success"] is False
    assert "security" in res_loopback["error"].lower() or "blocked" in res_loopback["error"].lower() or "not allowed" in res_loopback["error"].lower()

    # Block localhost
    res_local = await tool.execute(session_id="test_ssrf", url="http://localhost:8000/v1/admin/kill_all")
    assert res_local["success"] is False

    # Block AWS / Cloud metadata
    res_meta = await tool.execute(session_id="test_ssrf", url="http://169.254.169.254/latest/meta-data/")
    assert res_meta["success"] is False

    # Block private subnets
    res_priv1 = await tool.execute(session_id="test_ssrf", url="http://10.0.0.5/internal")
    assert res_priv1["success"] is False

    res_priv2 = await tool.execute(session_id="test_ssrf", url="http://192.168.1.1/admin")
    assert res_priv2["success"] is False

    # Block non-http schemes
    res_file = await tool.execute(session_id="test_ssrf", url="file:///C:/Windows/system32/cmd.exe")
    assert res_file["success"] is False

@pytest.mark.asyncio
async def test_web_fetch_reports_real_error_on_dead_url():
    tool = WebFetchTool()
    
    # Try an invalid domain or non-existent public URL
    res = await tool.execute(session_id="test_fetch", url="https://this-domain-does-not-exist-xyz-987654321.org")
    assert res["success"] is False
    assert "error" in res
    # Ensure NO fake mock competitor text is returned
    assert "Competitor specifications: Standard pricing is $20" not in str(res.get("content", ""))
    assert "Competitor specifications: Standard pricing is $20" not in str(res.get("error", ""))
