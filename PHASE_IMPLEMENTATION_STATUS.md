# Coagent Phase Implementation Status

Updated 2026-09-17 after the phase-by-phase implementation and verification pass.

This document distinguishes code that is implemented and verified in this repository from deployment controls that require external infrastructure, credentials, or security validation. A feature is not marked complete merely because a UI label or endpoint exists.

## Verification baseline

- Backend: `79 passed` with `backend/tests`.
- Frontend: `npm run build` passes (`tsc -b` + Vite production build).
- Python compile check: `python -m compileall -q backend/app bridge tools` passes.
- Red-team corpus: `12/12` cases pass (`tools/run_red_team.py`), covering injection, scope boundaries, approval bypass, and identity tampering.
- Use-case planner benchmark: `10/10` cases pass (`tools/run_usecase_eval.py`).
- GA readiness probe: local time-to-first-plan `5/5` passed; mean `367.79 ms`, conservative small-sample p95 `462.64 ms` against the `<10 s` PRD target (`tools/run_ga_readiness.py`).
- Live HTTP load probe: `10/10` session-create requests succeeded at concurrency 10; mean `534.14 ms`, p95 `660.82 ms` on the local development server.
- Live bridge smoke test: registered an agent with a session token, read a granted file successfully, and received a visible rejection for `..` traversal.
- Graph refresh: `1,012` nodes, `1,919` edges, `60` communities in `graphify-out/`.
- Existing user changes were preserved; no reset/checkout operation was used.

## Phase 0 — Foundations

Status: Implemented for the local orchestrator loop.

Implemented:

- Session create/list/get, lifecycle controls, WebSocket activity stream, and durable activity-event replay.
- Structured planner and executor loop with plan persistence.
- Sandboxed Python execution with payload, timeout, output, and session quotas.
- Artifact registration, preview, download, versioned overwrite snapshots.
- Desktop AI provider setup for OpenAI, Anthropic, Gemini, Ollama, and LM Studio with connection testing and explicit offline-preview labeling.
- Multi-account AI provider infrastructure: account metadata in SQLite, per-account Windows DPAPI secrets, account selection/testing/removal APIs, and account-management UI. This currently covers API-key and local accounts; provider subscription OAuth remains adapter-specific and disabled until approved credentials/flows are configured.
- OpenAI/Codex subscription route: Coagent can invoke the user-authenticated official `codex exec` CLI in read-only, non-interactive, ephemeral mode. Coagent never reads Codex credentials; the CLI owns ChatGPT login, quota, refresh, and provider policy.
- Claude subscription route: Coagent can invoke the user-authenticated official `claude -p` CLI in one-turn plan mode with JSON output. Coagent never reads Claude credentials; Claude Code owns subscription authentication, quota, refresh, and provider policy.
- Gemini/API health route: Gemini API-key calls classify authentication failures and HTTP 429 quota/rate-limit responses, and saved accounts expose the resulting health state. Google-account Gemini CLI OAuth is not implemented because Google prohibits third-party OAuth piggybacking.
- Task-level routing: sessions persist an optional provider-account ID, validate it against the workspace, use the selected account for planning and execution, reject accounts marked quota-exhausted, and expose account selection in the task composer.
- Hash-chained append-only audit log and DB tool-call records.

Verified by the Phase 0 tests and the full regression suite.

## Phase 1 — Sandbox & Safety Core

Status: Implemented in code; production isolation validation remains required.

Implemented:

- Optional Docker execution backend with no-network default, CPU/memory/PID ceilings, dropped capabilities, and `no-new-privileges`.
- Managed sandbox HTTP provider contract with authenticated execution requests and explicit server-enforced limit propagation; managed isolation remains deployment-owned.
- Local backend is explicitly a development fallback.
- Production startup and sandbox creation reject the local backend; the managed adapter remains an explicit deployment integration point.
- Risk classification, approval blocking, persisted approvals, takeover metadata, and approval recovery after process restart.
- Server-enforced step, tool-call, runtime, and estimated-cost ceilings.
- Server-enforced per-session disk ceiling for code, files, versions, and generated artifacts.
- Prompt-injection detection, untrusted-content wrapping, and high-risk elevation for content-triggered actions.
- Pause/resume/cancel and live permission revocation.
- Organization kill switch and optional bearer-token API protection.

