import asyncio
import logging
from typing import Dict, Any, List, Optional
from app.tools.base import BaseTool
from app.models.schemas import SessionCreate

logger = logging.getLogger(__name__)

class DelegateSubtaskTool(BaseTool):
    """Delegate work to an autonomous worker bot in a multi-agent swarm."""
    name: str = "delegate_subtask"
    description: str = "Delegate a subtask or specialized research step to an autonomous worker sub-agent. The worker bot executes in its own isolated sandbox environment and returns results and artifacts."
    risk_level: str = "low"
    required_scopes: List[str] = ["swarm_execution"]

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "subtask_description": {
                    "type": "string",
                    "description": "Clear and detailed goal or instructions for the worker agent."
                },
                "context": {
                    "type": "string",
                    "description": "Relevant context, data, or files from previous steps needed by the worker."
                },
                "tools_allowed": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of specific tools the worker agent may invoke."
                }
            },
            "required": ["subtask_description"]
        }

    async def execute(
        self,
        session_id: str,
        subtask_description: str,
        context: Optional[str] = None,
        tools_allowed: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        from app.engine.session_manager import session_manager
        
        parent = await session_manager.get_session(session_id)
        if not parent:
            return {"success": False, "error": f"Parent session {session_id} not found"}

        # Combine context into task if provided
        effective_task = subtask_description
        if context:
            effective_task = f"{subtask_description}\n\nContext:\n{context}"

        try:
            # Create child session linked to parent
            child_create = SessionCreate(
                task=effective_task,
                workspace_id=parent.workspace_id,
                parent_session_id=session_id,
                provider_account_id=parent.provider_account_id,
                allow_provider_failover=parent.allow_provider_failover,
                enabled_tools=tools_allowed or parent.enabled_tools,
                granted_folders=parent.granted_folders,
                granted_scopes=parent.granted_scopes,
                granted_domains=parent.granted_domains
            )
            worker_session = await session_manager.create_session(child_create)

            # Start worker execution
            await session_manager.start_session(worker_session.id)

            # Wait for worker completion with a reasonable deadline (e.g. 45 seconds for sub-task)
            deadline = 45
            elapsed = 0
            while elapsed < deadline:
                await asyncio.sleep(1.0)
                elapsed += 1
                current_worker = await session_manager.get_session(worker_session.id)
                if not current_worker:
                    break
                if current_worker.status in ("completed", "failed", "cancelled", "waiting_approval"):
                    break

            final_worker = await session_manager.get_session(worker_session.id)
            if not final_worker:
                return {"success": False, "error": "Worker session lost"}

            # Summarize output from worker steps
            step_summaries = []
            if final_worker.plan:
                for step in final_worker.plan.steps:
                    if step.result_summary:
                        step_summaries.append(f"- {step.description}: {step.result_summary}")
                    elif step.status == "completed":
                        step_summaries.append(f"- {step.description}: Completed successfully")

            summary_text = "\n".join(step_summaries) if step_summaries else f"Worker finished with status {final_worker.status}"
            artifacts_list = [a.name for a in final_worker.artifacts]

            return {
                "success": final_worker.status == "completed",
                "worker_session_id": final_worker.id,
                "status": final_worker.status,
                "summary": summary_text,
                "artifacts_created": artifacts_list
            }
        except Exception as exc:
            logger.error("Failed to execute swarm subtask: %s", exc)
            return {"success": False, "error": f"Failed to execute subtask: {str(exc)}"}
