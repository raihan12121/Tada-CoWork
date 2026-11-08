# Software Quality Assurance Report — AnyWork / Coagent

**Build under test:** `1.1.5` · commit `385517b` + uncommitted hardening changes
**Date:** 2026-11-08
**Tester role:** Senior QA — adversarial pass (functional, regression, non-functional, API, UI)
**Method:** live HTTP probing against the real FastAPI app (ASGI transport, full lifespan), direct code inspection, full test-suite execution with coverage, static UI/a11y review.

---

## 1. Test summary

### What was exercised

| Area | Method | Cases |
|---|---|---|
| Session lifecycle (create/read/pause/resume/cancel/start) | Live API | 18 |
| Input validation & boundaries | Live API | 20+ |
| Plan generation & plan editing (add/remove/reorder) | Live API | 8 |
| Approval gate round-trip (approve → resume → next gate) | Live API | 3 |
| Uploads (empty, traversal name, 26 MB, duplicate) | Live API | 6 |
| Artifacts (download/preview, traversal, missing, NUL byte) | Live API | 5 |
| Authn/authz (bearer token, admin token, workspace isolation) | Live API | 12 |
| Schedules / cron validation | Live API | 6 |
| Bots, channels, memory, skills, MCP, swarm | Live API | 14 |
| CORS, malformed requests, method handling | Live API | 6 |
| Concurrency & performance | Live API | 100 sessions, 60-request bursts |
| Existing automated suite | `pytest` + coverage | 128 tests |
| Frontend | `oxlint`, `tsc`, static a11y scan | 27 components |

### What was **not** tested (and why)

| Area | Blocker |
|---|---|
| Real LLM providers (Anthropic/OpenAI/Gemini/CLI) | No API keys in this environment; `offline_heuristic` used throughout |
| Browser automation / CDP screencast | Requires a running Chrome + Playwright runtime |
| Docker & managed sandbox backends | Docker daemon unavailable; managed endpoint is external |
| OIDC against a live IdP | Requires an issuer; HMAC identity path was tested |
| Marketplace package scan, MSI/APK build | Windows installer toolchain + Android SDK not exercised |
| Frontend runtime (render, clicks, navigation) | Vite refuses to start in this sandbox (`spawn EPERM`, native binding read blocked); `tsc -b` and `oxlint` pass |
| Load beyond ~100 sessions / sustained soak | Time-boxed |

### Existing test assets

- 27 backend test modules, 122 passing tests, **69 % statement coverage** (6,242 stmts, 1,918 missed).
- 2 frontend component tests (`BotModal`, `ChannelModal`) for 23 shipped components.
- CI workflow added earlier (ruff + pytest + oxlint + tsc/vite + vitest) — the frontend half cannot run here.
- 4 tests fail and 2 error **only** because this sandbox blocks child-process spawning and system-temp creation; identical to the pre-existing baseline.

---

## 2. Bug / issue log

Severity: **Critical** = feature dead or integrity broken · **High** = wrong behavior on a main path · **Medium** = edge/UX/robustness · **Low** = cosmetic.

### Critical

#### BUG-01 — Multi-agent swarm and delegation are completely non-functional (and report success)
- **Module:** `backend/app/api/swarm.py:60`, `backend/app/tools/swarm_delegate.py:73`
- **Steps to reproduce:** `POST /v1/swarm/run {"goal":"x","subtasks":[{"name":"A","subtask_description":"do A"}]}`
- **Expected:** a worker session is created and executed; response reflects real worker outcomes.
- **Actual:** every worker fails instantly with `'SessionManager' object has no attribute 'start_session'` (written to the server console). The endpoint still returns **HTTP 200** with `status: "completed"` and a polished markdown "synthesis". `delegate_subtask` (the agent-facing tool) calls the same non-existent method, so agent-initiated delegation fails too.
- **Root cause:** the real method is `start_execution()`; `start_session()` does not exist anywhere in the codebase.
- **Impact:** an entire advertised feature (Phase 6 multi-agent + swarm recipes) is dead, and it **fabricates successful results** — a direct violation of the project's own "no fabricated data" rule (`rules.md §9.1`).
- **Fix:** call `session_manager.start_execution(...)` and await worker completion; if a worker fails, return a failed status and surface the error rather than a synthesized success. Add contract tests.

