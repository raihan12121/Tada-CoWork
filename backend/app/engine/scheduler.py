import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy import select, update, delete
from app.db.session import AsyncSessionLocal, DBSchedule
from app.models.schemas import ScheduleModel, SessionCreate

class SchedulerEngine:
    async def create_schedule(self, title: str, task_template: str, cron_expression: str) -> ScheduleModel:
        sched_id = str(uuid.uuid4())
        # Default next run to 1 day ahead for daily, 7 days for weekly
        next_run = datetime.utcnow() + timedelta(days=1 if "daily" in cron_expression.lower() else 7)
        
        async with AsyncSessionLocal() as db:
            db_sched = DBSchedule(
                id=sched_id,
                title=title,
                task_template=task_template,
                cron_expression=cron_expression,
                is_active=True,
                next_run_at=next_run
            )
            db.add(db_sched)
            await db.commit()

        return ScheduleModel(
            id=sched_id,
            title=title,
            task_template=task_template,
            cron_expression=cron_expression,
            is_active=True,
            next_run_at=next_run
        )

    async def list_schedules(self) -> List[ScheduleModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBSchedule).order_by(DBSchedule.title.asc())
            res = await db.execute(stmt)
            items = res.scalars().all()
            return [
                ScheduleModel(
                    id=i.id,
                    title=i.title,
                    task_template=i.task_template,
                    cron_expression=i.cron_expression,
                    is_active=i.is_active,
                    next_run_at=i.next_run_at,
                    last_run_at=i.last_run_at,
                    last_status=i.last_status
                )
                for i in items
            ]

    async def delete_schedule(self, sched_id: str):
        async with AsyncSessionLocal() as db:
            stmt = delete(DBSchedule).where(DBSchedule.id == sched_id)
            await db.execute(stmt)
            await db.commit()

scheduler_engine = SchedulerEngine()
