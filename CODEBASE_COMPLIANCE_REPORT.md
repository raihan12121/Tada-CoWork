# Coagent Codebase Compliance Report

Review date: 2026-09-14  
Scope: repository source, tests, frontend build, PRD/TRD/design/architecture/phases/rules/usecases/Memory documents.

## Executive verdict

The repository is a strong functional prototype/demo of the planned Coagent experience, but it is not yet compliant with the production architecture or the security guarantees described by the TRD, architecture, and rules documents.

Implemented convincingly: task intake and plan generation, a FastAPI session lifecycle, a ReAct-shaped executor, WebSocket activity streaming, basic approval gates, reversible delete/version snapshots, document artifact generation, memory CRUD/recall, bridge path validation, audit hash chaining, a desktop launcher, and a React UI covering the main planned surfaces.

Not production-complete: the “sandbox” is a local subprocess, connector implementations return fixture data, email/Slack/webhook actions are simulated, there is no MCP transport, no browser automation, no real local bridge channel, no automatic scheduler, no authentication/tenant identity model, no server-enforced tool allow-list, no real resource/cost quotas, and no durable workflow recovery after process restart.

The correct status is therefore: **prototype scope substantially built; PRD feature intent partially represented; TRD/architecture/rules compliance incomplete, with sandbox and authorization gaps blocking production readiness.**

## Verification performed

- Backend test suite: **44 passed** (`.venv\Scripts\python.exe -m pytest backend/tests -q`).
- Frontend production build: **passed** (`npm run build`; TypeScript and Vite both completed).
- Graph extraction: 579 nodes, 1,008 graph edges, 39 communities; outputs are in `graphify-out/`.
- The graph shows the planning documents as a connected “Planning Documents” community and the implementation as distinct communities for sessions, executor, sandbox, safety, approvals, memory, bridge, tools, connectors, scheduling, and UI.

Passing tests demonstrate the current behavior, but several use-case tests validate only plan creation/status/artifact existence rather than real external effects. For example, UC-4 does not assert ten competitors, parallel fan-out, citations, or a research artifact; UC-7 constructs an approval object directly instead of exercising browser automation.

## Requirement traceability

Legend: **Built** = materially implemented and exercised; **Partial** = prototype or only one layer exists; **Missing** = not implemented or contradicts the requirement.

### PRD goals and key features

| Area | Status | Evidence / gap |
|---|---|---|
| Natural-language intake → structured plan | Partial | `backend/app/engine/planner.py:12`; offline planner is keyword-based in `backend/app/core/llm.py:72`, not a general planner. |
| Editable, transparent plan | Partial | UI renders risk/dependencies and has add/delete affordances in `frontend/src/components/PlanView.tsx:17`, but `frontend/src/App.tsx:213` does not pass edit handlers; no reorder/edit API exists. |
| Sandboxed execution | Missing for production | `backend/app/sandbox/process_sandbox.py:49` runs Python/Node with `asyncio.create_subprocess_exec`; this is not Firecracker/gVisor/container isolation. |
| Local bridge | Partial | Path containment exists in `bridge/agent.py:33`, but the backend bridge is global in-memory state with hard-coded grants in `backend/app/api/bridge.py:24`; it is not a connected session-scoped channel. |
| File/document tools | Partial | File operations and docx/xlsx/pptx/pdf/md/csv generation exist; input ingestion, OCR, native previews, and real folder reorganization are absent. |
| Web research | Partial | `web_search`/`web_fetch` exist, including SSRF checks; search has a fabricated fallback in `backend/app/tools/web_search.py:50`, and there is no browser fallback. |
| MCP connector ecosystem | Missing | Tools expose local Python schemas, but no MCP server/transport, connector lifecycle, OAuth scopes, token vault, or scope enforcement exists. |
| Approval gates | Partial/Built for demo | Risk classification and blocking approval work in `backend/app/engine/approval_gate.py:17`; exact diffs and durable distributed approval state are incomplete. |
| Live visibility and controls | Partial | WebSocket feed and pause/resume/cancel UI are implemented in `frontend/src/App.tsx:46`; events are in-process and not replayable after reconnect/restart. |
| Memory | Partial | Working memory and workspace-filtered SQLite memory exist in `backend/app/memory/long_term_memory.py:34`; default memory is enabled for `default`, there is no vector DB, edit/export/TTL flow, or verified memory application to plans. |
| Scheduling | Partial | Schedule CRUD and manual trigger exist in `backend/app/api/schedules.py:17`; there is no cron worker that runs jobs automatically or updates last-run state. |
| Artifact delivery | Partial | Artifact records, downloads and text previews exist; binary previews are placeholders and version history is not implemented beyond `version=1`. |
| Permissions/audit | Partial | Hash-chained JSONL audit exists in `backend/app/core/audit.py:23`; most APIs have no user/org authorization and admin audit export is unauthenticated. |
| Parallel workstreams | Partial | Dependency tiers and `asyncio.gather` exist in `backend/app/engine/executor.py:73`; there are no isolated sub-agent budgets, conflict surfacing, or true sandbox workers. |

