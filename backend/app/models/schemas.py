from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, field_validator

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

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
    created_at: datetime = Field(default_factory=utc_now)

class ToolCallRecord(BaseModel):
    id: str
    step_id: Optional[str] = None
    tool: str
    input_params: Dict[str, Any] = Field(default_factory=dict)
    output_data: Optional[Any] = None
    status: str = "success" # success, error, blocked
    risk_level: RiskLevel = "low"
    execution_time_ms: int = 0
    timestamp: datetime = Field(default_factory=utc_now)

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
    requested_at: datetime = Field(default_factory=utc_now)
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
    created_at: datetime = Field(default_factory=utc_now)
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
    created_at: datetime = Field(default_factory=utc_now)
    last_used_at: Optional[datetime] = None

class MemoryCandidate(BaseModel):
    type: MemoryType
    key: Optional[str] = None
    content: str
    rationale: str

class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    key: Optional[str] = None
    is_active: Optional[bool] = None

class ScheduleModel(BaseModel):
    id: str
    workspace_id: str = "default"
    title: str
    task_template: str
    cron_expression: str
    is_active: bool = True
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    enabled_tools: List[str] = Field(default_factory=list)
    granted_scopes: List[str] = Field(default_factory=list)
    granted_folders: List[str] = Field(default_factory=list)
    granted_domains: List[str] = Field(default_factory=list)

class ConnectorModel(BaseModel):
    id: str
    name: str
    connector_type: str # drive, slack, github, webhook
    scopes: List[str] = Field(default_factory=list)
    status: str = "active" # active, revoked
    granted_at: datetime = Field(default_factory=utc_now)
    last_used_at: Optional[datetime] = None

class SessionCreate(BaseModel):
    task: str = Field(..., min_length=1)
    workspace_id: str = "default"
    bot_id: Optional[str] = None
    channel_id: Optional[str] = None
    parent_session_id: Optional[str] = None
    provider_account_id: Optional[str] = None
    allow_provider_failover: bool = False
    granted_folders: List[str] = Field(default_factory=list)
    enabled_tools: List[str] = Field(default_factory=list)
    granted_scopes: List[str] = Field(default_factory=list)
    granted_domains: List[str] = Field(default_factory=list)

    @field_validator("task")
    @classmethod
    def validate_task_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Task cannot be empty or only whitespace")
        return v.strip()

class SessionModel(BaseModel):
    id: str
    task: str
    workspace_id: str = "default"
    bot_id: Optional[str] = None
    channel_id: Optional[str] = None
    parent_session_id: Optional[str] = None
    provider_account_id: Optional[str] = None
    allow_provider_failover: bool = False
    status: SessionStatus = "created"
    plan: Optional[PlanModel] = None
    artifacts: List[ArtifactModel] = Field(default_factory=list)
    pending_approval: Optional[ApprovalRequest] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    tool_calls_count: int = 0
    total_cost_usd: float = 0.0
    enabled_tools: List[str] = Field(default_factory=list)
    granted_folders: List[str] = Field(default_factory=list)
    granted_scopes: List[str] = Field(default_factory=list)
    granted_domains: List[str] = Field(default_factory=list)
    max_steps: int = 30
    max_tool_calls: int = 50
    max_runtime_seconds: int = 300

class ActivityFeedEvent(BaseModel):
    id: str
    session_id: str
    timestamp: datetime = Field(default_factory=utc_now)
    event_type: str # narration, reasoning, tool_start, tool_end, approval_required, plan_revised, artifact_created, error, done
    message: str # Plain language colleague narration
    technical_details: Optional[Dict[str, Any]] = None # Raw reasoning or tool payloads
    step_id: Optional[str] = None

class PlanEditRequest(BaseModel):
    action: Literal["add", "remove", "reorder"]
    step_id: Optional[str] = None
    description: Optional[str] = None
    tool: Optional[str] = None
    risk_level: RiskLevel = "low"
    ordered_step_ids: List[str] = Field(default_factory=list)

