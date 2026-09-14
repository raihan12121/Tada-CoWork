# Coagent Phase Implementation Status

Updated 2026-09-14 after the phase-by-phase implementation pass.

This document distinguishes code that is implemented and verified in this repository from deployment controls that require external infrastructure, credentials, or security validation. A feature is not marked complete merely because a UI label or endpoint exists.

## Verification baseline

- Backend: `51 passed` with `backend/tests`.
- Frontend: `npm run build` passes (`tsc -b` + Vite production build).
- Python compile check: `python -m compileall -q backend/app` passes.
- Existing user changes were preserved; no reset/checkout operation was used.

## Phase 0 — Foundations

Status: Implemented for the local orchestrator loop.

Implemented:

- Session create/list/get, lifecycle controls, WebSocket activity stream, and durable activity-event replay.
- Structured planner and executor loop with plan persistence.
- Sandboxed Python execution with payload, timeout, output, and session quotas.
- Artifact registration, preview, download, versioned overwrite snapshots.
- Hash-chained append-only audit log and DB tool-call records.

Verified by the Phase 0 tests and the full regression suite.

## Phase 1 — Sandbox & Safety Core

Status: Implemented in code; production isolation validation remains required.

Implemented:

- Optional Docker execution backend with no-network default, CPU/memory/PID ceilings, dropped capabilities, and `no-new-privileges`.
- Local backend is explicitly a development fallback.
- Risk classification, approval blocking, persisted approvals, takeover metadata, and approval recovery after process restart.
- Server-enforced step, tool-call, runtime, and estimated-cost ceilings.
- Prompt-injection detection, untrusted-content wrapping, and high-risk elevation for content-triggered actions.
- Pause/resume/cancel and live permission revocation.
- Organization kill switch and optional bearer-token API protection.

Remaining external exit criteria:

- Firecracker/managed microVM deployment or an equivalent independently validated isolation service.
- Pen-test/red-team evidence and production secrets management.

## Phase 2 — File & Document Tools

Status: Implemented for supported local formats.

Implemented:

- Scoped read/write/create/list/move/delete tools.
- Reversible delete via session trash.
- Versioned overwrite snapshots.
- Markdown, CSV, XLSX, DOCX, PPTX, and PDF generation.
- Artifact panel and downloadable durable artifact archive after ephemeral sandbox cleanup.

## Phase 3 — Local Bridge

Status: Implemented local bridge protocol; packaging and deployment hardening remain.

Implemented:

- Authenticated bridge registration/heartbeat/status.
- Session-scoped folder grants, revocation, path traversal rejection, offline failure, and audit records.
- Browser-automation tool schema and bridge request endpoint with explicit takeover/offline behavior.
- Optional authenticated HTTP bridge transport for scoped file requests and persistent browser sessions; Playwright actions are real when Playwright is installed.
- Bridge registration, heartbeat, stale-connection detection, per-session browser grants, and UI controls.

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

- A durable MCP server registry and automated/manual review pipeline for third-party package installation at deployment scale.
- Token vault/KMS integration and per-domain egress enforcement in the sandbox fleet.

## Phase 5 — Memory

Status: Implemented for local workspace-scoped memory; production vector-service and identity hardening remain.

Implemented:

- Resumable task state, plan history, artifacts, approvals, and activity replay.
- Opt-in long-term memory, relevance retrieval, last-used tracking, edit/delete/toggle UI, and JSON export.
- Workspace isolation in storage and retrieval.
- Stable deterministic embeddings across process restarts and persisted workspace memory opt-in state.

Remaining:

- Postgres/pgvector or Qdrant-backed embeddings for production semantic recall.
- OIDC identity-to-workspace authorization and cross-organization access tests.

## Phase 6 — Parallelism & Scheduling

Status: Implemented for the local orchestrator with restart recovery.

Implemented:

- Dependency-normalized DAG tiering and concurrent independent-step execution.
- Visible fan-out/merge activity events with failure warnings.
- Standard five-field cron parsing and a background scheduler that re-plans each run.
- Per-session tool-call count and estimated cost usage API/UI.
- Always-gated communication steps remain gated on scheduled runs.
- Restart recovery marks interrupted sessions paused instead of silently replaying external actions; retention sweeps run in the scheduler.

Remaining:

- Durable workflow execution/queueing (Temporal/Redis/Kafka equivalent) for multi-instance recovery.
- Org-wide usage aggregation and billing-grade token/compute metering.

## Phase 7 — Enterprise & Marketplace

Status: Implemented local admin foundation; enterprise identity and deployment controls remain.

Implemented:

- Admin-authenticated audit export/integrity verification and emergency kill switch.
- Organization policy API for connector allow/block lists, retention days, data region label, and kill switch.
- Policy enforcement in executor/MCP paths.
- Usage summary, retention cleanup endpoint, and connector review/version/scope records.
- Optional API bearer-token middleware.
- Admin UI exposes policy, usage, connector blocking, and kill-switch controls.

Remaining:

- Full OIDC/OAuth2 login, role/organization membership model, and tenant-aware authorization on every resource endpoint.
- Enforced data residency routing and a production retention worker.
- Marketplace submission, package scanning, signature verification, and update scope-change re-approval.

## Phase 8 — Hardening & GA

Status: Not complete; implementation scaffolding exists but exit evidence is external.

Implemented:

- Regression/security tests for path traversal, SSRF, authorization, approval gates, memory APIs, and tool behavior.
- Runnable red-team corpus evaluator, ten-use-case planner benchmark, and concurrent session load probe under `tools/`.
- Explicit configuration for production provider selection, Docker sandboxing, limits, delivery mode, SMTP, and API authentication.

Required before GA:

- Load tests at target concurrency and sandbox cold-start measurements.
- Red-team corpus for prompt injection, scope escalation, malicious connectors, and adversarial files/web pages.
- Human-evaluation benchmark suite mapped to `usecases.md` and PRD success metrics.
- External security review, production deployment topology, onboarding, pricing, and retention/residency sign-off.

## Overall conclusion

The repository now contains a substantially implemented local MVP through the core of Phase 7, with the safety-critical paths wired into the executor instead of being UI-only. It is not honest to label all nine phases GA-complete: Phase 3 browser transport, production-grade identity/vault/workflow infrastructure, and Phase 8 validation still require external systems and evidence.
