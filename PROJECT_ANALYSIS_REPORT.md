# AnyWork / Coagent — Complete Project Analysis

**Repository:** `D:\App Development\Omayk Cowork`
**Analysed:** 2026-11-07
**Version in code:** `1.1.5` (`backend/app/config.py`)
**Commit analysed:** `385517b` — *"feat: implement Production AI Provider engine, ReAct live streaming cards, and release v1.1.5"*
**Working tree:** clean · 40 commits on `main`, single branch
**Scope:** 1,000+ first-party files read/outlined; full backend test suite executed.

---

## 1. Executive summary

This is **not a prototype**. It is a mature, single-developer-built, locally-installable **autonomous AI "coworker" desktop application** — effectively a self-hosted clone of Anthropic's Claude Cowork / xAI's Grokbot concept, rebranded several times (Coagent → Tada-CoWork → AnyWork).

The system takes a natural-language task, produces a **reviewable DAG plan**, executes it step-by-step with a **ReAct loop** against **24 tools + 6 external connectors**, everything running inside a **resource-governed per-session sandbox**, with **risk-tiered approval gates** for anything consequential, **hash-chained audit logging**, and **multi-tier memory**. Output is real Office files (`.docx`, `.xlsx`, `.pptx`, `.pdf`, `.md`) served back through an in-app artifact viewer.

It is genuinely full-stack and end-to-end: FastAPI orchestrator → React 19 desktop UI → PyInstaller launcher → WiX MSI installer → optional local file/browser bridge → Capacitor Android shell.

**Verdict:** impressive breadth and unusually strong safety engineering for a solo project. It is *not* production-GA-ready, and the repo's own compliance document says so honestly. The gap is infrastructure (managed isolation, durable/distributed execution, secret vaulting, CI) rather than features.

| Dimension | Rating | Note |
|---|---|---|
| Feature completeness | ★★★★★ | All 9 planned phases substantially implemented |
| Architecture | ★★★★☆ | Clean layering; some large modules (executor 644 LOC, llm 40 KB) |
| Safety / security design | ★★★★☆ | Real approval gates, injection defence, audit chain, identity |
| Production readiness | ★★☆☆☆ | No CI, no managed isolation, no distributed execution |
| Test depth | ★★★☆☆ | 27 suites / 108 tests, but mostly contract-smoke level |
| Documentation | ★★★★★ | 10 spec documents (~1,100 lines) + 2 audit reports |
| Maintainability | ★★★☆☆ | Naming drift, dead code, missing lint/type config |

---

## 2. What the product actually does

A user types a goal — *"Research 10 competitors and produce a comparison deck"*, *"Turn these meeting notes into a report"*, *"Pull last month's numbers from our tracker"*.

1. The **Planner** decomposes it into ordered steps, each naming a tool (`web_search`, `create_document`, `execute_code`, …). The plan is shown in the UI, editable, and can be revised mid-flight.
2. The **Executor** walks the plan in dependency tiers. Independent steps fan out as **parallel sub-agents**; results merge with explicit conflict detection.
3. Each step is a **ReAct cycle**: reason → choose tool → execute → observe → decide. It is not a fixed script.
4. Every tool call is **risk-classified** (low/medium/high). High-risk actions — deletes, emails, Slack posts, out-of-scope paths, anything triggered by untrusted content — **block on a human approval modal**.
5. Tools run inside `sandboxes/<session_id>/` with per-session **disk, output, time, step, and tool-call caps**.
6. Artifacts are registered, versioned, previewed in-app, and downloadable.
7. Every action is appended to a **SHA-256 hash chain** (`data/audit/audit_chain.jsonl`), verifiable and exportable.

Real usage evidence: **814** generated artifact directories, **18,709** audit-chain entries, a **1.1 MB** SQLite database. This app has been driven hard.

---

