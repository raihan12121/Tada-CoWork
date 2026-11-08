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
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.config import settings

_jwks_cache: dict[str, Any] = {"expires_at": 0.0, "keys": {}}
_jwks_lock = threading.Lock()

# PyJWT is the preferred verifier; the dependency-free fallback below keeps the
# desktop bundle working if cryptography is unavailable in a frozen build.
_PYJWT: Any = None
_PYJWT_PROBED = False


def _load_pyjwt() -> Any:
    """Import PyJWT lazily so a missing optional dependency degrades safely."""
    global _PYJWT, _PYJWT_PROBED
    if not _PYJWT_PROBED:
        try:
            import jwt as _module
            _PYJWT = _module
        except Exception:  # pragma: no cover - optional dependency
            _PYJWT = False
        _PYJWT_PROBED = True
    return _PYJWT


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
    leeway = max(0, settings.IDENTITY_LEEWAY_SECONDS)
    exp = payload.get("exp")
    if exp is None or int(exp) + leeway < int(time.time()):
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


def _load_oidc_key(kid: str, force_refresh: bool = False) -> dict[str, Any]:
    now = time.time()
    with _jwks_lock:
        cached_keys = _jwks_cache.get("keys", {})
        stale = now >= float(_jwks_cache.get("expires_at", 0))
        # An unknown ``kid`` usually means the provider rotated keys; refresh
        # once instead of rejecting otherwise valid tokens until the TTL ends.
        if force_refresh or stale or kid not in cached_keys:
            try:
                with urllib.request.urlopen(settings.OIDC_JWKS_URL, timeout=5) as response:
                    document = json.loads(response.read().decode("utf-8"))
                keys = {str(key.get("kid")): key for key in document.get("keys", []) if key.get("kid")}
                if not keys:
                    raise ValueError("OIDC JWKS contains no keyed signing certificates")
                _jwks_cache.update({"expires_at": now + settings.OIDC_JWKS_TTL_SECONDS, "keys": keys})
            except Exception as exc:
                raise ValueError(f"Unable to load OIDC signing keys: {exc}") from exc
        key = _jwks_cache.get("keys", {}).get(kid)
    if not key:
        raise ValueError("OIDC signing key is not available")
    return key


def _verify_rs256(signing_input: bytes, signature: bytes, key: dict[str, Any]) -> bool:
    """Dependency-free RSASSA-PKCS1-v1_5 verification (fallback path only).

    Used when PyJWT/cryptography is not installed. Enforces the full modulus
    width and the RFC 8017 minimum padding length so truncated or malformed
    signatures cannot verify.
    """
    if key.get("kty") != "RSA" or key.get("alg") not in {None, "RS256"}:
        return False
    try:
        modulus = int.from_bytes(_unb64(str(key["n"])), "big")
        exponent = int.from_bytes(_unb64(str(key["e"])), "big")
        modulus_bytes = (modulus.bit_length() + 7) // 8
        if len(signature) != modulus_bytes or exponent < 3 or exponent % 2 == 0:
            return False
        expected_digest = hashlib.sha256(signing_input).digest()
        encoded = pow(int.from_bytes(signature, "big"), exponent, modulus).to_bytes(modulus_bytes, "big")
        digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + expected_digest
        padding_length = len(encoded) - len(digest_info) - 3
        if padding_length < 8:
            return False
        expected = b"\x00\x01" + (b"\xff" * padding_length) + b"\x00" + digest_info
        return hmac.compare_digest(encoded, expected)
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def _decode_rs256(token: str, key: dict[str, Any]) -> dict[str, Any]:
    """Verify an RS256 JWT and return its claims, raising ``ValueError`` on failure."""
    leeway = max(0, settings.IDENTITY_LEEWAY_SECONDS)
    pyjwt = _load_pyjwt()
    if pyjwt:
        try:
            key_object = pyjwt.PyJWK(key, algorithm="RS256").key
        except Exception as exc:  # malformed JWK
            raise ValueError("OIDC signing key is unusable") from exc
        kwargs: dict[str, Any] = {}
        if settings.OIDC_ISSUER:
            kwargs["issuer"] = settings.OIDC_ISSUER
        if settings.OIDC_AUDIENCE:
            kwargs["audience"] = settings.OIDC_AUDIENCE
        try:
            return pyjwt.decode(
                token,
                key_object,
                algorithms=["RS256"],
                leeway=leeway,
                options={"require": ["exp"]},
                **kwargs,
            )
        except pyjwt.InvalidSignatureError as exc:
            raise ValueError("Invalid OIDC token signature") from exc
        except (pyjwt.ExpiredSignatureError, pyjwt.ImmatureSignatureError) as exc:
            raise ValueError("OIDC token is expired or not yet valid") from exc
        except pyjwt.InvalidIssuerError as exc:
            raise ValueError("OIDC issuer mismatch") from exc
        except pyjwt.InvalidAudienceError as exc:
            raise ValueError("OIDC audience mismatch") from exc
        except pyjwt.InvalidAlgorithmError as exc:
            raise ValueError("Unsupported OIDC token algorithm") from exc
        except pyjwt.PyJWTError as exc:
            raise ValueError(f"Invalid OIDC token: {exc}") from exc

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed OIDC token")
    try:
        payload: dict[str, Any] = json.loads(_unb64(parts[1]).decode("utf-8"))
        signature = _unb64(parts[2])
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed OIDC token") from exc
    if not _verify_rs256(f"{parts[0]}.{parts[1]}".encode("ascii"), signature, key):
        raise ValueError("Invalid OIDC token signature")
    now = int(time.time())
    exp = payload.get("exp")
    if exp is None or int(exp) + leeway < now:
        raise ValueError("OIDC token is expired or not yet valid")
    if payload.get("nbf") is not None and int(payload["nbf"]) > now + leeway:
        raise ValueError("OIDC token is expired or not yet valid")
    if settings.OIDC_ISSUER and payload.get("iss") != settings.OIDC_ISSUER:
        raise ValueError("OIDC issuer mismatch")
    if settings.OIDC_AUDIENCE and settings.OIDC_AUDIENCE not in _claim_list(payload, "aud"):
        raise ValueError("OIDC audience mismatch")
    return payload


def parse_oidc_access_token(token: str) -> Principal:
    if not settings.OIDC_JWKS_URL:
        raise ValueError("OIDC verification is not configured")
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed OIDC token")
    try:
        header = json.loads(_unb64(parts[0]).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed OIDC token") from exc
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise ValueError("Unsupported OIDC token algorithm")
    key = _load_oidc_key(str(header["kid"]))
    payload = _decode_rs256(token, key)
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
