import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse
from app.config import settings
from app.sandbox.process_sandbox import sandbox_manager
from app.engine.session_manager import session_manager
from app.core.identity import Principal, require_workspace_access

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


async def _assert_artifact_access(request: Request, session_id: str) -> None:
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    principal = getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))
    try:
        require_workspace_access(principal, session.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

@router.get("/download/{session_id}/{filename}")
async def download_artifact(request: Request, session_id: str, filename: str):
    if not SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID format")
    await _assert_artifact_access(request, session_id)
    sandbox = sandbox_manager.get_existing(session_id)
    safe_name = Path(filename).name
    if ".." in filename or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename format")
    file_path = (sandbox.artifacts_dir / safe_name) if sandbox else (sandbox_manager.archived_artifacts_dir(session_id) / safe_name)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")
        
    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/octet-stream"
    )

@router.get("/preview/{session_id}/{filename}")
async def preview_artifact(request: Request, session_id: str, filename: str):
    if not SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID format")
    await _assert_artifact_access(request, session_id)
    sandbox = sandbox_manager.get_existing(session_id)
    safe_name = Path(filename).name
    if ".." in filename or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename format")
    file_path = (sandbox.artifacts_dir / safe_name) if sandbox else (sandbox_manager.archived_artifacts_dir(session_id) / safe_name)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found")
        
    ext = file_path.suffix.lower()
    if ext in (".md", ".txt", ".csv", ".json"):
        text = file_path.read_text(encoding="utf-8", errors="replace")
        return {"filename": safe_name, "type": ext[1:], "content": text}
    else:
        return {
            "filename": safe_name,
            "type": ext[1:],
            "content": f"[Binary deliverable: {ext.upper()} document ({file_path.stat().st_size} bytes). Click Download to open.]"
        }
