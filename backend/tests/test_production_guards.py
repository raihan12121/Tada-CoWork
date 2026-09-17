import pytest
import httpx

from app.config import settings
from app.sandbox.process_sandbox import SandboxManager, ManagedSandboxSession
from app.main import lifespan


def test_production_rejects_local_sandbox(monkeypatch):
    manager = SandboxManager()
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SANDBOX_BACKEND", "local")
    with pytest.raises(RuntimeError, match="development-only"):
        manager.get_or_create("production-guard-test")


@pytest.mark.asyncio
async def test_production_startup_rejects_missing_security_configuration(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SANDBOX_BACKEND", "docker")
    monkeypatch.setattr(settings, "DEFAULT_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "configured")
    monkeypatch.setattr(settings, "API_AUTH_TOKEN", "")
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    monkeypatch.setattr(settings, "BRIDGE_SECRET", "")
    with pytest.raises(RuntimeError, match="Production configuration incomplete"):
        async with lifespan(None):
            pass


@pytest.mark.asyncio
async def test_managed_sandbox_adapter_sends_limits_and_normalizes_result(monkeypatch):
    monkeypatch.setattr(settings, "MANAGED_SANDBOX_URL", "https://sandbox.example.test")
    monkeypatch.setattr(settings, "MANAGED_SANDBOX_TOKEN", "worker-token")
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"success": True, "stdout": "managed output", "stderr": "", "exit_code": 0}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            captured["timeout"] = kwargs["timeout"]

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json, headers):
            captured.update({"url": url, "payload": json, "headers": headers})
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    sandbox = ManagedSandboxSession("managed-contract")
    result = await sandbox.execute_code("print('ok')", timeout_seconds=7)
    assert result["success"] is True
    assert result["stdout"] == "managed output"
    assert captured["url"] == "https://sandbox.example.test/v1/execute"
    assert captured["headers"] == {"Authorization": "Bearer worker-token"}
    assert captured["payload"]["session_id"] == "managed-contract"
    assert captured["payload"]["timeout_seconds"] == 7
    assert captured["payload"]["limits"]["network"] == settings.SANDBOX_NETWORK


def test_production_managed_sandbox_requires_https_and_provider_token(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "SANDBOX_BACKEND", "managed")
    monkeypatch.setattr(settings, "MANAGED_SANDBOX_URL", "http://sandbox.example.test")
    monkeypatch.setattr(settings, "MANAGED_SANDBOX_TOKEN", "")
    with pytest.raises(RuntimeError, match="HTTPS"):
        SandboxManager().get_or_create("managed-production-guard")
