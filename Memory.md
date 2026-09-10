# Memory — Coagent Memory System

---

## 1. Why Memory Matters Here

A single-shot agent re-derives context every time, which wastes turns and produces inconsistent results ("what format do you like your reports in?" asked every session). Neither Claude Cowork nor ChatGPT Agent Mode does much cross-session learning today (sessions are largely self-contained, scheduled tasks just re-run a prompt) — this is a real opportunity for Coagent to differentiate, but it must be built with strict user control given the sensitivity of "an agent that remembers things about you and your work."

## 2. Memory Tiers

### 2.1 Working Memory (in-context)
- Scope: current session only.
- Contents: the task description, the live plan, tool call history, intermediate results.
- Lifetime: duration of the session; lives in the LLM context window (with summarization/compaction as it grows — see §5).
- Storage: not persisted beyond session end except as part of Task Memory.

### 2.2 Task Memory (persisted, per-task)
- Scope: one task/session, persisted so it can be resumed later or referenced by future related tasks.
- Contents: final plan, all artifacts produced, key decisions made (including approvals/denials and why), a compact summary of the outcome.
- Lifetime: retained per the org's data retention policy; user/org can delete anytime.
- Storage: relational store (Postgres) — structured, queryable, exportable for audit.
- Use: resuming a paused session; "do the same thing as last time but for Q3" style follow-ups; audit.

### 2.3 Long-Term Memory (opt-in, cross-session)
- Scope: persists across unrelated sessions for a given user or workspace.
- Contents (three kinds):
  1. **Preferences** — explicit or inferred style/format/process preferences ("I like reports in a 3-section format," "always CC my manager on drafts — but never actually send without asking").
  2. **Facts** — durable facts about the user's work context ("our fiscal year starts in April," "the team's project tracker lives in this Notion workspace").
  3. **Summaries** — compressed recollections of past tasks relevant for future retrieval ("last quarter's expense report categorized X, Y, Z this way").
- Lifetime: persists until the user deletes it or a TTL/staleness policy expires it (e.g., inferred preferences decay if unused for N months; explicit facts don't expire unless the user removes them).
- Storage: hybrid —
  - Structured facts/preferences: Postgres, key-value/typed rows, directly editable in UI.
  - Semantic summaries: vector embeddings in a vector DB (pgvector/Qdrant) for similarity retrieval.
- **Opt-in by default is OFF** for new users; enabling it is an explicit action with a clear explanation of what will be remembered and how to review/delete it.

## 3. How Memory Is Used

1. **At planning time**, the orchestrator queries long-term memory (top-k relevant facts/preferences/summaries via semantic search + any explicitly pinned facts) and injects a compact digest into the planner's context — not the raw memory store.
2. **During execution**, task memory from related prior sessions can be surfaced as a suggestion ("this looks similar to a task from March — reuse that approach?") rather than silently applied.
3. **Preferences are applied as defaults, never as silent overrides of explicit new instructions** — if the user's current request conflicts with a remembered preference, the current request always wins, and the agent may note the discrepancy.

## 4. How Memory Is Written

- **Explicit**: user directly states something to remember ("remember that our reports use APA style") → written immediately as a structured preference, shown to the user as confirmation.
- **Inferred**: at the end of a session, a lightweight extraction pass proposes candidate memory items (facts/preferences observed during the task) — these are **shown to the user for confirmation before being stored**, not silently written. (This avoids the failure mode of an agent "deciding" what's worth remembering about someone without their knowledge.)
- **Never written**: sensitive categories are excluded from inference by default — credentials, financial account details, health information, anything from a high-risk-tier action — unless the user explicitly and separately opts to store that category.

## 5. Context Window Management

- Working memory is compacted as sessions grow long: older tool outputs are summarized, not dropped silently — summaries retain enough detail to explain *why* a decision was made, not just *what* happened.
- Full, uncompacted transcripts remain available in Task Memory (relational store) even after the working context is compacted, so nothing is truly lost — just moved out of the LLM's active context.

## 6. User Controls (must-have UI, ties to design.md §2.7)

- View everything currently remembered, grouped by type and source task.
- Edit or delete any individual memory item.
- Turn long-term memory off entirely (existing items retained but not used, or purged — user's choice).
- Export memory (for transparency/portability).
- Per-workspace scoping: memory from a personal workspace never leaks into an org workspace and vice versa.

## 7. Tenant & Privacy Isolation

- Memory is strictly partitioned by user/workspace/org — no cross-tenant retrieval, ever (hard requirement, ties to rules.md §9.3).
- Org admins can set a policy (e.g., disable long-term memory org-wide, or require it for consistency) but cannot read an individual user's personal-workspace memory unless the user is operating in an org-managed workspace with disclosed admin visibility.
- Memory extraction pipeline itself runs inside the same security boundary as task execution — it does not get elevated access to make inferences.

## 8. Failure Modes to Design Against

| Risk | Mitigation |
|---|---|
| Agent "remembers" something wrong and repeats the error | Inferred memory requires confirmation before storage; easy correction/deletion |
| Memory becomes stale and misleads future tasks | TTL/staleness decay for inferred items; last-used timestamps shown to user |
| Memory used to silently override explicit new instructions | Current instructions always take precedence; conflicts are surfaced, not auto-resolved |
| Sensitive data captured into long-term memory | Default-exclude sensitive categories; explicit opt-in required per category |
| Cross-tenant leakage | Hard partitioning at the storage and retrieval-query level, tested in Phase 8 red-team pass |
