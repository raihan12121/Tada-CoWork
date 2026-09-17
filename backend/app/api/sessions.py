import asyncio
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query, Request, UploadFile, File
from app.models.schemas import SessionModel, SessionCreate, PlanModel, StepBase, PlanEditRequest, ActivityFeedEvent, SessionPermissionUpdate
from app.engine.session_manager import session_manager
from app.engine.planner import planner_engine
from app.core.identity import Principal, require_workspace_access, parse_identity_token, anonymous_principal, identity_verification_configured
from app.config import settings
from app.sandbox.process_sandbox import sandbox_manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))


def _assert_session_access(request: Request, session: SessionModel) -> None:
    try:
        require_workspace_access(_principal(request), session.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

@router.post("", response_model=SessionModel)
async def create_session(request: Request, payload: SessionCreate):
    try:
        require_workspace_access(_principal(request), payload.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    try:
        return await session_manager.create_session(payload)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

@router.get("", response_model=List[SessionModel])
async def list_sessions(request: Request, limit: int = Query(20, ge=1, le=100)):
    principal = _principal(request)
    sessions = await session_manager.list_sessions(limit)
    return [session for session in sessions if principal.can_access_workspace(session.workspace_id)]

@router.get("/{session_id}", response_model=SessionModel)
async def get_session(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    return session

@router.get("/{session_id}/events", response_model=List[ActivityFeedEvent])
async def get_session_events(request: Request, session_id: str, limit: int = Query(200, ge=1, le=1000)):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    return await session_manager.get_activity_events(session_id, limit)

@router.get("/{session_id}/usage")
async def get_session_usage(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    return {
        "session_id": session.id,
        "tool_calls": session.tool_calls_count,
        "tool_call_limit": session.max_tool_calls,
        "steps_completed": sum(1 for step in (session.plan.steps if session.plan else []) if step.status == "completed"),
        "step_limit": session.max_steps,
        "estimated_cost_usd": session.total_cost_usd,
        "runtime_limit_seconds": session.max_runtime_seconds,
    }

@router.post("/{session_id}/inputs")
async def upload_session_input(request: Request, session_id: str, file: UploadFile = File(...)):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    if session.status not in {"created", "paused"}:
        raise HTTPException(status_code=409, detail="Inputs can only be uploaded before execution or while paused")
    original_name = file.filename or ""
    safe_name = Path(original_name).name
    if not safe_name or safe_name in {".", ".."} or safe_name != original_name:
        raise HTTPException(status_code=400, detail="Filename must be a simple file name without path separators")
    content = await file.read(settings.DEFAULT_MAX_INPUT_BYTES + 1)
    if len(content) > settings.DEFAULT_MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded input exceeds the configured size limit")
    try:
        sandbox = sandbox_manager.get_or_create(session_id)
        sandbox.ensure_disk_capacity(len(content))
        target = sandbox.resolve_path(f"inputs/{safe_name}")
        if target.exists():
            raise HTTPException(status_code=409, detail="An input with that filename already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    return {"session_id": session_id, "filename": safe_name, "path": f"inputs/{safe_name}", "size": len(content)}

@router.post("/{session_id}/plan/edit", response_model=PlanModel)
async def edit_session_plan(request: Request, session_id: str, payload: PlanEditRequest):
    session = await session_manager.get_session(session_id)
    if not session or not session.plan:
        raise HTTPException(status_code=404, detail="Session or plan not found")
    _assert_session_access(request, session)
    if session.status not in {"created", "paused"}:
        raise HTTPException(status_code=409, detail="Plans can only be edited before execution or while paused")
    try:
        return await planner_engine.edit_plan(session_id, session.plan, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/{session_id}/permissions", response_model=SessionModel)
async def update_session_permissions(request: Request, session_id: str, payload: SessionPermissionUpdate):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
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
async def start_session(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    await session_manager.start_execution(session_id)
    return {"status": "started", "session_id": session_id}

@router.post("/{session_id}/pause")
async def pause_session(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    await session_manager.pause_session(session_id)
    return {"status": "paused", "session_id": session_id}

@router.post("/{session_id}/resume")
async def resume_session(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    await session_manager.resume_session(session_id)
    return {"status": "resumed", "session_id": session_id}

@router.post("/{session_id}/cancel")
async def cancel_session(request: Request, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _assert_session_access(request, session)
    await session_manager.cancel_session(session_id)
    return {"status": "cancelled", "session_id": session_id}

@router.websocket("/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4404)
        return
    principal = anonymous_principal()
    if identity_verification_configured():
        authorization = websocket.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            await websocket.close(code=4401)
            return
        try:
            principal = parse_identity_token(authorization.removeprefix("Bearer ").strip())
            require_workspace_access(principal, session.workspace_id)
        except (ValueError, PermissionError):
            await websocket.close(code=4403)
            return
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
