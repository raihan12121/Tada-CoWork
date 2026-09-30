from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Request, Body
from app.models.schemas import SkillModel, SkillCreate, SkillRunRequest, SessionModel
from app.skills.skill_manager import skill_manager
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/skills", tags=["skills"])

def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))

@router.get("", response_model=List[SkillModel])
async def list_skills(request: Request, workspace_id: str = Query("default")):
    principal = _principal(request)
    try:
        require_workspace_access(principal, workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    return await skill_manager.list_skills(workspace_id)

@router.post("", response_model=SkillModel)
async def create_skill(request: Request, payload: SkillCreate):
    principal = _principal(request)
    try:
        require_workspace_access(principal, payload.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    try:
        return await skill_manager.create_skill(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/{skill_id}", response_model=SkillModel)
async def get_skill(request: Request, skill_id: str):
    skill = await skill_manager.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, skill.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    return skill

@router.post("/from-session/{session_id}", response_model=SkillModel)
async def create_skill_from_session(
    request: Request,
    session_id: str,
    name: str = Body(..., embed=True),
    description: str = Body(..., embed=True),
    workspace_id: str = Body("default", embed=True),
):
    principal = _principal(request)
    try:
        require_workspace_access(principal, workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    try:
        return await skill_manager.create_skill_from_session(session_id, name, description, workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post("/{skill_id}/run", response_model=SessionModel)
async def run_skill(request: Request, skill_id: str, payload: Optional[SkillRunRequest] = None):
    skill = await skill_manager.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, skill.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    try:
        req = payload or SkillRunRequest()
        return await skill_manager.run_skill(skill_id, req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to execute skill: {exc}") from exc

@router.delete("/{skill_id}")
async def delete_skill(request: Request, skill_id: str):
    skill = await skill_manager.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    principal = _principal(request)
    try:
        require_workspace_access(principal, skill.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc
    deleted = await skill_manager.delete_skill(skill_id)
    return {"deleted": deleted, "skill_id": skill_id}
