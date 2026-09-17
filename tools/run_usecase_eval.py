"""Evaluate planner coverage against the documented use-case benchmark."""
import json
import sys
import asyncio
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.llm import get_llm_client
from app.tools.registry import tool_registry
from app.core.safety import safety_engine


async def main() -> int:
    root = Path(__file__).resolve().parents[1]
    cases = json.loads((root / "backend" / "evals" / "usecase_benchmarks.json").read_text(encoding="utf-8"))
    provider = get_llm_client()
    known_tools = set(tool_registry.list_tools())
    results = []
    for case in cases:
        memory_context = "- PREFERENCE: use the user's remembered report formatting defaults." if case.get("uses_long_term_memory") else ""
        plan = await provider.generate_plan(case["task"], memory_context)
        planned = {step.get("tool") for step in (plan or {}).get("steps", [])}
        missing = sorted(set(case.get("required_tools", [])) - planned)
        unknown_tools = sorted(planned - known_tools)
        steps = (plan or {}).get("steps", [])
        step_ids = [step.get("id") or f"step-{index}" for index, step in enumerate(steps, 1)]
        dependency_errors_set = set()
        for index, step in enumerate(steps, 1):
            self_id = step.get("id") or f"step-{index}"
            for dependency in step.get("dependencies", []):
                if dependency not in step_ids or dependency == self_id:
                    dependency_errors_set.add(dependency)
        dependency_errors = sorted(dependency_errors_set)
        policy_risk_mismatches = []
        for step in steps:
            policy_risk, policy_requires_approval, _ = safety_engine.classify_tool_risk(
                step.get("tool", ""), {}, pre_approved_medium_classes=set()
            )
            if policy_requires_approval and policy_risk == "high" and step.get("risk_level") != "high":
                policy_risk_mismatches.append(step.get("tool"))
        high_risk_steps = [step.get("tool") for step in (plan or {}).get("steps", []) if step.get("risk_level") == "high"]
        approval_missing = case.get("requires_high_risk_approval", False) and not high_risk_steps
        artifact_types = set()
        for step in (plan or {}).get("steps", []):
            if step.get("tool") == "create_document":
                reasoned = await provider.reason_step(case["task"], type("Step", (), {
                    "tool": "create_document", "description": step.get("description", ""),
                    "model_dump": lambda self: step,
                })(), [], sorted(planned))
                document_type = (reasoned.get("params") or {}).get("document_type")
                if document_type:
                    artifact_types.add(document_type)
        missing_artifacts = sorted(set(case.get("required_artifact_types", [])) - artifact_types)
        fanout = [step for step in steps if not step.get("dependencies")]
        parallel_missing = case.get("requires_parallel", False) and len(fanout) < 2
        merge_missing = case.get("requires_parallel", False) and not any(
            "merge" in str(step.get("description", "")).lower() or "reconcil" in str(step.get("description", "")).lower()
            for step in steps
        )
        memory_used = not case.get("uses_long_term_memory") or "recalled workspace context" in plan.get("explanation", "")
        passed = not (
            missing or unknown_tools or dependency_errors or policy_risk_mismatches
            or missing_artifacts or approval_missing or parallel_missing or merge_missing
            or not memory_used
        )
        results.append({
            "id": case["id"], "planned_tools": sorted(planned), "missing_tools": missing,
            "unknown_tools": unknown_tools, "dependency_errors": dependency_errors,
            "policy_risk_mismatches": policy_risk_mismatches,
            "missing_artifact_types": missing_artifacts, "high_risk_steps": high_risk_steps,
            "approval_missing": approval_missing, "parallel_missing": parallel_missing,
            "merge_missing": merge_missing, "memory_used": memory_used, "pass": passed,
        })
    failed = [item["id"] for item in results if not item["pass"]]
    print(json.dumps({"cases": len(results), "passed": len(results) - len(failed), "failed": failed, "results": results}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
