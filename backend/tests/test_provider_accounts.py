import httpx
import pytest

from app.main import app
from app.core.llm import OpenAICodexCLIProvider


@pytest.mark.asyncio
async def test_provider_account_lifecycle_for_local_model():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/v1/settings/accounts", json={
            "provider": "ollama",
            "label": "Test Ollama",
            "auth_type": "local",
            "endpoint": "http://127.0.0.1:11434/v1",
            "model": "test-model",
        })
        assert created.status_code == 200
        account = created.json()
        assert account["configured"] is True
        account_id = account["id"]

        selected = await client.post(f"/v1/settings/accounts/{account_id}/select")
        assert selected.status_code == 200
        settings = await client.get("/v1/settings/llm")
        assert settings.status_code == 200
        assert settings.json()["account_id"] == account_id

        removed = await client.delete(f"/v1/settings/accounts/{account_id}")
        assert removed.status_code == 200
        # Keep the shared local test runtime deterministic for later tests.
        reset = await client.put("/v1/settings/llm", json={"provider": "offline_heuristic"})
        assert reset.status_code == 200


@pytest.mark.asyncio
async def test_codex_cli_provider_parses_structured_response(monkeypatch):
    provider = OpenAICodexCLIProvider(command="codex")

    async def fake_run(_prompt):
        return '{"explanation":"ok","steps":[]}'

    monkeypatch.setattr(provider, "_run", fake_run)
    result = await provider.generate_plan("test")
    assert result["explanation"] == "ok"
