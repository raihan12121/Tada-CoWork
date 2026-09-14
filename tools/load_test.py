"""Small reproducible load probe for the session-create endpoint.

This is intentionally a client-side probe rather than a fake benchmark. Run
it against a deployed orchestrator and archive the JSON output with the target
concurrency, sandbox backend, and commit SHA.
"""
import argparse
import asyncio
import json
import time
from statistics import mean, quantiles

import httpx


async def run_one(client: httpx.AsyncClient, base_url: str, index: int) -> dict:
    started = time.perf_counter()
    try:
        response = await client.post(f"{base_url.rstrip('/')}/v1/sessions", json={"task": f"Load probe task {index}: create a short markdown report"})
        return {"status": response.status_code, "latency_ms": round((time.perf_counter() - started) * 1000, 2)}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "latency_ms": round((time.perf_counter() - started) * 1000, 2)}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()
    async with httpx.AsyncClient(timeout=60.0) as client:
        results = await asyncio.gather(*(run_one(client, args.base_url, i) for i in range(args.concurrency)))
    latencies = sorted(item["latency_ms"] for item in results)
    p95 = quantiles(latencies, n=20)[18] if len(latencies) >= 2 else (latencies[0] if latencies else None)
    print(json.dumps({"base_url": args.base_url, "concurrency": args.concurrency, "successes": sum(item["status"] == 200 for item in results), "errors": [item for item in results if item["status"] != 200], "mean_latency_ms": round(mean(latencies), 2) if latencies else None, "p95_latency_ms": round(p95, 2) if p95 is not None else None}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
