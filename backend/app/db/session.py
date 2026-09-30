from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, create_engine, text, select
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from app.config import settings

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

Base = declarative_base()

class DBSession(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True)
    task = Column(Text, nullable=False)
    workspace_id = Column(String, default="default", index=True)
    bot_id = Column(String, nullable=True, index=True)
    channel_id = Column(String, nullable=True, index=True)
    parent_session_id = Column(String, nullable=True, index=True)
    provider_account_id = Column(String, nullable=True)
    allow_provider_failover = Column(Boolean, default=False)
    status = Column(String, default="created", index=True)
    tool_calls_count = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    enabled_tools_json = Column(Text, default="[]")
    granted_folders_json = Column(Text, default="[]")
    granted_scopes_json = Column(Text, default="[]")
    granted_domains_json = Column(Text, default="[]")
    max_steps = Column(Integer, default=30)
    max_tool_calls = Column(Integer, default=50)
    max_runtime_seconds = Column(Integer, default=300)
    created_at = Column(DateTime, default=utc_now, index=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    plans = relationship("DBPlan", back_populates="session", cascade="all, delete-orphan")
    approvals = relationship("DBApproval", back_populates="session", cascade="all, delete-orphan")
    artifacts = relationship("DBArtifact", back_populates="session", cascade="all, delete-orphan")
    activity_events = relationship("DBActivityEvent", back_populates="session", cascade="all, delete-orphan")

class DBExecutionJob(Base):
    """Durable execution intent and lease for restart/multi-worker recovery."""
    __tablename__ = "execution_jobs"

    id = Column(String, primary_key=True)
    session_id = Column(String, nullable=False, unique=True)
    status = Column(String, default="queued")  # queued, running, completed, failed, cancelled
    attempts = Column(Integer, default=0)
    worker_id = Column(String, nullable=True)
    lease_until = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

class DBPlan(Base):
    __tablename__ = "plans"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    status = Column(String, default="draft", index=True)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    session = relationship("DBSession", back_populates="plans")
    steps = relationship("DBStep", back_populates="plan", cascade="all, delete-orphan")

class DBStep(Base):
    __tablename__ = "steps"
    
    id = Column(String, primary_key=True)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False, index=True)
    step_order = Column(Integer, nullable=False)
    description = Column(Text, nullable=False)
    tool = Column(String, nullable=False)
    risk_level = Column(String, default="low")
    dependencies_json = Column(Text, default="[]")
    status = Column(String, default="pending", index=True)
    result_summary = Column(Text, nullable=True)
    failure_count = Column(Integer, default=0)
    
    plan = relationship("DBPlan", back_populates="steps")

class DBToolCall(Base):
    __tablename__ = "tool_calls"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, nullable=False, index=True)
    step_id = Column(String, nullable=True, index=True)
    tool = Column(String, nullable=False)
    input_params_json = Column(Text, default="{}")
    output_data_json = Column(Text, nullable=True)
    status = Column(String, default="success")
    risk_level = Column(String, default="low")
    execution_time_ms = Column(Integer, default=0)
    timestamp = Column(DateTime, default=utc_now, index=True)

class DBApproval(Base):
    __tablename__ = "approvals"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    step_id = Column(String, nullable=True)
    action_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    consequence = Column(Text, nullable=False)
    target = Column(String, nullable=False)
    diff = Column(Text, nullable=True)
    risk_level = Column(String, default="high")
    status = Column(String, default="pending", index=True)
    takeover_mode = Column(Boolean, default=False)
    takeover_url = Column(String, nullable=True)
    requested_at = Column(DateTime, default=utc_now)
    resolved_at = Column(DateTime, nullable=True)
    actor = Column(String, nullable=True)
    user_feedback = Column(Text, nullable=True)
    
    session = relationship("DBSession", back_populates="approvals")

class DBArtifact(Base):
    __tablename__ = "artifacts"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    relative_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)
    summary = Column(Text, nullable=True)
    version = Column(Integer, default=1)
    
    session = relationship("DBSession", back_populates="artifacts")

class DBMemoryItem(Base):
    __tablename__ = "memory_items"
    
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False) # fact, preference, summary
    key = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    source_session_id = Column(String, nullable=True)
    workspace_id = Column(String, default="default", index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=utc_now)
    last_used_at = Column(DateTime, nullable=True)

