import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header
from app.config import settings

router = APIRouter(prefix="/bridge", tags=["bridge"])

class BridgeRegistration(BaseModel):
    client_name: str
    granted_folders: List[str]
    allow_browser_control: bool = False

class BridgeStatus(BaseModel):
    is_connected: bool
    granted_folders: List[str]
    allow_browser_control: bool
    last_heartbeat: Optional[str] = None

class ScopedFileRequest(BaseModel):
    folder: str
    relative_file: str

_bridge_state: Dict[str, Any] = {
    "is_connected": True,
    "granted_folders": ["D:/SampleDownloads", "C:/UserDocs/Reports"],
    "allow_browser_control": True,
    "token": settings.BRIDGE_SECRET
}

@router.get("/status", response_model=BridgeStatus)
async def get_bridge_status():
    return BridgeStatus(
        is_connected=_bridge_state["is_connected"],
        granted_folders=_bridge_state["granted_folders"],
        allow_browser_control=_bridge_state["allow_browser_control"]
    )

@router.post("/grant_folder")
async def grant_folder(folder_path: str):
    if folder_path not in _bridge_state["granted_folders"]:
        _bridge_state["granted_folders"].append(folder_path)
    return {"status": "granted", "folders": _bridge_state["granted_folders"]}

@router.post("/revoke_folder")
async def revoke_folder(folder_path: str):
    if folder_path in _bridge_state["granted_folders"]:
        _bridge_state["granted_folders"].remove(folder_path)
    return {"status": "revoked", "folders": _bridge_state["granted_folders"]}

@router.post("/toggle_browser")
async def toggle_browser(enable: bool):
    _bridge_state["allow_browser_control"] = enable
    return {"allow_browser_control": enable}