## 3. Technology stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, FastAPI ≥0.115, Uvicorn, Pydantic v2, SQLAlchemy 2 (async) + aiosqlite, httpx |
| Document generation | openpyxl, python-docx, python-pptx, reportlab |
| Frontend | React 19.2, TypeScript 6, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react |
| Frontend tooling | oxlint, Vitest 5 + jsdom + Testing Library |
| Desktop shell | PyInstaller (`desktop/coagent.spec`, GUI mode, embedded worker EXE) |
| Installer | WiX Toolset MSI (`installer/`), produces `AnyWork-<ver>-x64.msi` |
| Mobile | Capacitor 8 Android wrapper (`frontend/android`) |
| Bridge | Pure-stdlib HTTP server + optional TLS + optional Playwright |
| Persistence | SQLite (`data/coagent.db`), 20 tables; JSONL audit log; filesystem artifacts |

Deliberately **light on dependencies** — no LangChain, no ORM migrations framework, no vector DB, no auth library. All hand-rolled.

---

## 4. Repository anatomy

```
Omayk Cowork/
├── backend/app/            9,688 LOC · 60 Python modules
│   ├── api/                18 routers, ~75 endpoints + 1 WebSocket
│   ├── core/               llm, safety, identity, audit, plan tiers, policies
│   ├── engine/             planner, executor, session_manager, approval_gate, scheduler, task_graph
│   ├── sandbox/            process_sandbox (local/docker/managed), CDP browser service
│   ├── tools/              24 tool classes + registry
│   ├── connectors/         Drive, GitHub, Slack, Webhook, Gmail, Outlook
│   ├── memory/             working, long-term (embeddings + cosine)
│   ├── mcp/                dynamic MCP server discovery & JSON-RPC
│   └── db/                 SQLAlchemy models + init
├── backend/tests/          27 modules, 2,118 LOC
├── backend/evals/          red-team corpus, use-case benchmarks, human rubric
├── frontend/src/           8,290 LOC TS/TSX · 23 components
├── bridge/agent.py         12.8 KB scoped file/browser bridge
├── desktop/                launcher.py, sandbox_worker.py, coagent.spec
├── tools/                  load_test, red-team runner, eval runner, GA readiness
├── data/                   runtime (gitignored): DB, artifacts, audit chain
├── graphify-out/           committed-ignored code knowledge graph
└── *.md                    10 specification documents + 2 self-audit reports
```

---

## 5. Architecture

### 5.1 Layering

```
React SPA ──REST + WebSocket──► FastAPI orchestrator
                                  │
                     ┌────────────┼─────────────┐
                     ▼            ▼             ▼
              SessionManager  PlannerEngine  SchedulerEngine (cron)
                     │
                     ▼
              ExecutorSession  ──► TaskGraphEngine (topological tiers)
                     │
          ┌──────────┼───────────┬──────────────┐
          ▼          ▼           ▼              ▼
   SafetyEngine  ApprovalGate  ToolRegistry   MemoryManager
                     │            │
                     ▼            ▼
              ProcessSandbox   LLM providers (8)
              (local/docker/managed)   + MCP dynamic tools
```

### 5.2 Request lifecycle

1. `POST /v1/sessions` → row written, plan generated, status `planning`.
2. `POST /v1/sessions/{id}/start` → executor task launched on the event loop.
3. `GET /v1/sessions/{id}/stream` (WebSocket) pushes typed events: `narration`, `tool_call`, `approval_required`, `artifact`, `merge_conflict`, `done`, `error`. Auth is checked before `accept()` (closes 4401/4403/4404).
4. `POST /v1/approvals/{id}/resolve` unblocks a waiting step.
5. Artifacts served from `/v1/artifacts/preview|download/{session_id}/{filename}`.

Note: the frontend keeps a **REST event-history fallback** and the Agent Computer panel **polls every 3 s** — the WebSocket is the primary channel, not the only one.

### 5.3 Parallel execution model

`task_graph.py` computes execution tiers from step dependencies. A tier with >1 step becomes a fan-out via `asyncio.gather`. Crucially, after each parallel tier the executor performs **merge-conflict detection**: if two sub-agents target the same `path`/`filename`/`file_id`, it emits `merge_conflict` and **fails the run for human review** rather than silently picking a winner. That is a thoughtful, unusual design decision.

