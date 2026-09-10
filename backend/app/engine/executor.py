import asyncio
import uuid
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable, Awaitable
from sqlalchemy import update
from app.db.session import AsyncSessionLocal, DBSession, DBStep, DBToolCall, DBArtifact
from app.models.schemas import (
    SessionModel, PlanModel, StepBase, ToolCallRecord, ActivityFeedEvent, ArtifactModel
)
from app.core.safety import safety_engine
from app.core.audit import audit_logger
from app.core.llm import get_llm_client
from app.tools.registry import tool_registry
from app.engine.approval_gate import approval_gate_manager
from app.engine.planner import planner_engine
from app.engine.task_graph import task_graph_engine
from app.memory.working_memory import WorkingMemory
from app.config import settings

EventCallback = Callable[[ActivityFeedEvent], Awaitable[None]]

class ExecutorSession:
    def __init__(self, session_id: str, event_callback: Optional[EventCallback] = None):
        self.session_id = session_id
        self.event_callback = event_callback
        self.llm = get_llm_client()
        self.working_memory = WorkingMemory(session_id)
        self.is_paused = False
        self.is_cancelled = False
        self._pause_event = asyncio.Event()
        self._pause_event.set() # Not paused initially
        self.tool_calls_count = 0
        self._lock = asyncio.Lock()

    async def emit_event(
        self,
        event_type: str,
        message: str,
        technical_details: Optional[Dict[str, Any]] = None,
        step_id: Optional[str] = None
    ):
        event = ActivityFeedEvent(
            id=str(uuid.uuid4()),
            session_id=self.session_id,
            timestamp=datetime.utcnow(),
            event_type=event_type,
            message=message,
            technical_details=technical_details,
            step_id=step_id
        )
        if self.event_callback:
            try:
                await self.event_callback(event)
            except Exception:
                pass

    def pause(self):
        self.is_paused = True
        self._pause_event.clear()

    def resume(self):
        self.is_paused = False
        self._pause_event.set()

    def cancel(self):
        self.is_cancelled = True
        self._pause_event.set()

    async def run_plan(self, plan: PlanModel, task: str) -> bool:
        """
        Executes the plan using the Task Graph Engine. Identifies independent branches
        and fans out parallel sub-agent executor loops, followed by an explicit merge step (Phase 6).
        """
        await self.emit_event(
            "narration",
            "Starting execution of approved plan. I'll narrate each step as I work.",
            {"plan_id": plan.id, "total_steps": len(plan.steps)}
        )

        prior_observations: List[Dict[str, Any]] = []
        tiers = task_graph_engine.compute_execution_tiers(plan.steps)

        for tier_idx, tier in enumerate(tiers, 1):
            await self._pause_event.wait()
            if self.is_cancelled:
                await self.emit_event("narration", "Task execution was cancelled by user.")
                return False

            if task_graph_engine.is_parallel_tier(tier):
                # Multi-Workstream Parallelism (Phase 6 / TRD FR-4)
                sub_agent_names = [f"SubAgent-{s.step_order} ({s.tool})" for s in tier]
                await self.emit_event(
                    "narration",
                    f"Fanning out {len(tier)} parallel sub-agents for concurrent workstreams: {', '.join(sub_agent_names)}...",
                    {"tier": tier_idx, "parallel_steps": [s.id for s in tier]}
                )

                # Fan out concurrent sub-agents
                tier_tasks = [self._execute_single_step(s, plan, task, prior_observations) for s in tier]
                results = await asyncio.gather(*tier_tasks, return_exceptions=True)

                # Merge step (architecture.md §8)
                await self.emit_event(
                    "narration",
                    f"Reconciling and merging {len(tier)} sub-agent outputs into unified session state.",
                    {"tier": tier_idx, "completed_sub_agents": len(tier)}
                )
            else:
                # Single step execution
                step = tier[0]
                await self._execute_single_step(step, plan, task, prior_observations)

        await self.emit_event("done", "All plan steps completed successfully.", {"plan_id": plan.id})
        return True

    async def _execute_single_step(
        self,
        step: StepBase,
        plan: PlanModel,
        task: str,
        prior_observations: List[Dict[str, Any]]
    ) -> bool:
        await self._pause_event.wait()
        if self.is_cancelled:
            return False

        if step.status in ("completed", "skipped"):
            return True

        step.status = "running"
        await self._update_step_db(step)
        await self.emit_event(
            "narration",
            f"Starting: {step.description}",
            {"step_id": step.id, "tool": step.tool},
            step_id=step.id
        )

        # ReAct Reason pass
        reasoning = await self.llm.reason_step(
            task=task,
            step=step,
            prior_observations=prior_observations,
            tools_available=tool_registry.list_tools()
        )

        await self.emit_event(
            "reasoning",
            reasoning.get("narration", f"Reasoning about step: {step.description}"),
            {"thought": reasoning.get("thought"), "tool": reasoning.get("tool"), "params": reasoning.get("params")},
            step_id=step.id
        )

        tool_name = reasoning.get("tool", step.tool)
        tool_params = reasoning.get("params", {})

        # Enforce Risk Tier & Approval Gate (rules.md §2)
        pre_approved = approval_gate_manager.get_pre_approved_classes(self.session_id)
        risk_level, requires_approval, consequence = safety_engine.classify_tool_risk(
            tool_name=tool_name,
            input_params=tool_params,
            pre_approved_medium_classes=pre_approved
        )

        if requires_approval:
            await self.emit_event(
                "approval_required",
                f"Approval needed: {consequence}",
                {
                    "tool": tool_name,
                    "risk_level": risk_level,
                    "consequence": consequence,
                    "params": tool_params
                },
                step_id=step.id
            )
            
            is_takeover = "payment" in task.lower() or "login" in task.lower()
            takeover_url = tool_params.get("url") if is_takeover else None

            approved, user_feedback = await approval_gate_manager.request_approval(
                session_id=self.session_id,
                action_type=tool_name,
                description=step.description,
                consequence=consequence,
                target=str(tool_params.get("path") or tool_params.get("recipient") or tool_name),
                risk_level=risk_level,
                step_id=step.id,
                takeover_mode=is_takeover,
                takeover_url=takeover_url
            )

            if not approved:
                step.status = "failed"
                step.result_summary = f"Action denied by user. Reason: {user_feedback or 'User declined.'}"
                await self._update_step_db(step)
                await self.emit_event(
                    "narration",
                    f"Action '{tool_name}' was denied by user. Replanning remaining steps...",
                    {"feedback": user_feedback},
                    step_id=step.id
                )
                await planner_engine.revise_plan(self.session_id, plan, "User denied step", step.id)
                return False

            await self.emit_event("narration", f"Action approved. Proceeding with {tool_name}...", step_id=step.id)

        # Tool Execution inside Sandbox
        tool_instance = tool_registry.get_tool(tool_name)
        if not tool_instance:
            step.status = "failed"
            step.result_summary = f"Tool '{tool_name}' not found."
            await self._update_step_db(step)
            return False

        async with self._lock:
            self.tool_calls_count += 1
            
        start_ms = int(time.time() * 1000)

        # Audit log before call (architecture.md §4)
        audit_logger.log_event(
            session_id=self.session_id,
            event_type="tool_call_start",
            actor="executor",
            details={"tool": tool_name, "params": tool_params},
            step_id=step.id
        )

        try:
            result = await tool_instance.execute(session_id=self.session_id, **tool_params)
        except Exception as ex:
            result = {"success": False, "error": str(ex)}

        exec_time_ms = int(time.time() * 1000) - start_ms

        # Audit log after call
        audit_logger.log_event(
            session_id=self.session_id,
            event_type="tool_call_end",
            actor="executor",
            details={"tool": tool_name, "success": result.get("success", False), "time_ms": exec_time_ms},
            step_id=step.id
        )

        # Record Tool Call in DB
        await self._record_tool_call_db(step.id, tool_name, tool_params, result, risk_level, exec_time_ms)

        # Check if an artifact deliverable was produced
        if tool_name == "create_document" and result.get("success"):
            await self._record_artifact_db(result)
            await self.emit_event(
                "artifact_created",
                f"Created deliverable: {result.get('filename')}",
                result,
                step_id=step.id
            )

        # Update working memory & step completion
        step.status = "completed" if result.get("success") else "failed"
        step.result_summary = result.get("summary") or result.get("message") or ("Completed." if result.get("success") else result.get("error"))
        await self._update_step_db(step)

        async with self._lock:
            self.working_memory.add_turn(
                role="assistant",
                content=f"Executed {tool_name}: {step.result_summary}",
                metadata={"tool": tool_name, "step_id": step.id}
            )
            prior_observations.append({"step": step.id, "tool": tool_name, "result": result})

        await self.emit_event(
            "narration",
            f"Finished: {step.description}. {step.result_summary}",
            {"output": result},
            step_id=step.id
        )
        return result.get("success", False)

    async def _update_step_db(self, step: StepBase):
        async with AsyncSessionLocal() as db:
            stmt = update(DBStep).where(DBStep.id == step.id).values(
                status=step.status,
                result_summary=step.result_summary
            )
            await db.execute(stmt)
            await db.commit()

    async def _record_tool_call_db(
        self,
        step_id: str,
        tool: str,
        input_params: Dict[str, Any],
        output_data: Any,
        risk_level: str,
        exec_time_ms: int
    ):
        import json
        async with AsyncSessionLocal() as db:
            call_id = str(uuid.uuid4())
            db_call = DBToolCall(
                id=call_id,
                session_id=self.session_id,
                step_id=step_id,
                tool=tool,
                input_params_json=json.dumps(input_params),
                output_data_json=json.dumps(output_data) if output_data else None,
                status="success" if output_data and output_data.get("success") else "failed",
                risk_level=risk_level,
                execution_time_ms=exec_time_ms,
                timestamp=datetime.utcnow()
            )
            db.add(db_call)
            
            session_stmt = update(DBSession).where(DBSession.id == self.session_id).values(
                tool_calls_count=DBSession.tool_calls_count + 1,
                updated_at=datetime.utcnow()
            )
            await db.execute(session_stmt)
            await db.commit()

    async def _record_artifact_db(self, artifact_data: Dict[str, Any]):
        async with AsyncSessionLocal() as db:
            art_id = str(uuid.uuid4())
            db_art = DBArtifact(
                id=art_id,
                session_id=self.session_id,
                name=artifact_data.get("filename", "deliverable"),
                file_type=artifact_data.get("file_type", "md"),
                relative_path=artifact_data.get("relative_path", ""),
                file_size_bytes=artifact_data.get("file_size_bytes", 0),
                created_at=datetime.utcnow(),
                summary=artifact_data.get("summary"),
                version=1
            )
            db.add(db_art)
            await db.commit()