class DBSchedule(Base):
    __tablename__ = "schedules"
    
    id = Column(String, primary_key=True)
    workspace_id = Column(String, default="default", index=True)
    title = Column(String, nullable=False)
    task_template = Column(Text, nullable=False)
    cron_expression = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    next_run_at = Column(DateTime, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)
    enabled_tools_json = Column(Text, default="[]")
    granted_scopes_json = Column(Text, default="[]")
    granted_folders_json = Column(Text, default="[]")
    granted_domains_json = Column(Text, default="[]")

class DBConnector(Base):
    __tablename__ = "connectors"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    connector_type = Column(String, nullable=False)
    scopes_json = Column(Text, default="[]")
    status = Column(String, default="active")
    granted_at = Column(DateTime, default=utc_now)
    last_used_at = Column(DateTime, nullable=True)

class DBOrganization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    connector_allowlist_json = Column(Text, default="[]")
    connector_blocklist_json = Column(Text, default="[]")
    retention_days = Column(Integer, default=30)
    data_region = Column(String, default="local")
    kill_switch = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

class DBWorkspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False, default="default")
    name = Column(String, nullable=False)
    memory_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

class DBConnectorReview(Base):
    __tablename__ = "connector_reviews"

    id = Column(String, primary_key=True)
    connector_name = Column(String, nullable=False, unique=True)
    version = Column(String, default="1.0.0")
    declared_scopes_json = Column(Text, default="[]")
    risk_level = Column(String, default="medium")
    review_status = Column(String, default="pending")
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    package_url = Column(String, nullable=True)
    package_sha256 = Column(String, nullable=True)
    signature = Column(Text, nullable=True)
    data_access_json = Column(Text, default="[]")
    package_path = Column(Text, nullable=True)
    scan_status = Column(String, default="not_submitted")
    scan_report_json = Column(Text, default="{}")

class DBProviderAccount(Base):
    """User-owned AI provider account metadata.

    Secrets are deliberately kept outside SQLite in a DPAPI-protected file;
    this table only contains non-sensitive metadata and a secret reference.
    """
    __tablename__ = "provider_accounts"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, default="default")
    provider = Column(String, nullable=False)
    label = Column(String, nullable=False)
    auth_type = Column(String, nullable=False, default="api_key")
    model = Column(String, nullable=True)
    endpoint = Column(String, nullable=True)
    secret_ref = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")
    quota_status = Column(String, nullable=True)
    quota_remaining = Column(Float, nullable=True)
    quota_reset_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

class DBActivityEvent(Base):
    __tablename__ = "activity_events"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=utc_now, index=True)
    event_type = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    technical_details_json = Column(Text, nullable=True)
    step_id = Column(String, nullable=True)

    session = relationship("DBSession", back_populates="activity_events")

class DBSkill(Base):
    """Reusable automated skill learned from demonstration or workflow plan."""
    __tablename__ = "skills"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, default="default", index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=False)
    source_session_id = Column(String, nullable=True)
    parameters_schema_json = Column(Text, default="{}")
    steps_definition_json = Column(Text, default="[]")
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

class DBMcpServer(Base):
    """External or local Model Context Protocol (MCP) server integration."""
    __tablename__ = "mcp_servers"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, default="default", index=True)
    name = Column(String, nullable=False, index=True)
    server_url = Column(String, nullable=False)
    transport = Column(String, default="http")
    auth_header_json = Column(Text, default="{}")
    status = Column(String, default="connected")
    last_synced_at = Column(DateTime, nullable=True)
    tools_count = Column(Integer, default=0)
    discovered_tools_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

class DBBot(Base):
    """AnyWork Autonomous Agent persona."""
    __tablename__ = "bots"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, default="default", index=True)
    name = Column(String, nullable=False, index=True)
    avatar = Column(String, nullable=False, default="🤖")
    role_tag = Column(String, nullable=False, default="Assistant")
    description = Column(Text, nullable=False)
    folder_name = Column(String, nullable=False, default="General")
    pinned = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)
    model = Column(String, nullable=True)
    enabled_tools_json = Column(Text, default="[]")
    individual_memory_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class DBChannel(Base):
    """Multi-agent collaboration group chat / channel."""
    __tablename__ = "channels"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, default="default", index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    bot_ids_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


_engine_kwargs = {"echo": False}
if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite is the documented local runtime. Give short-lived background
    # scheduler/executor transactions time to yield instead of failing with a
    # spurious "database is locked" error during concurrent lifecycle work.
    _engine_kwargs["connect_args"] = {"timeout": 30}
engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Small, dependency-free migration path for the local SQLite runtime.
        # Production deployments should run Alembic migrations instead.
        if settings.DATABASE_URL.startswith("sqlite"):
            result = await conn.execute(text("PRAGMA table_info(sessions)"))
            existing = {row[1] for row in result.fetchall()}
            additions = {
                "bot_id": "TEXT",
                "channel_id": "TEXT",
                "provider_account_id": "TEXT",
                "allow_provider_failover": "BOOLEAN DEFAULT 0",
                "enabled_tools_json": "TEXT DEFAULT '[]'",
                "granted_folders_json": "TEXT DEFAULT '[]'",
                "max_steps": "INTEGER DEFAULT 30",
                "max_tool_calls": "INTEGER DEFAULT 50",
                "max_runtime_seconds": "INTEGER DEFAULT 300",
                "granted_scopes_json": "TEXT DEFAULT '[]'",
                "granted_domains_json": "TEXT DEFAULT '[]'",
                "parent_session_id": "TEXT",
            }
            for column, definition in additions.items():
                if column not in existing:
                    await conn.execute(text(f"ALTER TABLE sessions ADD COLUMN {column} {definition}"))
            result = await conn.execute(text("PRAGMA table_info(steps)"))
            step_existing = {row[1] for row in result.fetchall()}
            if "failure_count" not in step_existing:
                await conn.execute(text("ALTER TABLE steps ADD COLUMN failure_count INTEGER DEFAULT 0"))
            result = await conn.execute(text("PRAGMA table_info(workspaces)"))
            workspace_existing = {row[1] for row in result.fetchall()}
            if "memory_enabled" not in workspace_existing:
                await conn.execute(text("ALTER TABLE workspaces ADD COLUMN memory_enabled BOOLEAN DEFAULT 0"))
            result = await conn.execute(text("PRAGMA table_info(schedules)"))
            schedule_existing = {row[1] for row in result.fetchall()}
            schedule_additions = {
                "workspace_id": "TEXT DEFAULT 'default'",
                "enabled_tools_json": "TEXT DEFAULT '[]'",
                "granted_scopes_json": "TEXT DEFAULT '[]'",
                "granted_folders_json": "TEXT DEFAULT '[]'",
                "granted_domains_json": "TEXT DEFAULT '[]'",
            }
            for column, definition in schedule_additions.items():
                if column not in schedule_existing:
                    await conn.execute(text(f"ALTER TABLE schedules ADD COLUMN {column} {definition}"))
            result = await conn.execute(text("PRAGMA table_info(connector_reviews)"))
            review_existing = {row[1] for row in result.fetchall()}
            review_additions = {
                "package_url": "TEXT",
                "package_sha256": "TEXT",
                "signature": "TEXT",
                "data_access_json": "TEXT DEFAULT '[]'",
                "package_path": "TEXT",
                "scan_status": "TEXT DEFAULT 'not_submitted'",
                "scan_report_json": "TEXT DEFAULT '{}'",
            }
            for column, definition in review_additions.items():
                if column not in review_existing:
                    await conn.execute(text(f"ALTER TABLE connector_reviews ADD COLUMN {column} {definition}"))

            # Create performance indexes idempotently
            indexes = [
                "CREATE INDEX IF NOT EXISTS ix_sessions_workspace_id ON sessions (workspace_id)",
                "CREATE INDEX IF NOT EXISTS ix_sessions_bot_id ON sessions (bot_id)",
                "CREATE INDEX IF NOT EXISTS ix_sessions_channel_id ON sessions (channel_id)",
                "CREATE INDEX IF NOT EXISTS ix_sessions_parent_session_id ON sessions (parent_session_id)",
                "CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions (status)",
                "CREATE INDEX IF NOT EXISTS ix_sessions_created_at ON sessions (created_at)",
                "CREATE INDEX IF NOT EXISTS ix_plans_session_id ON plans (session_id)",
                "CREATE INDEX IF NOT EXISTS ix_steps_plan_id ON steps (plan_id)",
                "CREATE INDEX IF NOT EXISTS ix_tool_calls_session_id ON tool_calls (session_id)",
                "CREATE INDEX IF NOT EXISTS ix_tool_calls_timestamp ON tool_calls (timestamp)",
                "CREATE INDEX IF NOT EXISTS ix_approvals_session_id ON approvals (session_id)",
                "CREATE INDEX IF NOT EXISTS ix_artifacts_session_id ON artifacts (session_id)",
                "CREATE INDEX IF NOT EXISTS ix_memory_items_workspace_id ON memory_items (workspace_id)",
                "CREATE INDEX IF NOT EXISTS ix_schedules_workspace_id ON schedules (workspace_id)",
                "CREATE INDEX IF NOT EXISTS ix_mcp_servers_workspace_id ON mcp_servers (workspace_id)",
                "CREATE INDEX IF NOT EXISTS ix_activity_events_session_id ON activity_events (session_id)",
                "CREATE INDEX IF NOT EXISTS ix_activity_events_timestamp ON activity_events (timestamp)",
                "CREATE INDEX IF NOT EXISTS ix_bots_workspace_id ON bots (workspace_id)",
                "CREATE INDEX IF NOT EXISTS ix_channels_workspace_id ON channels (workspace_id)",
            ]
            for idx in indexes:
                await conn.execute(text(idx))

    # Seed default AnyWork Grokbot-style team if empty
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(DBBot))
        if not result.scalars().first():
            default_bots = [
                DBBot(
                    id="bot_klaus",
                    name="Klaus",
                    avatar="👔",
                    role_tag="Chief of Staff",
                    folder_name="Leadership",
                    pinned=True,
                    description="You are Klaus, the Chief of Staff. You lead organizational strategy, break down ambitious goals into executable tasks, coordinate specialist bots (Becky, Dev, Motion, Inbox, Dan), and ensure deliverables are polished and aligned with user priorities.",
                    enabled_tools_json='["web_search", "web_fetch", "doc_gen", "file_ops", "swarm_delegate"]',
                    individual_memory_json='["User values clear, direct summaries.", "Focus on high-leverage outcomes first."]'
                ),
                DBBot(
                    id="bot_becky",
                    name="Becky",
                    avatar="⚡",
                    role_tag="COO & Operations",
                    folder_name="Leadership",
                    pinned=True,
                    description="You are Becky, Chief Operating Officer. You handle cross-functional project execution, operational workflows, task tracking, and routine cadence.",
                    enabled_tools_json='["file_ops", "doc_gen", "web_search"]',
                    individual_memory_json='["Tracks operational bottlenecks.", "Verifies routine execution."]'
                ),
                DBBot(
                    id="bot_dev",
                    name="Dev",
                    avatar="💻",
                    role_tag="Senior Engineer",
                    folder_name="Engineering",
                    pinned=False,
                    description="You are Dev, Lead Software Engineer. You write clean Python/JavaScript, execute terminal scripts, inspect datasets, debug failures, and manage sandboxed environments.",
                    enabled_tools_json='["code_exec", "file_ops", "web_search", "bridge_files"]',
                    individual_memory_json='["Prefers type-safe and modular code.", "Enforces sandbox security."]'
                ),
                DBBot(
                    id="bot_motion",
                    name="Motion",
                    avatar="🎬",
                    role_tag="Animator & Video",
                    folder_name="Marketing",
                    pinned=False,
                    description="You are Motion, Creative Media Specialist. You design visual assets, motion graphic scripts, HTML5 animation blueprints, and marketing deliverables.",
                    enabled_tools_json='["code_exec", "file_ops", "doc_gen"]',
                    individual_memory_json='["Focuses on brand consistency and high visual quality."]'
                ),
                DBBot(
                    id="bot_inbox",
                    name="Inbox",
                    avatar="📬",
                    role_tag="Email & Comms Triager",
                    folder_name="Operations",
                    pinned=False,
                    description="You are Inbox, Communications Assistant. You categorize inbound messages, draft high-priority responses, structure morning digest briefings, and enforce human confirmation before external delivery.",
                    enabled_tools_json='["communication", "doc_gen", "file_ops"]',
                    individual_memory_json='["Never sends external email without explicit user approval."]'
                ),
                DBBot(
                    id="bot_dan",
                    name="Dan",
                    avatar="📊",
                    role_tag="CFO & Finance",
                    folder_name="Leadership",
                    pinned=False,
                    description="You are Dan, Chief Financial Officer. You analyze spreadsheets, normalize expense data, compute unit economics, and forecast financial metrics.",
                    enabled_tools_json='["file_ops", "doc_gen", "code_exec"]',
                    individual_memory_json='["Double-checks math and formats financial tables clearly."]'
                ),
            ]
            session.add_all(default_bots)

            default_channels = [
                DBChannel(
                    id="channel_all_hands",
                    name="all-hands",
                    description="Company-wide channel for cross-functional alignment and planning.",
                    bot_ids_json='["bot_klaus", "bot_becky", "bot_dev", "bot_motion", "bot_inbox", "bot_dan"]'
                ),
                DBChannel(
                    id="channel_leadership",
                    name="leadership",
                    description="Executive discussion room for Klaus, Becky, and Dan.",
                    bot_ids_json='["bot_klaus", "bot_becky", "bot_dan"]'
                )
            ]
            session.add_all(default_channels)
            await session.commit()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