### 5.4 Failure semantics

Non-blocking failures (low-risk steps, or a `read_file` "not found") become **warnings** — the plan completes with "completed with N non-blocking warning(s)". Everything else halts with `error`. This is honest reporting rather than fabricated success, and it is explicitly justified by a comment citing `rules.md §9.1 / §12.1`.

---

## 6. Backend deep dive

### 6.1 API surface — 18 routers

| Router | Prefix | Highlights |
|---|---|---|
| sessions | `/v1/sessions` | create, start, pause, resume, cancel, plan edit, permissions, terminal, usage, events, **WS stream** |
| approvals | `/v1/approvals` | resolve with decision + optional "always allow this class" |
| artifacts | `/v1/artifacts` | preview + download |
| memory | `/v1/memory` | list, patch, delete, toggle per workspace |
| schedules | `/v1/schedules` | CRUD + manual trigger |
| admin | `/v1/admin` | audit export/verify, org policy, usage, marketplace, retention sweep, **kill switch** |
| bridge | `/v1/bridge` | register, heartbeat, folder grant/revoke, proxied requests |
| browser | `/v1/browser` | navigate, click/type/scroll, screenshot, page text (CDP) |
| mcp | `/v1/mcp` | server CRUD, tool discovery, JSON-RPC proxy |
| settings / settings/accounts | `/v1/settings` | LLM config + encrypted provider accounts |
| skills | `/v1/skills` | teach-by-demonstration, run, extract from session |
| swarm | `/v1/swarm` | multi-subtask orchestration |
| bots | `/v1/bots` | bot CRUD, duplicate, templates, webhooks, routines |
| channels | `/v1/channels` | multi-agent channels |
| connectors | `/v1/connectors` | configure, test, disconnect |
| approvals/artifacts/… | | |

Health at `/health` (unauthenticated), APK download at `/download/app.apk`, static SPA mounted at `/` from five candidate paths (dev, PyInstaller `_MEIPASS`, installed `_internal`).

### 6.2 LLM provider layer — `core/llm.py` (40 KB, 10 classes)

`BaseLLMProvider` → implementations:

- **Anthropic** (Messages API), **OpenAI**, **Gemini**, **xAI**, **OpenAI-compatible** (Ollama / LM Studio), **Codex CLI**, **Claude Code CLI**, **OfflineHeuristic** (labelled no-AI preview mode).
- `AccountFailoverLLMProvider` wraps a list of clients and retries the next account **only on quota/rate-limit errors** — a clean, narrow failover policy.
- Provider selection is **runtime-configurable** via `configure_runtime_provider()` and persisted encrypted accounts (Windows DPAPI through `core/secret_store.py`); credentials are never returned to the UI nor written to SQLite.

The offline heuristic planner is a real deterministic planner (keyword → tool mapping), so the app is fully demoable with zero API keys. That is good product thinking — and it is explicitly labelled as preview mode.

### 6.3 Sandbox — `sandbox/process_sandbox.py` (23.7 KB)

Three backends behind one `SandboxSession` interface:

| Backend | Mechanism |
|---|---|
| `local` (default) | Isolated worker subprocess (`AnyWorkSandboxWorker`), resource caps, per-session dir |
| `docker` | Container per session with CPU/memory/pids limits, `--network none` |
| `managed` | Remote HTTPS worker with provider token |

Common guarantees: `resolve_path()` blocks traversal, `disk_usage_bytes()` + `ensure_disk_capacity()` enforce a 100 MB/session default, output capped at 1 MB, timeouts per execution, `destroy()`/`finalize()` archives artifacts and removes the tree.

**Production startup guard** in `main.py` refuses to boot in `APP_ENV=production` unless: docker/managed backend, real LLM provider + key, API token, admin token, bridge secret, identity secret or OIDC, marketplace signing secret, and a non-`local` deployment region. This is exactly the kind of fail-closed gate most hobby projects skip.

