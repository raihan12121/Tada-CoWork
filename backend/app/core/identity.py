"""Small dependency-free signed principal contract for local/edge deployments.

Production deployments can have an OIDC gateway mint HS256-compatible tokens
with the configured shared verification secret. The application never trusts a
client-supplied workspace header; workspace access comes only from verified
token claims.
"""

import base64
import hashlib
import hmac
import json
import time
import threading
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.config import settings

_jwks_cache: dict[str, Any] = {"expires_at": 0.0, "keys": {}}
_jwks_lock = threading.Lock()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass(frozen=True)
class Principal:
    subject: str
    organization_id: str
    workspace_ids: frozenset[str] = field(default_factory=frozenset)
    roles: frozenset[str] = field(default_factory=frozenset)

    @property
    def is_admin(self) -> bool:
        return bool(self.roles.intersection({"admin", "org_admin"}))

    def can_access_workspace(self, workspace_id: str) -> bool:
        return self.is_admin or "*" in self.workspace_ids or workspace_id in self.workspace_ids


def issue_access_token(
    subject: str,
    organization_id: str = "default",
    workspace_ids: Iterable[str] = (),
    roles: Iterable[str] = (),
    ttl_seconds: int = 3600,
) -> str:
    if not settings.IDENTITY_SECRET:
        raise RuntimeError("COAGENT_IDENTITY_SECRET is not configured")
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": subject,
        "org_id": organization_id,
        "workspace_ids": list(workspace_ids),
        "roles": list(roles),
        "iat": int(time.time()),
        "exp": int(time.time()) + max(1, ttl_seconds),
    }
    encoded_header = _b64(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{encoded_header}.{encoded_payload}".encode()
    signature = hmac.new(settings.IDENTITY_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64(signature)}"


def parse_access_token(token: str) -> Principal:
    if not settings.IDENTITY_SECRET:
        raise ValueError("Identity verification is not configured")
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed identity token")
    signing_input = f"{parts[0]}.{parts[1]}".encode()
    expected = hmac.new(settings.IDENTITY_SECRET.encode(), signing_input, hashlib.sha256).digest()
    try:
        supplied = _unb64(parts[2])
        payload: dict[str, Any] = json.loads(_unb64(parts[1]).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed identity token") from exc
    if not hmac.compare_digest(expected, supplied):
        raise ValueError("Invalid identity token signature")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Identity token expired")
    subject = str(payload.get("sub", "")).strip()
    organization_id = str(payload.get("org_id", "")).strip()
    if not subject or not organization_id:
        raise ValueError("Identity token is missing subject or organization")
    return Principal(
        subject=subject,
        organization_id=organization_id,
        workspace_ids=frozenset(str(item) for item in payload.get("workspace_ids", [])),
        roles=frozenset(str(item) for item in payload.get("roles", [])),
    )


def identity_verification_configured() -> bool:
    return bool(settings.IDENTITY_SECRET or settings.OIDC_JWKS_URL)


def _claim_list(payload: dict[str, Any], name: str) -> list[str]:
    value = payload.get(name, [])
    if isinstance(value, str):
        return [item for item in value.replace(",", " ").split() if item]
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item).strip()]
    return []


def _load_oidc_key(kid: str) -> dict[str, Any]:
    now = time.time()
    with _jwks_lock:
        if now >= float(_jwks_cache.get("expires_at", 0)):
            try:
                with urllib.request.urlopen(settings.OIDC_JWKS_URL, timeout=5) as response:
                    document = json.loads(response.read().decode("utf-8"))
                keys = {str(key.get("kid")): key for key in document.get("keys", []) if key.get("kid")}
                if not keys:
                    raise ValueError("OIDC JWKS contains no keyed signing certificates")
                _jwks_cache.update({"expires_at": now + 300, "keys": keys})
            except Exception as exc:
                raise ValueError(f"Unable to load OIDC signing keys: {exc}") from exc
        key = _jwks_cache.get("keys", {}).get(kid)
    if not key:
        raise ValueError("OIDC signing key is not available")
    return key


def _verify_rs256(signing_input: bytes, signature: bytes, key: dict[str, Any]) -> bool:
    if key.get("kty") != "RSA" or key.get("alg") not in {None, "RS256"}:
        return False
    try:
        modulus = int.from_bytes(_unb64(str(key["n"])), "big")
        exponent = int.from_bytes(_unb64(str(key["e"])), "big")
        expected_digest = hashlib.sha256(signing_input).digest()
        encoded = pow(int.from_bytes(signature, "big"), exponent, modulus).to_bytes((modulus.bit_length() + 7) // 8, "big")
        digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + expected_digest
        padding_length = len(encoded) - len(digest_info) - 3
        expected = b"\x00\x01" + (b"\xff" * padding_length) + b"\x00" + digest_info
        return hmac.compare_digest(encoded, expected)
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def parse_oidc_access_token(token: str) -> Principal:
    if not settings.OIDC_JWKS_URL:
        raise ValueError("OIDC verification is not configured")
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed OIDC token")
    try:
        header = json.loads(_unb64(parts[0]).decode("utf-8"))
        payload: dict[str, Any] = json.loads(_unb64(parts[1]).decode("utf-8"))
        signature = _unb64(parts[2])
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed OIDC token") from exc
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise ValueError("Unsupported OIDC token algorithm")
    key = _load_oidc_key(str(header["kid"]))
    if not _verify_rs256(f"{parts[0]}.{parts[1]}".encode("ascii"), signature, key):
        raise ValueError("Invalid OIDC token signature")
    now = int(time.time())
    if int(payload.get("exp", 0)) < now or (payload.get("nbf") is not None and int(payload["nbf"]) > now):
        raise ValueError("OIDC token is expired or not yet valid")
    if settings.OIDC_ISSUER and payload.get("iss") != settings.OIDC_ISSUER:
        raise ValueError("OIDC issuer mismatch")
    if settings.OIDC_AUDIENCE:
        audiences = _claim_list(payload, "aud")
        if settings.OIDC_AUDIENCE not in audiences:
            raise ValueError("OIDC audience mismatch")
    subject = str(payload.get("sub", "")).strip()
    organization_id = str(payload.get("org_id") or payload.get("organization_id") or payload.get("org") or "").strip()
    if not subject or not organization_id:
        raise ValueError("OIDC token is missing subject or organization")
    roles = set(_claim_list(payload, "roles"))
    realm_access = payload.get("realm_access")
    if isinstance(realm_access, dict):
        roles.update(_claim_list(realm_access, "roles"))
    workspaces = _claim_list(payload, settings.OIDC_WORKSPACE_CLAIM)
    if payload.get("admin") is True:
        roles.add("admin")
    return Principal(subject, organization_id, frozenset(workspaces), frozenset(roles))


def parse_identity_token(token: str) -> Principal:
    """Parse the configured production identity contract, failing closed."""
    if settings.OIDC_JWKS_URL:
        return parse_oidc_access_token(token)
    return parse_access_token(token)


def anonymous_principal() -> Principal:
    return Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"}))


def require_workspace_access(principal: Principal, workspace_id: str) -> None:
    if not principal.can_access_workspace(workspace_id):
        raise PermissionError(f"Principal '{principal.subject}' cannot access workspace '{workspace_id}'")
