from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, create_engine, text
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
    workspace_id = Column(String, default="default")
    status = Column(String, default="created")
    tool_calls_count = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    enabled_tools_json = Column(Text, default="[]")
    granted_folders_json = Column(Text, default="[]")
    granted_scopes_json = Column(Text, default="[]")
    max_steps = Column(Integer, default=30)
    max_tool_calls = Column(Integer, default=50)
    max_runtime_seconds = Column(Integer, default=300)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    plans = relationship("DBPlan", back_populates="session", cascade="all, delete-orphan")
    approvals = relationship("DBApproval", back_populates="session", cascade="all, delete-orphan")
    artifacts = relationship("DBArtifact", back_populates="session", cascade="all, delete-orphan")
    activity_events = relationship("DBActivityEvent", back_populates="session", cascade="all, delete-orphan")

class DBPlan(Base):
    __tablename__ = "plans"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    version = Column(Integer, default=1)
    status = Column(String, default="draft")
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    session = relationship("DBSession", back_populates="plans")
    steps = relationship("DBStep", back_populates="plan", cascade="all, delete-orphan")

class DBStep(Base):
    __tablename__ = "steps"
    
    id = Column(String, primary_key=True)
    plan_id = Column(String, ForeignKey("plans.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    description = Column(Text, nullable=False)
    tool = Column(String, nullable=False)
    risk_level = Column(String, default="low")
    dependencies_json = Column(Text, default="[]")
    status = Column(String, default="pending")
    result_summary = Column(Text, nullable=True)
    
    plan = relationship("DBPlan", back_populates="steps")

class DBToolCall(Base):
    __tablename__ = "tool_calls"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, nullable=False)
    step_id = Column(String, nullable=True)
    tool = Column(String, nullable=False)
    input_params_json = Column(Text, default="{}")
    output_data_json = Column(Text, nullable=True)
    status = Column(String, default="success")
    risk_level = Column(String, default="low")
    execution_time_ms = Column(Integer, default=0)
    timestamp = Column(DateTime, default=utc_now)

class DBApproval(Base):
    __tablename__ = "approvals"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    step_id = Column(String, nullable=True)
    action_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    consequence = Column(Text, nullable=False)
    target = Column(String, nullable=False)
    diff = Column(Text, nullable=True)
    risk_level = Column(String, default="high")
    status = Column(String, default="pending")
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
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
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
    workspace_id = Column(String, default="default")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    last_used_at = Column(DateTime, nullable=True)

class DBSchedule(Base):
    __tablename__ = "schedules"
    
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    task_template = Column(Text, nullable=False)
    cron_expression = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    next_run_at = Column(DateTime, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_status = Column(String, nullable=True)

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

class DBActivityEvent(Base):
    __tablename__ = "activity_events"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    timestamp = Column(DateTime, default=utc_now)
    event_type = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    technical_details_json = Column(Text, nullable=True)
    step_id = Column(String, nullable=True)

    session = relationship("DBSession", back_populates="activity_events")

engine = create_async_engine(settings.DATABASE_URL, echo=False)
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
                "enabled_tools_json": "TEXT DEFAULT '[]'",
                "granted_folders_json": "TEXT DEFAULT '[]'",
                "max_steps": "INTEGER DEFAULT 30",
                "max_tool_calls": "INTEGER DEFAULT 50",
                "max_runtime_seconds": "INTEGER DEFAULT 300",
                "granted_scopes_json": "TEXT DEFAULT '[]'",
            }
            for column, definition in additions.items():
                if column not in existing:
                    await conn.execute(text(f"ALTER TABLE sessions ADD COLUMN {column} {definition}"))

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