### 6.4 Safety engine — `core/safety.py`

- Three risk sets (`HIGH_RISK_TOOLS`, `MEDIUM_RISK_TOOLS`, `LOW_RISK_TOOLS`) plus prefix rules (`delete_*`, `send_*`, `write_*`, `edit_*`).
- **Tool-specific overrides**: `browser_automation` is low-risk except `takeover|login|payment|submit` → high; connectors (`slack`, `google_drive`, `github`, `gmail`, `outlook`, `webhook`) are low-risk only for explicit read-only actions, high otherwise.
- **Content-triggered elevation**: if a step was prompted by untrusted content, risk is forced to `high` regardless of tool.
- **Overwrite protection**: `write_file` with `overwrite=True` and no `snapshot_created` → high risk.
- **Prompt-injection detection**: 10 regexes (`ignore previous instructions`, `bypass safety`, `exfiltrate`, …).
- **Structural delimiting**: `wrap_untrusted_content()` fences external text in `BEGIN UNTRUSTED DATA … END` and strips triple backticks.

The injection defence is **heuristic, not semantic** — a determined attacker can phrase around those regexes. The structural delimiting + risk elevation is the stronger half of the control.

### 6.5 Approval gate & policies

`ApprovalGateManager` creates an `ApprovalRequest` with consequence text, target, optional diff, and `takeover_mode`/`takeover_url` for browser logins. Medium-risk classes can be pre-approved per session (`always_allow_category`); **high-risk can never be blanket-approved**. `approval_gate.py` + `org_policy.py` (per-org kill switch) + `connector_policy.py` + `plan_tier.py` compose a four-layer policy stack.

### 6.6 Memory

- **Working**: in-executor, context-compacted observation list.
- **Task**: SQLite rows (sessions, plans, steps, tool calls, artifacts) → instant resume. `recover_interrupted_sessions()` runs at startup and reconciles orphaned `running` sessions.
- **Long-term**: `compute_simple_embedding()` + cosine similarity — a hand-rolled bag-of-words vector, **not** a neural embedding. Adequate for a few hundred facts, weak at semantic recall. Workspace-isolated with an on/off toggle persisted per workspace.

### 6.7 Audit trail — `core/audit.py`

Each entry: `{session_id, step_id, event_type, actor, details, timestamp, prev_hash, hash}` where `hash = SHA256(canonical_json(payload))`. Appends are guarded by a `threading.Lock` (needed because parallel tiers share the logger). `verify_integrity()` replays the chain, and secret-bearing keys (`token`, `secret`, `password`, `api_key`, `authorization`) are **redacted before hashing**. `trace_id` is threaded from the inbound `X-Trace-ID` header into every audit entry.

### 6.8 Identity & authorisation — `core/identity.py`

Two modes: local **HMAC-SHA256** signed principal tokens, or **OIDC RS256** with JWKS discovery. OIDC validation covers signature, `exp`, `nbf`, `iss`, `aud`, then extracts `sub`, `org_id`, `roles` (incl. Keycloak `realm_access.roles`), and `workspace_ids`. `Principal.can_access_workspace()` gates session, memory, artifact, schedule, WebSocket, and admin access.

### 6.9 Tools & connectors

24 registered tools: `execute_code`, `read_file`, `write_file`, `create_file`, `list_files`, `delete_file`, `move_file`, `create_document` (md/xlsx/docx/pptx/pdf via reportlab), `web_search`, `web_fetch`, `send_email`, `send_slack_message`, `browser_automation`, three bridge tools, six connectors, `ocr_extract`, `delegate_subtask`. MCP servers add **dynamic** tools at runtime (`DynamicMcpTool` subclasses `BaseTool`, so MCP tools are first-class citizens in the same registry and approval path).

### 6.10 Scheduling

Cron-style `_next_run(expression, after)` supporting 5-field expressions with `*`, lists, ranges, steps; loop wakes periodically, runs due schedules by **re-planning from scratch each run** (not replaying a frozen plan) while approvals still gate consequential actions. Also runs the retention sweep.

