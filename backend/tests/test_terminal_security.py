import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_terminal_executes_safe_command():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a session
        sess_resp = await client.post("/v1/sessions", json={"task": "Terminal Test Session"})
        assert sess_resp.status_code == 200
        session_id = sess_resp.json()["id"]

        # Run echo command
        term_resp = await client.post(
            f"/v1/sessions/{session_id}/terminal",
            json={"command": "echo Hello AnyWork", "timeout_seconds": 10}
        )
        assert term_resp.status_code == 200
        result = term_resp.json()
        assert result["success"] is True
        assert "Hello AnyWork" in result["stdout"]
        assert result["exit_code"] == 0

@pytest.mark.asyncio
async def test_terminal_blocks_dangerous_destructive_commands():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        sess_resp = await client.post("/v1/sessions", json={"task": "Security Session"})
        assert sess_resp.status_code == 200
        session_id = sess_resp.json()["id"]

        dangerous_commands = [
            "del /f /s /q C:\\Windows",
            "format C: /fs:ntfs",
            "rmdir /s /q C:\\",
            "shutdown /s /t 0",
            ":(){ :|:& };:",
        ]

        for cmd in dangerous_commands:
            term_resp = await client.post(
                f"/v1/sessions/{session_id}/terminal",
                json={"command": cmd, "timeout_seconds": 5}
            )
            # Must either return 400/403 or return a failed result with security block message
            if term_resp.status_code == 200:
                result = term_resp.json()
                assert result["success"] is False
                assert any(kw in (result["stderr"] + result["stdout"]).lower() for kw in ["blocked", "security", "prohibited", "dangerous", "not allowed"])
            else:
                assert term_resp.status_code in (400, 403)

@pytest.mark.asyncio
async def test_terminal_handles_timeout():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        sess_resp = await client.post("/v1/sessions", json={"task": "Timeout Session"})
        assert sess_resp.status_code == 200
        session_id = sess_resp.json()["id"]

        # Run sleep / timeout
        term_resp = await client.post(
            f"/v1/sessions/{session_id}/terminal",
            json={"command": "ping 127.0.0.1 -n 4 > nul", "timeout_seconds": 1}
        )
        assert term_resp.status_code == 200
        result = term_resp.json()
        assert result["success"] is False
        assert "timed out" in result["stderr"].lower()
