# Technical Requirements Document (TRD)
## Coagent — v1.0

---

## 1. System Overview

Coagent is composed of five cooperating subsystems:

1. **Client** (web/desktop/mobile UI) — chat + plan view + activity feed + artifact viewer.
2. **Orchestrator service** — owns sessions, planning, task graph, approval gates, scheduling.
3. **Execution sandbox** — ephemeral, isolated compute environment where the agent actually runs code/tools.
4. **Local bridge agent** — thin desktop process that exposes explicitly-granted local folders/browser to the sandbox over an authenticated channel.
5. **Tool/connector layer** — MCP-compatible tool servers (file ops, code exec, web browse/search, document generation, third-party SaaS connectors).

```
┌────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│   Client    │◄────►│   Orchestrator (API)  │◄────►│  Execution Sandbox     │
│ (chat/plan/ │ WS/  │  - session mgmt       │ gRPC │  - agent loop          │
│  activity)  │ REST │  - planner/executor   │      │  - tool calling        │
└────────────┘      │  - approval gates      │      │  - code runtime        │
                     │  - scheduler           │      │  - filesystem (scoped) │
                     │  - memory store        │      └──────────┬─────────────┘
                     └───────────┬───────────┘                 │
                                 │                    ┌─────────▼─────────┐
                     ┌───────────▼───────────┐        │  Tool/Connector    │
                     │  Local Bridge Agent    │◄──────►│  Layer (MCP)       │
                     │  (desktop companion)   │  MCP   │  - docs/sheets/ppt │
                     │  - scoped FS access    │        │  - web search/fetch│
                     │  - browser control     │        │  - SaaS connectors │
                     └────────────────────────┘        └────────────────────┘
```

## 2. Functional Requirements

### 2.1 Session & Task Management
- FR-1: System shall create an isolated session per task/conversation with a unique session ID.
- FR-2: System shall persist session state (plan, transcript, artifacts, tool calls) for resumability.
- FR-3: System shall support pausing, resuming, and cancelling a running session at any point.
- FR-4: System shall support parallel sub-agent workstreams within one session, merged by the orchestrator.

### 2.2 Planning
- FR-5: On task intake, the orchestrator shall call a **planner** LLM pass that outputs a structured task graph (steps, dependencies, tool requirements, estimated risk level).
- FR-6: The plan shall be rendered to the user before/while execution begins and shall be editable (reorder, remove, add steps) before or during execution.
- FR-7: The planner shall be able to revise the plan mid-execution based on intermediate results (replanning loop).

### 2.3 Execution
- FR-8: Each plan step shall be executed by an **executor** loop (ReAct-style: reason → select tool → act → observe → continue) inside the sandbox.
- FR-9: The executor shall have access only to tools explicitly enabled for that session.
- FR-10: All tool calls and their outputs shall be logged immutably for audit and replay.
- FR-11: Execution shall support streaming partial results to the client in real time.

### 2.4 Sandbox
- FR-12: Every session shall run in a freshly provisioned, ephemeral container/microVM, destroyed at session end (or after a configurable idle timeout).
- FR-13: The sandbox shall have no default network access; egress shall be allow-listed per session based on the tools enabled.
- FR-14: The sandbox filesystem shall be namespaced per session; no cross-session data leakage.
- FR-15: Resource limits (CPU, memory, disk, wall-clock time, tool-call count) shall be enforced per session.

### 2.5 Local Bridge
- FR-16: A desktop companion app shall let the user grant access to specific local folders and/or browser control.
- FR-17: The bridge shall only relay requests for paths/domains explicitly granted; it shall reject any out-of-scope request.
- FR-18: If the bridge is offline/disconnected, sandbox requests requiring local resources shall fail gracefully and be surfaced to the user, not silently skipped.
- FR-19: All bridge traffic shall be authenticated (session-scoped token) and encrypted in transit.
- FR-20: The user shall be able to revoke bridge grants at any time, taking effect immediately.

### 2.6 Tools / Connectors
- FR-21: Tools shall be exposed via a standard protocol (MCP) so new tools/connectors can be added without core orchestrator changes.
- FR-22: Built-in tools (v1): file read/write, code execution (Python/Node/bash), document generation (docx/xlsx/pptx/pdf/md), web search, web fetch, browser automation (click/type/navigate/screenshot).
- FR-23: Third-party connectors (v1 target list): Google Drive, Slack, Gmail/Outlook, GitHub, a generic REST/webhook connector.
- FR-24: Each connector shall declare required scopes/permissions up front; the orchestrator shall enforce least-privilege grants.

### 2.7 Approval Gates
- FR-25: Every tool/action shall carry a **risk classification** (low / medium / high) set by policy (see rules.md).
- FR-26: High-risk actions (delete, overwrite without backup, send communication, spend money, publish externally) shall block execution pending explicit user approval.
- FR-27: The user shall be able to pre-approve a class of actions for a session ("approve all file writes in this folder") to reduce friction.

### 2.8 Memory
- FR-28: Session memory (working context) shall be maintained for the duration of a task.
- FR-29: Task memory (artifacts, decisions, plan history) shall persist and be retrievable if the user resumes later.
- FR-30: Long-term memory shall be opt-in, user-visible, editable, and deletable (see Memory.md).

### 2.9 Scheduling
- FR-31: Users shall be able to convert a completed task into a recurring scheduled job (cron-like: daily/weekly/monthly/custom).
- FR-32: Scheduled runs shall re-invoke planning (not just replay a script) so they adapt to changed inputs, while respecting the same approval gates.