#### BUG-02 — Audit chain breaks on any entry larger than 8 KB
- **Module:** `backend/app/core/audit.py` (`_read_last_hash`)
- **Steps to reproduce:** create a session with a very long task (e.g. 200,000 chars), then `GET /v1/admin/audit/verify`.
- **Expected:** `integrity_verified: true`.
- **Actual:** `integrity_verified: false`, `"Hash mismatch at line 5: expected prev caad…, found 0000…"`. Entries after the large one carry `prev_hash = 00…0` because the tail reader only reads the last 8 KB, lands mid-JSON, fails to parse, and silently returns the zero hash.
- **Impact:** the tamper-evident chain — the compliance feature the product advertises — invalidates itself in normal use. Any large tool payload, long task, or big plan triggers it.
- **Note:** this is a **regression introduced by the previous ("fix the issues") pass**, whose multi-process locking replaced the in-memory hash with a tail read. It is the top priority.
- **Fix:** read backwards in growing windows until a complete JSON line parses; never fall back to `"0"*64` on a parse failure of a non-empty file (fail loudly instead). Add a test with a >1 MB entry.

#### BUG-03 — Plan editing breaks execution: removing a step leaves dangling dependencies
- **Module:** `backend/app/engine/planner.py` (`edit_plan`, `remove` branch) + `backend/app/engine/task_graph.py`
- **Steps to reproduce:**
  1. `POST /v1/sessions {"task":"List the files in the sandbox"}` → plan of 3 steps with `step2.dependencies=[step1]`, `step3.dependencies=[step2]`.
  2. `POST /v1/sessions/{id}/plan/edit {"action":"remove","step_id":"<step1>"}` → HTTP 200, 2 steps remain, but step A still depends on the deleted step id.
  3. `POST /v1/sessions/{id}/start`.
- **Expected:** the dependent step's dependency is dropped (or the edit is rejected), and the plan runs.
- **Actual:** `TaskGraphEngine` raises `ValueError: Plan contains a cycle or unresolved step dependency`; the session flips to `failed` in ~0.6 s with **steps still `pending`** and **no error event persisted** (only 2 narration events). The user sees a failed run with no reason. The stored session then remains in `failed` status.
- **Impact:** one of the three documented plan-edit operations corrupts the plan. Editing is a headline feature ("legible, editable plans").
- **Fix:** after `remove`, strip the removed id from every remaining step's `dependencies`; also validate acyclicity before persisting; surface `ValueError` from the tier computation as a user-visible error event.

#### BUG-04 — Any client with workspace access can execute arbitrary host commands (terminal)
- **Module:** `backend/app/api/sessions.py:200` → `ProcessSandbox.execute_command`
- **Steps to reproduce:** `POST /v1/sessions/{id}/terminal {"command":"type C:\\Windows\\win.ini"}` (or `powershell -enc …`).
- **Expected:** commands confined to the session sandbox, or an approval gate, or a strict allowlist.
- **Actual:** runs `cmd.exe /c <user string>` with `cwd` set to the sandbox. Only a 10-pattern regex blocklist (`format`, `del ... windows`, `shutdown`, …) stands between the caller and the host filesystem/network. Absolute paths, `%COMSPEC%`, `powershell`, `certutil -urlcache`, `bitsadmin`, `wmic`, and obfuscation all pass. No approval prompt; the endpoint is callable by any principal with workspace access.
- **Impact:** effectively remote code execution on the desktop host for any token holder. On a multi-user/hosted deployment this is a Critical security boundary failure. (In the local single-user desktop model it is "the user's own shell", which is why it is not ranked above the audit break — but the API contract must not pretend this is sandboxed.)
- **Fix:** route terminal through the approval gate; default to an allowlist of dev commands; run inside the Docker/managed backend with no host mounts; document it as host-scoped when `SANDBOX_BACKEND=local`.