---

## 7. Frontend deep dive

**23 components, 8,290 LOC**, no router — a single `App.tsx` state hub with a sidebar workspace model (bots ↔ channels ↔ sessions).

| Component | Purpose |
|---|---|
| `Sidebar` (21 KB) | Bot/channel/session navigation, workspace switcher |
| `AnyWorkChat` (28 KB) | Task composer + conversation surface |
| `AgentComputerPanel` (27 KB) | Live "agent computer" — browser screencast, terminal, files |
| `ArtifactPanel` (21 KB) | Inline preview of md/docx/xlsx/pptx/pdf + download |
| `SkillsManager` / `SkillsModal` | Teach-by-demonstration skill library |
| `RoutinesModal`, `ScheduleManager` | Recurring task UX |
| `MemoryManager` / `MemoryModal` | Fact curation, toggles |
| `ConnectionsModal`, `ProviderSettings` | OAuth-ish connectors, multi-provider account management with "Test account" |
| `ApprovalPrompt` | The human gate — consequence text + approve/deny + category pre-approval |
| `ActivityFeed`, `ToolCallCard`, `ThinkingCard` | Streaming ReAct transparency |
| `AuditViewer`, `BridgeManager`, `BotModal`, `ChannelModal`, `VoiceModeOrb`, `DynamicAvatar`, `SettingsModal` | |

Design system: dark obsidian palette, Tailwind 4, lucide icons, hand-written CSS (`App.css`, `index.css` 8.7 KB) rather than a component library.

**Transport:** one `WebSocket` ref per active session, URL derived from `getBackendBaseUrl()`; event history loaded via REST on mount. The backend URL is user-overridable at runtime (`setBackendBaseUrl`).

**Tests:** only `BotModal` and `ChannelModal` are covered (2 files). This is the thinnest part of the test strategy.

---

## 8. Bridge, desktop, mobile

**`bridge/agent.py`** — a dependency-free HTTP server the user points at explicitly granted folders (`--folder`). Token auth on every request (`X-Bridge-Token`), path resolution via `Path.resolve()` + `relative_to()` (blocks `..` traversal **and** symlink escapes), master token exchanged for a session-scoped token at registration, optional TLS with a hard refusal on partial cert configuration. Playwright is opt-in (`bridge/requirements.txt`). Browser actions that need a human (login/payment/CAPTCHA) return `takeover-required` instead of proceeding.

**`desktop/launcher.py`** — finds a free port (8000…8029), spawns uvicorn in a thread, polls `/health` for 12 s, shows a native error dialog on failure, global thread-exception hook. `sandbox_worker.py` is the isolated child EXE. PyInstaller spec bundles the built frontend as data.

**Mobile** — Capacitor Android project; the backend exposes `/download/app.apk` pointing at the debug APK build output.

**Installer** — WiX MSI, artifacts present for 1.1.0 and 1.1.1 (note: code is at 1.1.5, so **the installer lags the source**).

---

## 9. Data model

20 SQLAlchemy tables: `DBSession`, `DBExecutionJob`, `DBPlan`, `DBStep`, `DBToolCall`, `DBApproval`, `DBArtifact`, `DBMemoryItem`, `DBSchedule`, `DBConnector`, `DBOrganization`, `DBWorkspace`, `DBConnectorReview`, `DBProviderAccount`, `DBActivityEvent`, `DBSkill`, `DBMcpServer`, `DBBot`, `DBChannel`.

Sensible normalisation, ISO timestamps (`utc_now`), workspace scoping on every tenant-bearing table, and indexes added in a later performance pass. **No Alembic** — schema is created via `init_db()` (`create_all`), so migrations are manual. That will bite on the first breaking schema change.

---

## 10. Quality assessment

### 10.1 Test suite — actually executed

```
.venv\Scripts\python.exe -m pytest backend/tests -q
→ 102 passed, 4 failed, 2 errors in 16.75s
```

