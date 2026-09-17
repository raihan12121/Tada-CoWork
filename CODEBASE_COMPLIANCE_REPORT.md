# Coagent Codebase Compliance Report

Review date: 2026-09-17
Scope: repository source, tests, frontend build, PRD/TRD/design/architecture/phases/rules/usecases/Memory documents.

## Executive verdict

The repository is a substantially implemented local MVP of the planned Coagent experience. Core workflow, safety, connector-policy, memory, scheduling, bridge, and admin paths are now wired into executable code and regression tests; production architecture and external-evidence requirements remain open.

Implemented convincingly: task intake and plan generation, configurable hosted/local AI providers, a FastAPI session lifecycle, a ReAct-shaped executor, WebSocket activity streaming, approval gates, reversible delete/version snapshots, document artifact generation, memory CRUD/recall, authenticated session-scoped bridge transport, audit hash chaining, connector scope/review policy, scheduling/recovery/retention, a desktop launcher, and a React UI covering the main planned surfaces.

Not production-complete: local subprocess execution remains the development backend (and is now rejected in production), several external connectors require deployment credentials, browser automation requires the separately installed bridge runtime, OIDC provider/key lifecycle and connector vault integration require deployment ownership, and durable multi-instance workflow, managed isolation, and external security evidence remain outstanding.

The correct status is therefore: **prototype scope substantially built; PRD feature intent partially represented; TRD/architecture/rules compliance incomplete, with sandbox and authorization gaps blocking production readiness.**

## Verification performed

- Backend test suite: **79 passed** (`.venv\Scripts\python.exe -m pytest backend/tests -q`).
- Frontend production build: **passed** (`npm run build`; TypeScript and Vite both completed).
- Python compile check: **passed** (`python -m compileall -q backend/app bridge tools`).
- Red-team corpus: **12/12 passed** (`tools/run_red_team.py`), including injection, domain-scope, approval-bypass, and identity-tamper cases.
- Use-case planner benchmark: **10/10 passed** (`tools/run_usecase_eval.py`).
- GA readiness probe: **5/5** local time-to-first-plan samples passed; mean **367.79 ms**, conservative small-sample p95 **462.64 ms** against the PRD `<10 s` target (`tools/run_ga_readiness.py`).
- Live HTTP load probe: **10/10 succeeded** at concurrency 10; mean **534.14 ms**, p95 **660.82 ms** on the local development server.
- Live bridge smoke test: **passed** session-token registration, granted-file read, and out-of-scope traversal rejection.
- Graph extraction: **1,012 nodes, 1,919 graph edges, 60 communities**; outputs are in `graphify-out/`.
- The graph shows the planning documents as a connected “Planning Documents” community and the implementation as distinct communities for sessions, executor, sandbox, safety, approvals, memory, bridge, tools, connectors, scheduling, and UI.

Passing tests demonstrate the current behavior, but several use-case tests validate only plan creation/status/artifact existence rather than real external effects. For example, UC-4 does not assert ten competitors, parallel fan-out, citations, or a research artifact; UC-7 constructs an approval object directly instead of exercising browser automation.

## Requirement traceability

Legend: **Built** = materially implemented and exercised; **Partial** = prototype or only one layer exists; **Missing** = not implemented or contradicts the requirement.

### PRD goals and key features