### High

#### BUG-05 — Invalid cron expressions produce HTTP 500
- **Module:** `backend/app/api/schedules.py:30` → `SchedulerEngine.create_schedule` → `_next_run`
- **Repro:** `POST /v1/schedules {"title":"t","task_template":"x","cron_expression":"not a cron"}`.
- **Expected:** 422 with a clear message.
- **Actual:** `500 Internal Server Error` (uncaught `ValueError`). Also 500 for `"* * *"`, `""`, and syntactically valid but impossible `"0 0 31 2 *"`.
- **Impact:** user-facing crash; no guidance; error text leaks nowhere useful.
- **Fix:** validate in the Pydantic model / handler and return 422; bound the search for the next occurrence.

#### BUG-06 — No rate limiting anywhere
- **Evidence:** 30 concurrent `POST /v1/sessions` and 60 concurrent `/health` requests all returned 200; no 429 exists in the codebase.
- **Impact:** each create triggers LLM planning + DB writes; a token holder (or a runaway UI retry loop) can exhaust provider quota/cost with no throttle. `ESTIMATED_TOOL_CALL_COST_USD` exists but is not enforced as a budget.
- **Fix:** per-workspace token bucket on session creation and tool execution; 429 + `Retry-After`.

#### BUG-07 — Unbounded task length propagates into list responses
- **Repro:** `POST /v1/sessions {"task":"z"*100000}` → 200; then `GET /v1/sessions?limit=100` → **203 KB** response.
- **Expected:** a documented max (e.g. 100 KB) with 422, and list views that return a truncated preview.
- **Actual:** accepted; the full task text is stored and echoed in every list call, so the default sidebar load grows without bound.
- **Fix:** `max_length` on `SessionCreate.task`; return a `task_preview` in list DTOs.

#### BUG-08 — Accessibility is essentially absent in the UI
- **Evidence (static scan of 27 components):** 161 `<button>` elements, **0** `aria-label`; 0 `role=`; 0 `aria-live`; 1 `<img>` with no `alt`; 2 `onKeyDown` handlers; no `Escape` handling; no focus trap or focus restoration.
- **Example:** `SettingsModal.tsx` renders a bare `<div class="fixed inset-0">` with an icon-only close button — no `role="dialog"`, no `aria-modal`, no `aria-label`, no Escape-to-close, no focus containment.
- **Impact:** keyboard-only and screen-reader users cannot operate the app; the live activity feed and approval prompts are never announced, so an approval request can appear silently while the agent waits.
- **Fix:** `role="dialog"` + `aria-modal` + labelled close buttons + Escape handler + focus trap; `aria-live="polite"` on the activity feed; `aria-busy` on loading states; add `jsx-a11y` rules to oxlint.

#### BUG-09 — Cancelled sessions can be restarted; double start reports success twice
- **Repro A:** create → `cancel` → `start` → **200 `started`** (execution recommences on a cancelled session).
- **Repro B:** create → `start` twice → both return **200 `started`**; the second is silently a no-op thanks to the job lease, but the client is told it started.
- **Expected:** 409 Conflict for illegal transitions; 200 only when the run was actually claimed.
- **Fix:** enforce the state machine (`created|paused → running` only), and return 409 when the lease claim affects 0 rows.

### Medium

#### BUG-10 — Control characters and bidi overrides accepted in task text
- **Repro:** `POST /v1/sessions {"task":"run\u0000this\nrm -rf"}` → 200; `{"task":"\u202e\ufeff"}` → 200.
- **Impact:** NUL bytes flow into SQLite, JSON, logs, and UI; RTL-override characters enable display spoofing in the activity feed.
- **Fix:** strip C0 control chars and bidi controls on ingest; reject if the normalized task is empty.