### TRD functional requirements

| FRs | Assessment |
|---|---|
| FR-1 | **Built:** UUID sessions persisted in SQLite. |
| FR-2–FR-4 | **Partial:** plans, approvals, artifacts and tool calls persist, but transcript/event history and executor state are not durable; parallelism is same-process coroutine fan-out. |
| FR-5–FR-8 | **Partial:** planner/executor/replan-shaped code exists, but the default provider is heuristic and `revise_plan` mainly marks a denied/failed step skipped. |
| FR-9 | **Missing:** `SessionCreate.enabled_tools` is declared but ignored; executor uses the global registry. |
| FR-10–FR-11 | **Partial/Built:** DB tool-call records, append-only audit events and WebSocket streaming exist; immutability/replay and event persistence are incomplete. |
| FR-12–FR-15 | **Missing/Partial:** path namespacing and subprocess timeout/output caps exist, but no microVM, default-deny network, CPU/memory/disk caps, max-step enforcement, or spend enforcement exists. `DEFAULT_MAX_STEPS`, `DEFAULT_MAX_TOOL_CALLS`, and cost fields are defined but not enforced. |
| FR-16–FR-20 | **Partial/Missing:** folder grant/revoke and path checking exist, but no authenticated encrypted bridge protocol, browser control, heartbeat/offline behavior, or per-session grants. |
| FR-21–FR-24 | **Missing/Partial:** connector classes declare scope metadata, but no MCP protocol or scope/token enforcement exists; connectors return sample data. |
| FR-25–FR-27 | **Partial/Built:** low/medium/high classification and medium pre-approval work; approval payloads do not reliably contain a real diff, and approval resolution audit uses `session_id="unknown"` in `backend/app/engine/approval_gate.py:147`. |
| FR-28–FR-30 | **Partial:** working memory and SQLite memory CRUD exist; restart-safe task memory, opt-in default behavior, candidate confirmation, edit/export/TTL, and vector retrieval are missing. |
| FR-31–FR-32 | **Missing/Partial:** schedule records and manual trigger exist, but no automatic cron execution or schedule worker. A triggered session does plan again. |
| FR-33 | **Partial/Built:** plan/activity/artifact panels exist. |
| FR-34 | **Missing:** takeover metadata/UI exists, but no browser automation tool or actual takeover channel exists. |
| FR-35 | **Missing:** usage/cost is displayed as a model field but never calculated or enforced. |

### TRD technology choices and non-functional requirements

| Requirement | Status |
|---|---|
| FastAPI/React foundation | Built. |
| Postgres | Missing; default is SQLite in `backend/app/config.py:28`. |
| Temporal/durable workflow engine | Missing; execution is `asyncio.create_task` in `backend/app/engine/session_manager.py:116`. |
| Redis/Kafka event bus | Missing; events use process-local queues. |
| MCP | Missing; no MCP dependency or transport. |
| Firecracker/gVisor/managed microVM | Missing. |
| OAuth2/OIDC/token vault | Missing. A shared static bridge secret is the main control. |
| OpenTelemetry/tracing | Missing. |
| Horizontal scale/50k sessions/99.9% availability | Not demonstrated or supported by the current in-memory managers and SQLite default. |
| Default-deny egress and tenant isolation | Missing. Subprocesses inherit the host PATH/environment shape and no egress allow-list is enforced. |
| Immutable/exportable audit | Partial. Hash chaining and export exist, but export/verify endpoints are not admin-authenticated. |

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

- **Zero access by default:** the bridge API starts with hard-coded folders and `allow_browser_control=True` (`backend/app/api/bridge.py:24`); the CLI defaults to granting `.` (`bridge/agent.py:54`). Session-level `granted_folders` and `enabled_tools` are not persisted or enforced.
- **Least privilege per step:** executor can call any globally registered tool; connector scopes are descriptive only.
- **Untrusted-content elevation:** `WebFetchTool` reports injection, but the executor does not pass that signal into `classify_tool_risk(is_triggered_by_untrusted_content=True)`.
- **No fabrication:** offline execution prints a hard-coded “records: 24” result (`backend/app/core/llm.py:170`), and Google Drive/Slack/GitHub/webhook connectors return fixture/success responses rather than live effects.
- **Sandbox/network rules:** the subprocess sandbox is not a security boundary and there is no default-deny network policy.
- **Connector review and org allow/block lists:** no marketplace/review/admin policy engine exists.
- **Tenant isolation:** workspace filtering exists for memory, but there is no authenticated user/org identity or authorization boundary.
- **Audit reconstruction:** approval resolution logs `session_id="unknown"`; admin audit endpoints are open.
- **Failure escalation:** repeated tool failures do not trigger a user-facing replan proposal; ordinary failures mark the step failed.

