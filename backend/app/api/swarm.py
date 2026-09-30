import asyncio
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from app.models.schemas import (
    SwarmRunRequest,
    SwarmRunResponse,
    SwarmSubtask,
    SessionCreate
)
from app.engine.session_manager import session_manager
from app.core.identity import Principal, require_workspace_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/swarm", tags=["swarm"])

def _principal(request: Request) -> Principal:
    return getattr(request.state, "principal", Principal("anonymous", "default", frozenset({"*"}), frozenset({"local_dev"})))

@router.post("/run", response_model=SwarmRunResponse)
async def run_swarm(request: Request, payload: SwarmRunRequest):
    principal = _principal(request)
    try:
        require_workspace_access(principal, payload.workspace_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Workspace access denied") from exc

    # 1. Create master orchestrator session
    master_create = SessionCreate(
        task=f"[Swarm Orchestration] {payload.goal}",
        workspace_id=payload.workspace_id,
        provider_account_id=payload.provider_account_id,
        allow_provider_failover=payload.allow_provider_failover
    )
    master_session = await session_manager.create_session(master_create)

    # 2. Determine subtasks: either provided or decomposed
    subtasks = payload.subtasks
    if not subtasks:
        subtasks = [
            SwarmSubtask(
                name="Research & Context Discovery",
                subtask_description=f"Gather foundational information, data sources, and constraints for: {payload.goal}"
            ),
            SwarmSubtask(
                name="Execution & Drafting",
                subtask_description=f"Execute core computational, analysis, or document tasks for: {payload.goal}"
            )
        ]

    # 3. Spawn and execute worker sub-agents in parallel
    async def _execute_worker(sub: SwarmSubtask) -> dict:
        try:
            worker_create = SessionCreate(
                task=f"[{sub.name}] {sub.subtask_description}",
                workspace_id=payload.workspace_id,
                parent_session_id=master_session.id,
                provider_account_id=payload.provider_account_id,
                allow_provider_failover=payload.allow_provider_failover,
                enabled_tools=sub.tools_allowed or []
            )
            child = await session_manager.create_session(worker_create)
            await session_manager.start_session(child.id)

            # Wait for completion (up to 45 seconds)
            for _ in range(45):
                await asyncio.sleep(1.0)
                current = await session_manager.get_session(child.id)
                if not current or current.status in ("completed", "failed", "cancelled", "waiting_approval"):
                    break

            final_child = await session_manager.get_session(child.id)
            if not final_child:
                return {"id": child.id, "name": sub.name, "status": "lost", "summary": "Worker session lost", "artifacts": []}

            summaries = []
            if final_child.plan:
                for st in final_child.plan.steps:
                    if st.result_summary:
                        summaries.append(f"{st.description}: {st.result_summary}")
                    elif st.status == "completed":
                        summaries.append(f"{st.description}: Completed")

            return {
                "id": final_child.id,
                "name": sub.name,
                "status": final_child.status,
                "summary": "; ".join(summaries) or f"Finished with status {final_child.status}",
                "artifacts": [a.name for a in final_child.artifacts]
            }
        except Exception as exc:
            logger.error("Swarm worker %s failed: %s", sub.name, exc)
            return {"id": "error", "name": sub.name, "status": "failed", "summary": str(exc), "artifacts": []}

    worker_results = await asyncio.gather(*[_execute_worker(sub) for sub in subtasks])

    worker_session_ids = [w["id"] for w in worker_results if w["id"] != "error"]
    all_artifacts = []
    for w in worker_results:
        all_artifacts.extend(w.get("artifacts", []))

    # 4. Synthesize results
    synthesis_lines = [
        f"### Swarm Execution Synthesis: {payload.goal}",
        f"Deployed {len(worker_results)} parallel worker agents under master session {master_session.id}:\n"
    ]
    for w in worker_results:
        synthesis_lines.append(f"- **Agent '{w['name']}'** [{w['status']}]: {w['summary']}")

    if all_artifacts:
        synthesis_lines.append(f"\n**Artifacts Created**: {', '.join(all_artifacts)}")

    synthesis_text = "\n".join(synthesis_lines)

    return SwarmRunResponse(
        master_session_id=master_session.id,
        goal=payload.goal,
        worker_session_ids=worker_session_ids,
        status="completed",
        synthesis=synthesis_text,
        artifacts_created=all_artifacts
    )
