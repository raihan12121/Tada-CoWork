from typing import List
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request
from app.models.schemas import ScheduleModel, SessionCreate, SessionModel
from app.engine.scheduler import scheduler_engine
from app.engine.session_manager import session_manager
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/schedules", tags=["schedules"])

class ScheduleCreatePayload(BaseModel):
    workspace_id: str = "default"
    title: str
    task_template: str
    cron_expression: str
    enabled_tools: List[str] = Field(default_factory=list)
    granted_scopes: List[str] = Field(default_factory=list)
    granted_folders: List[str] = Field(default_factory=list)
    granted_domains: List[str] = Field(default_factory=list)

@router.get("", response_model=List[ScheduleModel])
async def list_schedules(request: Request):
    principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    schedules = await scheduler_engine.list_schedules()
    return [schedule for schedule in schedules if principal.can_access_workspace(schedule.workspace_id)]

@router.post("", response_model=ScheduleModel)
async def create_schedule(request: Request, payload: ScheduleCreatePayload):
    principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    try:
        require_workspace_access(principal, payload.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    return await scheduler_engine.create_schedule(
        workspace_id=payload.workspace_id,
        title=payload.title,
        task_template=payload.task_template,
        cron_expression=payload.cron_expression,
        enabled_tools=payload.enabled_tools,
        granted_scopes=payload.granted_scopes,
        granted_folders=payload.granted_folders,
        granted_domains=payload.granted_domains,
    )

@router.post("/{schedule_id}/trigger", response_model=SessionModel)
async def trigger_schedule_now(request: Request, schedule_id: str):
    schedules = await scheduler_engine.list_schedules()
    target = next((s for s in schedules if s.id == schedule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Schedule not found")
    principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    try:
        require_workspace_access(principal, target.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

    # Spawns new session using template and starts execution
    session = await session_manager.create_session(SessionCreate(
        task=f"[Scheduled Run: {target.title}] {target.task_template}",
        enabled_tools=target.enabled_tools,
        granted_scopes=target.granted_scopes,
        granted_folders=target.granted_folders,
        granted_domains=target.granted_domains,
    ))
    await session_manager.start_execution(session.id)
    return session

@router.delete("/{schedule_id}")
async def delete_schedule(request: Request, schedule_id: str):
    schedules = await scheduler_engine.list_schedules()
    target = next((schedule for schedule in schedules if schedule.id == schedule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Schedule not found")
    principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    try:
        require_workspace_access(principal, target.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    await scheduler_engine.delete_schedule(schedule_id)
    return {"status": "deleted", "id": schedule_id}
