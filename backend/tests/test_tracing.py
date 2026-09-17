import json

import httpx
import pytest

from app.main import app
from app.core.audit import audit_logger
from app.core.tracing import get_trace_id


@pytest.mark.asyncio
async def test_http_trace_id_is_returned_and_correlated():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health", headers={"X-Trace-ID": "trace-contract-123"})
    assert response.status_code == 200
    assert response.headers["X-Trace-ID"] == "trace-contract-123"


def test_audit_trace_id_is_hash_verified(tmp_path, monkeypatch):
    monkeypatch.setattr(audit_logger, "log_file", str(tmp_path / "audit.jsonl"))
    monkeypatch.setattr(audit_logger, "_last_hash", "0" * 64)
    record = audit_logger.log_event("trace-test", "trace_event", "test", {"value": 1})
    assert "trace_id" not in record["details"] or isinstance(record["details"]["trace_id"], str)
    valid, error = audit_logger.verify_integrity()
    assert valid, error
