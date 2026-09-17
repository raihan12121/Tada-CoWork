import base64

import httpx
import pytest

from app.config import settings
from app.core.identity import issue_access_token, parse_access_token, parse_identity_token, identity_verification_configured
from app.main import app


def test_signed_identity_token_round_trip_and_tamper_detection(monkeypatch):
    monkeypatch.setattr(settings, "IDENTITY_SECRET", "identity-test-secret")
    token = issue_access_token("user-1", "org-1", ["workspace-a"], ["member"])
    principal = parse_access_token(token)
    assert principal.subject == "user-1"
    assert principal.can_access_workspace("workspace-a")
    assert not principal.can_access_workspace("workspace-b")
    parts = token.split(".")
    parts[1] = base64.urlsafe_b64encode(b"{}").rstrip(b"=").decode()
    with pytest.raises(ValueError, match="signature"):
        parse_access_token(".".join(parts))


@pytest.mark.asyncio
async def test_session_routes_enforce_signed_workspace_claims(monkeypatch):
    monkeypatch.setattr(settings, "IDENTITY_SECRET", "identity-http-secret")
    monkeypatch.setattr(settings, "API_AUTH_TOKEN", "static-api-token")
    allowed = issue_access_token("user-a", "org-1", ["workspace-a"], ["member"])
    denied = issue_access_token("user-b", "org-1", ["workspace-b"], ["member"])
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/v1/sessions",
            headers={"Authorization": f"Bearer {allowed}"},
            json={"task": "Create a report", "workspace_id": "workspace-a"},
        )
        assert created.status_code == 200
        session_id = created.json()["id"]
        denied_create = await client.post(
            "/v1/sessions",
            headers={"Authorization": f"Bearer {denied}"},
            json={"task": "Create a report", "workspace_id": "workspace-a"},
        )
        assert denied_create.status_code == 403
        denied_read = await client.get(
            f"/v1/sessions/{session_id}",
            headers={"Authorization": f"Bearer {denied}"},
        )
        assert denied_read.status_code == 403


def test_oidc_mode_is_selected_and_rejects_non_rs256_tokens(monkeypatch):
    monkeypatch.setattr(settings, "IDENTITY_SECRET", "")
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", "https://issuer.example/.well-known/jwks.json")
    assert identity_verification_configured()
    malformed = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.AA"
    with pytest.raises(ValueError, match="algorithm"):
        parse_identity_token(malformed)