class SessionPermissionUpdate(BaseModel):
    action: Literal["grant", "revoke"]
    resource_type: Literal["tool", "folder", "scope", "domain"]
    value: str = Field(..., min_length=1)

class SkillModel(BaseModel):
    id: str
    workspace_id: str = "default"
    name: str
    description: str
    source_session_id: Optional[str] = None
    parameters_schema: Dict[str, Any] = Field(default_factory=dict)
    steps_definition: List[Dict[str, Any]] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

class SkillCreate(BaseModel):
    name: str
    description: str
    workspace_id: str = "default"
    parameters_schema: Dict[str, Any] = Field(default_factory=dict)
    steps_definition: List[Dict[str, Any]] = Field(default_factory=list)

class SkillRunRequest(BaseModel):
    parameters: Dict[str, Any] = Field(default_factory=dict)
    provider_account_id: Optional[str] = None

class McpServerModel(BaseModel):
    id: str
    workspace_id: str = "default"
    name: str
    server_url: str
    transport: str = "http"  # http, sse, stdio
    status: str = "connected"
    last_synced_at: Optional[datetime] = None
    tools_count: int = 0
    discovered_tools: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

class McpServerCreate(BaseModel):
    name: str = Field(..., min_length=1)
    server_url: str = Field(..., min_length=1)
    workspace_id: str = "default"
    transport: str = "http"
    auth_headers: Dict[str, str] = Field(default_factory=dict)

class SwarmSubtask(BaseModel):
    name: str
    subtask_description: str
    context: Optional[str] = None
    tools_allowed: Optional[List[str]] = None

class SwarmRunRequest(BaseModel):
    goal: str = Field(..., min_length=1)
    workspace_id: str = "default"
    subtasks: List[SwarmSubtask] = Field(default_factory=list)
    provider_account_id: Optional[str] = None
    allow_provider_failover: bool = False

class SwarmRunResponse(BaseModel):
    master_session_id: str
    goal: str
    worker_session_ids: List[str] = Field(default_factory=list)
    status: str = "completed"
    synthesis: str
    artifacts_created: List[str] = Field(default_factory=list)


class BotModel(BaseModel):
    id: str
    workspace_id: str = "default"
    name: str
    avatar: str = "🤖"
    role_tag: str = "Assistant"
    description: str
    folder_name: str = "General"
    pinned: bool = False
    is_hidden: bool = False
    model: Optional[str] = None
    enabled_tools: List[str] = Field(default_factory=list)
    individual_memory: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class BotCreate(BaseModel):
    name: str = Field(..., min_length=1)
    avatar: str = "🤖"
    role_tag: str = "Assistant"
    description: str
    folder_name: str = "General"
    pinned: bool = False
    is_hidden: bool = False
    model: Optional[str] = None
    workspace_id: str = "default"
    enabled_tools: List[str] = Field(default_factory=list)
    individual_memory: List[str] = Field(default_factory=list)


class BotUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    role_tag: Optional[str] = None
    description: Optional[str] = None
    folder_name: Optional[str] = None
    pinned: Optional[bool] = None
    is_hidden: Optional[bool] = None
    model: Optional[str] = None
    enabled_tools: Optional[List[str]] = None
    individual_memory: Optional[List[str]] = None


class BotTemplate(BaseModel):
    name: str
    avatar: str = "🤖"
    role_tag: str
    description: str
    folder_name: str = "General"
    enabled_tools: List[str] = Field(default_factory=list)
    individual_memory: List[str] = Field(default_factory=list)
    template_version: str = "1.0.0"


class ChannelModel(BaseModel):
    id: str
    workspace_id: str = "default"
    name: str
    description: Optional[str] = None
    bot_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    bot_ids: List[str] = Field(default_factory=list)
    workspace_id: str = "default"


class TerminalCommandRequest(BaseModel):
    command: str = Field(..., min_length=1)
    timeout_seconds: int = 30


class TerminalCommandResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    execution_time_ms: int
    cwd: str