Remaining external exit criteria:

- Firecracker/managed microVM deployment or an equivalent independently validated isolation service, including provider-side isolation and pen-test evidence.
- Pen-test/red-team evidence and production secrets management.

## Phase 2 — File & Document Tools

Status: Implemented for supported local formats.

Implemented:

- Scoped read/write/create/list/move/delete tools.
- Reversible delete via session trash.
- Versioned overwrite snapshots.
- Markdown, CSV, XLSX, DOCX, PPTX, and PDF generation.
- Authenticated session input uploads with simple-name validation, per-file size limits, duplicate protection, and sandbox disk-quota enforcement.
- Artifact panel and downloadable durable artifact archive after ephemeral sandbox cleanup.

Remaining:

- OCR/structured ingestion for receipt images and native binary previews; input files are currently available to execution as `inputs/<filename>` but are not automatically parsed into every use-case workflow.

## Phase 3 — Local Bridge

Status: Implemented local bridge protocol; packaging and deployment hardening remain.

Implemented:

- Authenticated bridge registration/heartbeat/status.
- Session-scoped folder grants, revocation, path traversal rejection, offline failure, and audit records.
- Session-scoped web-domain grants are persisted, revocable, enforced on fetches, and rechecked after redirects.
- Browser-automation tool schema and bridge request endpoint with explicit takeover/offline behavior.
- Optional authenticated HTTP bridge transport for scoped file requests and persistent browser sessions; Playwright actions are real when Playwright is installed.
- First-party bridge file tools (`bridge_list_files`, `bridge_read_file`, `bridge_move_file`) route explicit folder work through the agent; dynamic grant/revoke updates are forwarded to the companion.
- Bridge registration, heartbeat, stale-connection detection, per-session browser grants, and UI controls.
- The orchestrator does not fall back to reading host files directly; file access requires a registered bridge agent transport.

Remaining:

- TLS/session-token rotation and signed Electron/Tauri packaging.

The current browser path intentionally returns a visible failure when no browser controller is registered; it does not fabricate browser results.

## Phase 4 — Web Research & Connector Layer

Status: Implemented connector/tool layer with deployment credential requirements.

Implemented:

- Web search with live DuckDuckGo/Bing fallbacks, web fetch, SSRF protections, and injection tagging.
- MCP-style tool discovery and JSON-RPC calls with schema-required-field, tool allow-list, scope, org-policy, audit, and approval enforcement.
- Live Google Drive search/read/upload path, GitHub read APIs, Slack channel/read and post APIs, webhook SSRF validation.
- Gmail and Outlook/Microsoft Graph read/draft connectors.
- SMTP-backed email delivery when explicitly configured; preview mode prepares but does not send.
- Connector scopes and risk declarations.
- Admin connector review records and approved/pending/blocked review states.
- Action-specific least-privilege scope checks and enforcement of blocked/pending marketplace reviews.

Remaining:

- A durable MCP server registry and deployment-scale automated/manual package review pipeline; local staged package upload, digest verification, archive safety scanning, and production scan gating now exist.
- Token vault/KMS integration and per-domain egress enforcement in the sandbox fleet.

## Phase 5 — Memory

Status: Implemented for local workspace-scoped memory; production vector-service and identity-operations hardening remain.

Implemented:

- Resumable task state, plan history, artifacts, approvals, and activity replay.
- Opt-in long-term memory, relevance retrieval, last-used tracking, edit/delete/toggle UI, and JSON export.
- Workspace isolation in storage and retrieval.
- Stable deterministic embeddings across process restarts and persisted workspace memory opt-in state.

Remaining:

- Postgres/pgvector or Qdrant-backed embeddings for production semantic recall.
- OIDC provider lifecycle/rotation operations and independently operated cross-organization access testing.

## Phase 6 — Parallelism & Scheduling

Status: Implemented for the local orchestrator with restart recovery.

Implemented:

- Dependency-normalized DAG tiering and concurrent independent-step execution.
- Visible fan-out/merge activity events with failure warnings.
- Standard five-field cron parsing and a background scheduler that re-plans each run.
- Scheduled jobs persist tool, folder, scope, and web-domain grants into each fresh run.
- Per-session tool-call count and estimated cost usage API/UI.
- Always-gated communication steps remain gated on scheduled runs.
- Restart recovery marks interrupted sessions paused instead of silently replaying external actions; retention sweeps run in the scheduler.
- Database-backed execution jobs persist queued/running/completed state, worker leases, attempts, and restart requeue decisions.
- Repeated failures on a step are counted durably and emit `replan_required` with an explicit plan-revision proposal after the second failure.

Remaining:

- External durable workflow execution/queueing (Temporal/Redis/Kafka equivalent) and multi-instance worker deployment; the local database-backed lease queue is implemented.
- Org-wide usage aggregation and billing-grade token/compute metering.

## Phase 7 — Enterprise & Marketplace

Status: Implemented local admin foundation; enterprise identity and deployment controls remain.

Implemented:

- Admin-authenticated audit export/integrity verification and emergency kill switch.
- Organization policy API for connector allow/block lists, retention days, data region label, and kill switch.
- Policy enforcement in executor/MCP paths.
- Usage summary, retention cleanup endpoint, and connector review/version/scope records.
- Optional API bearer-token middleware.
- Signed principal verification with subject, organization, workspace claims, and admin-role enforcement across protected resource routes.
- Admin UI exposes policy, usage, connector blocking, and kill-switch controls.
- Production startup rejects incomplete provider, authentication, bridge-secret, and sandbox configuration.

Remaining:

- OIDC/OAuth2 token verification with cached RS256 JWKS, issuer/audience checks, and workspace/role mapping is implemented; provider lifecycle, key-rotation operations, and external identity-management ownership remain.
- Multi-region data routing and a production retention worker.
- Package manifest submission/validation, staged package acquisition, digest verification, archive safety scanning, signed-manifest verification, pending review, and update scope-change re-approval are implemented; production malware/dependency scanning and registry distribution remain.

## Phase 8 — Hardening & GA

Status: Not complete; implementation scaffolding exists but exit evidence is external.

Implemented:

- Regression/security tests for path traversal, SSRF, authorization, approval gates, memory APIs, and tool behavior.
- Runnable 12-case red-team corpus evaluator, ten-use-case planner benchmark, and concurrent session load probe under `tools/`.
- Reproducible GA-readiness report that separates locally measurable timing/safety/planner checks from human-scored completion, approval precision, longitudinal memory value, and external security evidence.
- Explicit configuration for production provider selection, Docker sandboxing, limits, delivery mode, SMTP, and API authentication.
- Production configuration guards, request trace IDs, full tool-output audit records, disk-limit regression tests, and marketplace scope-creep tests.
- Repeated-step-failure escalation tests enforce the rules.md §12.2 re-plan requirement.

Required before GA:

- Load tests at target concurrency and sandbox cold-start measurements.
- Red-team corpus for prompt injection, scope escalation, malicious connectors, and adversarial files/web pages.
- Human-evaluation benchmark suite mapped to `usecases.md` and PRD success metrics.
- External security review, production deployment topology, onboarding, pricing, and retention/residency sign-off.

## Overall conclusion

The repository now contains a substantially implemented local MVP through the core of Phase 7, with meaningful Phase 8 hardening evidence and production startup guards. It is not honest to label all nine phases GA-complete: production-grade identity/vault/workflow infrastructure, managed isolation, and Phase 8 external validation still require external systems and evidence.
