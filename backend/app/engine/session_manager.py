import asyncio
import uuid
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update, or_, delete
from app.db.session import AsyncSessionLocal, DBSession, DBExecutionJob, DBPlan, DBStep, DBArtifact, DBApproval, DBActivityEvent, DBProviderAccount
from app.models.schemas import (
    SessionModel, SessionCreate, PlanModel, StepBase, ArtifactModel, ApprovalRequest, ActivityFeedEvent
)
from app.engine.planner import planner_engine
from app.engine.executor import ExecutorSession
from app.memory.long_term_memory import long_term_memory
from app.core.audit import audit_logger
from app.core.org_policy import org_policy_manager
from app.sandbox.process_sandbox import sandbox_manager
from app.core.llm import get_llm_client_for_account
from app.core.provider_accounts import load_account_secret

class SessionManager:
    def __init__(self):
        self._active_executors: Dict[str, ExecutorSession] = {}
        self._ws_subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._background_tasks: Dict[str, asyncio.Task] = {}
        self.worker_id = f"worker-{os.getpid()}-{uuid.uuid4().hex[:8]}"

    async def recover_interrupted_sessions(self) -> int:
        """Safely mark in-flight work as paused after an orchestrator restart.

        The persisted plan, approvals, activity feed, and artifacts remain
        available; a user must explicitly resume so a crashed process never
        silently repeats an external action.
        """
        recovered = 0
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(DBSession).where(DBSession.status.in_(["running", "waiting_approval"])))
            sessions = result.scalars().all()
            for session in sessions:
                session.status = "paused"
                session.updated_at = datetime.now(timezone.utc)
                recovered += 1
                audit_logger.log_event(session.id, "session_recovered_paused", "system", {"reason": "orchestrator_restart"})
            stale_jobs = await db.execute(select(DBExecutionJob).where(DBExecutionJob.status == "running"))
            for job in stale_jobs.scalars().all():
                job.status = "queued"
                job.worker_id = None
                job.lease_until = None
                job.updated_at = datetime.now(timezone.utc)
                job.last_error = "Recovered after orchestrator restart; explicit resume is required."
                audit_logger.log_event(job.session_id, "execution_job_requeued", "system", {"job_id": job.id, "reason": "orchestrator_restart"})
            await db.commit()
        return recovered

    def subscribe_events(self, session_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        if session_id not in self._ws_subscribers:
            self._ws_subscribers[session_id] = []
        self._ws_subscribers[session_id].append(q)
        return q

    def unsubscribe_events(self, session_id: str, q: asyncio.Queue):
        if session_id in self._ws_subscribers:
            try:
                self._ws_subscribers[session_id].remove(q)
            except ValueError:
                pass

    async def broadcast_event(self, event: ActivityFeedEvent):
        queues = self._ws_subscribers.get(event.session_id, [])
        for q in queues:
            await q.put(event)

    async def create_session(self, task_data: SessionCreate) -> SessionModel:
        org_policy_manager.assert_data_region_available(task_data.workspace_id)
        session_id = str(uuid.uuid4())

        if task_data.provider_account_id:
            async with AsyncSessionLocal() as db:
                account = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == task_data.provider_account_id, DBProviderAccount.workspace_id == task_data.workspace_id))).scalar_one_or_none()
            if not account:
                raise ValueError("Selected provider account was not found in this workspace")
            if account.status == "quota_exhausted":
                raise ValueError("Selected provider account is quota exhausted; choose another account")
        
        # Recall relevant long-term memory
        relevant_memories = await long_term_memory.retrieve_relevant_memory(
            query=task_data.task,
            workspace_id=task_data.workspace_id
        )
        memory_context = "\n".join(f"- {m.type.upper()}: {m.content}" for m in relevant_memories)

        # Create session in DB
        async with AsyncSessionLocal() as db:
            db_sess = DBSession(
                id=session_id,
                task=task_data.task,
                workspace_id=task_data.workspace_id,
                provider_account_id=task_data.provider_account_id,
                status="planning",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
                ,enabled_tools_json=json.dumps(task_data.enabled_tools)
                ,granted_folders_json=json.dumps(task_data.granted_folders)
                ,granted_scopes_json=json.dumps(task_data.granted_scopes)
                ,granted_domains_json=json.dumps(task_data.granted_domains)
            )
            db.add(db_sess)
            await db.commit()

        # Audit log creation
        audit_logger.log_event(
            session_id=session_id,
            event_type="session_created",
            actor="user",
            details={"task": task_data.task, "workspace": task_data.workspace_id}
        )

        # Generate structured plan
        plan = await planner_engine.generate_initial_plan(
            session_id=session_id,
            task=task_data.task,
            memory_context=memory_context,
            provider_account_id=task_data.provider_account_id,
        )

        # An empty allow-list means "tools required by this plan", never the
        # entire global registry. This keeps the local demo convenient while
        # enforcing least privilege at the session boundary.
        if not task_data.enabled_tools:
            enabled_tools = sorted({step.tool for step in plan.steps})
            async with AsyncSessionLocal() as db:
                stmt = update(DBSession).where(DBSession.id == session_id).values(
                    enabled_tools_json=json.dumps(enabled_tools)
                )
                await db.execute(stmt)
                await db.commit()
        else:
            enabled_tools = task_data.enabled_tools

        # Update status to created
        async with AsyncSessionLocal() as db:
            stmt = update(DBSession).where(DBSession.id == session_id).values(status="created")
            await db.execute(stmt)
            await db.commit()

        return SessionModel(
            id=session_id,
            task=task_data.task,
            workspace_id=task_data.workspace_id,
            provider_account_id=task_data.provider_account_id,
            status="created",
            plan=plan,
            artifacts=[],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
            ,enabled_tools=enabled_tools
            ,granted_folders=task_data.granted_folders
            ,granted_scopes=task_data.granted_scopes
            ,granted_domains=task_data.granted_domains
        )

    async def start_execution(self, session_id: str):
        session = await self.get_session(session_id)
        if not session or not session.plan:
            raise ValueError("Session or plan not found")

        # Persist execution intent before starting an in-process worker. This
        # makes a crash recoverable and gives competing workers a lease gate.
        job_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as db:
            existing = (await db.execute(select(DBExecutionJob).where(DBExecutionJob.session_id == session_id))).scalar_one_or_none()
            if existing and existing.status in {"queued", "running"}:
                job_id = existing.id
            else:
                if existing:
                    await db.delete(existing)
                db.add(DBExecutionJob(id=job_id, session_id=session_id, status="queued", attempts=0))
            await db.commit()

        lease_until = datetime.now(timezone.utc).timestamp() + max(60, session.max_runtime_seconds + 30)
        async with AsyncSessionLocal() as db:
            claimed = await db.execute(
                update(DBExecutionJob)
                .where(
                    DBExecutionJob.id == job_id,
                    DBExecutionJob.status == "queued",
                    or_(DBExecutionJob.lease_until.is_(None), DBExecutionJob.lease_until < datetime.now(timezone.utc)),
                )
                .values(
                    status="running",
                    worker_id=self.worker_id,
                    lease_until=datetime.fromtimestamp(lease_until, tz=timezone.utc),
                    attempts=DBExecutionJob.attempts + 1,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        if not claimed.rowcount:
            return

        provider_client = None
        if session.provider_account_id:
            async with AsyncSessionLocal() as db:
                account = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == session.provider_account_id, DBProviderAccount.workspace_id == session.workspace_id))).scalar_one_or_none()
            if not account:
                raise ValueError("Selected provider account no longer exists")
            if account.status == "quota_exhausted":
                raise ValueError("Selected provider account is quota exhausted; choose another account")
            secret = load_account_secret(account.id).get("secret", "")
            provider_client = get_llm_client_for_account(account.provider, secret, account.endpoint or "", account.model or "")

        # Create executor instance
        executor = ExecutorSession(
            session_id=session_id,
            workspace_id=session.workspace_id,
            event_callback=self.broadcast_event,
            enabled_tools=session.enabled_tools,
            max_steps=session.max_steps,
            max_tool_calls=session.max_tool_calls,
            max_runtime_seconds=session.max_runtime_seconds,
            granted_scopes=session.granted_scopes,
            granted_domains=session.granted_domains,
            granted_folders=session.granted_folders,
            llm=provider_client,
        )
        self._active_executors[session_id] = executor

        # Update status in DB
        async with AsyncSessionLocal() as db:
            stmt = update(DBSession).where(DBSession.id == session_id).values(
                status="running",
                updated_at=datetime.now(timezone.utc)
            )
            await db.execute(stmt)
            await db.commit()

        # Launch runner in background
        task = asyncio.create_task(self._run_executor_task(executor, session.plan, session.task, job_id))
        self._background_tasks[session_id] = task

    async def _run_executor_task(self, executor: ExecutorSession, plan: PlanModel, task: str, job_id: str):
        try:
            success = await executor.run_plan(plan, task)
            status = "completed" if success else ("cancelled" if executor.is_cancelled else "failed")
        except Exception as e:
            await executor.emit_event("error", f"Fatal execution failure: {str(e)}")
            status = "failed"
            
        async with AsyncSessionLocal() as db:
            stmt = update(DBSession).where(DBSession.id == executor.session_id).values(
                status=status,
                updated_at=datetime.now(timezone.utc)
            )
            await db.execute(stmt)
            await db.execute(
                update(DBExecutionJob).where(DBExecutionJob.id == job_id).values(
                    status=status,
                    worker_id=None,
                    lease_until=None,
                    last_error=None if status == "completed" else status,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()

        # Deliverables survive in durable artifact storage; temporary code,
        # trash, and working files do not survive the session lifecycle.
        sandbox_manager.finalize(executor.session_id)

        # Propose long-term memory candidate extraction at end (Memory.md §4)
        if status == "completed":
            candidates = long_term_memory.propose_candidates_from_task(task, [])
            if candidates:
                for c in candidates:
                    await executor.emit_event(
                        "narration",
                        f"Memory suggestion: {c.content} (Review in Memory Manager)",
                        {"candidate": c.model_dump()}
                    )

        self._active_executors.pop(executor.session_id, None)

    async def pause_session(self, session_id: str):
        executor = self._active_executors.get(session_id)
        if executor:
            executor.pause()
            async with AsyncSessionLocal() as db:
                stmt = update(DBSession).where(DBSession.id == session_id).values(status="paused")
                await db.execute(stmt)
                await db.commit()
            await executor.emit_event("narration", "Session paused.")

    async def resume_session(self, session_id: str):
        executor = self._active_executors.get(session_id)
        if executor:
            executor.resume()
            async with AsyncSessionLocal() as db:
                stmt = update(DBSession).where(DBSession.id == session_id).values(status="running")
                await db.execute(stmt)
                await db.commit()
            await executor.emit_event("narration", "Session resumed.")
        else:
            # Rehydrate a paused/failed-over session from persisted plan state.
            session = await self.get_session(session_id)
            if not session or not session.plan:
                raise ValueError("Session or plan not found")
            await self.start_execution(session_id)

    async def cancel_session(self, session_id: str):
        executor = self._active_executors.get(session_id)
        if executor:
            executor.cancel()
        async with AsyncSessionLocal() as db:
            stmt = update(DBSession).where(DBSession.id == session_id).values(status="cancelled")
            await db.execute(stmt)
            await db.execute(
                update(DBExecutionJob).where(DBExecutionJob.session_id == session_id, DBExecutionJob.status.in_(["queued", "running"])).values(
                    status="cancelled", worker_id=None, lease_until=None, updated_at=datetime.now(timezone.utc)
                )
            )
            await db.commit()

    async def update_permission(self, session_id: str, resource_type: str, value: str, granted: bool) -> SessionModel:
        session = await self.get_session(session_id)
        if not session:
            raise ValueError("Session not found")
        collections = {
            "tool": session.enabled_tools,
            "folder": session.granted_folders,
            "scope": session.granted_scopes,
            "domain": session.granted_domains,
        }
        target = collections[resource_type]
        if granted and value not in target:
            target.append(value)
        if not granted and value in target:
            target.remove(value)
        async with AsyncSessionLocal() as db:
            values = {
                "enabled_tools_json": json.dumps(session.enabled_tools),
                "granted_folders_json": json.dumps(session.granted_folders),
                "granted_scopes_json": json.dumps(session.granted_scopes),
                "granted_domains_json": json.dumps(session.granted_domains),
                "updated_at": datetime.now(timezone.utc),
            }
            await db.execute(update(DBSession).where(DBSession.id == session_id).values(**values))
            await db.commit()
        executor = self._active_executors.get(session_id)
        if executor:
            executor.update_permission(resource_type, value, granted)
        audit_logger.log_event(session_id, "permission_changed", "user", {"resource_type": resource_type, "value": value, "granted": granted})
        return await self.get_session(session_id)

    async def get_session(self, session_id: str) -> Optional[SessionModel]:
        async with AsyncSessionLocal() as db:
            sess_stmt = select(DBSession).where(DBSession.id == session_id)
            sess_res = await db.execute(sess_stmt)
            db_sess = sess_res.scalars().first()
            if not db_sess:
                return None

            # Fetch latest plan
            plan_stmt = select(DBPlan).where(DBPlan.session_id == session_id).order_by(DBPlan.version.desc())
            plan_res = await db.execute(plan_stmt)
            db_plan = plan_res.scalars().first()

            plan_model = None
            if db_plan:
                steps_stmt = select(DBStep).where(DBStep.plan_id == db_plan.id).order_by(DBStep.step_order.asc())
                steps_res = await db.execute(steps_stmt)
                db_steps = steps_res.scalars().all()
                steps = [
                    StepBase(
                        id=s.id,
                        step_order=s.step_order,
                        description=s.description,
                        tool=s.tool,
                        risk_level=s.risk_level, # type: ignore
                        dependencies=json.loads(s.dependencies_json or "[]"),
                        status=s.status, # type: ignore
                        result_summary=s.result_summary
                    )
                    for s in db_steps
                ]
                plan_model = PlanModel(
                    id=db_plan.id,
                    session_id=session_id,
                    version=db_plan.version,
                    status=db_plan.status,
                    explanation=db_plan.explanation,
                    steps=steps,
                    created_at=db_plan.created_at
                )

            # Fetch artifacts
            art_stmt = select(DBArtifact).where(DBArtifact.session_id == session_id)
            art_res = await db.execute(art_stmt)
            db_arts = art_res.scalars().all()
            artifacts = [
                ArtifactModel(
                    id=a.id,
                    session_id=a.session_id,
                    name=a.name,
                    file_type=a.file_type,
                    relative_path=a.relative_path,
                    file_size_bytes=a.file_size_bytes,
                    created_at=a.created_at,
                    summary=a.summary,
                    version=a.version
                )
                for a in db_arts
            ]

            # Fetch pending approval
            appr_stmt = select(DBApproval).where(
                DBApproval.session_id == session_id,
                DBApproval.status == "pending"
            ).order_by(DBApproval.requested_at.desc())
            appr_res = await db.execute(appr_stmt)
            db_appr = appr_res.scalars().first()
            pending_appr = None
            if db_appr:
                pending_appr = ApprovalRequest(
                    id=db_appr.id,
                    session_id=db_appr.session_id,
                    step_id=db_appr.step_id,
                    action_type=db_appr.action_type,
                    description=db_appr.description,
                    consequence=db_appr.consequence,
                    target=db_appr.target,
                    diff=db_appr.diff,
                    risk_level=db_appr.risk_level, # type: ignore
                    status=db_appr.status, # type: ignore
                    takeover_mode=db_appr.takeover_mode,
                    takeover_url=db_appr.takeover_url,
                    requested_at=db_appr.requested_at,
                    resolved_at=db_appr.resolved_at,
                    actor=db_appr.actor,
                    user_feedback=db_appr.user_feedback
                )

            return SessionModel(
                id=db_sess.id,
                task=db_sess.task,
                workspace_id=db_sess.workspace_id,
                provider_account_id=db_sess.provider_account_id,
                status=db_sess.status, # type: ignore
                plan=plan_model,
                artifacts=artifacts,
                pending_approval=pending_appr,
                created_at=db_sess.created_at,
                updated_at=db_sess.updated_at,
                tool_calls_count=db_sess.tool_calls_count,
                total_cost_usd=db_sess.total_cost_usd
                ,enabled_tools=json.loads(db_sess.enabled_tools_json or "[]")
                ,granted_folders=json.loads(db_sess.granted_folders_json or "[]")
                ,granted_scopes=json.loads(db_sess.granted_scopes_json or "[]")
                ,granted_domains=json.loads(db_sess.granted_domains_json or "[]")
                ,max_steps=db_sess.max_steps or 30
                ,max_tool_calls=db_sess.max_tool_calls or 50
                ,max_runtime_seconds=db_sess.max_runtime_seconds or 300
            )

    async def list_sessions(self, limit: int = 20) -> List[SessionModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBSession).order_by(DBSession.created_at.desc()).limit(limit)
            res = await db.execute(stmt)
            items = res.scalars().all()
            results = []
            for item in items:
                sess = await self.get_session(item.id)
                if sess:
                    results.append(sess)
            return results

    async def get_activity_events(self, session_id: str, limit: int = 200) -> List[ActivityFeedEvent]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBActivityEvent).where(
                DBActivityEvent.session_id == session_id
            ).order_by(DBActivityEvent.timestamp.asc()).limit(limit)
            result = await db.execute(stmt)
            rows = result.scalars().all()
            return [
                ActivityFeedEvent(
                    id=row.id,
                    session_id=row.session_id,
                    timestamp=row.timestamp,
                    event_type=row.event_type,
                    message=row.message,
                    technical_details=json.loads(row.technical_details_json) if row.technical_details_json else None,
                    step_id=row.step_id,
                )
                for row in rows
            ]

session_manager = SessionManager()
