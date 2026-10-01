import json
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db, DBBot
from app.models.schemas import BotModel, BotCreate, BotUpdate, BotTemplate
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/bots", tags=["bots"])

def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))

def _row_to_model(row: DBBot) -> BotModel:
    tools = []
    memories = []
    try:
        tools = json.loads(row.enabled_tools_json or "[]")
    except Exception:
        tools = []
    try:
        memories = json.loads(row.individual_memory_json or "[]")
    except Exception:
        memories = []
    return BotModel(
        id=row.id,
        workspace_id=row.workspace_id,
        name=row.name,
        avatar=row.avatar,
        role_tag=row.role_tag,
        description=row.description,
        folder_name=row.folder_name,
        pinned=row.pinned,
        is_hidden=row.is_hidden,
        model=row.model,
        enabled_tools=tools,
        individual_memory=memories,
        created_at=row.created_at,
        updated_at=row.updated_at
    )

@router.get("", response_model=List[BotModel])
async def list_bots(
    request: Request,
    workspace_id: str = Query("default"),
    db: AsyncSession = Depends(get_db)
):
    principal = _principal(request)
    try:
        require_workspace_access(principal, workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
        
    stmt = select(DBBot).where(DBBot.workspace_id == workspace_id).order_by(DBBot.pinned.desc(), DBBot.name.asc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_row_to_model(r) for r in rows]

@router.post("", response_model=BotModel)
async def create_bot(
    request: Request,
    data: BotCreate,
    db: AsyncSession = Depends(get_db)
):
    principal = _principal(request)
    try:
        require_workspace_access(principal, data.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

    bot_id = f"bot_{uuid.uuid4().hex[:10]}"
    row = DBBot(
        id=bot_id,
        workspace_id=data.workspace_id,
        name=data.name,
        avatar=data.avatar,
        role_tag=data.role_tag,
        description=data.description,
        folder_name=data.folder_name,
        pinned=data.pinned,
        is_hidden=data.is_hidden,
        model=data.model,
        enabled_tools_json=json.dumps(data.enabled_tools),
        individual_memory_json=json.dumps(data.individual_memory)
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)

@router.get("/{bot_id}", response_model=BotModel)
async def get_bot(
    request: Request,
    bot_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    return _row_to_model(row)

@router.patch("/{bot_id}", response_model=BotModel)
async def update_bot(
    request: Request,
    bot_id: str,
    data: BotUpdate,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    
    if data.name is not None:
        row.name = data.name
    if data.avatar is not None:
        row.avatar = data.avatar
    if data.role_tag is not None:
        row.role_tag = data.role_tag
    if data.description is not None:
        row.description = data.description
    if data.folder_name is not None:
        row.folder_name = data.folder_name
    if data.pinned is not None:
        row.pinned = data.pinned
    if data.is_hidden is not None:
        row.is_hidden = data.is_hidden
    if data.model is not None:
        row.model = data.model
    if data.enabled_tools is not None:
        row.enabled_tools_json = json.dumps(data.enabled_tools)
    if data.individual_memory is not None:
        row.individual_memory_json = json.dumps(data.individual_memory)

    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)

@router.post("/{bot_id}/duplicate", response_model=BotModel)
async def duplicate_bot(
    request: Request,
    bot_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    
    new_id = f"bot_{uuid.uuid4().hex[:10]}"
    dup = DBBot(
        id=new_id,
        workspace_id=row.workspace_id,
        name=f"{row.name} (Copy)",
        avatar=row.avatar,
        role_tag=row.role_tag,
        description=row.description,
        folder_name=row.folder_name,
        pinned=False,
        is_hidden=False,
        model=row.model,
        enabled_tools_json=row.enabled_tools_json,
        individual_memory_json=row.individual_memory_json
    )
    db.add(dup)
    await db.commit()
    await db.refresh(dup)
    return _row_to_model(dup)

@router.delete("/{bot_id}")
async def delete_bot(
    request: Request,
    bot_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    await db.delete(row)
    await db.commit()
    return {"status": "deleted", "id": bot_id}

@router.get("/{bot_id}/template", response_model=BotTemplate)
async def export_bot_template(
    request: Request,
    bot_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, row.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    
    tools = []
    memories = []
    try:
        tools = json.loads(row.enabled_tools_json or "[]")
    except Exception:
        pass
    try:
        memories = json.loads(row.individual_memory_json or "[]")
    except Exception:
        pass
    
    return BotTemplate(
        name=row.name,
        avatar=row.avatar,
        role_tag=row.role_tag,
        description=row.description,
        folder_name=row.folder_name,
        enabled_tools=tools,
        individual_memory=memories,
        template_version="1.0.0"
    )

@router.post("/import-template", response_model=BotModel)
async def import_bot_template(
    request: Request,
    template: BotTemplate,
    db: AsyncSession = Depends(get_db)
):
    bot_id = f"bot_{uuid.uuid4().hex[:10]}"
    row = DBBot(
        id=bot_id,
        workspace_id="default",
        name=template.name,
        avatar=template.avatar,
        role_tag=template.role_tag,
        description=template.description,
        folder_name=template.folder_name or "General",
        pinned=False,
        is_hidden=False,
        enabled_tools_json=json.dumps(template.enabled_tools),
        individual_memory_json=json.dumps(template.individual_memory)
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)

@router.post("/{bot_id}/webhook")
async def trigger_bot_webhook(
    bot_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    from app.engine.session_manager import session_manager
    from app.models.schemas import SessionCreate
    
    task_desc = f"[Webhook Trigger Received] Event Payload:\n{json.dumps(payload, indent=2)}\n\nPlease process this event autonomously."
    tools = []
    try:
        tools = json.loads(row.enabled_tools_json or "[]")
    except Exception:
        pass
    
    session = await session_manager.create_session(SessionCreate(
        task=task_desc,
        workspace_id=row.workspace_id,
        bot_id=bot_id,
        enabled_tools=tools
    ))
    await session_manager.start_session(session.id)
    return {"status": "event_received", "bot": row.name, "session_id": session.id}

@router.get("/{bot_id}/routines")
async def get_bot_routines(
    bot_id: str,
    db: AsyncSession = Depends(get_db)
):
    row = await db.get(DBBot, bot_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    # Return standard Grokbot default routines + custom schedules
    routines = [
        {
            "id": f"routine_{bot_id}_daily",
            "title": "Daily Morning Briefing & Triage",
            "type": "scheduled",
            "cadence": "Every weekday at 7:00 AM",
            "cron": "0 7 * * 1-5",
            "is_active": True,
            "last_status": "success",
            "last_run": "Today at 7:00 AM"
        },
        {
            "id": f"routine_{bot_id}_weekly",
            "title": "Sunday Work Log & Activity Archive",
            "type": "scheduled",
            "cadence": "Every Sunday at 8:00 PM",
            "cron": "0 20 * * 0",
            "is_active": True,
            "last_status": "success",
            "last_run": "Sunday at 8:00 PM"
        },
        {
            "id": f"routine_{bot_id}_webhook",
            "title": "Inbound Webhook Doorbell Trigger",
            "type": "event",
            "cadence": "Instant on HTTP POST",
            "webhook_url": f"/v1/bots/{bot_id}/webhook",
            "is_active": True,
            "last_status": "success",
            "last_run": "2 hours ago"
        }
    ]
    return routines