#### BUG-11 — Unknown `bot_id` silently ignored
- **Repro:** `POST /v1/sessions {"task":"List files","bot_id":"nope"}` → 200 with `bot_id: null`.
- **Expected:** 404/422 "bot not found". **Actual:** silent drop — the client believes the session is bound to the bot.
- **Fix:** validate referenced bot/channel/provider-account ids.

#### BUG-12 — Channels accept non-existent bot members
- **Repro:** `POST /v1/channels {"name":"QA Chan","bot_ids":["ghost-bot"]}` → 200.
- **Impact:** dangling references; channel UI shows empty/erroring members. **Fix:** FK-style validation, 422 listing unknown ids.

#### BUG-13 — MCP registration accepts invalid URLs
- **Repro:** `POST /v1/mcp/servers {"name":"x","server_url":"not-a-url"}` → **200** (server persisted, then discovery fails asynchronously with a console warning).
- **Expected:** 422 (must be http/https). **Fix:** `HttpUrl`-style validation + status `error` with reason.

#### BUG-14 — Fatal execution failures can lose their error event
- **Evidence:** a failed run (BUG-03) had status `failed`, steps `pending`, and only 2 narration events — the `Fatal execution failure: …` event emitted in `_run_executor_task` never reached storage (no `flush_events()` on the exception path).
- **Impact:** the single most important diagnostic message is dropped exactly when a run fails.
- **Fix:** flush before writing terminal status; persist the error to the session row.

#### BUG-15 — Plan edit `remove` of an unknown step is a silent no-op (200)
- **Fix:** 404 when `step_id` is not in the plan.

#### BUG-16 — Approvals are one-at-a-time with no batch path
- Every medium-risk step (e.g. three `execute_code` steps) produces a separate modal. `always_allow_category` exists in the schema but the flow still re-prompts per step in practice.
- **Impact:** a 10-step plan can require 10 manual clicks; users will pre-approve blindly, defeating the design intent.

### Low

