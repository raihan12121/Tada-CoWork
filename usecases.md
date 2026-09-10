# Use Cases — Coagent

Grounded in what Claude Cowork and ChatGPT Agent Mode are actually marketed and observed doing (file organization, report drafting from scattered inputs, spreadsheet building from unstructured data, multi-site research, scheduled recurring reviews), plus extensions from the persona set in PRD.md.

---

## UC-1: Organize a Messy Folder
**Actor:** Ops/Admin professional
**Trigger:** "Organize my Downloads folder — rename files sensibly and sort into subfolders by type/project."
**Flow:**
1. User grants the agent access to the Downloads folder via the local bridge.
2. Agent plans: inventory files → infer categories from content/filenames → propose folder structure → rename/move.
3. Plan shown; medium-risk (file moves) can be batch pre-approved for this folder.
4. Agent executes, streaming progress ("Sorted 40 of 120 files...").
5. Result: reorganized folder + a summary report of what moved where.
**Risk tier:** Medium (file moves/renames within a granted, reversible scope).

## UC-2: Build a Spreadsheet from Unstructured Inputs
**Actor:** Ops/Admin professional
**Trigger:** "Build an expense spreadsheet from these 40 receipt photos."
**Flow:**
1. User uploads/grants access to receipt images.
2. Agent plans: OCR/extract each receipt → normalize fields (date, vendor, amount, category) → build spreadsheet with totals/pivot.
3. Executes with the document-generation tool (xlsx).
4. Delivers a downloadable spreadsheet artifact with a summary of any receipts it couldn't confidently parse (flagged, not guessed).
**Risk tier:** Low/Medium (read-only input, file creation in sandbox/granted folder).

## UC-3: Draft a Report from Scattered Notes
**Actor:** Founder/Analyst
**Trigger:** "Turn these meeting notes and this data file into a first-draft quarterly report."
**Flow:**
1. Agent plans: read notes + data → outline report structure → draft sections → format as docx.
2. Streams drafting progress per section.
3. Delivers a docx artifact clearly marked as a first draft for the user to revise.
**Risk tier:** Low (content generation, no external side effects).

## UC-4: Multi-Source Competitive Research
**Actor:** Analyst/Researcher
**Trigger:** "Research 10 competitors and produce a comparison report."
**Flow:**
1. Agent plans: identify 10 companies → fan out parallel sub-agents (one per competitor or per data dimension) to search/fetch → merge into a comparison table/report.
2. Web search/fetch tools used (cloud-side, no bridge needed unless sites require login).
3. Merge step shown to user; conflicting/uncertain data points flagged rather than silently reconciled.
4. Delivers a report artifact with cited sources.
**Risk tier:** Low (public web research); copyright rules applied to any quoted content.

## UC-5: Recurring Weekly Digest
**Actor:** Team lead
**Trigger:** "Every Friday, summarize this week's support tickets into a digest and draft (don't send) an email."
**Flow:**
1. User connects the support-ticket tool (connector) and grants a draft-only email connector scope.
2. Agent completes the task once, user reviews, then converts it to a schedule (weekly, Fridays).
3. Each run: re-plans (accounts for however many tickets exist that week) → produces the digest → drafts the email → **stops for approval before sending** (rules.md §4.3 — sending is always gated, even on a schedule).
4. User approves/edits/sends from the client.
**Risk tier:** Low (digest generation) + High (the send step, always gated).

## UC-6: Cross-Tool Research + Slide Deck
**Actor:** Team lead
**Trigger:** "Pull last month's numbers from our tracker and build a status deck."
**Flow:**
1. Agent uses a connected project-tracker connector (read-only scope) to pull data.
2. Agent generates a pptx artifact with charts and a narrative summary.
3. Low-risk throughout (read-only connector scope, file generation only).
**Risk tier:** Low.

## UC-7: Browser-Based Multi-Step Task (Booking/Form Submission Style)
**Actor:** Any user
**Trigger:** "Find the cheapest flight to Tokyo under $800 next month and show me the options" (note: **booking itself is out of scope for v1** — see rules.md, payments are always high-risk/gated and Coagent v1 does not auto-purchase).
**Flow:**
1. Agent uses browser automation (via local bridge, user's own logged-in browser context if needed) to search multiple sites.
2. Compares and filters results.
3. Presents a comparison table of options; **does not** complete a purchase.
4. If the user asks to proceed with booking, that step requires explicit "takeover mode" — user completes payment themselves with the agent's research pre-filled where safe to do so.
**Risk tier:** Low (research) / High (any payment step — user-completed, not agent-completed, in v1).

## UC-8: Cleanup + Migration Task
**Actor:** Ops/Admin
**Trigger:** "Go through this shared drive folder, find duplicate files, and consolidate them."
**Flow:**
1. Agent plans: inventory → hash/compare for duplicates → propose consolidation plan (which copy to keep).
2. Deletion of duplicates is high-risk by default → user approves the batch (or item-by-item) before any deletion, with a reversible-delete/backup step per rules.md §4.1.
**Risk tier:** High (deletion involved — always gated).

## UC-9: Resume a Paused Task
**Actor:** Any user
**Trigger:** User closes the client mid-task, returns two days later.
**Flow:**
1. Task Memory has preserved plan state, artifacts so far, and pending approvals.
2. User reopens the session; sees exactly where it left off, including any approval still awaiting a decision.
3. Continues or edits the plan before resuming.
**Risk tier:** N/A (session-management use case, not an action).

## UC-10: Personalized Recurring Report (Memory-Driven)
**Actor:** Returning user, long-term memory enabled
**Trigger:** "Build this month's report" (a recurring, loosely-specified request).
**Flow:**
1. Planner retrieves relevant long-term memory: remembered formatting preference, remembered data source location from prior sessions.
2. Plan is pre-populated using these defaults, shown transparently ("Using your usual report format from last time — let me know if that's changed").
3. User confirms or overrides; overrides always win over remembered defaults (Memory.md §3).
**Risk tier:** Low.

---

## Use Case → Feature Traceability (summary)

| Use Case | Key Features Exercised |
|---|---|
| UC-1 | Local bridge, medium-risk batch approval |
| UC-2 | Document/file tools, low-risk generation |
| UC-3 | Content drafting, doc generation |
| UC-4 | Web research tools, parallel sub-agents, merge step |
| UC-5 | Connectors, scheduling, high-risk send gate |
| UC-6 | Connectors (read-only), pptx generation |
| UC-7 | Browser automation, takeover mode, payment gating |
| UC-8 | Deletion gating, reversible-delete |
| UC-9 | Task memory, resumability |
| UC-10 | Long-term memory, preference retrieval |