| Area | Status | Evidence / gap |
|---|---|---|
| Natural-language intake → structured plan | Partial | `backend/app/engine/planner.py:12`; offline planner is keyword-based in `backend/app/core/llm.py:72`, not a general planner. |
| Editable, transparent plan | Partial/Built locally | UI renders risk/dependencies, add/delete affordances, and step reordering; backend plan editing remains limited and full arbitrary step editing is not implemented. |
| Sandboxed execution | Partial for production | Local subprocess execution is development-only and rejected by production guards; Docker isolation, no-network defaults, CPU/memory/PID/time/output/tool-call/disk limits, and an authenticated managed-provider execution contract exist, but provider-owned microVM isolation and independent validation remain. |
| Local bridge | Built locally | Authenticated registration/heartbeat, session-scoped tokens, stale detection, grant/revoke forwarding, bridge file tools, strict remote-agent file transport, browser permission checks, and audit events are implemented; signed packaging remains. |
| File/document tools | Partial/Built locally | File operations and docx/xlsx/pptx/pdf/md/csv generation exist; authenticated session input uploads are quota/path safe, while OCR, native previews, and real folder reorganization are absent. |
| Web research | Partial/Built locally | `web_search`/`web_fetch` exist with SSRF checks, session domain grants, redirect revalidation, and injection tagging; there is no browser fallback for unavailable public HTTP sources. |
| MCP connector ecosystem | Partial/Built locally | JSON-RPC `tools/list` and `tools/call`, connector scope checks, organization policy, staged marketplace package upload, digest/archive safety scanning, signed-manifest verification, pending review, and scope-change re-approval are implemented; durable third-party registry, OAuth/token vault, malware/dependency scanning, and package distribution remain. |
| Approval gates | Built locally/partial production | Risk classification, blocking approval, concrete target/diff previews, takeover metadata, and durable approval state work; distributed approval durability and full external identity are incomplete. |
| Live visibility and controls | Partial | WebSocket feed and pause/resume/cancel UI are implemented in `frontend/src/App.tsx:46`; events are in-process and not replayable after reconnect/restart. |
| Memory | Partial/Built locally | Opt-in workspace-filtered SQLite memory has stable embeddings, retrieval, edit/delete/toggle/export, and transparent planner annotations; production vector/identity isolation remains. |
| Scheduling | Built locally/partial production | Five-field cron parsing, background execution, manual trigger, re-planning, last-run state, retention sweeps, and database-backed execution leases/requeue recovery are implemented; distributed workflow/event infrastructure remains. |
| Artifact delivery | Partial/Built locally | Artifact records, downloads, text previews, durable archive, and versioned overwrite snapshots exist; binary previews and richer version browsing remain. |
| Permissions/audit | Built locally/partial production | Hash-chained JSONL audit, bearer-token middleware, local signed principals, optional RS256/OIDC JWKS verification, workspace authorization, admin-role enforcement, session tool allow-lists, organization policy, and connector review checks are implemented; provider lifecycle and key rotation ownership remain. |
| Parallel workstreams | Partial | Dependency tiers and `asyncio.gather` exist in `backend/app/engine/executor.py:73`, with duplicate-output conflict detection; there are no isolated sub-agent budgets or true sandbox workers. |

### TRD functional requirements

| FRs | Assessment |
|---|---|
| FR-1 | **Built:** UUID sessions persisted in SQLite. |
| FR-2–FR-4 | **Partial:** plans, approvals, artifacts and tool calls persist, but transcript/event history and executor state are not durable; parallelism is same-process coroutine fan-out. |
| FR-5–FR-8 | **Partial:** planner/executor/replan-shaped code exists, but the default provider is heuristic and `revise_plan` mainly marks a denied/failed step skipped. |
| FR-9 | **Built locally:** session-enabled tool allow-lists are enforced by executor and MCP paths. |
| FR-10–FR-11 | **Partial/Built:** DB tool-call records, append-only audit events and WebSocket streaming exist; immutability/replay and event persistence are incomplete. |
| FR-12–FR-15 | **Partial:** local/Docker sandbox backends, no-network defaults, CPU/memory/PID/disk/time/output ceilings, and server-enforced session quotas exist; managed microVM isolation and independent production validation remain. |
| FR-16–FR-20 | **Built locally/partial for production:** authenticated bridge transport, browser control, heartbeat/offline behavior, revocation, per-session folder/domain grants, and scheduled grant persistence exist; TLS/token rotation and signed packaging remain. |
| FR-21–FR-24 | **Partial/Built locally:** JSON-RPC MCP endpoints, live connector paths, action-specific scopes, session scopes, org policy, and review gates exist; token vault and third-party registry remain. |
| FR-25–FR-27 | **Built locally/partial:** low/medium/high classification, concrete target/diff approval payloads, durable approval resolution, and medium pre-approval work; distributed identity-bound approval remains. |
| FR-28–FR-30 | **Partial/Built locally:** resumable task records, opt-in persisted workspace memory, CRUD/edit/export/toggle, stable embeddings, and retrieval exist; production vector service and identity isolation remain. |
| FR-31–FR-32 | **Built locally/partial for production:** automatic five-field cron execution, persisted grants, re-planning, restart recovery, retention sweeps, and manual trigger exist; durable distributed scheduling remains. |
| FR-33 | **Partial/Built:** plan/activity/artifact panels exist. |
| FR-34 | **Partial:** browser actions run through the optional Playwright bridge and sensitive flows return explicit takeover-required; signed packaging and end-to-end desktop handoff remain. |
| FR-35 | **Built locally:** per-session tool-call, step, runtime, and estimated-cost limits are enforced and exposed; billing-grade metering remains. |

### TRD technology choices and non-functional requirements

