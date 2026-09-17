"""Run the locally measurable portion of the PRD Phase 8 readiness gate.

This probe deliberately reports external-only metrics as ``unknown`` rather
than treating planner checks or local timing as proof of GA readiness.
"""

import asyncio
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app


async def measure_time_to_first_plan(sample_count: int = 5) -> dict:
    latencies = []
    failures = []
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ga-probe") as client:
        for index in range(sample_count):
            started = time.perf_counter()
            response = await client.post(
                "/v1/sessions",
                json={"task": f"GA readiness plan sample {index}: create a short markdown report"},
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            if response.status_code == 200 and response.json().get("plan"):
                latencies.append(elapsed_ms)
            else:
                failures.append({"status": response.status_code, "detail": response.text[:300]})
    ordered = sorted(latencies)
    # With fewer than 20 observations, use the maximum as a conservative
    # empirical p95 rather than understating the tail with a lower index.
    p95 = ordered[-1] if ordered else None
    return {
        "samples": sample_count,
        "successful_samples": len(latencies),
        "failures": failures,
        "mean_ms": round(statistics.mean(latencies), 2) if latencies else None,
        "p95_ms": p95,
        "target_ms": 10000,
        "status": "pass" if len(latencies) == sample_count and p95 < 10000 else "fail",
    }


def run_json_probe(script: str) -> dict:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / script)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        payload = {"status": "fail", "returncode": result.returncode, "stdout": result.stdout[-1000:], "stderr": result.stderr[-1000:]}
    if result.returncode != 0:
        payload["status"] = "fail"
    else:
        payload["status"] = "pass"
    return payload


async def main() -> int:
    timing = await measure_time_to_first_plan()
    red_team = run_json_probe("run_red_team.py")
    usecases = run_json_probe("run_usecase_eval.py")
    report = {
        "metrics": {
            "time_to_first_plan": timing,
            "safety_red_team": red_team,
            "planner_usecase_benchmark": usecases,
            "task_completion_rate_without_human_correction": {
                "status": "unknown",
                "reason": "Requires scored human or production task outcomes, not planner-shape checks.",
                "target": ">= 0.80",
            },
            "approval_gate_precision": {
                "status": "unknown",
                "reason": "Requires labeled action decisions and false-positive measurement.",
            },
            "session_to_session_task_reuse": {
                "status": "unknown",
                "reason": "Requires paired longitudinal task evaluation.",
            },
            "external_security_review": {
                "status": "required",
                "reason": "Cannot be established by repository-local tests.",
            },
        },
        "ga_decision": "not_ready_without_external_evidence",
    }
    print(json.dumps(report, indent=2))
    return 0 if timing["status"] == "pass" and red_team.get("status") == "pass" and usecases.get("status") == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
