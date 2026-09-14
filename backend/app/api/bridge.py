import uuid
import httpx
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header
from app.config import settings
from app.core.audit import audit_logger

router = APIRouter(prefix="/bridge", tags=["bridge"])

class BridgeRegistration(BaseModel):
    client_name: str
    granted_folders: List[str]
    allow_browser_control: bool = False
    session_id: Optional[str] = None

class BridgeStatus(BaseModel):
    is_connected: bool
    granted_folders: List[str]
    allow_browser_control: bool
    last_heartbeat: Optional[str] = None

class ScopedFileRequest(BaseModel):
    session_id: Optional[str] = None
    folder: str
    relative_file: str
    action: str = "read"

_bridge_state: Dict[str, Any] = {
    "is_connected": False,
    "granted_folders": [],
    "allow_browser_control": False,
    "last_heartbeat": None,
    "session_grants": {},
    "browser_sessions": set(),
    "token": settings.BRIDGE_SECRET
}

@router.get("/status", response_model=BridgeStatus)
async def get_bridge_status(session_id: Optional[str] = None):
    folders = _bridge_state["session_grants"].get(session_id, _bridge_state["granted_folders"]) if session_id else _bridge_state["granted_folders"]
    browser_allowed = (session_id in _bridge_state["browser_sessions"] if session_id and _bridge_state["browser_sessions"] else _bridge_state["allow_browser_control"])
    last_heartbeat = _bridge_state["last_heartbeat"]
    connected = _bridge_state["is_connected"]
    if last_heartbeat:
        try:
            connected = connected and (datetime.now(timezone.utc) - datetime.fromisoformat(last_heartbeat)).total_seconds() <= 90
        except ValueError:
            connected = False
    return BridgeStatus(
        is_connected=connected,
        granted_folders=folders,
        allow_browser_control=browser_allowed,
        last_heartbeat=last_heartbeat
    )