All 4 failures and both errors are **environmental**, not product defects:

- `test_code_exec_tool`, `test_terminal_command_execution`, `test_terminal_executes_safe_command`, `test_terminal_handles_timeout` — all fail with `Subprocess launch failed: [WinError 5] Access is denied`. The analysis sandbox blocks child-process spawning; I reproduced it directly:
  ```json
  {"success": false, "stderr": "Subprocess launch failed: [WinError 5] Access is denied"}
  ```
- 2 errors in `test_tracing` / `test_tools_security` — `OSError: could not create numbered dir with prefix pytest-` in the sandbox-restricted temp directory.

On an unrestricted machine these should pass. Coverage artifact (`.coverage`, 53 KB) is present from a prior run.

**What the tests actually assert:** API contracts, security boundaries (path traversal, terminal injection, red-team prompt injection, connector scope, identity authorisation, plan tiers, disk limits), planner/executor smoke, bot/channel lifecycle, use cases. **What they don't:** true end-to-end effects, restart recovery under load, quota enforcement under concurrency, browser takeover flows. The repo's own `CODEBASE_COMPLIANCE_REPORT.md` flags exactly this gap, which is a point in its favour.

### 10.2 Tooling gaps

- **No CI** (`.github/` does not exist). Nothing runs the 108 tests automatically.
- **No Python linter or type checker** — no `pyproject.toml`, `ruff`, `mypy`, or `pyright`. For 9,688 LOC with heavy `Dict[str, Any]` usage this is the single biggest maintainability risk.
- Frontend has `oxlint` and `vitest` wired but only 2 component tests.
- Exactly **1** `TODO/FIXME/HACK` comment in the entire codebase. That is either exceptional discipline or under-annotation — given the honest audit docs, likely the former.

### 10.3 Code-health observations (concrete)

| Location | Observation | Severity |
|---|---|---|
| `core/audit.py:82-96` | Hash computed once **outside** the lock, then recomputed inside; first result discarded | Cosmetic / dead code |
| `core/audit.py:last` | `from typing import Tuple` at file **bottom** instead of top | Cosmetic |
| `main.py:196,207` | `Path` and `sys` imported mid-file after first use; `from fastapi.responses import FileResponse` mid-file | Cosmetic |
| `core/identity.py` | **Hand-rolled RSA/PKCS#1 v1.5 verification** using raw `pow()` — correct, but unvetted crypto with no clock-skew leeway; `cryptography`/PyJWT is not a dependency | Medium |
| `core/identity.py` | JWKS cache TTL 300 s with no force-refresh on unknown `kid` | Low |
| `bridge/agent.py:151` | Token compared with `!=` rather than constant-time compare | Low |
| `config.py:88` | Development `BRIDGE_SECRET` defaults to a fixed literal `dev-only-local-bridge-secret` | Low (guarded in prod) |
| `main.py:104-111` | CORS hardcoded to localhost origins — correct for desktop, blocks any hosted deployment | Medium (for SaaS) |
| `main.py:194` | `/download/app.apk` is unauthenticated and reaches outside the sandbox dirs | Low |
| `main.py` | Static SPA mounted at `/` **last** — API routes win, but any future route added after the mount would be shadowed | Low |
| `memory/long_term_memory.py` | "Embedding" is bag-of-words + cosine, not a neural embedding | Medium (recall quality) |
| `core/safety.py` | Injection detection is 10 regexes — trivially evadable by paraphrase | Medium |
| `db/session.py` | `create_all` only; no migrations | Medium |
| Repo-wide | Naming drift: `Coagent` (code/docs) vs `AnyWork` (README/config/spec) vs `Tada-CoWork` (`start.bat`) vs folder `Omayk Cowork` | Medium (UX/identity) |
| `installer/` | MSI artifacts stop at 1.1.1 while source is 1.1.5 | Low |

---

## 11. Documentation

Ten specification documents (~1,118 lines) covering PRD, TRD, architecture, design, memory, phases, rules, use cases — and two genuinely candid self-audits:

