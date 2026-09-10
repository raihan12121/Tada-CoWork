from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from app.models.schemas import ScheduleModel, SessionCreate, SessionModel
from app.engine.scheduler import scheduler_engine
from app.engine.session_manager import session_manager

router = APIRouter(prefix="/schedules", tags=["schedules"])

class ScheduleCreatePayload(BaseModel):
    title: str
    task_template: str
    cron_expression: str

@router.get("", response_model=List[ScheduleModel])
async def list_schedules():
    return await scheduler_engine.list_schedules()

@router.post("", response_model=ScheduleModel)
async def create_schedule(payload: ScheduleCreatePayload):
    return await scheduler_engine.create_schedule(
        title=payload.title,
        task_template=payload.task_template,
        cron_expression=payload.cron_expression
    )

@router.post("/{schedule_id}/trigger", response_model=SessionModel)
async def trigger_schedule_now(schedule_id: str):
    schedules = await scheduler_engine.list_schedules()
    target = next((s for s in schedules if s.id == schedule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Spawns new session using template and starts execution
    session = await session_manager.create_session(SessionCreate(
        task=f"[Scheduled Run: {target.title}] {target.task_template}"
    ))
    await session_manager.start_execution(session.id)
    return session

@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str):
    await scheduler_engine.delete_schedule(schedule_id)
    return {"status": "deleted", "id": schedule_id}