| Requirement | Status |
|---|---|
| FastAPI/React foundation | Built. |
| Postgres | Missing; default is SQLite in `backend/app/config.py:28`. |
| Temporal/durable workflow engine | Partial local substitute; execution intent, leases, attempts, and restart requeue state persist in `execution_jobs`, while the actual worker still runs in-process and lacks external queue/event infrastructure. |
| Redis/Kafka event bus | Missing; events use process-local queues. |
| MCP | Partial/Built locally; JSON-RPC discovery/call transport and policy enforcement exist, but durable third-party server registry remains. |
| Firecracker/gVisor/managed microVM | Missing. |
| OAuth2/OIDC/token vault | Partial | Signed HS256 and optional RS256/JWKS principal verification with issuer/audience/workspace/role enforcement exist; provider lifecycle/key rotation and connector token vault remain. |
| Request tracing | Built locally; correlation IDs are propagated through HTTP responses and audit details. OpenTelemetry export remains absent. |
| Horizontal scale/50k sessions/99.9% availability | Not demonstrated or supported by the current in-memory managers and SQLite default. |
| Default-deny egress and tenant isolation | Missing. Subprocesses inherit the host PATH/environment shape and no egress allow-list is enforced. |
| Immutable/exportable audit | Partial/Built locally. Hash chaining, export, verification, and admin-token plus verified-admin protection exist; provider lifecycle and independent compliance validation remain. |

## Rules compliance

### Followed or substantially followed

- Risk tiers and high-risk approval blocking for delete/send/financial-style tool names.
- Medium-risk pre-approval is restricted to medium actions in `backend/app/engine/approval_gate.py:104`.
- Delete moves files to session trash (`backend/app/tools/file_ops.py:104`).
- Overwrite snapshots are created before writes (`backend/app/tools/file_ops.py:56`).
- Prompt-injection patterns are detected and untrusted content is wrapped (`backend/app/core/safety.py:39`).
- SSRF protections block loopback, private, link-local, metadata and non-HTTP schemes; these are tested.
- User pause/resume/cancel and an admin kill switch exist.
- Audit entries are append-only and hash-chained.

### Not followed or only simulated

- **Zero access by default:** bridge grants are empty until explicitly registered/granted; file access requires a connected agent transport. Session grants and enabled tools are enforced in the orchestrator.
- **Least privilege per step:** executor and MCP paths enforce session tool allow-lists, action-specific connector scopes, and organization connector policy.
- **Untrusted-content elevation:** fetched injection signals are propagated into executor risk classification and force high-risk approval.
- **No fabrication:** offline execution now reports preview-only behavior instead of fabricated findings; live connector effects still require deployment credentials and preview mode intentionally does not send external communication.
- **Sandbox/network rules:** the subprocess sandbox is not a security boundary and there is no default-deny network policy.
- **Connector review and org allow/block lists:** enforced through the connector policy and admin review APIs; manifest submission, HTTPS/digest validation, staged upload, archive safety scanning, signed-manifest verification, pending review persistence, and scope-change re-approval are implemented, while malware/dependency scanning remains.
- **Tenant isolation:** signed subject/org/workspace claims are enforced across local resource routes; external IdP federation and production key lifecycle remain.
- **Audit reconstruction:** approval/tool/bridge/admin events are logged and admin endpoints require an admin token plus verified admin role when identity verification is configured; provider lifecycle ownership remains.
- **Failure escalation:** repeated failures on a step are counted in the database and the second failure emits a user-facing `replan_required` event and invokes plan revision; external workflow retry policy remains deployment-specific.

## Use-case coverage

| Use case | Status | What is really implemented |
|---|---|---|
| UC-1 organize folder | Partial/Built locally | When a bridge agent is configured, the plan uses bridge list/move tools with explicit folder and scope grants; unconfigured development mode retains sandbox-only fallback. |
| UC-2 expense spreadsheet | Partial | xlsx generation and authenticated `inputs/<filename>` uploads work; receipt image OCR, automatic input parsing, formulas/pivot totals, and uncertainty reporting remain. |
| UC-3 report from notes | Partial | docx generation works; default content is generic and does not read notes/data. |
| UC-4 competitive research | Partial/Built in planner | Ten-competitor tasks generate ten search/fetch branches, a merge step, conflict surfacing, and a cited-report step; live source quality still requires runtime evaluation. |
| UC-5 recurring digest | Partial/Built locally | Scheduling re-plans each run, creates a draft, and keeps send high-risk gated; a production support-ticket connector still requires deployment integration. |
| UC-6 tracker → slide deck | Partial | pptx generation exists; tracker connector is fixture-only. |
| UC-7 browser task/takeover | Partial | Browser navigate/click/type/screenshot actions are routed through the optional Playwright bridge; login/payment/CAPTCHA flows return takeover-required and require the desktop runtime. |
| UC-8 cleanup/migration | Partial | High-risk delete and reversible trash exist; no shared-drive access, duplicate hashing workflow, or approval diff. |
| UC-9 resume paused task | Partial/Built locally | Persisted plans, artifacts, approvals, events, and startup recovery-to-paused are available; distributed workflow recovery remains. |
| UC-10 memory-driven report | Built locally/partial production | Workspace opt-in memory is retrieved at planning time and the planner transparently annotates recalled defaults; managed vector/identity isolation remains. |