@router.post("/grant_folder")
async def grant_folder(folder_path: str, session_id: Optional[str] = None, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    target = _bridge_state["session_grants"].setdefault(session_id, []) if session_id else _bridge_state["granted_folders"]
    if folder_path not in target:
        target.append(folder_path)
    return {"status": "granted", "session_id": session_id, "folders": target}

@router.post("/register")
async def register_bridge(payload: BridgeRegistration, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    _bridge_state["is_connected"] = True
    _bridge_state["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
    _bridge_state["allow_browser_control"] = payload.allow_browser_control
    if payload.session_id:
        _bridge_state["session_grants"][payload.session_id] = list(dict.fromkeys(payload.granted_folders))
        if payload.allow_browser_control:
            _bridge_state["browser_sessions"].add(payload.session_id)
    else:
        _bridge_state["granted_folders"] = list(dict.fromkeys(payload.granted_folders))
    _bridge_state["allow_browser_control"] = payload.allow_browser_control
    return {"status": "registered"}

@router.post("/heartbeat")
async def bridge_heartbeat(x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    _bridge_state["is_connected"] = True
    _bridge_state["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
    return {"status": "alive"}

@router.post("/request")
async def scoped_bridge_request(payload: ScopedFileRequest, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    if not (await get_bridge_status(payload.session_id)).is_connected:
        raise HTTPException(status_code=503, detail="Local bridge is offline.")
    granted_folders = _bridge_state["session_grants"].get(payload.session_id, _bridge_state["granted_folders"])
    if payload.folder not in granted_folders:
        audit_logger.log_event(payload.session_id or "bridge", "bridge_scope_denied", "bridge", {"folder": payload.folder, "relative_file": payload.relative_file, "action": payload.action})
        raise HTTPException(status_code=403, detail="Folder is not granted.")
    if payload.action not in ("read", "list"):
        raise HTTPException(status_code=400, detail="Unsupported bridge action.")
    if settings.BRIDGE_AGENT_URL:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{settings.BRIDGE_AGENT_URL.rstrip('/')}/file",
                    headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
                    json=payload.model_dump(),
                )
            if response.status_code >= 400:
                detail = response.json().get("error", "Bridge file request failed.")
                raise HTTPException(status_code=503, detail=detail)
            result = response.json()
            audit_logger.log_event(payload.session_id or "bridge", "bridge_request", "bridge", {"action": payload.action, "folder": payload.folder, "remote": True})
            return result
        except HTTPException:
            raise
        except Exception as exc:
            audit_logger.log_event(payload.session_id or "bridge", "bridge_scope_denied", "bridge", {"reason": "bridge_transport_error", "error": str(exc)})
            raise HTTPException(status_code=503, detail=f"Local bridge request failed: {exc}") from exc
    root = Path(payload.folder).resolve()
    target = (root / payload.relative_file).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Requested path is outside the granted folder.") from exc
    if payload.action == "list":
        if not target.is_dir():
            raise HTTPException(status_code=404, detail="Granted directory not found.")
        result = {"action": "list", "path": str(target), "items": [item.name for item in target.iterdir()]}
        audit_logger.log_event(payload.session_id or "bridge", "bridge_request", "bridge", {"action": payload.action, "path": str(target)})
        return result
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Granted file not found.")
    result = {"action": "read", "path": str(target), "content": target.read_text(encoding="utf-8", errors="replace")}
    audit_logger.log_event(payload.session_id or "bridge", "bridge_request", "bridge", {"action": payload.action, "path": str(target)})
    return result

class BrowserBridgeRequest(BaseModel):
    session_id: str
    action: str
    url: Optional[str] = None
    selector: Optional[str] = None
    text: Optional[str] = None

@router.post("/browser_request")
async def browser_bridge_request(payload: BrowserBridgeRequest, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    if not (await get_bridge_status(payload.session_id)).is_connected:
        audit_logger.log_event(payload.session_id, "bridge_scope_denied", "bridge", {"reason": "offline", "action": payload.action})
        raise HTTPException(status_code=503, detail="Local bridge is offline.")
    if not _bridge_state["allow_browser_control"]:
        audit_logger.log_event(payload.session_id, "bridge_scope_denied", "bridge", {"reason": "browser_not_granted", "action": payload.action})
        raise HTTPException(status_code=403, detail="Browser control is not granted.")
    if _bridge_state["browser_sessions"] and payload.session_id not in _bridge_state["browser_sessions"]:
        audit_logger.log_event(payload.session_id, "bridge_scope_denied", "bridge", {"reason": "browser_session_not_granted", "action": payload.action})
        raise HTTPException(status_code=403, detail="Browser control is not granted to this session.")
    audit_logger.log_event(payload.session_id, "browser_request_pending", "bridge", payload.model_dump())
    if not settings.BRIDGE_AGENT_URL:
        raise HTTPException(status_code=503, detail="Browser controller is not registered; no browser action was performed.")
    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                f"{settings.BRIDGE_AGENT_URL.rstrip('/')}/browser",
                headers={"X-Bridge-Token": settings.BRIDGE_SECRET},
                json=payload.model_dump(),
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=503, detail=response.json().get("error", "Browser bridge failed."))
        return response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Browser controller unavailable: {exc}") from exc

@router.post("/revoke_folder")
async def revoke_folder(folder_path: str, session_id: Optional[str] = None, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    target = _bridge_state["session_grants"].setdefault(session_id, []) if session_id else _bridge_state["granted_folders"]
    if folder_path in target:
        target.remove(folder_path)
    return {"status": "revoked", "session_id": session_id, "folders": target}

@router.post("/toggle_browser")
async def toggle_browser(enable: bool, session_id: Optional[str] = None, x_bridge_token: Optional[str] = Header(None)):
    if not x_bridge_token or x_bridge_token != settings.BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized: Valid X-Bridge-Token required.")
    _bridge_state["allow_browser_control"] = enable
    if session_id:
        if enable:
            _bridge_state["browser_sessions"].add(session_id)
        else:
            _bridge_state["browser_sessions"].discard(session_id)
    return {"allow_browser_control": enable, "session_id": session_id}
