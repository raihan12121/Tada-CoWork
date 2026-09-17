# Coagent (Tada-CoWork) 🤖💼

> A Cowork-style Autonomous Work Agent that plans, executes, and delivers knowledge work across files, spreadsheets, web research, and documents — with strict sandbox isolation, risk-gated approvals, and multi-tier memory.

---

## 🌟 Key Features

1. **Plan/Execute Split**: Deconstructs high-level tasks into legible, editable DAG step graphs before taking autonomous action.
2. **Strict Ephemeral Sandboxing**: Work runs inside namespaced, resource-governed directories (`sandboxes/<session_id>`) with execution timeouts and output caps.
3. **Approval Gates & Safety Engine**:
   - **Low Risk**: Autonomous execution (reading files, web search, formatting).
   - **Medium Risk**: File creation and code execution inside the sandbox (can be pre-approved per session).
   - **High Risk**: File deletion, overwriting without backup, external communications (email/Slack), financial actions, and out-of-scope access **ALWAYS** pause for human confirmation.
4. **Prompt-Injection Defense**: All fetched external content (webpages, files, tool outputs) is structurally delimited as untrusted data (`BEGIN UNTRUSTED DATA ... END UNTRUSTED DATA`) and inspected for directive overrides. Actions triggered by untrusted content are automatically elevated to High Risk.
5. **Multi-Format Deliverables**: Generates polished Markdown reports (`.md`), Excel spreadsheets (`.xlsx`), Word documents (`.docx`), PowerPoint slide decks (`.pptx`), and PDFs (`.pdf`) with inline viewer and one-click downloads.
6. **Multi-Tier Memory**:
   - **Working Memory**: Context-compacted active session memory preserving decision rationales.
   - **Task Memory**: Relational SQLite persistence for instant session resumption.
   - **Long-Term Memory**: Workspace-isolated structured facts, user preferences, and semantic vector recall.
7. **Local Desktop Bridge**: Lightweight desktop companion (`bridge/agent.py`) exposing explicitly whitelisted local folders and browser automation over authenticated session tokens. Rejects and audits any path traversal attempt.
8. **Scheduled Recurring Tasks**: Cron automation engine that re-invokes dynamic planning for each run while maintaining approval gates for consequential actions.
9. **Tamper-Evident Audit Trail**: Every tool call, plan revision, and approval decision is cryptographically chained using SHA-256 hashes and exportable for compliance.

---

## 🏗️ Architecture

```
┌────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│   Client   │◄────►│   Orchestrator (API) │◄────►│   Execution Sandbox   │
│ React/Vite │ WS/  │  - session mgmt      │      │  - ReAct agent loop   │
│  Tailwind  │ REST │  - planner/executor  │      │  - Python/Node runner │
└────────────┘      │  - approval gates     │      │  - namespaced files   │
                    │  - scheduler (cron)  │      └───────────┬───────────┘
                    │  - memory store      │                  │
                    └───────────┬──────────┘                  ▼
                                │                    ┌────────────────────┐
                    ┌───────────▼──────────┐         │  Tool & Connector  │
                    │  Local Bridge Agent  │◄───────►│  Layer (MCP)       │
                    │  (desktop companion) │   MCP   │  - docs/sheets/ppt │
                    │  - scoped folders    │         │  - web search/fetch│
                    │  - browser control   │         │  - Drive/Slack/Git │
                    └──────────────────────┘         └────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Git

### 2. Setup Backend
```bash
# In project root:
python -m venv .venv
.venv\Scripts\activate       # On Windows (.venv/bin/activate on Linux/Mac)
pip install -r backend/requirements.txt

# Run backend orchestrator
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4. Run Automated Tests
```bash
.venv\Scripts\python -m pytest backend/tests -v
```

---

## 🔒 Configuration & Environment Variables

Copy `.env.example` to `.env`. Offline heuristic planning is for development only; production deployments must configure a real model provider, a non-empty bridge secret, API/admin authentication, and the Docker or managed sandbox backend.

