import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from app.models.schemas import SessionModel, SessionCreate, PlanModel, StepBase, PlanEditRequest, ActivityFeedEvent, SessionPermissionUpdate
from app.engine.session_manager import session_manager
from app.engine.planner import planner_engine

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("", response_model=SessionModel)
async def create_session(payload: SessionCreate):
    return await session_manager.create_session(payload)

@router.get("", response_model=List[SessionModel])
async def list_sessions(limit: int = Query(20, ge=1, le=100)):
    return await session_manager.list_sessions(limit)

@router.get("/{session_id}", response_model=SessionModel)
async def get_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.get("/{session_id}/events", response_model=List[ActivityFeedEvent])
async def get_session_events(session_id: str, limit: int = Query(200, ge=1, le=1000)):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await session_manager.get_activity_events(session_id, limit)

@router.get("/{session_id}/usage")
async def get_session_usage(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session.id,
        "tool_calls": session.tool_calls_count,
        "tool_call_limit": session.max_tool_calls,
        "steps_completed": sum(1 for step in (session.plan.steps if session.plan else []) if step.status == "completed"),
        "step_limit": session.max_steps,
        "estimated_cost_usd": session.total_cost_usd,
        "runtime_limit_seconds": session.max_runtime_seconds,
    }

@router.post("/{session_id}/plan/edit", response_model=PlanModel)
async def edit_session_plan(session_id: str, payload: PlanEditRequest):
    session = await session_manager.get_session(session_id)
    if not session or not session.plan:
        raise HTTPException(status_code=404, detail="Session or plan not found")
    try:
        return await planner_engine.edit_plan(session_id, session.plan, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/{session_id}/permissions", response_model=SessionModel)
async def update_session_permissions(session_id: str, payload: SessionPermissionUpdate):
    try:
        return await session_manager.update_permission(
            session_id,
            payload.resource_type,
            payload.value,
            payload.action == "grant",
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404 if "not found" in str(exc).lower() else 400, detail=str(exc)) from exc

@router.post("/{session_id}/start")
async def start_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session_manager.start_execution(session_id)
    return {"status": "started", "session_id": session_id}

@router.post("/{session_id}/pause")
async def pause_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session_manager.pause_session(session_id)
    return {"status": "paused", "session_id": session_id}

@router.post("/{session_id}/resume")
async def resume_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session_manager.resume_session(session_id)
    return {"status": "resumed", "session_id": session_id}

@router.post("/{session_id}/cancel")
async def cancel_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session_manager.cancel_session(session_id)
    return {"status": "cancelled", "session_id": session_id}

@router.websocket("/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    queue = session_manager.subscribe_events(session_id)
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        session_manager.unsubscribe_events(session_id, queue)
    except Exception:
        session_manager.unsubscribe_events(session_id, queue)