## Phase completion assessment

| Phase | Status |
|---|---|
| Phase 0 Foundations | **Mostly built as prototype:** session API, heuristic planner, executor, UI, audit and artifacts work. |
| Phase 1 Sandbox & Safety Core | **Partial:** approval, SSRF/injection checks, pause/cancel, Docker controls, disk ceilings, and production configuration guards exist; managed isolation, egress policy, and pen-test-grade enforcement do not. |
| Phase 2 File & Document Tools | **Partial/Built locally:** file/doc generation, authenticated quota-enforced session input uploads, artifact rendering for text, reversible delete, versioned overwrite, and disk enforcement exist; automatic parsing/OCR, native binary previews, and zero-cleanup quality are not demonstrated. |
| Phase 3 Local Bridge | **Built locally/partial production:** live authenticated bridge protocol, folder/domain session grants, browser routing, revocation and offline behavior; TLS/packaging remain. |
| Phase 4 Web/Connector Layer | **Built locally/partial production:** MCP JSON-RPC, live connector paths, scopes, review and policy gates exist; vault/registry remain. |
| Phase 5 Memory | **Built locally/partial production:** SQLite CRUD, workspace filter, stable embeddings, persisted opt-in, edit/export and retrieval exist; managed vector/identity remain. |
| Phase 6 Parallelism/Scheduling | **Built locally/partial production:** dependency tiers, automatic cron with persisted permissions, recovery, retention, usage controls, and database-backed execution leases/requeue state exist; durable distributed execution remains. |
| Phase 7 Enterprise/Marketplace | **Partial/Built locally:** org admin policy, connector review/version/scope records, staged package upload and archive safety scanning, manifest submission/validation, signed-manifest verification, pending review persistence, scope-change re-approval, action-scope enforcement, deployment-region residency guard, retention, local signed-principal and optional RS256/OIDC JWKS workspace authorization, role-gated audit administration, and authenticated controls exist; OIDC provider lifecycle/rotation operations, malware/dependency scanning, package distribution, multi-region routing, and production retention workers remain. |
| Phase 8 Hardening/GA | **Partial:** reproducible load probe, GA-readiness timing probe, 12-case red-team corpus, strengthened 10-case use-case evaluator, tracing, production sandbox guards, and regression security tests exist; PRD task-completion, approval-precision, longitudinal-memory metrics, target-scale evidence, external security review, and GA launch sign-off remain. |

## Highest-priority blockers

1. Replace the local/Docker deployment fallback with a managed isolated worker boundary and independently validate server-side CPU/memory/disk/time/tool/cost limits.
2. Complete external OIDC provider lifecycle, key rotation, and identity lifecycle ownership; signed subject/org/workspace claims now bind session, memory, artifact, schedule, WebSocket, and admin access locally, with optional RS256/JWKS verification.
3. Add durable MCP server registration/review and a production token vault; local JSON-RPC and scope enforcement are implemented.
4. Complete signed bridge desktop packaging and independently validate browser takeover/TLS deployment.
5. Add durable distributed workflow execution; local cron, restart recovery, and event persistence are implemented.
6. Make execution data-driven: planner/tool parameters must use real inputs, preserve citations, report uncertainty, and never fabricate placeholder results.
7. Complete remaining UI requirements (connector permissions, native artifact preview/version browsing, schedule diffs, and richer usage/cost views); basic plan editing and memory edit/export now exist.
8. Expand tests from status/artifact smoke checks to contract tests for actual effects, authorization, scope boundaries, restart recovery, quotas, connector schemas, browser takeover, and “no fabricated data” guarantees.

## Bottom line

The codebase now implements and verifies the local MVP core through Phase 7, with meaningful Phase 8 hardening evidence. It is not yet a production-safe GA agent: managed isolation, identity/RBAC, durable multi-instance execution, token-vault/marketplace infrastructure, and independent security/scale evidence remain explicit blockers.
