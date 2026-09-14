from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.models.schemas import RiskLevel

class ToolSchema(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]
    required_scopes: List[str] = Field(default_factory=list)
    risk_level: RiskLevel = "low"

class BaseTool:
    name: str = "base_tool"
    description: str = "Base MCP-compatible tool description"
    risk_level: RiskLevel = "low"
    required_scopes: List[str] = []

    def get_schema(self) -> ToolSchema:
        return ToolSchema(
            name=self.name,
            description=self.description,
            parameters=self.get_parameters_schema(),
            required_scopes=self.required_scopes,
            risk_level=self.risk_level
        )

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {},
            "required": []
        }

    def get_required_scopes(self, input_params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Return the least-privilege scopes needed for this invocation.

        Connectors may override this based on a read versus write action;
        ``required_scopes`` remains the union advertised in discovery schema.
        """
        return list(self.required_scopes)

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        raise NotImplementedError
