import os
import shutil
import time
from pathlib import Path
from typing import Dict, Any, List
from app.tools.base import BaseTool
from app.sandbox.process_sandbox import sandbox_manager

class ReadFileTool(BaseTool):
    name = "read_file"
    description = "Reads content from a file within the session sandbox."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to file inside sandbox."}
            },
            "required": ["path"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        rel_path = kwargs.get("path", "")
        sandbox = sandbox_manager.get_or_create(session_id)
        target = sandbox.resolve_path(rel_path)
        
        if not target.exists():
            return {"success": False, "error": f"File not found: {rel_path}"}
        if not target.is_file():
            return {"success": False, "error": f"Path is not a file: {rel_path}"}
            
        try:
            content = target.read_text(encoding="utf-8", errors="replace")
            return {"success": True, "content": content, "size_bytes": len(content)}
        except Exception as e:
            return {"success": False, "error": str(e)}

class WriteFileTool(BaseTool):
    name = "write_file"
    description = "Writes or overwrites content to a file inside the sandbox, snapshotting previous versions."
    risk_level = "medium"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to write to."},
                "content": {"type": "string", "description": "File text content."}
            },
            "required": ["path", "content"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        rel_path = kwargs.get("path", "")
        content = kwargs.get("content", "")
        sandbox = sandbox_manager.get_or_create(session_id)
        target = sandbox.resolve_path(rel_path)
        
        target.parent.mkdir(parents=True, exist_ok=True)
        
        # Rule 4.2: Snapshot prior version before overwrite
        snapshot_path = None
        if target.exists():
            ts = int(time.time() * 1000)
            safe_name = rel_path.replace("/", "_").replace("\\", "_")
            snapshot = sandbox.versions_dir / f"{safe_name}.{ts}.bak"
            shutil.copy2(target, snapshot)
            snapshot_path = str(snapshot.name)
            
        target.write_text(content, encoding="utf-8")
        return {
            "success": True,
            "path": rel_path,
            "bytes_written": len(content),
            "snapshot_created": snapshot_path
        }

class ListFilesTool(BaseTool):
    name = "list_files"
    description = "Lists files and subdirectories in the sandbox directory."
    risk_level = "low"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "default": ".", "description": "Relative path to list."}
            }
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        rel_path = kwargs.get("path", ".")
        sandbox = sandbox_manager.get_or_create(session_id)
        target = sandbox.resolve_path(rel_path)
        
        if not target.exists() or not target.is_dir():
            return {"success": False, "error": f"Directory not found: {rel_path}"}
            
        items = []
        for child in target.iterdir():
            if child.name.startswith("."):
                continue # Skip hidden/trash directories
            items.append({
                "name": child.name,
                "is_dir": child.is_dir(),
                "size_bytes": child.stat().st_size if child.is_file() else 0
            })
        return {"success": True, "path": rel_path, "items": items}

class DeleteFileTool(BaseTool):
    name = "delete_file"
    description = "Safely deletes a file by moving it to the session trash (reversible)."
    risk_level = "high"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to file to remove."}
            },
            "required": ["path"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        rel_path = kwargs.get("path", "")
        sandbox = sandbox_manager.get_or_create(session_id)
        target = sandbox.resolve_path(rel_path)
        
        if not target.exists():
            return {"success": False, "error": f"File not found: {rel_path}"}
            
        # Rule 4.1: Reversible delete - move to session trash
        ts = int(time.time() * 1000)
        trash_target = sandbox.trash_dir / f"{target.name}.{ts}.deleted"
        shutil.move(str(target), str(trash_target))
        
        return {
            "success": True,
            "message": f"File '{rel_path}' safely moved to session trash.",
            "trash_reference": str(trash_target.name)
        }
