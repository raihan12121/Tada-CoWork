import uuid
import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy import select, update, delete
from app.db.session import AsyncSessionLocal, DBSchedule, DBOrganization, DBSession, DBActivityEvent, DBToolCall, DBPlan, DBStep, DBApproval, DBArtifact
from app.core.audit import audit_logger
from app.models.schemas import ScheduleModel, SessionCreate

class SchedulerEngine:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._last_retention_sweep = datetime.min.replace(tzinfo=timezone.utc)

    async def create_schedule(
        self,
        title: str,
        task_template: str,
        cron_expression: str,
        workspace_id: str = "default",
        enabled_tools: Optional[List[str]] = None,
        granted_scopes: Optional[List[str]] = None,
        granted_folders: Optional[List[str]] = None,
        granted_domains: Optional[List[str]] = None,
    ) -> ScheduleModel:
        sched_id = str(uuid.uuid4())
        next_run = self._next_run(cron_expression, datetime.now(timezone.utc))
        
        async with AsyncSessionLocal() as db:
            db_sched = DBSchedule(
                id=sched_id,
                workspace_id=workspace_id,
                title=title,
                task_template=task_template,
                cron_expression=cron_expression,
                is_active=True,
                next_run_at=next_run,
                enabled_tools_json=json.dumps(enabled_tools or []),
                granted_scopes_json=json.dumps(granted_scopes or []),
                granted_folders_json=json.dumps(granted_folders or []),
                granted_domains_json=json.dumps(granted_domains or []),
            )
            db.add(db_sched)
            await db.commit()

        return ScheduleModel(
            id=sched_id,
            workspace_id=workspace_id,
            title=title,
            task_template=task_template,
            cron_expression=cron_expression,
            is_active=True,
            next_run_at=next_run,
            enabled_tools=enabled_tools or [],
            granted_scopes=granted_scopes or [],
            granted_folders=granted_folders or [],
            granted_domains=granted_domains or [],
        )

    async def list_schedules(self) -> List[ScheduleModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBSchedule).order_by(DBSchedule.title.asc())
            res = await db.execute(stmt)
            items = res.scalars().all()
            return [
                ScheduleModel(
                    id=i.id,
                    workspace_id=i.workspace_id or "default",
                    title=i.title,
                    task_template=i.task_template,
                    cron_expression=i.cron_expression,
                    is_active=i.is_active,
                    next_run_at=i.next_run_at,
                    last_run_at=i.last_run_at,
                    last_status=i.last_status,
                    enabled_tools=json.loads(i.enabled_tools_json or "[]"),
                    granted_scopes=json.loads(i.granted_scopes_json or "[]"),
                    granted_folders=json.loads(i.granted_folders_json or "[]"),
                    granted_domains=json.loads(i.granted_domains_json or "[]"),
                )
                for i in items
            ]

    async def delete_schedule(self, sched_id: str):
        async with AsyncSessionLocal() as db:
            stmt = delete(DBSchedule).where(DBSchedule.id == sched_id)
            await db.execute(stmt)
            await db.commit()

    async def run_due_schedules(self):
        """Create fresh sessions for due jobs; each run plans again."""
        from app.engine.session_manager import session_manager
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(DBSchedule).where(
                DBSchedule.is_active == True,
                DBSchedule.next_run_at <= now,
            ))
            due = result.scalars().all()
            for schedule in due:
                try:
                    session = await session_manager.create_session(SessionCreate(
                        task=schedule.task_template,
                        workspace_id=schedule.workspace_id or "default",
                        enabled_tools=json.loads(schedule.enabled_tools_json or "[]"),
                        granted_scopes=json.loads(schedule.granted_scopes_json or "[]"),
                        granted_folders=json.loads(schedule.granted_folders_json or "[]"),
                        granted_domains=json.loads(schedule.granted_domains_json or "[]"),
                    ))
                    await session_manager.start_execution(session.id)
                    schedule.last_status = "started"
                except Exception as exc:
                    schedule.last_status = f"failed: {exc}"
                schedule.last_run_at = now
                schedule.next_run_at = self._next_run(schedule.cron_expression, now)
            await db.commit()

    async def run_retention_sweep(self):
        now = datetime.now(timezone.utc)
        if (now - self._last_retention_sweep).total_seconds() < 60:
            return
        self._last_retention_sweep = now
        async with AsyncSessionLocal() as db:
            org_result = await db.execute(select(DBOrganization))
            organizations = org_result.scalars().all()
            for organization in organizations:
                cutoff = now - timedelta(days=organization.retention_days or 30)
                ids_result = await db.execute(select(DBSession.id).where(DBSession.workspace_id == organization.id, DBSession.created_at < cutoff))
                session_ids = [row[0] for row in ids_result.all()]
                if not session_ids:
                    continue
                plan_result = await db.execute(select(DBPlan.id).where(DBPlan.session_id.in_(session_ids)))
                plan_ids = [row[0] for row in plan_result.all()]
                if plan_ids:
                    await db.execute(delete(DBStep).where(DBStep.plan_id.in_(plan_ids)))
                    await db.execute(delete(DBPlan).where(DBPlan.id.in_(plan_ids)))
                for model in (DBApproval, DBArtifact, DBActivityEvent, DBToolCall):
                    await db.execute(delete(model).where(model.session_id.in_(session_ids)))
                await db.execute(delete(DBSession).where(DBSession.id.in_(session_ids)))
                audit_logger.log_event("organization", "retention_cleanup", "scheduler", {"organization_id": organization.id, "deleted_sessions": len(session_ids), "retention_days": organization.retention_days})
            await db.commit()

    @staticmethod
    def _next_run(expression: str, after: datetime) -> datetime:
        """Return the next UTC occurrence for standard five-field cron."""
        fields = expression.strip().split()
        if len(fields) != 5:
            raise ValueError("cron_expression must contain five fields: minute hour day-of-month month day-of-week")

        def values(field: str, minimum: int, maximum: int) -> set[int]:
            output: set[int] = set()
            for token in field.split(","):
                if token == "*":
                    output.update(range(minimum, maximum + 1))
                elif token.startswith("*/"):
                    step = int(token[2:])
                    if step <= 0:
                        raise ValueError("cron step must be positive")
                    output.update(range(minimum, maximum + 1, step))
                elif "-" in token:
                    start, end = (int(value) for value in token.split("-", 1))
                    if start > end:
                        raise ValueError("cron range start must not exceed end")
                    output.update(range(start, end + 1))
                else:
                    output.add(int(token))
            if not output or min(output) < minimum or max(output) > maximum:
                raise ValueError(f"cron value outside allowed range {minimum}-{maximum}")
            return output

        minutes = values(fields[0], 0, 59)
        hours = values(fields[1], 0, 23)
        days = values(fields[2], 1, 31)
        months = values(fields[3], 1, 12)
        weekdays = values(fields[4], 0, 7)
        weekday_values = {0 if day == 7 else day for day in weekdays}
        candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
        for _ in range(60 * 24 * 366):
            cron_weekday = (candidate.weekday() + 1) % 7
            if (candidate.month in months and candidate.day in days and
                    cron_weekday in weekday_values and candidate.hour in hours and
                    candidate.minute in minutes):
                return candidate
            candidate += timedelta(minutes=1)
        raise ValueError("cron expression has no occurrence within one year")

    async def start(self):
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self):
        while not self._stop.is_set():
            try:
                await self.run_due_schedules()
                await self.run_retention_sweep()
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(30)

scheduler_engine = SchedulerEngine()
