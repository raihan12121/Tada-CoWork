import uuid
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update
from app.db.session import AsyncSessionLocal, DBPlan, DBStep
from app.models.schemas import PlanModel, StepBase, RiskLevel
from app.core.llm import get_llm_client
from app.core.audit import audit_logger

class PlannerEngine:
    def __init__(self):
        self.llm = get_llm_client()

    async def generate_initial_plan(
        self,
        session_id: str,
        task: str,
        memory_context: str = ""
    ) -> PlanModel:
        plan_data = await self.llm.generate_plan(task, memory_context)
        plan_id = str(uuid.uuid4())
        explanation = plan_data.get("explanation", "Initial plan generated.")
        raw_steps = plan_data.get("steps", [])

        steps: List[StepBase] = []
        for i, s in enumerate(raw_steps, 1):
            step_id = f"{session_id[:8]}-step-{i}"
            steps.append(StepBase(
                id=step_id,
                step_order=i,
                description=s.get("description", f"Step {i}"),
                tool=s.get("tool", "execute_code"),
                risk_level=s.get("risk_level", "low"),
                dependencies=s.get("dependencies", []),
                status="pending"
            ))

        plan = PlanModel(
            id=plan_id,
            session_id=session_id,
            version=1,
            status="draft",
            explanation=explanation,
            steps=steps,
            created_at=datetime.utcnow()
        )

        # Persist to database
        async with AsyncSessionLocal() as db:
            db_plan = DBPlan(
                id=plan.id,
                session_id=session_id,
                version=1,
                status="draft",
                explanation=explanation,
                created_at=plan.created_at
            )
            db.add(db_plan)
            for st in steps:
                db_step = DBStep(
                    id=st.id,
                    plan_id=plan.id,
                    step_order=st.step_order,
                    description=st.description,
                    tool=st.tool,
                    risk_level=st.risk_level,
                    dependencies_json=json.dumps(st.dependencies),
                    status=st.status
                )
                db.add(db_step)
            await db.commit()

        # Audit log
        audit_logger.log_event(
            session_id=session_id,
            event_type="plan_created",
            actor="planner",
            details={
                "plan_id": plan.id,
                "step_count": len(steps),
                "explanation": explanation
            }
        )

        return plan

    async def revise_plan(
        self,
        session_id: str,
        current_plan: PlanModel,
        reason: str,
        failed_or_denied_step_id: Optional[str] = None
    ) -> PlanModel:
        """
        Replanning pass mid-execution (TRD FR-7).
        """
        new_version = current_plan.version + 1
        explanation = f"Plan revised: {reason}"
        
        # Mark pending steps or adjust
        updated_steps: List[StepBase] = []
        for s in current_plan.steps:
            if s.id == failed_or_denied_step_id:
                s.status = "skipped"
                s.result_summary = f"Skipped or denied: {reason}"
            updated_steps.append(s)

        current_plan.version = new_version
        current_plan.explanation = explanation
        current_plan.steps = updated_steps

        # Update in database
        async with AsyncSessionLocal() as db:
            stmt = update(DBPlan).where(DBPlan.id == current_plan.id).values(
                version=new_version,
                explanation=explanation,
                status="revised"
            )
            await db.execute(stmt)
            for st in updated_steps:
                step_stmt = update(DBStep).where(DBStep.id == st.id).values(
                    status=st.status,
                    result_summary=st.result_summary
                )
                await db.execute(step_stmt)
            await db.commit()

        audit_logger.log_event(
            session_id=session_id,
            event_type="plan_revised",
            actor="planner",
            details={"version": new_version, "reason": reason},
            step_id=failed_or_denied_step_id
        )

        return current_plan

planner_engine = PlannerEngine()
