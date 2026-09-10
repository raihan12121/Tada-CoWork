from typing import Dict, Any
from app.tools.base import BaseTool
from app.sandbox.process_sandbox import sandbox_manager

class ExecuteCodeTool(BaseTool):
    name = "execute_code"
    description = "Executes Python or JavaScript code inside the session's isolated sandbox."
    risk_level = "medium"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "The script source code to execute."},
                "language": {"type": "string", "enum": ["python", "node", "javascript"], "default": "python"},
                "timeout_seconds": {"type": "integer", "default": 20}
            },
            "required": ["code"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        code = kwargs.get("code", "")
        language = kwargs.get("language", "python")
        timeout = kwargs.get("timeout_seconds", 20)
        
        sandbox = sandbox_manager.get_or_create(session_id)
        result = await sandbox.execute_code(code=code, language=language, timeout_seconds=timeout)
        return result
