from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import MemoryItemModel, MemoryType
from app.memory.long_term_memory import long_term_memory

router = APIRouter(prefix="/memory", tags=["memory"])

class MemoryCreatePayload(BaseModel):
    type: MemoryType
    content: str
    key: Optional[str] = None
    workspace_id: str = "default"

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
    await long_term_memory.delete_memory_item(memory_id)
    return {"status": "deleted", "id": memory_id}

@router.post("/toggle")
async def toggle_memory(payload: MemoryTogglePayload):
    long_term_memory.set_memory_enabled(payload.workspace_id, payload.enabled)
    return {"workspace_id": payload.workspace_id, "enabled": payload.enabled}

@router.get("/status")
async def get_memory_status(workspace_id: str = Query("default")):
    enabled = long_term_memory.is_memory_enabled(workspace_id)
    return {"workspace_id": workspace_id, "enabled": enabled}
