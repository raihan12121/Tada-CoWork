import pytest

from app.config import settings
from app.sandbox.process_sandbox import SandboxManager
from app.tools.file_ops import WriteFileTool


def test_session_disk_limit_rejects_projected_growth(monkeypatch):
    monkeypatch.setattr(settings, "DEFAULT_MAX_DISK_BYTES", 1)
    sandbox = SandboxManager().get_or_create("disk-limit-test")
    with pytest.raises(OSError, match="disk limit"):
        sandbox.ensure_disk_capacity(2)


@pytest.mark.asyncio
async def test_write_file_enforces_disk_limit(monkeypatch):
    monkeypatch.setattr(settings, "DEFAULT_MAX_DISK_BYTES", 8)
    manager = SandboxManager()
    import app.tools.file_ops as file_ops_module
    original = file_ops_module.sandbox_manager
    file_ops_module.sandbox_manager = manager
    try:
        with pytest.raises(OSError, match="disk limit"):
            await WriteFileTool().execute(session_id="disk-write-limit-test", path="large.txt", content="012345678")
    finally:
        file_ops_module.sandbox_manager = original
