# Design — UX & Interaction Design for Coagent

---

## 1. Design Principles

1. **Show the plan before the work.** The user should never watch a wall of raw actions with no framing — every session opens with a legible plan.
2. **Narrate, don't dump logs.** The activity feed reads like a colleague describing what they're doing, with a raw/technical view available but not default.
3. **Steerability over control freakery.** Default to letting the agent run; make pausing/redirecting/approving fast and low-friction so users don't feel they must babysit every step.
4. **Trust is earned incrementally.** New users start with more confirmations; as trust calibrates (or via explicit settings), friction decreases — never the reverse by default.
5. **Irreversible actions always feel different.** Approval prompts for high-risk actions are visually distinct (color, iconography, explicit consequence text) from routine progress updates.
6. **Artifacts are the point.** The results/artifact panel is first-class, not a byproduct of the chat — users came for a deliverable.

---

## 2. Core Screens / Surfaces

### 2.1 Task Intake
- A single input (chat-style) plus an optional "attach folder / connect tool" affordance shown contextually.
- Quick-start templates for common jobs (organize files, build a report, research & compare, draft from notes) to reduce blank-page friction — mirrors the persona/use-case set.

### 2.2 Plan View
- Rendered as a numbered, collapsible step list, each step showing: short description, tool it will use, risk tier badge (low/medium/high), and dependency links for parallel branches.
- Inline edit affordances: reorder, remove, add a step, before execution starts.
- A single "Start" action; a visible "Coagent will ask before doing anything risky" reassurance line.

### 2.3 Activity Feed (live)
- Two toggleable views:
  - **Plain-language view** (default): "Reading your notes... Drafting section 2... Creating the spreadsheet..."
  - **Technical/raw view**: full reasoning trace + tool call payloads, for power users and debugging.
- Streaming, auto-scrolling, with a persistent pause/cancel control.
- Parallel workstreams shown as swimlanes when active, collapsing into one lane at the merge step.

### 2.4 Approval Prompts
- Modal or inline card (not a full-screen interrupt) showing: exactly what will happen, what it affects, and two clear actions (Approve / Deny), plus "always allow this class this session" where policy permits (never available for high-risk tiers, per rules.md).
- High-risk prompts use a distinct visual treatment (e.g., warm accent color, explicit icon) vs. routine progress.
- "Takeover mode" for browser logins/payments hands an embedded browser view to the user with a clear "you're in control now" banner.

### 2.5 Artifact Panel
- Live-updating list of produced files with type icons, preview thumbnails, and one-click download/open/share.
- Documents open in an inline viewer (docx/pdf/xlsx render natively where possible) rather than forcing a download-first flow.
- Version history if a file was overwritten (ties to rules.md §4.2 snapshot requirement).

### 2.6 Connector / Permissions Manager
- A settings surface listing every granted folder/domain/connector, when it was granted, last used, and a one-click revoke.
- Org admin variant: policy templates, allow/block lists, spend dashboards.

### 2.7 Memory Manager
- A plain list of what the agent remembers (facts/preferences/summaries), grouped by source task, each editable/deletable.
- A toggle for long-term memory on/off, scoped per workspace.

### 2.8 Schedule Manager
- List of recurring jobs, next run time, last result status, and a diff/summary of what changed run-to-run.
- Editing a schedule reopens the plan view for that template.

---

## 3. Interaction Patterns

| Pattern | Behavior |
|---|---|
| **Ambient progress** | Non-blocking toast/status updates for low-risk steps; no interruption |
| **Blocking approval** | High-risk steps pause the executor and require a decision before continuing |
| **Soft redirect** | User can type a correction mid-run ("actually use last month's data") which triggers a scoped re-plan, shown as a visible plan diff |
| **Graceful degradation** | If a tool/connector fails or the bridge is offline, the feed shows a clear, specific failure and offers next steps (retry, skip, ask for different access) — never a silent stall |
| **Resumability** | Closing the client doesn't cancel a session; reopening shows exactly where it left off |

---

## 4. Visual/Content Language

- Plan and activity language should read like a competent human coworker's status updates — specific, not robotic ("Extracting line items from 12 receipt images" not "Executing tool: ocr_extract").
- Risk badges use consistent, colorblind-safe iconography (not color alone) — low = neutral, medium = amber outline, high = red fill with an icon.
- Avoid dark-pattern-style pre-checked "always allow" boxes; every elevated permission is an explicit opt-in.
- Empty states teach by example (show 2–3 sample tasks) rather than a blank box.

---

## 5. Accessibility & Cross-Platform

- Full keyboard navigation for plan editing and approval decisions.
- Screen-reader-friendly activity feed (semantic live-region updates, not just visual streaming).
- Design system shared across web, desktop (Tauri), and mobile (React Native) — mobile simplifies the technical/raw activity view but keeps plan + approvals + artifacts fully functional, since approvals must work from a phone even if a task was started on desktop.

---

## 6. Error & Edge-Case States

- **Plan generation failure**: show a clear retry with the option to rephrase the task.
- **Mid-task tool failure**: isolate to the affected step; offer retry/skip/replan rather than failing the whole session.
- **Approval timeout**: session pauses indefinitely (no auto-approve on timeout, ever) with a reminder notification.
- **Bridge disconnected mid-task**: affected steps marked blocked, rest of the plan continues if independent, clear reconnect CTA.
- **Budget/limit reached**: session pauses with a clear breakdown of what was used and an option to extend (admin/user approval) rather than silently truncating output.
