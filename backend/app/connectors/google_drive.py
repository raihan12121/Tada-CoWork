import json
import uuid
from typing import Dict, Any
from app.connectors.base import BaseConnector
from app.config import settings
import httpx

class GoogleDriveConnector(BaseConnector):
    name = "google_drive"
    description = "Reads, writes, and searches files in connected Google Drive workspaces."
    connector_type = "drive"
    risk_level = "medium"
    required_scopes = ["https://www.googleapis.com/auth/drive.file"]

    def get_required_scopes(self, input_params=None):
        action = (input_params or {}).get("action", "search")
        return ["https://www.googleapis.com/auth/drive.metadata.readonly"] if action == "search" else ["https://www.googleapis.com/auth/drive.file"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["search", "read", "upload"], "default": "search"},
                "filename": {"type": "string", "description": "Target file name or query"},
                "file_id": {"type": "string", "description": "Drive file ID for read"},
                "content": {"type": "string", "description": "File payload if uploading"}
            },
            "required": ["action"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        action = kwargs.get("action", "search")
        filename = kwargs.get("filename", "document")
        if not settings.GOOGLE_ACCESS_TOKEN:
            return {"success": False, "connector": "google_drive", "error": "Google Drive access token is not configured."}
        headers = {"Authorization": f"Bearer {settings.GOOGLE_ACCESS_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                if action == "search":
                    response = await client.get(
                        "https://www.googleapis.com/drive/v3/files",
                        headers=headers,
                        params={"q": f"name contains '{filename.replace(chr(39), chr(39) + chr(39))}'", "fields": "files(id,name,mimeType,modifiedTime)"},
                    )
                    response.raise_for_status()
                    return {"success": True, "connector": "google_drive", "files": response.json().get("files", [])}
                if action == "read":
                    file_id = kwargs.get("file_id")
                    if not file_id:
                        return {"success": False, "connector": "google_drive", "error": "file_id is required for read."}
                    response = await client.get(f"https://www.googleapis.com/drive/v3/files/{file_id}", headers=headers, params={"alt": "media"})
                    response.raise_for_status()
                    return {"success": True, "connector": "google_drive", "file_id": file_id, "content": response.text}
                if action == "upload":
                    content = kwargs.get("content", "")
                    if not filename or not content:
                        return {"success": False, "connector": "google_drive", "error": "filename and content are required for upload."}
                    metadata = {"name": filename, "mimeType": "text/plain"}
                    boundary = f"coagent-{uuid.uuid4().hex}"
                    body = (
                        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                        f"{json.dumps(metadata)}\r\n--{boundary}\r\nContent-Type: text/plain\r\n\r\n"
                        f"{content}\r\n--{boundary}--\r\n"
                    ).encode("utf-8")
                    upload_headers = {**headers, "Content-Type": f"multipart/related; boundary={boundary}"}
                    response = await client.post("https://www.googleapis.com/upload/drive/v3/files", headers=upload_headers, params={"uploadType": "multipart"}, content=body)
                    response.raise_for_status()
                    return {"success": True, "connector": "google_drive", "file": response.json()}
                return {"success": False, "connector": "google_drive", "error": f"Unsupported action: {action}"}
        except httpx.HTTPError as exc:
            return {"success": False, "connector": "google_drive", "error": f"Google Drive request failed: {exc}"}
