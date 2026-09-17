import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, update, delete
from app.db.session import AsyncSessionLocal, DBPlan, DBStep, DBProviderAccount
from app.models.schemas import PlanModel, StepBase, RiskLevel, PlanEditRequest
from app.core.llm import get_llm_client, BaseLLMProvider
from app.core.llm import get_llm_client_for_account
from app.core.provider_accounts import load_account_secret
from app.core.audit import audit_logger
from app.tools.registry import tool_registry

class PlannerEngine:
    def __init__(self):
        self.llm = get_llm_client()

    async def generate_initial_plan(
        self,
        session_id: str,
        task: str,
        memory_context: str = "",
        provider_account_id: Optional[str] = None,
        provider_client: Optional[BaseLLMProvider] = None,
    ) -> PlanModel:
        # Provider settings can be changed from the desktop Settings panel
        # while the server is running.
        self.llm = provider_client or get_llm_client()
        if provider_account_id and not provider_client:
            async with AsyncSessionLocal() as db:
                account = (await db.execute(select(DBProviderAccount).where(DBProviderAccount.id == provider_account_id))).scalar_one_or_none()
            if not account:
                raise ValueError("Selected provider account was not found")
            secret = load_account_secret(account.id).get("secret", "")
            self.llm = get_llm_client_for_account(account.provider, secret, account.endpoint or "", account.model or "")
        plan_data = await self.llm.generate_plan(task, memory_context)
        plan_id = str(uuid.uuid4())
        explanation = plan_data.get("explanation", "Initial plan generated.")
        raw_steps = plan_data.get("steps", [])

        steps: List[StepBase] = []
        step_ids = {f"step-{i}": f"{session_id[:8]}-step-{i}" for i in range(1, len(raw_steps) + 1)}
        for i, s in enumerate(raw_steps, 1):
            step_id = f"{session_id[:8]}-step-{i}"
            tool_name = s.get("tool", "execute_code")
            if not tool_registry.get_tool(tool_name):
                raise ValueError(f"Planner selected unknown tool: {tool_name}")
            dependencies = [step_ids.get(dep, dep) for dep in s.get("dependencies", [])]
            steps.append(StepBase(
                id=step_id,
                step_order=i,
                description=s.get("description", f"Step {i}"),
                tool=tool_name,
                risk_level=s.get("risk_level", "low"),
                dependencies=dependencies,
                status="pending"
            ))

        plan = PlanModel(
            id=plan_id,
            session_id=session_id,
            version=1,
            status="draft",
            explanation=explanation,
            steps=steps,
            created_at=datetime.now(timezone.utc)
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
                    ,failure_count=0
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

    async def edit_plan(self, session_id: str, plan: PlanModel, request: PlanEditRequest) -> PlanModel:
        if plan.status not in ("draft", "revised"):
            raise ValueError("Only a draft or revised plan can be edited")

        if request.action == "add":
            if not request.description or not request.tool:
                raise ValueError("Adding a step requires description and tool")
            if not tool_registry.get_tool(request.tool):
                raise ValueError(f"Unknown tool: {request.tool}")
            step_id = f"{session_id[:8]}-step-{uuid.uuid4().hex[:8]}"
            plan.steps.append(StepBase(
                id=step_id,
                step_order=len(plan.steps) + 1,
                description=request.description.strip(),
                tool=request.tool,
                risk_level=request.risk_level,
                status="pending",
            ))
        elif request.action == "remove":
            if not request.step_id:
                raise ValueError("Removing a step requires step_id")
            plan.steps = [s for s in plan.steps if s.id != request.step_id]
        elif request.action == "reorder":
            wanted = request.ordered_step_ids
            current = {s.id: s for s in plan.steps}
            if set(wanted) != set(current) or len(wanted) != len(current):
                raise ValueError("ordered_step_ids must contain every plan step exactly once")
            plan.steps = [current[step_id] for step_id in wanted]
        else:
            raise ValueError(f"Unsupported plan edit action: {request.action}")

        for index, step in enumerate(plan.steps, 1):
            step.step_order = index

        plan.version += 1
        plan.status = "revised"
        plan.explanation = "Plan edited by user."

        async with AsyncSessionLocal() as db:
            await db.execute(update(DBPlan).where(DBPlan.id == plan.id).values(
                version=plan.version,
                status=plan.status,
                explanation=plan.explanation,
            ))
            existing = await db.execute(select(DBStep).where(DBStep.plan_id == plan.id))
            existing_steps = {row.id: row for row in existing.scalars().all()}
            current_ids = {step.id for step in plan.steps}
            for step_id in set(existing_steps) - current_ids:
                await db.execute(delete(DBStep).where(DBStep.id == step_id))
            for step in plan.steps:
                values = dict(
                    plan_id=plan.id,
                    step_order=step.step_order,
                    description=step.description,
                    tool=step.tool,
                    risk_level=step.risk_level,
                    dependencies_json=json.dumps(step.dependencies),
                    status=step.status,
                    result_summary=step.result_summary,
                )
                if step.id in existing_steps:
                    await db.execute(update(DBStep).where(DBStep.id == step.id).values(**values))
                else:
                    db.add(DBStep(id=step.id, **values))
            await db.commit()

        audit_logger.log_event(
            session_id=session_id,
            event_type="plan_edited",
            actor="user",
            details={"action": request.action, "version": plan.version},
        )
        return plan

planner_engine = PlannerEngine()
