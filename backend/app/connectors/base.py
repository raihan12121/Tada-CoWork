from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from app.tools.base import BaseTool
from app.models.schemas import RiskLevel

class ConnectorDefinition(BaseModel):
    id: str
    name: str
    description: str
    connector_type: str # drive, slack, github, webhook
    required_scopes: List[str]
    risk_level: RiskLevel = "medium"

class BaseConnector(BaseTool):
    connector_type: str = "generic"
    required_scopes: List[str] = []

    def get_definition(self) -> ConnectorDefinition:
        return ConnectorDefinition(
            id=self.name,
            name=self.name,
            description=self.description,
            connector_type=self.connector_type,
            required_scopes=self.required_scopes,
            risk_level=self.risk_level
        )
