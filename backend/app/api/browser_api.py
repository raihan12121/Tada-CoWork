from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Request, Body
from pydantic import BaseModel
from app.sandbox.browser_service import browser_service
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/browser", tags=["browser"])

class NavigateRequest(BaseModel):
    url: str

class BrowserActionRequest(BaseModel):
    action: str  # "click", "type", "press_key", "scroll", "refresh"
    x: Optional[int] = None
    y: Optional[int] = None
    text: Optional[str] = None
    key: Optional[str] = None
    delta_y: Optional[int] = 300

@router.get("/status")
async def get_browser_status():
    return await browser_service.get_status()

@router.post("/navigate")
async def navigate_browser(payload: NavigateRequest):
    if not payload.url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    res = await browser_service.navigate(payload.url)
    return res

@router.post("/action")
async def execute_browser_action(payload: BrowserActionRequest):
    action = payload.action.lower()
    if action == "click":
        if payload.x is None or payload.y is None:
            raise HTTPException(status_code=400, detail="Coordinates (x, y) required for click")
        return await browser_service.click(payload.x, payload.y)
    elif action == "type":
        if payload.text is None:
            raise HTTPException(status_code=400, detail="Text required for type action")
        return await browser_service.type_text(payload.text)
    elif action == "press_key":
        if not payload.key:
            raise HTTPException(status_code=400, detail="Key required for press_key")
        return await browser_service.press_key(payload.key)
    elif action == "scroll":
        return await browser_service.scroll(delta_y=payload.delta_y or 300)
    elif action == "refresh":
        status = await browser_service.get_status()
        url = status.get("url") or "https://www.google.com"
        return await browser_service.navigate(url)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported browser action: {payload.action}")

@router.get("/screenshot")
async def get_browser_screenshot():
    data = await browser_service.capture_screenshot()
    return {"screenshot": data}

@router.get("/content")
async def get_browser_content():
    text = await browser_service.get_page_text()
    return {"text": text}
