"""Provider-account persistence and routing helpers for the local desktop app."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings
from app.core.secret_store import delete_secret, load_secret, save_secret

ACCOUNT_SECRET_DIR = settings.DATA_DIR / "provider_accounts"

SUPPORTED_PROVIDERS = {"openai", "openai_codex", "anthropic", "anthropic_claude", "gemini", "ollama", "lm_studio", "offline_heuristic"}
SUPPORTED_AUTH_TYPES = {"api_key", "local", "oauth"}


def secret_path(account_id: str) -> Path:
    return ACCOUNT_SECRET_DIR / f"{account_id}.dpapi"


def save_account_secret(account_id: str, secret: Dict[str, Any]) -> str:
    ref = f"dpapi://provider-account/{account_id}"
    save_secret(secret_path(account_id), json.dumps(secret).encode("utf-8"))
    return ref


def load_account_secret(account_id: str) -> Dict[str, Any]:
    raw = load_secret(secret_path(account_id))
    if not raw:
        return {}
    try:
        value = json.loads(raw.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except (ValueError, UnicodeDecodeError):
        return {}


def delete_account_secret(account_id: str) -> None:
    delete_secret(secret_path(account_id))


def new_account_id() -> str:
    return f"acct_{uuid.uuid4().hex}"


def sanitized_account(row: Any, active_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "provider": row.provider,
        "label": row.label,
        "auth_type": row.auth_type,
        "model": row.model or "",
        "endpoint": row.endpoint or "",
        "status": row.status,
        "configured": bool(row.secret_ref) or row.provider in {"openai_codex", "anthropic_claude", "ollama", "lm_studio", "offline_heuristic"},
        "quota_status": row.quota_status,
        "quota_remaining": row.quota_remaining,
        "quota_reset_at": row.quota_reset_at.isoformat() if row.quota_reset_at else None,
        "last_error": row.last_error,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "active": row.id == active_id,
    }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
