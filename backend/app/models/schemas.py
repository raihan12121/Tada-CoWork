from datetime import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

RiskLevel = Literal["low", "medium", "high"]
SessionStatus = Literal["created", "planning", "running", "paused", "waiting_approval", "completed", "failed", "cancelled"]
StepStatus = Literal["pending", "running", "completed", "failed", "skipped", "blocked"]
ApprovalDecision = Literal["pending", "approved", "denied"]
MemoryType = Literal["fact", "preference", "summary"]

class StepBase(BaseModel):
    id: str
    step_order: int
    description: str
    tool: str
    risk_level: RiskLevel = "low"
    dependencies: List[str] = Field(default_factory=list)
    status: StepStatus = "pending"
    result_summary: Optional[str] = None

class StepCreate(BaseModel):
    description: str
    tool: str
    risk_level: RiskLevel = "low"
    dependencies: List[str] = Field(default_factory=list)

class PlanModel(BaseModel):
    id: str
    session_id: str
    version: int = 1
    status: str = "draft" # draft, approved, active, completed, revised
    steps: List[StepBase] = Field(default_factory=list)
    explanation: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ToolCallRecord(BaseModel):
    id: str
    step_id: Optional[str] = None
    tool: str
    input_params: Dict[str, Any] = Field(default_factory=dict)
    output_data: Optional[Any] = None
    status: str = "success" # success, error, blocked
    risk_level: RiskLevel = "low"
    execution_time_ms: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ApprovalRequest(BaseModel):
    id: str
    session_id: str
    step_id: Optional[str] = None
    action_type: str
    description: str
    consequence: str
    target: str
    diff: Optional[str] = None
    risk_level: RiskLevel = "high"
    status: ApprovalDecision = "pending"
    takeover_mode: bool = False
    takeover_url: Optional[str] = None
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    actor: Optional[str] = None
    user_feedback: Optional[str] = None

class ApprovalResponse(BaseModel):
    decision: Literal["approved", "denied"]
    user_feedback: Optional[str] = None
    always_allow_category: bool = False # For medium risk pre-approval only

class ArtifactModel(BaseModel):
    id: str
    session_id: str
    name: str
    file_type: str # md, xlsx, docx, pptx, pdf, csv, txt
    relative_path: str
    file_size_bytes: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    summary: Optional[str] = None
    version: int = 1

class MemoryItemModel(BaseModel):
    id: str
    type: MemoryType
    key: Optional[str] = None
    content: str
    source_session_id: Optional[str] = None
    workspace_id: str = "default"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None

class MemoryCandidate(BaseModel):
    type: MemoryType
    key: Optional[str] = None
    content: str
    rationale: str

class ScheduleModel(BaseModel):
    id: str
    title: str
    task_template: str
    cron_expression: str
    is_active: bool = True
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None

class ConnectorModel(BaseModel):
    id: str
    name: str
    connector_type: str # drive, slack, github, webhook
    scopes: List[str] = Field(default_factory=list)
    status: str = "active" # active, revoked
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None

class SessionCreate(BaseModel):
    task: str
    workspace_id: str = "default"
    granted_folders: List[str] = Field(default_factory=list)
    enabled_tools: List[str] = Field(default_factory=list)

class SessionModel(BaseModel):
    id: str
    task: str
    workspace_id: str = "default"
    status: SessionStatus = "created"
    plan: Optional[PlanModel] = None
    artifacts: List[ArtifactModel] = Field(default_factory=list)
    pending_approval: Optional[ApprovalRequest] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    tool_calls_count: int = 0
    total_cost_usd: float = 0.0

class ActivityFeedEvent(BaseModel):
    id: str
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    event_type: str # narration, reasoning, tool_start, tool_end, approval_required, plan_revised, artifact_created, error, done
    message: str # Plain language colleague narration
    technical_details: Optional[Dict[str, Any]] = None # Raw reasoning or tool payloads
    step_id: Optional[str] = None
