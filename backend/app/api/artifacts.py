import re
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from app.config import settings
from app.sandbox.process_sandbox import sandbox_manager

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")

@router.get("/download/{session_id}/{filename}")
async def download_artifact(session_id: str, filename: str):
    if not SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID format")
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
async def preview_artifact(session_id: str, filename: str):
    if not SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID format")
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
