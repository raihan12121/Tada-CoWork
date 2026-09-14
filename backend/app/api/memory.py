from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import MemoryItemModel, MemoryType, MemoryUpdate
from app.memory.long_term_memory import long_term_memory

router = APIRouter(prefix="/memory", tags=["memory"])

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
async def list_memories(workspace_id: str = Query("default")):
    return await long_term_memory.list_all_memory(workspace_id)

@router.post("", response_model=MemoryItemModel)
async def create_memory(payload: MemoryCreatePayload):
    return await long_term_memory.add_memory_item(
        memory_type=payload.type,
        content=payload.content,
        workspace_id=payload.workspace_id,
        key=payload.key
    )

@router.delete("/{memory_id}")
async def delete_memory(memory_id: str):
    deleted = await long_term_memory.delete_memory_item(memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return {"status": "deleted", "id": memory_id}

@router.patch("/{memory_id}", response_model=MemoryItemModel)
async def update_memory(memory_id: str, payload: MemoryUpdate):
    updated = await long_term_memory.update_memory_item(memory_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Memory item not found")
    return updated

@router.post("/toggle")
async def toggle_memory(payload: MemoryTogglePayload):
    await long_term_memory.persist_memory_enabled(payload.workspace_id, payload.enabled)
    return {"workspace_id": payload.workspace_id, "enabled": payload.enabled}

@router.get("/status")
async def get_memory_status(workspace_id: str = Query("default")):
    enabled = long_term_memory.is_memory_enabled(workspace_id)
    return {"workspace_id": workspace_id, "enabled": enabled}
