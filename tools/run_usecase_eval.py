"""Evaluate planner coverage against the documented use-case benchmark."""
import json
import sys
import asyncio
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.llm import get_llm_client


async def main() -> int:
    root = Path(__file__).resolve().parents[1]
    cases = json.loads((root / "backend" / "evals" / "usecase_benchmarks.json").read_text(encoding="utf-8"))
    provider = get_llm_client()
    results = []
    for case in cases:
        plan = await provider.generate_plan(case["task"])
        planned = {step.get("tool") for step in (plan or {}).get("steps", [])}
        missing = sorted(set(case.get("required_tools", [])) - planned)
        high_risk_steps = [step.get("tool") for step in (plan or {}).get("steps", []) if step.get("risk_level") == "high"]
        approval_missing = case.get("requires_high_risk_approval", False) and not high_risk_steps
        results.append({"id": case["id"], "planned_tools": sorted(planned), "missing_tools": missing, "high_risk_steps": high_risk_steps, "approval_missing": approval_missing, "pass": not missing and not approval_missing})
    failed = [item["id"] for item in results if not item["pass"]]
    print(json.dumps({"cases": len(results), "passed": len(results) - len(failed), "failed": failed, "results": results}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
