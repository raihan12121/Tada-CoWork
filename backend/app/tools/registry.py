from typing import Any, Dict, List, Optional

from app.connectors.email import GmailConnector, OutlookConnector
from app.connectors.github import GitHubConnector
from app.connectors.google_drive import GoogleDriveConnector
from app.connectors.slack import SlackConnector, WebhookConnector
from app.tools.base import BaseTool
from app.tools.bridge_files import BridgeListFilesTool, BridgeMoveFileTool, BridgeReadFileTool
from app.tools.browser import BrowserAutomationTool
from app.tools.code_exec import ExecuteCodeTool
from app.tools.communication import SendEmailTool, SendSlackMessageTool
from app.tools.doc_gen import CreateDocumentTool
from app.tools.file_ops import CreateFileTool, DeleteFileTool, ListFilesTool, MoveFileTool, ReadFileTool, WriteFileTool
from app.tools.ocr_extract import OCRExtractTool
from app.tools.swarm_delegate import DelegateSubtaskTool
from app.tools.web_fetch import WebFetchTool
from app.tools.web_search import WebSearchTool


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._core_tools: set[str] = set()
        self._register_default_tools()

    def _register_default_tools(self):
        default_tools = [
            ExecuteCodeTool(),
            ReadFileTool(),
            WriteFileTool(),
            CreateFileTool(),
            ListFilesTool(),
            DeleteFileTool(),
            MoveFileTool(),
            CreateDocumentTool(),
            WebSearchTool(),
            WebFetchTool(),
            SendEmailTool(),
            SendSlackMessageTool(),
            BrowserAutomationTool(),
            BridgeListFilesTool(),
            BridgeReadFileTool(),
            BridgeMoveFileTool(),
            GoogleDriveConnector(),
            GitHubConnector(),
            SlackConnector(),
            WebhookConnector(),
            GmailConnector(),
            OutlookConnector(),
            OCRExtractTool(),
            DelegateSubtaskTool()
        ]
        for t in default_tools:
            self._tools[t.name] = t
            self._core_tools.add(t.name)

    def is_core_tool(self, name: str) -> bool:
        return name in self._core_tools

    def register_tool(self, tool: BaseTool):
        if tool.name in self._core_tools:
            raise ValueError(f"Cannot overwrite protected core tool '{tool.name}'")
        self._tools[tool.name] = tool

    def unregister_tool(self, name: str):
        if name in self._core_tools:
            raise ValueError(f"Cannot unregister protected core tool '{name}'")
        self._tools.pop(name, None)

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[str]:
        return list(self._tools.keys())

    def get_all_schemas(self) -> List[Dict[str, Any]]:
        return [t.get_schema().model_dump() for t in self._tools.values()]

tool_registry = ToolRegistry()
