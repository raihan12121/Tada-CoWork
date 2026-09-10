import asyncio
from typing import List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from app.models.schemas import SessionModel, SessionCreate, PlanModel, StepBase
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

@router.post("/{session_id}/start")
async def start_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session_manager.start_execution(session_id)
    return {"status": "started", "session_id": session_id}

@router.post("/{session_id}/pause")
async def pause_session(session_id: str):
    await session_manager.pause_session(session_id)
    return {"status": "paused", "session_id": session_id}

@router.post("/{session_id}/resume")
async def resume_session(session_id: str):
    await session_manager.resume_session(session_id)
    return {"status": "resumed", "session_id": session_id}

@router.post("/{session_id}/cancel")
async def cancel_session(session_id: str):
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
