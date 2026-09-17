import pytest
from pathlib import Path
from bridge.agent import LocalBridgeAgent
from app.tools.web_fetch import WebFetchTool, is_domain_granted
from app.tools.bridge_files import BridgeListFilesTool

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


def test_domain_grants_are_exact_or_subdomain_scoped():
    assert is_domain_granted("docs.example.com", ["example.com"])
    assert is_domain_granted("example.com", ["https://example.com"])
    assert not is_domain_granted("example.com.evil.test", ["example.com"])
    assert not is_domain_granted("other.test", ["example.com"])


@pytest.mark.asyncio
async def test_web_fetch_rejects_ungranted_domain_before_network_call():
    result = await WebFetchTool().execute(
        session_id="domain-scope-test",
        url="https://example.com/report",
        allowed_domains=["trusted.example"],
    )
    assert result["success"] is False
    assert "not granted" in result["error"]


def test_local_bridge_scoped_move_and_traversal_rejection(tmp_path: Path):
    source = tmp_path / "source.txt"
    source.write_text("bridge data", encoding="utf-8")
    agent = LocalBridgeAgent("test-token", [str(tmp_path)])
    moved = agent.file_action({
        "folder": str(tmp_path),
        "relative_file": "source.txt",
        "destination_file": "organized/source.txt",
        "action": "move",
    })
    assert moved["action"] == "move"
    assert (tmp_path / "organized" / "source.txt").read_text(encoding="utf-8") == "bridge data"
    with pytest.raises(PermissionError):
        agent.file_action({
            "folder": str(tmp_path),
            "relative_file": "../outside.txt",
            "action": "read",
        })


@pytest.mark.asyncio
async def test_bridge_tool_reports_offline_without_agent(monkeypatch):
    monkeypatch.setattr("app.tools.bridge_files.settings.BRIDGE_AGENT_URL", "")
    result = await BridgeListFilesTool().execute(session_id="bridge-offline", folder="D:/Downloads")
    assert result["success"] is False
    assert result["status"] == "bridge_offline"
