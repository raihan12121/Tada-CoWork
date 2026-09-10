# Phases — Delivery Plan for Coagent

A staged plan that de-risks the hardest problems (sandboxing, approval gates, local bridge) early, rather than building UI polish first.

---

## Phase 0 — Foundations (Weeks 1–3)
**Goal:** Prove the core loop works end-to-end on a single, low-risk tool, with no local access yet.

- Stand up orchestrator skeleton (session create/get, WebSocket streaming).
- Implement the executor loop (reason → act → observe) against one model provider.
- Implement one tool: sandboxed code execution (Python) with strict resource limits.
- Implement plan generation (planner LLM call → structured task graph) and render it in a minimal client.
- Basic audit logging (append-only) of every tool call.
- **Exit criteria:** a user can submit a task, see a plan, watch it execute in a sandbox, and download a resulting file — no local files, no browsing, no approvals yet.

## Phase 1 — Sandbox & Safety Core (Weeks 4–7)
**Goal:** Get the isolation and approval-gate model production-grade before adding surface area.

- Move code execution to real microVM/container isolation (Firecracker or managed provider) with egress default-deny.
- Implement risk-tier classification and the approval-gate manager (blocking flow, client approval UI).
- Implement resource ceilings (CPU/mem/disk/time/tool-call/spend) enforced server-side.
- Implement prompt-injection defenses: untrusted-content tagging, instruction-override detection, high-risk reclassification for content-triggered actions.
- Implement pause/resume/cancel.
- **Exit criteria:** the sandbox is genuinely isolated (pen-test pass), and any destructive/irreversible action reliably blocks for approval, including adversarial prompt-injection test cases.

## Phase 2 — File & Document Tools (Weeks 6–10, overlaps Phase 1)
**Goal:** Make the agent useful for real knowledge-work deliverables.

- File read/write/create tools scoped to the sandbox filesystem.
- Document generation tools: docx, xlsx, pptx, pdf, markdown (via dedicated generation skills/libraries).
- Artifact panel in the client (preview/download).
- Reversible-delete / versioned-overwrite semantics (rules.md §4).
- **Exit criteria:** a user can ask for "turn these notes into a formatted report" or "build me a spreadsheet from this data" and get a correct, downloadable artifact with zero manual cleanup for well-scoped tasks.

## Phase 3 — Local Bridge (Weeks 9–13)
**Goal:** Let the agent work with the user's actual files and browser, safely.

- Build the desktop companion app (Electron/Tauri) with folder-grant and browser-grant UX.
- Implement the scoped-request protocol between sandbox ↔ orchestrator ↔ bridge.
- Implement out-of-scope request rejection + logging, offline-bridge graceful failure.
- Implement browser automation tool (navigate/click/type/screenshot) routed through the bridge, with "takeover mode" for logins/payments/CAPTCHAs.
- **Exit criteria:** a user can grant a specific Downloads folder and have the agent reorganize it end-to-end; a user can have the agent browse the live web through their own browser session for a research task, handing back control at a login page.

## Phase 4 — Web Research & Connector Layer (Weeks 12–16, overlaps Phase 3)
**Goal:** Multi-source research and third-party tool integration via MCP.

- Web search + web fetch tools (cloud-side, not requiring the bridge, for non-authenticated research).
- MCP server framework: schema validation, scope declaration, risk classification per connector.
- Ship first-party connectors: Google Drive, Slack, Gmail/Outlook, GitHub, generic REST/webhook.
- Connector review pipeline (automated schema checks + manual review for high-risk scopes).
- **Exit criteria:** a user can ask "research 10 competitors and put results in a Google Doc" and have the agent search, synthesize, and write to a connected Drive doc, with all connector scopes correctly enforced.

## Phase 5 — Memory (Weeks 15–19, overlaps Phase 4)
**Goal:** Make the agent get more useful across sessions.

- Implement task memory (resumable sessions: plan history, artifacts, decisions).
- Implement long-term memory extraction (facts/preferences), storage (structured + vector), and retrieval at planning time.
- Build the user-facing memory manager (view/edit/delete memory items).
- Enforce strict tenant isolation of memory across orgs/workspaces.
- **Exit criteria:** a returning user's second task in the same domain visibly benefits from recalled context (e.g., known preferences, prior artifacts), and the user can fully inspect/delete what's remembered.

## Phase 6 — Parallelism & Scheduling (Weeks 18–22, overlaps Phase 5)
**Goal:** Handle bigger, recurring jobs.

- Task Graph Engine: dependency detection, sub-agent fan-out, merge-step UX.
- Scheduler: cron-like recurring task creation from a completed task, re-planning on each run.
- Cost/usage dashboards per session and per schedule.
- **Exit criteria:** a user can set up "every Monday, compile last week's support tickets into a digest and email me a draft" and have it run unattended except for the (always-gated) send step.

## Phase 7 — Enterprise & Marketplace (Weeks 21–26, overlaps Phase 6)
**Goal:** Org-level controls and an extensible ecosystem.

- Org admin console: permission policy config, connector allow/block lists, spend tracking, global kill switch.
- Plugin/connector marketplace: submission, review, versioning, scope-change re-approval flow.
- Data residency/retention configuration per org.
- Full audit export.
- **Exit criteria:** an org admin can deploy Coagent to a team with a defined permission policy, monitor usage/spend, and pull a complete audit trail for any session.

## Phase 8 — Hardening & GA (Weeks 25–30)
**Goal:** Production readiness.

- Load testing at target concurrency (sandbox provisioning under load).
- Red-team pass: prompt injection, permission escalation, malicious connector submissions, adversarial file/webpage corpora.
- Human-eval benchmark suite across the persona/use-case set (usecases.md) — target completion-rate metrics from PRD.md §7.
- Documentation, onboarding flows, pricing/limits finalization.
- **Exit criteria:** meets the success metrics defined in PRD.md §7; passes external security review; GA launch.

---

## Cross-cutting workstreams (run throughout all phases)
- **Observability**: tracing/logging expand alongside each new tool/connector.
- **Design system**: client UI evolves per design.md as new panels (approval, memory, schedule) are added.
- **Safety review**: every new tool/connector is risk-classified per rules.md before it ships, not retrofitted after.
