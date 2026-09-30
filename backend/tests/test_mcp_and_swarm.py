import pytest
import uuid
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from app.db.session import init_db, AsyncSessionLocal, DBMcpServer
from app.models.schemas import McpServerCreate, SwarmRunRequest, SwarmSubtask
from app.mcp.mcp_manager import mcp_manager, DynamicMcpTool
from app.tools.registry import tool_registry
from app.tools.swarm_delegate import DelegateSubtaskTool

@pytest.mark.asyncio
async def test_dynamic_mcp_server_lifecycle():
    await init_db()

    mock_tools_response = {
        "jsonrpc": "2.0",
        "id": "discover-1",
        "result": {
            "tools": [
                {
                    "name": "notion_create_page",
                    "description": "Create a new page in Notion workspace",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "content": {"type": "string"}
                        },
                        "required": ["title"]
                    },
                    "risk_level": "medium",
                    "required_scopes": ["notion:write"]
                }
            ]
        }
    }

    # Mock HTTP response for tool discovery
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_tools_response
        mock_post.return_value = mock_resp

        # Register server
        server = await mcp_manager.register_server(
            McpServerCreate(
                name="Notion MCP Server",
                server_url="http://localhost:9999/mcp",
                workspace_id="default",
                auth_headers={"Authorization": "Bearer notion-test-key"}
            )
        )

        assert server.name == "Notion MCP Server"
        assert server.tools_count == 1
        assert len(server.discovered_tools) == 1
        assert server.discovered_tools[0]["name"] == "notion_create_page"

        # Verify tool is now live in tool_registry
        registered_tool = tool_registry.get_tool("notion_create_page")
        assert registered_tool is not None
        assert isinstance(registered_tool, DynamicMcpTool)
        assert registered_tool.description == "Create a new page in Notion workspace"

        # Test tool execution call
        mock_call_resp = MagicMock()
        mock_call_resp.status_code = 200
        mock_call_resp.json.return_value = {
            "jsonrpc": "2.0",
            "id": "call-1",
            "result": {"success": True, "page_id": "page-123"}
        }
        mock_post.return_value = mock_call_resp

        call_result = await registered_tool.execute(session_id="test-session", title="Test Title", content="Hello Notion")
        assert call_result["success"] is True
        assert call_result["page_id"] == "page-123"

        # Delete server and verify tool is removed from registry
        deleted = await mcp_manager.delete_server(server.id)
        assert deleted is True
        assert tool_registry.get_tool("notion_create_page") is None

@pytest.mark.asyncio
async def test_swarm_delegate_tool():
    await init_db()

    delegate_tool = tool_registry.get_tool("delegate_subtask")
    assert delegate_tool is not None
    assert isinstance(delegate_tool, DelegateSubtaskTool)

    schema = delegate_tool.get_schema().model_dump()
    assert schema["name"] == "delegate_subtask"
    assert "subtask_description" in schema["parameters"]["properties"]
