from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, HTTPException, Query, Request
from app.models.schemas import MemoryItemModel, MemoryType, MemoryUpdate
from app.memory.long_term_memory import long_term_memory
from app.core.identity import Principal, require_workspace_access
from app.db.session import AsyncSessionLocal, DBMemoryItem
from sqlalchemy import select

router = APIRouter(prefix="/memory", tags=["memory"])


def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))


def _assert_workspace(request: Request, workspace_id: str) -> None:
    try:
        require_workspace_access(_principal(request), workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc


async def _assert_memory_item_access(request: Request, memory_id: str) -> None:
    async with AsyncSessionLocal() as db:
        item = await db.get(DBMemoryItem, memory_id)
    if not item:
        raise HTTPException(status_code=404, detail="Memory item not found")
    _assert_workspace(request, item.workspace_id)

class MemoryCreatePayload(BaseModel):
    type: MemoryType
    content: str = Field(..., min_length=1)
    key: Optional[str] = None
    workspace_id: str = "default"

    @field_validator("content")
    @classmethod
    def validate_content_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Content cannot be empty or only whitespace")
        return v.strip()

class MemoryTogglePayload(BaseModel):
    workspace_id: str = "default"
    enabled: bool

@router.get("", response_model=List[MemoryItemModel])
async def list_memories(request: Request, workspace_id: str = Query("default")):
    _assert_workspace(request, workspace_id)
    return await long_term_memory.list_all_memory(workspace_id)

@router.post("", response_model=MemoryItemModel)
async def create_memory(request: Request, payload: MemoryCreatePayload):
    _assert_workspace(request, payload.workspace_id)
    if not long_term_memory.is_memory_enabled(payload.workspace_id):
        raise HTTPException(
            status_code=409,
            detail="Long-term memory is disabled for this workspace. Enable it explicitly before storing memory.",
        )
    return await long_term_memory.add_memory_item(
        memory_type=payload.type,
        content=payload.content,
        workspace_id=payload.workspace_id,
        key=payload.key
    )

@router.delete("/{memory_id}")
async def delete_memory(request: Request, memory_id: str):
    await _assert_memory_item_access(request, memory_id)
    deleted = await long_term_memory.delete_memory_item(memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return {"status": "deleted", "id": memory_id}

@router.patch("/{memory_id}", response_model=MemoryItemModel)
async def update_memory(request: Request, memory_id: str, payload: MemoryUpdate):
    await _assert_memory_item_access(request, memory_id)
    updated = await long_term_memory.update_memory_item(memory_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return updated

@router.post("/toggle")
async def toggle_memory(request: Request, payload: MemoryTogglePayload):
    _assert_workspace(request, payload.workspace_id)
    await long_term_memory.persist_memory_enabled(payload.workspace_id, payload.enabled)
    return {"workspace_id": payload.workspace_id, "enabled": payload.enabled}

@router.get("/status")
async def get_memory_status(request: Request, workspace_id: str = Query("default")):
    _assert_workspace(request, workspace_id)
    enabled = long_term_memory.is_memory_enabled(workspace_id)
    return {"workspace_id": workspace_id, "enabled": enabled}
