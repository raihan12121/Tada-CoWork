# Product Requirements Document (PRD)
## Project Codename: **Coagent** — A Cowork-style Autonomous Work Agent

Version 1.0 | Last updated: 2026-09-03

---

## 1. Background & Research Summary

Before defining requirements, here is what the two closest reference products actually do today (researched Sep 2026):

### 1.1 Claude Cowork (Anthropic)
- Built on the same underlying agent architecture as Claude Code ("Claude Code without the code"), wrapped in a chat-style interface for non-coders.
- User grants access to a **specific folder** (and optionally connected tools/apps). Claude cannot reach anything outside the granted scope.
- Execution model: Claude **analyzes the request → creates a plan → breaks it into subtasks → runs code/shell commands in an isolated cloud sandbox → coordinates multiple workstreams in parallel when useful → delivers finished outputs** to a session the user can preview/download.
- **Isolated cloud execution**: work runs in a temporary, per-session sandbox on the provider's servers, not on the user's machine, and cannot reach the user's network.
- **Local bridge**: when a task needs a local file or the user's browser, the agent reaches the user's computer through a lightweight desktop-app bridge, and only for folders the user explicitly connected. If the bridge is offline, the session can't reach the local machine.
- The user retains visibility into planning/execution throughout, and can steer or let it run unattended.
- Confirmation is required before consequential/irreversible file actions (e.g., deletion).
- Enterprise controls: permission configuration, spend tracking, plugin marketplace, org-wide usage tracking.

### 1.2 ChatGPT Agent Mode (OpenAI)
- Spins up a **sandboxed virtual computer**: visual browser, text browser, code terminal, file system, and any authorized third-party integrations.
- Two observability views: a "desktop view" (what the agent sees/does) and an "activity/reasoning view" (step-by-step logic).
- Runs on a dual-model pipeline (a planning/reasoning model + an execution model) working in sequence.
- **Consequential-action gating**: pauses and asks for human confirmation before sensitive actions (payments, sending email); hands control back to the user in a "takeover mode" for logins/payments.
- **Session-based, not persistent**: a task starts, runs to completion or timeout (roughly 5–30 min), and ends. It does not passively watch an inbox; scheduled tasks just re-run the same prompt on a clock.
- Usage is capped per plan tier (e.g., ~40 agent tasks/month on a mid tier, ~400 on the top tier).

### 1.3 Cross-cutting patterns worth adopting
- Both systems separate **planning** from **execution**.
- Both run in an **isolated sandbox**, never directly on the user's raw OS session, and bridge to local resources only through an explicit, revocable connector.
- Both require **human approval for irreversible/high-risk actions** (deletion, payment, send, external publish).
- Both give **real-time visibility** into plan + live actions, not just a final answer.
- Both support **tool/connector ecosystems** (MCP-style or app-integration based) rather than hard-coding every capability.
- Neither is a fully "fire-and-forget" background daemon — supervision is a deliberate design choice, not a limitation to route around.

---

## 2. Problem Statement

Knowledge workers spend large amounts of time on multi-step busywork that requires judgment but not creativity: reorganizing files, drafting first-pass documents from scattered notes, extracting data across many sources into one artifact, chasing multi-step workflows across several tools. Existing chat-based AI assistants only produce *advice* — the user still performs every action. There is no affordable, safe, general-purpose agent that a non-developer can hand a real, multi-step, multi-tool job to and trust with completion.

## 3. Vision

Build **Coagent**: a general-purpose, sandboxed AI work agent that a user can delegate real, multi-step knowledge-work tasks to — across local files, documents, spreadsheets, browser-based research, and connected SaaS tools — with full visibility, steerability, and safety guarantees, without requiring the user to write code.

## 4. Goals / Non-Goals

### Goals (v1)
1. Accept a natural-language task description and turn it into a transparent, editable execution plan.
2. Execute multi-step work autonomously in an isolated sandbox: read/write files, run code, browse the web, call connected tools (MCP).
3. Bridge safely to a user's local folder(s) and browser via an explicit, revocable local connector — never blanket OS access.
4. Produce real deliverables (documents, spreadsheets, slides, reports, code, data extracts) the user can preview and download.
5. Ask for human approval before irreversible or high-risk actions.
6. Give the user live visibility into plan + actions + reasoning, and let them pause/redirect/cancel at any time.
7. Support session memory (within a task) and durable memory (across sessions) so the agent gets more useful over time.
8. Support scheduled/recurring tasks (e.g., "every Monday, compile the weekly report").
9. Be extensible via a tool/connector/plugin ecosystem rather than hard-coded integrations.

