import json
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db, DBChannel
from app.models.schemas import ChannelModel, ChannelCreate
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/channels", tags=["channels"])

def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))

def _row_to_model(row: DBChannel) -> ChannelModel:
    bot_ids = []
    try:
        bot_ids = json.loads(row.bot_ids_json or "[]")
    except Exception:
        bot_ids = []
    return ChannelModel(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        description=row.description,
        bot_ids=bot_ids,
        created_at=row.created_at,
        updated_at=row.updated_at
    )

@router.get("", response_model=List[ChannelModel])
async def list_channels(
    request: Request,
    workspace_id: str = Query("default"),
    db: AsyncSession = Depends(get_db)
):
    principal = _principal(request)
    try:
        require_workspace_access(principal, workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    stmt = select(DBChannel).where(DBChannel.workspace_id == workspace_id).order_by(DBChannel.name.asc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_row_to_model(r) for r in rows]

@router.post("", response_model=ChannelModel)
async def create_channel(
    request: Request,
    data: ChannelCreate,
    db: AsyncSession = Depends(get_db)
):
    principal = _principal(request)
    try:
        require_workspace_access(principal, data.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

    channel_id = f"channel_{uuid.uuid4().hex[:10]}"
    row = DBChannel(
        id=channel_id,
        workspace_id=data.workspace_id,
        name=data.name,
        description=data.description,
        bot_ids_json=json.dumps(data.bot_ids)
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)

@router.get("/{channel_id}", response_model=ChannelModel)
async def get_channel(
    request: Request,
    channel_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBChannel, channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    return _row_to_model(row)

@router.delete("/{channel_id}")
async def delete_channel(
    request: Request,
    channel_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBChannel, channel_id)
    if not row:
        raise HTTPException(status_code=404, detail="Channel not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    await db.delete(row)
    await db.commit()
    return {"status": "deleted", "id": channel_id}