- `CODEBASE_COMPLIANCE_REPORT.md` — requirement traceability with a "not followed or only simulated" section.
- `PHASE_IMPLEMENTATION_STATUS.md` — per-phase evidence, explicitly refusing to call all nine phases GA-complete.

Both are dated 2026-09-17 and describe the pre-1.1.5 state (they predate the production provider engine and the ReAct streaming UI), so they slightly understate current capability — but the blockers they list are still substantially accurate.

`README.md` is genuinely good: quick start, env-var table, provider setup, bridge setup, repo map.

---

## 12. Verified vs. unverified

**Verified by execution or direct code inspection:** test results (102/4/2), API surface (18 routers), tool inventory (24), schema count (20 tables), provider classes (8), audit redaction + hash chain, production startup guard, risk tiers, bridge traversal defence, WebSocket auth, sandbox backend switch, artifact volume (814 dirs), audit volume (18,709 entries).

**Read but not executed:** Docker and managed sandbox paths, Playwright browser takeover, real Anthropic/OpenAI/Gemini calls, OIDC against a live issuer, marketplace package scanning, Android build, MSI install.

---

## 13. Recommendations, prioritised

**P0 — before any real user trusts this with data**
1. Add CI (GitHub Actions): pytest + oxlint + vitest + `tsc --noEmit` on every push. Nothing else matters until the 108 tests run automatically.
2. Replace hand-rolled RSA with `PyJWT[crypto]` or `cryptography`; add clock-skew leeway and forced JWKS refresh on unknown `kid`.
3. Add `ruff` + `mypy`; type the `Dict[str, Any]` escape hatches at the executor/tool boundary.
4. Introduce Alembic before the next schema change.

**P1 — production hardening**
5. Managed isolation is the documented top blocker: make `SANDBOX_BACKEND=managed` the real path, and independently validate CPU/memory/disk/time limits.
6. Durable execution: replace in-process `asyncio` tasks with a persistent job queue so a restart doesn't lose a running plan.
7. Secret vault for connector tokens and provider accounts (DPAPI is Windows-only; add a cross-platform backend).
8. Semantic memory: swap bag-of-words for a real embedding model or a local vector index.

**P2 — product polish**
9. Unify naming (Coagent / AnyWork / Tada-CoWork appear in the same repo).
10. Expand frontend tests beyond 2 of 23 components; add one Playwright E2E for the full plan→approve→artifact flow.
11. Rebuild MSI to 1.1.5; publish a signed build.
12. De-duplicate the audit hash computation and clean up mid-file imports.

---

## 14. Bottom line

This is a **serious, coherent, full-stack autonomous agent platform** — roughly 21,000 lines of first-party code across Python, TypeScript, and packaging, with real safety engineering (fail-closed production guard, risk-tiered approvals, content-triggered elevation, hash-chained redacted audit, workspace-scoped identity) that most AI-agent projects at this stage simply do not have.

Its weaknesses are the classic solo-project ones: **no CI, no type checking, no migrations, hand-rolled crypto, and naming that never settled**. The features to ship a GA product largely exist; the *infrastructure and evidence* to certify one do not. The repository's own audit documents agree with that verdict, which is itself a strong signal of engineering honesty.

For a demo, a portfolio piece, or an internal power-user tool: **ready today**.
For a multi-tenant SaaS: **3–6 focused months of infrastructure work away**, with managed isolation and durable execution as the critical path.

---

## 15. Remediation status (applied after this analysis)

### Fixed

