"""Run the repository prompt-injection corpus against the policy engine."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.safety import safety_engine
from app.tools.web_fetch import is_domain_granted
from app.core.identity import issue_access_token, parse_access_token
from app.config import settings


def main() -> int:
    corpus = json.loads((Path(__file__).resolve().parents[1] / "backend" / "evals" / "red_team_corpus.json").read_text(encoding="utf-8"))
    failures = []
    original_identity_secret = settings.IDENTITY_SECRET
    for case in corpus:
        kind = case.get("kind", "injection")
        passed = True
        if kind == "injection":
            detected, warning = safety_engine.detect_prompt_injection(case["text"])
            passed = detected == case["expected_detected"] and (not detected or bool(warning))
        elif kind == "domain":
            passed = is_domain_granted(case["hostname"], case["allowed_domains"]) == case["expected_allowed"]
        elif kind == "risk":
            risk, requires_approval, _ = safety_engine.classify_tool_risk(
                case["tool"], {}, pre_approved_medium_classes={"all_medium", case["tool"]}
            )
            passed = risk == "high" and requires_approval == case["expected_approval"]
        elif kind == "identity":
            try:
                settings.IDENTITY_SECRET = "red-team-secret"
                token = issue_access_token("attacker", "org-a", ["workspace-a"])
                pieces = token.split(".")
                pieces[1] = pieces[1][::-1]
                parse_access_token(".".join(pieces))
                passed = False
            except ValueError:
                passed = case["expected_rejected"]
            finally:
                settings.IDENTITY_SECRET = original_identity_secret
        if not passed:
            failures.append(case["id"])
    print(json.dumps({"cases": len(corpus), "passed": len(corpus) - len(failures), "failed": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
