import httpx
import pytest

from app.main import app
from app.core.llm import OpenAICodexCLIProvider, AnthropicClaudeCLIProvider, AccountFailoverLLMProvider, BaseLLMProvider


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


@pytest.mark.asyncio
async def test_claude_code_provider_parses_json_output(monkeypatch):
    provider = AnthropicClaudeCLIProvider(command="claude")

    async def fake_run(_prompt):
        return '{"explanation":"ok","steps":[]}'

    monkeypatch.setattr(provider, "_run", fake_run)
    result = await provider.generate_plan("test")
    assert result["explanation"] == "ok"


@pytest.mark.asyncio
async def test_session_can_pin_an_explicit_provider_account():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/v1/settings/accounts", json={
            "provider": "offline_heuristic",
            "label": "Deterministic test account",
            "auth_type": "api_key",
        })
        assert created.status_code == 200
        account_id = created.json()["id"]
        session = await client.post("/v1/sessions", json={"task": "Create a short report", "provider_account_id": account_id})
        assert session.status_code == 200
        assert session.json()["provider_account_id"] == account_id
        removed = await client.delete(f"/v1/settings/accounts/{account_id}")
        assert removed.status_code == 200


@pytest.mark.asyncio
async def test_failover_only_moves_on_quota_error():
    class QuotaClient(BaseLLMProvider):
        async def generate_plan(self, task, memory_context=""):
            raise RuntimeError("quota exhausted (HTTP 429)")
        async def reason_step(self, *args, **kwargs):
            raise RuntimeError("quota exhausted")

    class GoodClient(BaseLLMProvider):
        async def generate_plan(self, task, memory_context=""):
            return {"explanation": "fallback", "steps": []}
        async def reason_step(self, *args, **kwargs):
            return {"tool": "execute_code", "params": {}}

    result = await AccountFailoverLLMProvider([QuotaClient(), GoodClient()]).generate_plan("test")
    assert result["explanation"] == "fallback"