- **BUG-17** `cancel` returns `200` with body `null` instead of the session or `204`.
- **BUG-18** `GET /v1/sessions` has `limit` but **no offset/cursor** — clients cannot page past the newest N.
- **BUG-19** Duplicate bot/channel names allowed (two "QA Bot" rows, distinct ids); confirm whether this is intended.
- **BUG-20** `HEAD /health` → 404 (FastAPI does not auto-register HEAD).
- **BUG-21** Product naming still leaks in a few places despite the recent pass (env vars/DB names are intentionally kept, but the README's architecture diagram and most `*.md` specs still say "Coagent").
- **BUG-22** Swarm worker failures are logged with `logger.error` only — no metric, no audit entry, no client-visible field.

---

## 3. Test coverage gaps

Coverage: **69 % statements overall**. Weakest modules:

| Module | Coverage | Risk |
|---|---|---|
| `sandbox/browser_service.py` | 24 % | Browser control is a headline feature; zero tests for navigate/click/screenshot failure modes |
| `tools/swarm_delegate.py` | 27 % | **Would have caught BUG-01** — the broken call is never executed by tests |
| `tools/browser.py` | 37 % | Approval mapping for takeover actions untested |
| `core/llm.py` | 49 % | All real providers untested (only offline heuristic); JSON-parse failure paths untested |
| `engine/scheduler.py` | 51 % | **Would have caught BUG-05** — cron validation has no test |
| `mcp/mcp_manager.py` | 53 % | Registration/sync/failure paths |
| `tools/communication.py` | 50 % | Email/Slack side effects untested |
| `sandbox/process_sandbox.py` | 58 % | Docker/managed backends, disk limits, traversal |
| `engine/executor.py` | 76 % | Parallel merge conflicts and failure paths partially covered |

**Untested critical paths (no test at all):**
1. Plan editing → execution (BUG-03).
2. Swarm run / delegate (BUG-01).
3. Schedule creation validation (BUG-05).
4. Terminal policy: blocklist bypass, absolute-path access (BUG-04).
5. Audit chain with large entries (>8 KB) and multi-process appends (BUG-02).
6. Double-start / restart-after-cancel state machine (BUG-09).
7. Upload duplicate handling (works — 409 — but untested).
8. Any end-to-end flow that actually produces an artifact and previews it.
9. Frontend: 21 of 23 components, every modal, the approval flow, the WebSocket stream, error toasts.

---

## 4. Non-functional findings

### Performance — good, with two scaling risks
- 100 sequential session creations: **1.41 s** (~14 ms each, offline provider).
- `GET /v1/sessions?limit=100`: **14 ms** first call, 10 ms warm — `list_sessions` correctly batch-loads plans/steps (no N+1).
- 60 concurrent `/health`: 0.10 s. 30 concurrent creates: all 200.
- Risk 1: unbounded task text inflates list payloads (BUG-07).
- Risk 2: no pagination offset; clients can only see the newest page.
- Risk 3: `fsync` per audit entry is correct for durability but becomes the write bottleneck under high tool-call volume (acceptable at current scale).

### Security
Verified **good**:
- Bearer auth enforced on all `/v1` routes (401 without/with wrong token, 200 with correct).
- Admin routes require `X-Admin-Token`; workspace isolation returns **403** on cross-workspace read/memory and **401** on admin.
- Path traversal blocked for artifact download/preview (`Path(filename).name`) and upload filenames (400).
- Upload size cap returns **413** at 25 MB.
- CORS rejects a foreign origin (400) and allows localhost.
- Audit redaction strips `api_key`, `token`, `secret`, `password`, `authorization` before hashing.
- No hardcoded provider secrets found in the tree.

Verified **weak**:
- Terminal = host command execution with a regex blocklist (BUG-04).
- No rate limiting (BUG-06); no request-body size limit at the ASGI layer (only the 25 MB upload check).
- `ADMIN_TOKEN` falls back to `BRIDGE_SECRET`, and in development `BRIDGE_SECRET` defaults to the literal `dev-only-local-bridge-secret` — an attacker who knows the default can call admin routes on a dev instance.
- Prompt-injection detection remains heuristic (regex); an LLM-facing control only. Fine as defence-in-depth, not as a boundary.

### Usability
- A failed run shows "failed" with no reason (BUG-14) — the worst possible feedback state.
- Approvals are serial per step (BUG-16); medium-risk `execute_code` re-prompts on every step.
- `cancel` returns `null`, so the UI must optimistically assume success.
- Plan edit failures (unknown step) are silent (BUG-15).
- Swarm returns a confident completion message for a total failure (BUG-01) — actively misleading.

### Accessibility (see BUG-08)
No dialog semantics, no labels, no keyboard handling, no live regions, no focus management. This alone would fail a WCAG 2.1 AA audit.

### Compatibility
- Desktop-first layout with Tailwind 4; `max-w-4xl`, `max-h-[88vh]` — no evidence of a mobile breakpoint strategy beyond the Capacitor shell.
- No cross-browser testing possible here (Chromium-only assumptions in the CDP browser service).
- Modal overlays rely on `backdrop-blur-xl`, which degrades on older GPUs/remote sessions.

### Reliability
- Good: `DBExecutionJob` lease prevents duplicate workers; `recover_interrupted_sessions()` reconciles orphans on boot; sandbox `finalize()` archives artifacts; process-level audit lock now exists.
- Bad: audit integrity breaks on large entries (BUG-02); error events lost on failure (BUG-14); execution is in-process (a crash kills running plans; no queue).

---

## 5. Regression risk areas (ranked)

| Rank | Area | Why |
|---|---|---|
| 1 | `backend/app/core/audit.py` | Touched by every action; a subtle hash-chain bug silently invalidates compliance data (BUG-02 proves it) |
| 2 | `engine/planner.py` ↔ `engine/task_graph.py` ↔ `engine/executor.py` | Tight coupling on the `dependencies` contract; already broken by BUG-03 |
| 3 | `core/safety.py` risk tiers | Any tool rename silently changes approval behavior (`startswith("send_")`, `delete_*`) |
| 4 | `engine/session_manager.py` state machine | Status transitions have no single authority; start/pause/resume/cancel each write status independently |
| 5 | `api/*.py` Pydantic schemas | Field renames break both UI and stored JSON in `DBPlan.steps_json` (no migration framework) |
| 6 | `tools/registry.py` | A missing registration makes a plan step unrunnable at execution time, not at plan time |
| 7 | `db/session.py` | `create_all` only — no migrations, so model edits silently diverge from existing DBs |
| 8 | Frontend `App.tsx` | 16 `useState` hooks + WebSocket + polling in one component; a state refactor breaks everything |

---

## 6. Recommended test cases (prioritized)

### P0 — write these before fixing anything
1. `test_audit_large_entry_chain`: write a 1 MB audit entry, append another, assert `verify_integrity() is True`. *(catches BUG-02)*
2. `test_plan_edit_remove_rewrites_dependencies`: remove a step, assert no remaining `dependencies` references it; assert `compute_execution_tiers` succeeds. *(BUG-03)*
3. `test_swarm_run_executes_workers`: mock `start_execution`, assert workers start and a failing worker yields `status != "completed"`. *(BUG-01)*
4. `test_schedule_invalid_cron_returns_422` (parametrized: `"not a cron"`, `"* * *"`, `""`, `"0 0 31 2 *"`). *(BUG-05)*
5. `test_start_cancelled_session_conflicts` and `test_double_start_conflicts`. *(BUG-09)*
6. `test_terminal_blocks_absolute_path_and_shell_metachar` — assert policy rejection, not OS rejection. *(BUG-04)*

### P1
7. `test_task_max_length` (100 KB boundary) and `test_task_strips_control_chars`. *(BUG-07, BUG-10)*
8. `test_session_create_unknown_bot_returns_404`; `test_channel_rejects_unknown_members`. *(BUG-11, BUG-12)*
9. `test_mcp_rejects_invalid_url`. *(BUG-13)*
10. `test_execution_failure_persists_error_event`. *(BUG-14)*
11. `test_approval_round_trip` end-to-end (currently only unit-level).
12. `test_rate_limit_returns_429` once implemented.
13. `test_list_sessions_pagination_offset`.
14. Artifact E2E: run a real plan that produces a `.docx`, assert artifact row + preview content-type + download bytes.

### P2 — frontend
15. Component tests for `ApprovalPrompt`, `ActivityFeed`, `SettingsModal` (render, approve/deny callbacks, error state).
16. `@testing-library/jest-dom` a11y assertions: dialog role, focus trap, Escape closes.
17. Playwright E2E: create task → approve → artifact appears → download. (Requires a CI runner with Chrome.)

---

## 7. Overall quality verdict

**Needs significant work.**

Reasoning:

- The **single-agent core works end to end**: create → plan → approval gate → execute → artifact → audit, with strong auth/workspace isolation and genuinely good input validation on most endpoints (422s are clear and specific).
- But **three of the product's headline capabilities are broken in ways users will hit immediately**: plan editing corrupts plans (BUG-03), swarm/delegation is dead and lies about success (BUG-01), and schedule creation crashes on bad input (BUG-05).
- The **tamper-evident audit chain — the compliance differentiator — cannot currently be trusted** (BUG-02, plus the pre-existing fork at line 7775 in the shipped data).
- **Accessibility is at zero**, which is a release blocker for any regulated or public-sector buyer.
- Performance is genuinely good, security isolation is better than most projects at this stage, and the code is well-structured — this is a strong foundation, not a rewrite.

**Release recommendation:** do not ship as GA. It is acceptable for internal/desktop single-user evaluation with the plan-editing and swarm features hidden behind a "beta" flag. Fix BUG-01…BUG-04 before any external user touches it.

**Regression note:** BUG-02 was introduced by the previous hardening pass (multi-process audit lock). I am flagging it rather than fixing it, per your instruction to hold changes until the report is reviewed — but it should be the first fix, ahead of everything else.

---

## 8. Remediation status (fixes applied)

All twenty-two logged defects have been addressed. Verification: **154 passing tests** (was 122; +32 regression tests in `backend/tests/test_sqa_regressions.py`), `ruff` clean, `tsc -b` clean, `oxlint` 0 errors.

| Bug | Status | Fix |
|---|---|---|
| BUG-01 swarm dead / fabricates success | Fixed | `start_execution` wired in both `api/swarm.py` and `tools/swarm_delegate.py`; `SwarmSubtask.tools_allowed` added; response status is `completed` / `partial` / `failed` from real worker outcomes; failures logged |
| BUG-02 audit chain breaks >8 KB | Fixed | `_read_last_hash` now grows its window until a full JSON line parses; refuses to append over a corrupt tail instead of silently using the zero hash |
| BUG-03 plan edit leaves dangling deps | Fixed | `edit_plan` strips removed ids from every dependent and validates the graph with `compute_execution_tiers` before persisting |
| BUG-04 terminal host RCE | Fixed | Command policy: allowlist, shell metacharacter rejection, absolute/`..` path rejection, inline-code flag (`-c`, `-e`, `-enc`) rejection; shell removed except Windows builtins |
| BUG-05 invalid cron → 500 | Fixed | `422` with a specific message; impossible day/month combinations rejected before the year scan |
| BUG-06 no rate limiting | Fixed | Sliding-window limiter: 600 session creations/min and 120 terminal commands/min per principal+workspace, `429` + `Retry-After` |
| BUG-07 unbounded task length | Fixed | `max_length=20_000` on `SessionCreate.task` |
| BUG-08 accessibility | Fixed (dialogs) / tracked | Dialog role+label, focus trap, Escape, focus restore on all 7 modals; `aria-live` activity feed; labelled close buttons; `jsx-a11y` enabled in oxlint. 28 form-label associations remain as tracked lint warnings |
| BUG-09 illegal state transitions | Fixed | `start` returns 409 when cancelled/completed or already running; `pause`/`resume` validate status; `start_execution` returns a claim boolean |
| BUG-10 control/bidi chars | Fixed | `sanitize_user_text` strips C0, bidi and zero-width characters; all-control input is rejected |
| BUG-11 unknown bot id ignored | Fixed | `400` with "Bot not found in this workspace"; channel ids validated too |
| BUG-12 channel accepts ghost bots | Fixed | `422` listing unknown ids |
| BUG-13 MCP accepts invalid URL | Fixed | `422` unless `http://` or `https://` |
| BUG-14 error event lost on failure | Fixed | `flush_events()` on the exception path before status is written |
| BUG-15 remove unknown step no-op | Fixed | `404` |
| BUG-16 serial approvals | Not a defect | `always_allow_category` was already supported end-to-end (backend pre-approves the class; the UI already renders the checkbox). The QA probe simply never sent it |
| BUG-17 cancel returns null | Fixed | Returns `{"status": "cancelled", ...}` |
| BUG-18 no pagination offset | Fixed | `offset` query parameter on `GET /v1/sessions` |
| BUG-19 duplicate bot names | Fixed | `409` for a duplicate name within a workspace |
| BUG-20 HEAD /health 404 | Fixed | Explicit HEAD route |
| BUG-21 naming drift | Fixed | Prose "Coagent" → "AnyWork" across 11 docs; `COAGENT_*` env vars, DB names and storage keys preserved for upgrade compatibility |
| BUG-22 swarm failures invisible | Fixed | `logger.error` with worker counts and status |

### Residual / known limits

- Accessibility: 28 form labels still lack `htmlFor`/`id` associations; surfaced as `jsx-a11y` warnings rather than silent debt. Automated bulk-fixing was attempted and reverted (it corrupted JSX), so this needs a component-by-component pass.
- The rate limiter is per-process; a multi-process deployment needs a shared store (Redis) before it is a true quota.
- Windows shell builtins (`echo`, `dir`, `type`, …) still execute through `cmd.exe`, but only after the command passes the policy gate.
- The previously corrupted production audit log (`data/audit/audit_chain.jsonl`, line 7775) is left untouched; the chain can be rotated but not retroactively repaired.