| Finding | Change | Evidence |
|---|---|---|
| Hand-rolled RSA verification (unvetted crypto) | `core/identity.py` now verifies RS256 through **PyJWT + cryptography**, with the dependency-free verifier kept only as a fallback and hardened (full-modulus check, RFC 8017 minimum padding, odd-exponent check) | `test_hardening.py::test_dependency_free_rs256_fallback_matches_reference` |
| No clock-skew tolerance | Added `COAGENT_IDENTITY_LEEWAY_SECONDS` (default 30) to both HS256 and OIDC paths | `test_oidc_rejects_expired_and_wrong_audience` |
| JWKS key rotation stalled until TTL expiry | Unknown `kid` now forces one refresh; TTL configurable via `COAGENT_OIDC_JWKS_TTL_SECONDS` | `test_jwks_rotation_refreshes_on_unknown_kid` |
| Audit hash computed twice outside the lock | Single hashing pass inside the critical section | `test_audit_entries_are_single_hash_and_verify` |
| Audit chain could fork across processes (thread-only lock) | Appends now take an **OS-level file lock** (`msvcrt` / `fcntl`) and re-read the true tail hash | `test_two_logger_instances_do_not_fork_the_chain` |
| Tests polluted real runtime state | `conftest.py` sets `COAGENT_DATA_DIR` to `data/test-runtime/` before app import; suite no longer appends to the production audit chain or DB | Real chain unchanged at 19,323 entries during a full run |
| Loop-closure bug in eval tooling (B023) | Bound loop variable as a default argument | `ruff` clean |
| Duplicate `reason_step` definition shadowed the first (F811) | Removed the dead definition | `ruff` clean; provider tests pass |
| 354 lint violations, no lint config | Added `pyproject.toml` (ruff + pytest + mypy config); fixed **all** violations — 308 auto-fixed, 46 by hand | `ruff check` → *All checks passed* |
| No CI | `.github/workflows/ci.yml`: backend (ruff + pytest) and frontend (oxlint, `tsc -b`/vite build, vitest) | new |
| CORS hardcoded to localhost | `COAGENT_ALLOWED_ORIGINS` env allowlist (localhost defaults preserved) | `settings.ALLOWED_ORIGINS` |
| `/download/app.apk` could read outside the repo | Path resolved and confined to the repo root | `main.py` |
| Bridge token compared with `!=` | `hmac.compare_digest` | `bridge/agent.py` |
| Injection detection evadable by obfuscation | Unicode/whitespace normalisation, 15 patterns (was 10), fence markers neutralised so untrusted text cannot close its own block | `test_injection_detection_normalises_obfuscation`, `test_fenced_content_cannot_close_its_own_fence` |
| Memory "embeddings" were bag-of-words only | 256-dim signed-hash vector with sublinear TF + character trigrams; L2-normalised | 2 embedding tests |
| Mid-file imports (`main.py`, `connectors.py`, `approval_gate.py`, `audit.py`) | Moved to module top | `ruff` clean |
| Product naming drift in user-visible strings | `start.bat`, memory placeholder, export filenames now say AnyWork (env vars, DB names and storage keys intentionally unchanged for upgrade compatibility) | — |

**Verification:** `ruff check backend bridge desktop tools` → clean; `pytest backend/tests` → **120 passed** (was 102; +19 new regression tests), 4 failed / 2 errors remaining and all six are the pre-existing sandbox restrictions described in §10.1 (child-process spawning and system-temp creation are blocked in the analysis environment — unchanged from the baseline run). `tsc -b` passes; `vite build` and Vitest cannot complete here because Vite spawns a helper process (`spawn EPERM`), so frontend build/test remain CI-verified only.

### Still open (deliberately not attempted)

- **Alembic migrations** — needs a baseline against existing installs plus a decision on `create_all` coexistence; not a safe drive-by change.
- **Managed sandbox isolation, durable/distributed execution, cross-platform secret vault** — require external infrastructure, not repo edits.
- **`mypy` adoption** — config added, but running it over ~9.7k LOC will surface a backlog that should be burned down module by module.
- **MSI rebuild to 1.1.5** — `installer/build_msi.py` already targets 1.1.5; only the committed build artifacts lag.
- **Existing audit-chain fork** — the production chain (`data/audit/audit_chain.jsonl`) is genuinely broken at line 7775, consistent with two processes appending concurrently before this fix. The data is left intact; `verify_integrity()` reports it honestly rather than silently repairing it.