```env
LLM_PROVIDER=offline_heuristic  # Development only; use anthropic/openai/gemini in production
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
BRIDGE_SECRET=generate-a-random-secret
COAGENT_API_AUTH_TOKEN=generate-a-random-api-token
COAGENT_ADMIN_TOKEN=generate-a-random-admin-token
COAGENT_IDENTITY_SECRET=shared-verification-secret-for-signed-principal-tokens
COAGENT_OIDC_ISSUER=https://id.example.com/
COAGENT_OIDC_AUDIENCE=coagent-api
COAGENT_OIDC_JWKS_URL=https://id.example.com/.well-known/jwks.json
COAGENT_OIDC_WORKSPACE_CLAIM=workspace_ids
COAGENT_MARKETPLACE_SIGNING_SECRET=shared-secret-for-connector-manifest-signatures
COAGENT_DEPLOYMENT_REGION=eu-west
SANDBOX_BACKEND=docker
SANDBOX_NETWORK=none
COAGENT_MANAGED_SANDBOX_URL=https://sandbox.example.com
COAGENT_MANAGED_SANDBOX_TOKEN=provider-issued-worker-token
COAGENT_DELIVERY_MODE=preview
```

When identity verification is enabled, configure `VITE_IDENTITY_TOKEN` with a signed principal token; its claims determine the user's organization, workspaces, and admin role. Production can use the local HMAC contract or configure the OIDC issuer, audience, and JWKS URL for RS256 verification.

### Configure the AI provider

Open the **AI Provider** item in the desktop sidebar. Add one or more OpenAI, Anthropic, or Gemini API-key accounts, choose **ChatGPT subscription via Codex CLI** or **Claude subscription via Claude Code CLI** for an already-authenticated official CLI installation, or choose Ollama/LM Studio for a local OpenAI-compatible endpoint. Select an account and use **Test account** before starting a task. New tasks can pin a specific saved account from the task composer; account health records available, unauthorized, and quota-exhausted states after connection tests. Hosted-provider credentials are encrypted with the Windows user-bound DPAPI store and are never returned to the UI or written to SQLite. `offline_heuristic` is an explicitly labeled no-AI preview mode.

When marketplace review is enabled, approved connector manifests must carry an HMAC-SHA256 signature over their canonical metadata and, in production, pass the staged package scan. The built-in scan verifies the declared digest and rejects unsafe archive paths, links, and executable binaries; deployment registries should add malware and dependency scanning before distribution.

### Optional local bridge

Run the authenticated companion transport with explicitly granted folders:

```bash
python bridge/agent.py --serve --token "<same BRIDGE_SECRET>" --folder "D:/Downloads"
```

Install the bridge-only browser dependency before enabling browser control:

```bash
pip install -r bridge/requirements.txt
playwright install chromium
```

Set `COAGENT_BRIDGE_AGENT_URL=http://127.0.0.1:8765` in the orchestrator environment. Browser control requires an installed Playwright runtime in the bridge environment and always returns takeover-required for login, payment, or CAPTCHA work.

For non-local deployments, start the bridge with `--certfile` and `--keyfile` and configure an `https://` `COAGENT_BRIDGE_AGENT_URL`; the bridge refuses a partial TLS configuration.

---

## 📁 Repository Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/          # REST endpoints & WebSocket live stream
│   │   ├── core/         # LLM abstraction, safety engine, audit log
│   │   ├── db/           # Async SQLAlchemy SQLite persistence
│   │   ├── engine/       # Planner, ReAct executor, approval gates, scheduler
│   │   ├── memory/       # Working, task, and long-term memory
│   │   ├── sandbox/      # Process isolation & path protection
│   │   ├── tools/        # Code execution, file ops, document generators, web search
│   │   └── connectors/   # Drive, Slack, GitHub, Webhook MCP connectors
│   ├── tests/            # Automated pytest verification suite
│   └── requirements.txt
├── frontend/             # React 19 + Vite + Tailwind CSS dashboard
│   ├── src/components/   # Task intake, plan view, activity feed, approval modal
│   └── src/services/     # API & WebSocket client
├── bridge/
│   └── agent.py          # Desktop companion scoped folder bridge
├── Memory.md             # Memory specification
├── PRD.md                # Product requirements
├── TRD.md                # Technical requirements
├── architecture.md       # Architecture specification
├── design.md             # UX & interaction design specification
├── phases.md             # Phased delivery roadmap
├── rules.md              # Safety, risk tiers & operating policy
└── usecases.md           # Core personas and target use cases
```

---

## 📄 License
MIT License
