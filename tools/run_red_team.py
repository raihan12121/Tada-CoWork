"""Run the repository prompt-injection corpus against the policy engine."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.safety import safety_engine


def main() -> int:
    corpus = json.loads((Path(__file__).resolve().parents[1] / "backend" / "evals" / "red_team_corpus.json").read_text(encoding="utf-8"))
    failures = []
    for case in corpus:
        detected, warning = safety_engine.detect_prompt_injection(case["text"])
        if detected != case["expected_detected"] or (detected and not warning):
            failures.append(case["id"])
    print(json.dumps({"cases": len(corpus), "passed": len(corpus) - len(failures), "failed": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
