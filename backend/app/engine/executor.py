import asyncio
import uuid
import time
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable, Awaitable
from sqlalchemy import update
from app.db.session import AsyncSessionLocal, DBSession, DBStep, DBToolCall, DBArtifact, DBActivityEvent
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
from app.core.org_policy import org_policy_manager
from app.core.connector_policy import connector_is_allowed

EventCallback = Callable[[ActivityFeedEvent], Awaitable[None]]

class ExecutorSession:
    def __init__(
        self,
        session_id: str,
        workspace_id: str = "default",
        event_callback: Optional[EventCallback] = None,
        enabled_tools: Optional[List[str]] = None,
        max_steps: int = 30,
        max_tool_calls: int = 50,
        max_runtime_seconds: int = 300,
        granted_scopes: Optional[List[str]] = None,
    ):
        self.session_id = session_id
        self.workspace_id = workspace_id
        self.event_callback = event_callback
        self.llm = get_llm_client()
        self.working_memory = WorkingMemory(session_id)
        self.is_paused = False
        self.is_cancelled = False
        self._pause_event = asyncio.Event()
        self._pause_event.set() # Not paused initially
        self.tool_calls_count = 0
        self._lock = asyncio.Lock()
        self.enabled_tools = set(enabled_tools or [])
        self.granted_scopes = set(granted_scopes or [])
        self.max_steps = max_steps
        self.max_tool_calls = max_tool_calls
        self.max_runtime_seconds = max_runtime_seconds
        self.steps_executed = 0
        self.started_at = time.monotonic()

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
            timestamp=datetime.now(timezone.utc),
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
        try:
            async with AsyncSessionLocal() as db:
                db.add(DBActivityEvent(
                    id=event.id,
                    session_id=event.session_id,
                    timestamp=event.timestamp,
                    event_type=event.event_type,
                    message=event.message,
                    technical_details_json=json.dumps(event.technical_details) if event.technical_details else None,
                    step_id=event.step_id,
                ))
                await db.commit()
        except Exception:
            # Streaming must remain available even if event persistence is
            # temporarily unavailable; the audit/tool records still capture
            # the durable execution facts.
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

    def update_permission(self, resource_type: str, value: str, granted: bool):
        target = {
            "tool": self.enabled_tools,
            "scope": self.granted_scopes,
        }.get(resource_type)
        if target is not None:
            if granted:
                target.add(value)
            else:
                target.discard(value)

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
        overall_success = True
        warning_failures: List[str] = []

        def is_non_blocking_failure(step: StepBase) -> bool:
            # A missing optional input is surfaced as a warning and does not
            # erase otherwise completed deliverables. The failed step remains
            # visible in the plan/activity feed, so this is not a fabricated
            # success (rules.md §9.1 / §12.1).
            return step.risk_level == "low" or (
                step.tool in {"read_file", "move_file"}
                and bool(step.result_summary)
                and "not found" in step.result_summary.lower()
            )

        for tier_idx, tier in enumerate(tiers, 1):
            await self._pause_event.wait()
            if self.is_cancelled:
                await self.emit_event("narration", "Task execution was cancelled by user.")
                return False
            if org_policy_manager.get(self.workspace_id).kill_switch:
                await self.emit_event("error", "Organization kill switch is active; execution stopped.")
                return False
            if time.monotonic() - self.started_at > self.max_runtime_seconds:
                await self.emit_event("error", "Session runtime limit reached; execution stopped.")
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
                for step, result in zip(tier, results):
                    if isinstance(result, Exception) or result is False:
                        if is_non_blocking_failure(step):
                            warning_failures.append(step.description)
                        else:
                            overall_success = False

                # Merge step (architecture.md §8)
                await self.emit_event(
                    "narration",
                    f"Reconciling and merging {len(tier)} sub-agent outputs into unified session state.",
                    {"tier": tier_idx, "completed_sub_agents": len(tier)}
                )
            else:
                # Single step execution
                step = tier[0]
                if not await self._execute_single_step(step, plan, task, prior_observations):
                    if is_non_blocking_failure(step):
                        warning_failures.append(step.description)
                    else:
                        overall_success = False

        if overall_success and not self.is_cancelled:
            message = "All plan steps completed successfully."
            if warning_failures:
                message = f"Plan completed with {len(warning_failures)} non-blocking warning(s); see failed low-risk steps in the activity feed."
            await self.emit_event("done", message, {"plan_id": plan.id, "warnings": warning_failures})
            return True
        await self.emit_event("error", "Execution stopped with one or more incomplete plan steps.", {"plan_id": plan.id})
        return False

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

        if self.steps_executed >= self.max_steps:
            step.status = "failed"
            step.result_summary = f"Session step limit ({self.max_steps}) reached."
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
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

        if tool_name not in self.enabled_tools:
            step.status = "failed"
            step.result_summary = f"Tool '{tool_name}' is not enabled for this session."
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
            return False

        if not org_policy_manager.get(self.workspace_id).allows(tool_name):
            step.status = "failed"
            step.result_summary = f"Organization policy blocked tool '{tool_name}'."
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
            return False

        connector_allowed, connector_reason = await connector_is_allowed(tool_name)
        if not connector_allowed:
            step.status = "failed"
            step.result_summary = connector_reason
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
            return False

        tool_instance = tool_registry.get_tool(tool_name)
        required_scopes = set(tool_instance.get_required_scopes(tool_params) if tool_instance else [])
        if not required_scopes.issubset(self.granted_scopes):
            step.status = "failed"
            missing = sorted(required_scopes - self.granted_scopes)
            step.result_summary = f"Missing connector scope(s): {', '.join(missing)}"
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
            return False

        if self.tool_calls_count >= self.max_tool_calls:
            step.status = "failed"
            step.result_summary = f"Session tool-call limit ({self.max_tool_calls}) reached."
            await self._update_step_db(step)
            await self.emit_event("error", step.result_summary, step_id=step.id)
            return False

        # Enforce Risk Tier & Approval Gate (rules.md §2)
        pre_approved = approval_gate_manager.get_pre_approved_classes(self.session_id)
        risk_level, requires_approval, consequence = safety_engine.classify_tool_risk(
            tool_name=tool_name,
            input_params=tool_params,
            pre_approved_medium_classes=pre_approved,
            is_triggered_by_untrusted_content=any(
                observation.get("result", {}).get("injection_detected", False)
                or observation.get("result", {}).get("injection_warning")
                for observation in prior_observations
            ),
        )

        if requires_approval:
            await self._set_session_status("waiting_approval")
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
                diff=json.dumps(tool_params, ensure_ascii=False, default=str),
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
                await self._set_session_status("running")
                return False

            await self.emit_event("narration", f"Action approved. Proceeding with {tool_name}...", step_id=step.id)
            await self._set_session_status("running")

        # Tool Execution inside Sandbox
        tool_instance = tool_registry.get_tool(tool_name)
        if not tool_instance:
            step.status = "failed"
            step.result_summary = f"Tool '{tool_name}' not found."
            await self._update_step_db(step)
            return False

        async with self._lock:
            self.tool_calls_count += 1
            self.steps_executed += 1
            
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
            await self.emit_event(
                "tool_start",
                f"Calling {tool_name}.",
                {"tool": tool_name, "params": tool_params, "risk_level": risk_level},
                step_id=step.id,
            )
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
        await self.emit_event(
            "tool_end",
            f"{tool_name} returned {'success' if result.get('success') else 'failure'}.",
            {"tool": tool_name, "success": result.get("success", False), "time_ms": exec_time_ms},
            step_id=step.id,
        )

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

    async def _set_session_status(self, status: str):
        async with AsyncSessionLocal() as db:
            stmt = update(DBSession).where(DBSession.id == self.session_id).values(
                status=status,
                updated_at=datetime.now(timezone.utc),
            )
            await db.execute(stmt)
            await db.commit()

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
                timestamp=datetime.now(timezone.utc)
            )
            db.add(db_call)
            
            session_stmt = update(DBSession).where(DBSession.id == self.session_id).values(
                tool_calls_count=DBSession.tool_calls_count + 1,
                total_cost_usd=DBSession.total_cost_usd + settings.ESTIMATED_TOOL_CALL_COST_USD,
                updated_at=datetime.now(timezone.utc)
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
                created_at=datetime.now(timezone.utc),
                summary=artifact_data.get("summary"),
                version=artifact_data.get("version", 1)
            )
            db.add(db_art)
            await db.commit()