### 2.10 Client / UX
- FR-33: The client shall show a live plan view, a step-by-step activity/reasoning log, and an artifact panel.
- FR-34: The client shall support "takeover mode" for browser steps requiring login/payment/CAPTCHA.
- FR-35: The client shall show usage/cost consumption against plan limits.

## 3. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Latency | Plan generation < 10s p95 for tasks under 20 steps |
| Availability | Orchestrator 99.9% uptime; sandbox provisioning < 5s p95 |
| Scalability | Support 50k+ concurrent sandboxed sessions (horizontal autoscaling) |
| Isolation | gVisor/microVM-grade isolation (e.g., Firecracker, Modal, E2B-class) — no shared kernel with host |
| Security | No sandbox shall reach another tenant's data or the host network directly |
| Auditability | 100% of tool calls logged, immutable, exportable |
| Data retention | Session sandbox destroyed at session end; transcripts/artifacts retained per user's data policy |
| Cost control | Hard per-session token/compute/time caps, configurable per plan tier |
| Observability | Structured tracing (OpenTelemetry) across orchestrator → sandbox → tools |

## 4. Technology Choices (Recommended Stack)

| Layer | Recommendation | Rationale |
|---|---|---|
| LLM | Claude (Sonnet/Opus class) via Anthropic API, or GPT-4.x/5-class via OpenAI API; abstract behind a model-agnostic interface | Need strong tool-use + long-context + reliable structured output |
| Agent loop / harness | Custom-built thin harness (ReAct-style loop) rather than a heavy framework, per Anthropic's own guidance: "simple, composable patterns, not complex frameworks" | Full control over plan/execute/approve boundaries; easier to debug and audit |
| Tool protocol | MCP (Model Context Protocol) | Emerging standard; lets both first-party and third-party tools plug in uniformly |
| Sandbox/compute | Firecracker microVMs or a managed provider (E2B, Modal, Cloudflare Sandboxes) | Fast cold starts, strong isolation, per-session ephemeral compute |
| Orchestrator backend | Python (FastAPI) or Node (NestJS) + a durable workflow engine (Temporal) for step/retry/replay semantics | Long-running, resumable, multi-step workflows need durable execution, not just in-memory loops |
| Task/session store | Postgres (relational: sessions, plans, approvals, audit log) | Strong consistency for audit trail |
| Memory store | Vector DB (pgvector/Qdrant) for semantic recall + relational store for structured facts | Hybrid retrieval: semantic + structured |
| Message/event bus | Redis Streams or Kafka | Real-time step streaming to client, decoupled connector calls |
| Local bridge | Electron/Tauri desktop companion, gRPC/WebSocket to orchestrator | Cross-platform, small footprint, secure channel |
| Client | React/Next.js web app; same design system for desktop (Tauri) and mobile (React Native) | Shared component library across surfaces |
| Auth | OAuth2/OIDC; per-connector token vault (e.g., HashiCorp Vault or cloud KMS-backed secrets) | Secrets never touch the LLM context directly |
| Observability | OpenTelemetry + Grafana/Datadog | Full trace from user request to tool call to output |

## 5. Data Model (core entities)

- `User`, `Organization`, `Plan/Tier`
- `Session` (id, user, status, created_at, sandbox_ref, cost_used)
- `Plan` (session_id, steps[], version, status)
- `Step` (plan_id, description, tool, risk_level, status, dependencies[])
- `ToolCall` (step_id, tool, input, output, timestamp, cost)
- `Approval` (step_id, requested_at, resolved_at, decision, actor)
- `Artifact` (session_id, type, path/url, created_at)
- `Connector` (org/user, type, scopes[], token_ref, status)
- `MemoryItem` (user/org, type[fact/preference/summary], content, embedding, source_session, created_at, ttl/expiry)
- `Schedule` (task_template, cron, owner, next_run_at, last_result)

## 6. APIs (representative)

```
POST   /v1/sessions                    Create session, submit task
GET    /v1/sessions/{id}                Get status/plan/transcript
POST   /v1/sessions/{id}/plan/approve   Approve/edit plan
POST   /v1/sessions/{id}/pause
POST   /v1/sessions/{id}/resume
POST   /v1/sessions/{id}/cancel
POST   /v1/sessions/{id}/approvals/{approval_id}  Approve/deny a gated action
GET    /v1/sessions/{id}/artifacts
POST   /v1/connectors                  Add connector / grant scopes
DELETE /v1/connectors/{id}             Revoke connector
POST   /v1/schedules                   Create recurring task
GET    /v1/memory                      List memory items
DELETE /v1/memory/{id}                 Delete memory item
WS     /v1/sessions/{id}/stream        Live plan + activity + token stream
```

## 7. Security Requirements
See `rules.md` for the full policy; TRD-level requirements:
- All inter-service traffic authenticated + encrypted (mTLS internally, TLS externally).
- Sandbox egress default-deny, allow-list per enabled tool/connector.
- Secrets (API keys, OAuth tokens) never placed in LLM context; injected server-side at tool-call time.
- Prompt-injection mitigation: content fetched from the web/files is treated as untrusted data, never as instructions (see rules.md §Prompt Injection).
- Full audit log, tamper-evident (append-only / hash-chained).

## 8. Testing Requirements
- Unit tests per tool adapter (contract tests against MCP schema).
- Integration tests: full plan→execute→approve→artifact pipeline in a mocked sandbox.
- Adversarial tests: prompt-injection corpora, malicious file/webpage fixtures, permission-escalation attempts.
- Load tests: concurrent session provisioning, sandbox cold-start under load.
- Human eval: task-completion benchmarks across the persona set in PRD.md §5.