## Use-case coverage

| Use case | Status | What is really implemented |
|---|---|---|
| UC-1 organize folder | Partial | Plan, list, write, summary flow; no local Downloads bridge integration, rename/move semantics, or real inventory input. |
| UC-2 expense spreadsheet | Partial | xlsx generation works; no receipt image OCR, real input loading, formulas/pivot totals, or uncertainty report. |
| UC-3 report from notes | Partial | docx generation works; default content is generic and does not read notes/data. |
| UC-4 competitive research | Partial | Web tools and report artifact exist; no ten-source/ten-competitor fan-out, citation preservation, conflict handling, or guaranteed real sources. |
| UC-5 recurring digest | Partial | High-risk email gate is tested; support connector, actual draft/send, and automatic recurrence are absent. |
| UC-6 tracker → slide deck | Partial | pptx generation exists; tracker connector is fixture-only. |
| UC-7 browser task/takeover | Missing | Approval object and takeover metadata are tested directly, but browser automation is absent. |
| UC-8 cleanup/migration | Partial | High-risk delete and reversible trash exist; no shared-drive access, duplicate hashing workflow, or approval diff. |
| UC-9 resume paused task | Partial | Same-process pause/resume works; process restart, event replay, and durable executor recovery are absent. |
| UC-10 memory-driven report | Partial | Memory retrieval is wired into session creation; the heuristic planner does not visibly use `memory_context`, and the test only asserts a plan exists. |

## Phase completion assessment

| Phase | Status |
|---|---|
| Phase 0 Foundations | **Mostly built as prototype:** session API, heuristic planner, executor, UI, audit and artifacts work. |
| Phase 1 Sandbox & Safety Core | **Partial:** approval, SSRF/injection checks and pause/cancel exist; real isolation, egress policy, quotas and pen-test-grade enforcement do not. |
| Phase 2 File & Document Tools | **Partial:** basic file/doc generation exists; real input workflows, artifact rendering, versioning and zero-cleanup quality are not demonstrated. |
| Phase 3 Local Bridge | **Partial skeleton:** path checker and UI exist; no live authenticated bridge protocol, browser automation or offline behavior. |
| Phase 4 Web/Connector Layer | **Partial skeleton:** web fetch/search and connector definitions exist; no MCP, live SaaS integrations, OAuth or scope enforcement. |
| Phase 5 Memory | **Partial:** SQLite CRUD, workspace filter and simple similarity recall; no hybrid/vector store, opt-in default, TTL, edit/export, or restart-safe task memory. |
| Phase 6 Parallelism/Scheduling | **Partial:** dependency tiers and manual schedule trigger; no durable scheduler, cost dashboards, true sub-agents or conflict merge UI. |
| Phase 7 Enterprise/Marketplace | **Not built:** no org admin policy console, marketplace review/versioning, data residency or full authenticated audit administration. |
| Phase 8 Hardening/GA | **Not built:** no load tests, external security review, real adversarial integration harness, human-eval benchmark, or success-metric instrumentation. |

## Highest-priority blockers

1. Replace the local subprocess “sandbox” with a real isolated worker boundary and enforce server-side CPU/memory/disk/time/tool/cost limits.
2. Add identity/authentication and authorization at every session, memory, artifact, bridge, connector, and admin endpoint; persist session-scoped grants.
3. Implement actual MCP transport and connector scope/token enforcement; remove fixture/success fallbacks from production paths.
4. Implement the bridge protocol and browser automation/takeover flow, including offline/revocation behavior.
5. Add durable workflow execution and a real cron scheduler; recover sessions after process restart and persist/replay activity events.
6. Make execution data-driven: planner/tool parameters must use real inputs, preserve citations, report uncertainty, and never fabricate placeholder results.
7. Wire plan editing to backend APIs and implement missing UI requirements (connector permissions, native artifact preview/version history, memory edit/export, schedule diffs, usage/cost).
8. Expand tests from status/artifact smoke checks to contract tests for actual effects, authorization, scope boundaries, restart recovery, quotas, connector schemas, browser takeover, and “no fabricated data” guarantees.

## Bottom line

The codebase follows the intended product shape and is a credible Phase 0 / early Phase 1–2 prototype. It does not yet follow the documented production plan in the areas that matter most for trust: isolation, authorization, scoped access, real integrations, durable execution, and truthful data handling. Treat it as a demonstrable local prototype, not as a production-safe autonomous work agent.
