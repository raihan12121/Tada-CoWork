# Architecture — Coagent

---

## 1. Guiding Principles

1. **Plan/Execute separation.** A planning pass produces a legible, editable task graph before autonomous action happens. This mirrors both Claude Cowork and ChatGPT Agent Mode, and is what makes long, multi-step runs auditable and steerable instead of an opaque loop.
2. **Sandbox-first.** The agent never acts directly on a user's live OS session. It acts inside an ephemeral, isolated compute environment; local access is always mediated through an explicit bridge.
3. **Least privilege by default.** Nothing is reachable unless explicitly granted for this session — no folder, no domain, no connector, no destructive action.
4. **Human-in-the-loop for irreversible actions.** Autonomy is the default for reversible, low-risk work; approval gates are the default for anything that can't be cleanly undone.
5. **Simple, composable core loop over a heavy framework.** The agent loop itself should be a small, well-tested piece of code (reason → act → observe), not a large opaque framework — this keeps it debuggable and auditable, per Anthropic's own published guidance on building agents.
6. **Everything is a tool call.** File I/O, code exec, browsing, and third-party actions are all exposed the same way (MCP-style tool schema), so the core loop doesn't need special-cased logic per capability.

---

## 2. High-Level Component Diagram

```
                     ┌───────────────────────────────────────────┐
                     │                  CLIENT                    │
                     │  Chat · Plan view · Activity feed ·        │
                     │  Artifact panel · Approval prompts ·       │
                     │  Schedule manager · Memory manager         │
                     └───────────────────┬─────────────────────────┘
                                          │ REST + WebSocket
                     ┌───────────────────▼─────────────────────────┐
                     │              ORCHESTRATOR                    │
                     │ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
                     │ │  Planner   │ │  Task Graph │ │  Scheduler  │ │
                     │ │  (LLM call)│ │  Engine     │ │  (cron)     │ │
                     │ └───────────┘ └────────────┘ └─────────────┘ │
                     │ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
                     │ │  Approval  │ │  Session    │ │  Memory     │ │
                     │ │  Gate Mgr  │ │  Manager    │ │  Manager    │ │
                     │ └───────────┘ └────────────┘ └─────────────┘ │
                     └───────────────────┬─────────────────────────┘
                                          │ provisions & streams
                     ┌───────────────────▼─────────────────────────┐
                     │            EXECUTION SANDBOX (per session)    │
                     │  ┌─────────────────────────────────────┐     │
                     │  │  Executor Loop (ReAct-style)         │     │
                     │  │  reason → select tool → act → observe │    │
                     │  └───────────────┬───────────────────────┘   │
                     │  ┌───────────────▼───────────────────────┐   │
                     │  │  Sub-agent pool (parallel workstreams) │   │
                     │  └───────────────┬───────────────────────┘   │
                     │  scoped FS · code runtime · egress allow-list │
                     └───────────────────┬─────────────────────────┘
                                          │ MCP tool calls
                     ┌───────────────────▼─────────────────────────┐
                     │              TOOL / CONNECTOR LAYER           │
                     │  file ops · code exec · doc gen (docx/xlsx/  │
                     │  pptx/pdf) · web search/fetch · browser      │
                     │  automation · SaaS connectors (Drive, Slack, │
                     │  Gmail, GitHub, generic REST/webhook)         │
                     └───────────────────┬─────────────────────────┘
                                          │ scoped, authenticated
                     ┌───────────────────▼─────────────────────────┐
                     │           LOCAL BRIDGE AGENT (optional)       │
                     │   desktop companion · scoped folder access ·  │
                     │   scoped browser control · token-authenticated│
                     └───────────────────────────────────────────────┘
```

---

## 3. The Execution Sandbox

- One ephemeral microVM/container per session (Firecracker-class isolation, or a managed equivalent).
- No default network egress. Egress is opened per-domain/per-connector only for tools enabled in that session's plan.
- Filesystem is namespaced to the session; destroyed (or archived to session storage) at session end.
- Resource envelope: CPU/mem/disk quotas, wall-clock timeout, max tool-call count, max spend — all enforced by the orchestrator, not self-reported by the agent.
- The sandbox can spawn **sub-agent workstreams** — independent executor loops for independent branches of the task graph — coordinated by the orchestrator's Task Graph Engine and merged back into a single output.

This mirrors Claude Cowork's isolated per-session cloud environment and ChatGPT Agent Mode's sandboxed virtual computer — both deliberately avoid running directly against the user's live machine.

---

