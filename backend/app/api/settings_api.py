from fastapi import APIRouter, HTTPException, Request
import httpx

from app.core.identity import Principal, require_workspace_access
from app.core.llm import configure_runtime_provider, current_provider_config, get_llm_client

router = APIRouter(prefix="/settings", tags=["settings"])


def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))


@router.get("/llm")
async def get_llm_settings(request: Request):
    require_workspace_access(_principal(request), "default")
    return current_provider_config()


@router.put("/llm")
async def update_llm_settings(request: Request):
    require_workspace_access(_principal(request), "default")
    payload = await request.json()
    provider = str(payload.get("provider", "")).strip().lower()
    if provider not in {"openai", "openai_codex", "anthropic", "anthropic_claude", "gemini", "ollama", "lm_studio", "offline_heuristic"}:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    api_key = str(payload.get("api_key", ""))
    endpoint = str(payload.get("endpoint", ""))
    model = str(payload.get("model", ""))
    if provider in {"openai", "anthropic", "gemini"} and not api_key:
        raise HTTPException(status_code=400, detail="An API key is required for this provider")
    if provider in {"ollama", "lm_studio"} and endpoint and not endpoint.startswith(("http://127.0.0.1", "http://localhost", "https://")):
        raise HTTPException(status_code=400, detail="Local-model endpoints must be localhost or HTTPS")
    configure_runtime_provider(provider, api_key, endpoint, model)
    return current_provider_config()


@router.post("/llm/test")
async def test_llm_settings(request: Request):
    require_workspace_access(_principal(request), "default")
    config = current_provider_config()
    if config["provider"] == "offline_heuristic":
        return {"success": False, "detail": "Offline heuristic mode has no AI model connection"}
    try:
        client = get_llm_client()
        result = await client.generate_plan("Reply with a one-step plan for testing the configured AI connection.")
        if not result.get("steps"):
            raise ValueError("The provider returned no structured plan")
        return {"success": True, "provider": config["provider"], "model": config["model"]}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI provider test failed: {exc}") from exc
