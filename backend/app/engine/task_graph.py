import asyncio
from typing import List, Dict, Set, Any
from app.models.schemas import StepBase

class TaskGraphEngine:
    """
    Analyzes task step dependencies and organizes steps into concurrent execution tiers (DAG waves).
    Identifies independent branches for parallel sub-agent workstreams (Phase 6).
    """
    def compute_execution_tiers(self, steps: List[StepBase]) -> List[List[StepBase]]:
        """
        Organizes steps into tiers where each tier contains steps whose dependencies
        are satisfied by previous tiers. Steps within the same tier can run concurrently.
        """
        completed_ids: Set[str] = set()
        remaining_steps = list(steps)
        tiers: List[List[StepBase]] = []

        while remaining_steps:
            current_tier: List[StepBase] = []
            for step in list(remaining_steps):
                # Check if all dependencies of this step are in completed_ids
                deps = set(step.dependencies)
                if deps.issubset(completed_ids):
                    current_tier.append(step)
                    remaining_steps.remove(step)

            if not current_tier:
                # Cycle or unresolved dependency detected: fallback to sequential execution
                tiers.append(remaining_steps)
                break

            for step in current_tier:
                completed_ids.add(step.id)

            tiers.append(current_tier)

        return tiers

    def is_parallel_tier(self, tier: List[StepBase]) -> bool:
        """Returns True if the tier has more than 1 independent step that can fan out."""
        return len(tier) > 1

task_graph_engine = TaskGraphEngine()
