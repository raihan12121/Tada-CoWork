from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import delete, select

from app.core.identity import Principal, require_workspace_access
from app.core.llm import configure_runtime_provider, current_provider_config, get_llm_client_for_account
from app.core.provider_accounts import (
    SUPPORTED_AUTH_TYPES,
    SUPPORTED_PROVIDERS,
    delete_account_secret,
    load_account_secret,
    new_account_id,
    sanitized_account,
    save_account_secret,
)
from app.db.session import AsyncSessionLocal, DBProviderAccount

router = APIRouter(prefix="/settings/accounts", tags=["provider accounts"])


def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))


def _workspace(request: Request) -> str:
    workspace = _principal(request).workspace_ids
    return next(iter(workspace), "default") if workspace and "*" not in workspace else "default"


def _validate_payload(payload: Dict[str, Any]) -> tuple[str, str, str, str, str, str]:
    provider = str(payload.get("provider", "")).strip().lower()
    label = str(payload.get("label", "")).strip()
    auth_type = str(payload.get("auth_type", "api_key")).strip().lower()
    model = str(payload.get("model", "")).strip()
    endpoint = str(payload.get("endpoint", "")).strip()
    secret = str(payload.get("secret", ""))
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    if auth_type not in SUPPORTED_AUTH_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported authentication type")
    if not label:
        raise HTTPException(status_code=400, detail="Account label is required")
    if provider in {"openai", "anthropic", "gemini"} and auth_type == "api_key" and not secret:
        raise HTTPException(status_code=400, detail="An API key is required")
    if provider == "openai_codex" and auth_type != "oauth":
        raise HTTPException(status_code=400, detail="ChatGPT subscription accounts must use the official Codex CLI login")
    if auth_type == "oauth":
        raise HTTPException(status_code=400, detail="OAuth account linking is not enabled until the provider-approved OAuth adapter is configured")
    if provider in {"ollama", "lm_studio"} and endpoint and not endpoint.startswith(("http://127.0.0.1", "http://localhost", "https://")):
        raise HTTPException(status_code=400, detail="Local-model endpoints must be localhost or HTTPS")
    return provider, label, auth_type, model, endpoint, secret


@router.get("", response_model=List[Dict[str, Any]])
async def list_provider_accounts(request: Request):
    workspace = _workspace(request)
    require_workspace_access(_principal(request), workspace)
    active_id = current_provider_config().get("account_id")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBProviderAccount).where(DBProviderAccount.workspace_id == workspace).order_by(DBProviderAccount.created_at))
        return [sanitized_account(row, active_id) for row in result.scalars().all()]


@router.post("", response_model=Dict[str, Any])
async def create_provider_account(request: Request):
    workspace = _workspace(request)
    require_workspace_access(_principal(request), workspace)
    payload = await request.json()
    provider, label, auth_type, model, endpoint, secret = _validate_payload(payload)
    account_id = new_account_id()
    secret_ref = save_account_secret(account_id, {"secret": secret}) if secret else None
    row = DBProviderAccount(id=account_id, workspace_id=workspace, provider=provider, label=label, auth_type=auth_type, model=model or None, endpoint=endpoint or None, secret_ref=secret_ref)
    async with AsyncSessionLocal() as db:
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return sanitized_account(row)


@router.post("/{account_id}/select", response_model=Dict[str, Any])
async def select_provider_account(request: Request, account_id: str):
    workspace = _workspace(request)
    require_workspace_access(_principal(request), workspace)
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == account_id, DBProviderAccount.workspace_id == workspace))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Provider account not found")
        secret = load_account_secret(row.id).get("secret", "")
        if row.provider in {"openai", "anthropic", "gemini"} and not secret:
            raise HTTPException(status_code=409, detail="Provider account credential is unavailable")
        configure_runtime_provider(row.provider, secret, row.endpoint or "", row.model or "", account_id=row.id)
        row.last_used_at = datetime.now(timezone.utc)
        row.last_error = None
        await db.commit()
        return sanitized_account(row, row.id)


@router.post("/{account_id}/test")
async def test_provider_account(request: Request, account_id: str):
    workspace = _workspace(request)
    require_workspace_access(_principal(request), workspace)
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == account_id, DBProviderAccount.workspace_id == workspace))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Provider account not found")
        secret = load_account_secret(row.id).get("secret", "")
        try:
            client = get_llm_client_for_account(row.provider, secret, row.endpoint or "", row.model or "")
            result = await client.generate_plan("Reply with a one-step plan for testing the configured AI connection.")
            if not result.get("steps"):
                raise ValueError("The provider returned no structured plan")
            row.status, row.last_error, row.quota_status = "active", None, "unknown"
            await db.commit()
            return {"success": True, "provider": row.provider, "model": row.model or "default"}
        except Exception as exc:
            row.status, row.last_error = "error", str(exc)[:1000]
            await db.commit()
            raise HTTPException(status_code=502, detail=f"AI provider test failed: {exc}") from exc


@router.delete("/{account_id}")
async def delete_provider_account(request: Request, account_id: str):
    workspace = _workspace(request)
    require_workspace_access(_principal(request), workspace)
    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == account_id, DBProviderAccount.workspace_id == workspace))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Provider account not found")
        was_active = current_provider_config().get("account_id") == row.id
        delete_account_secret(row.id)
        await db.execute(delete(DBProviderAccount).where(DBProviderAccount.id == account_id))
        await db.commit()
        if was_active:
            configure_runtime_provider("offline_heuristic")
    return {"deleted": True, "account_id": account_id}