### Non-Goals (v1)
- Fully unsupervised, always-on background operation with no human checkpoints (explicitly rejected as a safety anti-pattern based on research above).
- Replacing a dedicated coding agent (Claude Code / Codex-style) — Coagent targets knowledge work, not primary software engineering, though it can run code as a means to an end.
- Building our own foundation model. Coagent is a harness/orchestration layer over a third-party or self-hosted LLM API.
- Consumer social/commerce automation (auto-purchasing, auto-posting) in v1 — gated behind explicit opt-in connectors later.

## 5. Target Users & Personas

| Persona | Need | Example task |
|---|---|---|
| Ops/Admin professional | Turn messy inputs into clean outputs | "Build an expense spreadsheet from these 40 receipt photos" |
| Analyst/Researcher | Multi-source synthesis | "Research 10 competitors and produce a comparison report" |
| Founder/Solo operator | Delegate recurring admin | "Every Friday, summarize this week's support tickets into a digest" |
| Team lead | Standardized recurring deliverables | "Generate the weekly status deck from the project tracker" |

## 6. Key Features (v1 scope)

1. **Task intake & planning** — natural language → structured plan (see architecture.md for the planner/executor split).
2. **Sandboxed execution environment** — per-session isolated container (see architecture.md §3).
3. **Local bridge connector** — desktop-app companion for scoped folder + browser access.
4. **File & document tools** — read/write/create docx, xlsx, pptx, pdf, csv, markdown.
5. **Code execution tool** — sandboxed shell + Python/Node runtime.
6. **Web research tool** — search + page fetch, with a real browser fallback for JS-heavy/interactive sites.
7. **Connector/plugin framework (MCP-based)** — SaaS integrations (Drive, Slack, email, CRM, etc.).
8. **Approval gates** — configurable risk tiers that require explicit user confirmation.
9. **Live activity feed** — plan view + step-by-step action/reasoning log, pause/resume/cancel controls.
10. **Memory system** — session memory, task memory, and opt-in cross-session long-term memory (see Memory.md).
11. **Scheduling** — cron-like recurring task triggers.
12. **Artifact delivery** — a results pane where finished files can be previewed/downloaded/shared.
13. **Permissions & audit** — per-folder/per-tool grants, full action log, revocable at any time.
14. **Multi-workstream parallelism** — the agent can fan out independent subtasks concurrently and merge results.

## 7. Success Metrics

- **Task completion rate** without human correction (target ≥ 80% for well-scoped tasks by v1 GA).
- **Time-to-first-plan** < 10s for typical tasks.
- **Human intervention rate** on non-risky steps (lower is better — should trend down as trust calibration improves).
- **Approval-gate precision**: % of high-risk actions correctly flagged vs. false positives that cause fatigue.
- **Session-to-session task reuse** (memory value proxy): % of tasks that benefit from recalled context.
- **Safety incidents**: 0 tolerance for unauthorized-scope access or unapproved irreversible actions.

## 8. Constraints & Assumptions

- Must run on top of a tool-calling-capable LLM API (Claude, GPT, or open-weight equivalent) — see TRD.md.
- Local file/browser access requires a companion desktop app; there is no way to safely grant full OS access from a pure cloud session.
- Compute costs scale with autonomy — parallel workstreams and long sessions cost more; must have cost/usage caps.
- Must comply with data-handling expectations: local files touched by the agent are processed wherever the sandbox runs (cloud), which must be disclosed to the user (as Anthropic does).

## 9. Out-of-Scope Risks Explicitly Flagged for Rules.md
- Prompt injection via fetched web content or files.
- Over-broad tool permissions.
- Unattended long-running agents silently taking irreversible actions.
- Malicious/duplicated plugin submissions in a marketplace model.

## 10. Milestones
See `phases.md` for the phased delivery plan.