## 4. The Agent Loop (inside the sandbox)

```
while not done:
    observation = current_state (plan step, prior tool outputs, user input)
    thought, action = executor_llm.reason(observation)
    if action.risk_level >= threshold:
        await approval_gate(action)          # blocks until user approves/denies
    result = tool_layer.call(action.tool, action.args)
    log(action, result)                       # immutable audit entry
    stream_to_client(action, result)          # live activity feed
    if planner_should_replan(result):
        plan = planner_llm.revise(plan, result)
    done = plan.is_complete()
```

Key properties:
- Every tool call is logged **before** execution starts and updated with the result — so a crash mid-call still leaves an audit trail.
- Replanning is explicit and visible, not silent — the client shows "plan updated because X."
- The loop treats all fetched external content (web pages, file contents, tool outputs) as **data**, never as instructions — this is the core prompt-injection defense (see rules.md).

---

## 5. Local Bridge Architecture

- A small desktop companion process (Electron/Tauri) that the user installs once.
- The user grants access to **specific folders** and, optionally, **browser control** via an explicit permission dialog — never a blanket "give Claude my computer" toggle.
- The bridge authenticates to the orchestrator with a short-lived, session-scoped token.
- When the sandbox needs a local resource, it sends a scoped request through the orchestrator to the bridge (never a direct sandbox→user's-machine connection); the bridge checks the request against granted scopes and either serves it or rejects it.
- If the bridge is offline, requests fail explicitly and are surfaced to the user — never silently skipped or substituted.
- All bridge traffic is encrypted; grants are revocable instantly and take effect on the next request.

This is the same shape as Claude Cowork's local bridge model: the heavy compute and reasoning stay in the isolated cloud sandbox, and only specific, user-approved local resources are exposed through a narrow, revocable channel.

---

## 6. Tool / Connector Layer (MCP)

- All tools — first-party (file ops, code exec, doc generation, web search/fetch, browser automation) and third-party (Drive, Slack, Gmail, GitHub, generic REST) — are exposed via a common protocol (Model Context Protocol) with a declared schema: name, description, input schema, required scopes, risk classification.
- New connectors are added by registering an MCP server; the orchestrator doesn't need code changes.
- Each connector declares its required OAuth scopes up front; the orchestrator enforces least-privilege — a connector never receives more access than the session's granted scopes.
- Secrets/tokens live in a server-side vault and are injected at call time; they are never placed into the LLM's context window.

---

## 7. Memory Architecture (summary — full detail in Memory.md)

- **Working memory**: the current plan + transcript, held in the session context window.
- **Task memory**: persisted per session in the relational store (plan history, artifacts, decisions) so a session can be resumed later.
- **Long-term memory**: opt-in, extracted facts/preferences stored in a hybrid store (structured facts in Postgres + semantic embeddings in a vector DB), retrieved via relevance at the start of planning for a new task, always visible/editable/deletable by the user.

---

## 8. Multi-Agent / Parallelism Model

- The **Task Graph Engine** identifies independent branches in the plan (no shared dependency) and assigns each to its own executor sub-loop within the sandbox pool.
- Sub-agents share the session's memory/context store but have their own tool-call budget and risk gate.
- A **merge step** (itself a planned step) reconciles sub-agent outputs into the final artifact(s) — this merge is always visible to the user, not silently auto-resolved when conflicts exist.
- This uses role-based orchestration only where it earns its complexity (e.g., "Researcher" sub-agents fanning out across sources); the default is the simpler single-loop model per the "simple, composable patterns" principle.

---

## 9. Observability

- Every request traced end-to-end (client → orchestrator → sandbox → tool → connector) via OpenTelemetry.
- Two views exposed to the user, mirroring ChatGPT Agent Mode's split: a **plan/outcome view** (what's happening, in plain language) and a **raw activity/reasoning log** (for power users/debugging).
- All tool calls, approvals, and plan revisions are stored in an append-only audit log.

---

## 10. Deployment Topology

- Orchestrator: stateless service, horizontally scaled behind a load balancer, backed by Postgres (durable state) + Temporal (workflow durability for long-running, resumable sessions) + Redis/Kafka (event streaming).
- Sandbox fleet: autoscaled pool of microVM workers (Firecracker or managed provider), provisioned on-demand per session, torn down on completion/timeout.
- Local bridge: distributed as a signed desktop installer, auto-updating, per-OS build (macOS/Windows/Linux).
- Multi-region for latency and data residency; sandbox region should match the user's/org's data residency requirements.
