from typing import Dict, Any, List, Optional
from app.tools.base import BaseTool
from app.tools.code_exec import ExecuteCodeTool
from app.tools.file_ops import ReadFileTool, WriteFileTool, ListFilesTool, DeleteFileTool
from app.tools.doc_gen import CreateDocumentTool
from app.tools.web_search import WebSearchTool
from app.tools.web_fetch import WebFetchTool
from app.tools.communication import SendEmailTool, SendSlackMessageTool

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        default_tools = [
            ExecuteCodeTool(),
            ReadFileTool(),
            WriteFileTool(),
            ListFilesTool(),
            DeleteFileTool(),
            CreateDocumentTool(),
            WebSearchTool(),
            WebFetchTool(),
            SendEmailTool(),
            SendSlackMessageTool()
        ]
        for t in default_tools:
            self.register_tool(t)

    def register_tool(self, tool: BaseTool):
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[str]:
        return list(self._tools.keys())

    def get_all_schemas(self) -> List[Dict[str, Any]]:
        return [t.get_schema().model_dump() for t in self._tools.values()]

tool_registry = ToolRegistry()
