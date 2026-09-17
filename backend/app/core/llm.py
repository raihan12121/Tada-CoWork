import os
import json
import uuid
import asyncio
import shutil
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.models.schemas import StepBase, RiskLevel
from app.core.secret_store import save_secret, load_secret, delete_secret


def annotate_memory_context(plan: Dict[str, Any], memory_context: str) -> Dict[str, Any]:
    """Make recalled defaults visible in every provider's plan output."""
    if memory_context:
        plan["explanation"] = (
            f"{plan.get('explanation', 'Plan generated.')} "
            "Using recalled workspace context as a transparent default; the current task instructions take precedence."
        )
    return plan

class BaseLLMProvider:
    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        raise NotImplementedError

    async def reason_step(
        self,
        task: str,
        step: StepBase,
        prior_observations: List[Dict[str, Any]],
        tools_available: List[str]
    ) -> Dict[str, Any]:
        raise NotImplementedError

class AnthropicLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.endpoint = "https://api.anthropic.com/v1/messages"

    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        system_prompt = (
            "You are the Coagent Planner. Deconstruct the user task into a structured plan graph. "
            "Return JSON with keys: explanation, steps: [{description, tool, risk_level, dependencies}]. "
            "Tools available: execute_code, create_file, write_file, edit_file, delete_file, read_file, "
            "list_files, bridge_list_files, bridge_read_file, bridge_move_file, create_document, web_search, web_fetch, browser_automation, google_drive, gmail, outlook, github, slack, webhook. "
            "Risk levels: low (read-only/search), medium (file create/write/code exec), high (delete/external send)."
        )
        prompt = f"Task: {task}\nMemory Context:\n{memory_context}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    self.endpoint,
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-7-sonnet-20250219",
                        "max_tokens": 2048,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
                if resp.status_code == 200:
                    text = resp.json()["content"][0]["text"]
                    # Extract JSON block
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start != -1 and end != -1:
                        return json.loads(text[start:end])
        except Exception as exc:
            raise RuntimeError(f"Anthropic provider request failed: {exc}") from exc
        raise RuntimeError("Anthropic provider returned no usable plan")

    async def reason_step(
        self,
        task: str,
        step: StepBase,
        prior_observations: List[Dict[str, Any]],
        tools_available: List[str]
    ) -> Dict[str, Any]:
        return OfflineHeuristicProvider().reason_step_sync(task, step, prior_observations, tools_available)


class OpenAILLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.endpoint = "https://api.openai.com/v1/chat/completions"
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    async def _json_call(self, system: str, prompt: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={
                        "model": self.model,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                return json.loads(response.json()["choices"][0]["message"]["content"])
        except Exception as exc:
            raise RuntimeError(f"OpenAI provider request failed: {exc}") from exc

    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        data = await self._json_call(
            "Return only JSON with explanation and steps. Each step has description, tool, risk_level, dependencies.",
            f"Task: {task}\nMemory context: {memory_context}",
        )
        if not data:
            raise RuntimeError("OpenAI provider returned no usable plan")
        return data

    async def reason_step(self, task: str, step: StepBase, prior_observations: List[Dict[str, Any]], tools_available: List[str]) -> Dict[str, Any]:
        data = await self._json_call(
            "Return only JSON with thought, narration, tool, and params. Choose only from the available tools.",
            json.dumps({"task": task, "step": step.model_dump(), "observations": prior_observations[-5:], "tools": tools_available}),
        )
        return data or OfflineHeuristicProvider().reason_step_sync(task, step, prior_observations, tools_available)


class OpenAICodexCLIProvider(BaseLLMProvider):
    """Use the official Codex CLI login without reading its credentials."""
    def __init__(self, command: str = ""):
        self.command = command or os.getenv("COAGENT_CODEX_COMMAND", "") or shutil.which("codex") or "codex"

    async def _run(self, prompt: str) -> str:
        args = [self.command, "exec", "--ephemeral", "--json", "--skip-git-repo-check", "-s", "read-only", "-a", "never", prompt]
        try:
            process = await asyncio.create_subprocess_exec(*args, cwd=str(settings.BASE_DIR), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
        except FileNotFoundError as exc:
            raise RuntimeError("Codex CLI was not found. Install Codex and sign in with ChatGPT first.") from exc
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise RuntimeError("Codex CLI request timed out") from exc
        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip()[-1000:]
            raise RuntimeError(detail or f"Codex CLI exited with code {process.returncode}")
        messages = []
        for line in stdout.decode("utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            item = event.get("item") if isinstance(event, dict) else None
            if isinstance(item, dict) and item.get("type") in {"agent_message", "assistant_message"} and item.get("text"):
                messages.append(str(item["text"]))
            elif isinstance(event, dict) and event.get("type") == "message" and event.get("text"):
                messages.append(str(event["text"]))
        if messages:
            return messages[-1]
        raise RuntimeError("Codex CLI returned no assistant message")

    async def _json_call(self, prompt: str) -> Dict[str, Any]:
        text = await self._run(prompt)
        start, end = text.find("{"), text.rfind("}") + 1
        if start < 0 or end <= start:
            raise RuntimeError("Codex CLI returned non-JSON output")
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            raise RuntimeError("Codex CLI returned invalid JSON") from exc

    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        return await self._json_call("Return ONLY valid JSON with keys explanation and steps. Each step must contain description, tool, risk_level, dependencies. " + f"Task: {task}\nMemory context: {memory_context}")

    async def reason_step(self, task: str, step: StepBase, prior_observations: List[Dict[str, Any]], tools_available: List[str]) -> Dict[str, Any]:
        return await self._json_call("Return ONLY valid JSON with keys thought, narration, tool, params. Choose only an available tool. " + json.dumps({"task": task, "step": step.model_dump(), "observations": prior_observations[-5:], "tools": tools_available}))


class AnthropicClaudeCLIProvider(BaseLLMProvider):
    """Use the official Claude Code CLI login for Pro/Max subscriptions."""
    def __init__(self, command: str = ""):
        self.command = command or os.getenv("COAGENT_CLAUDE_COMMAND", "") or shutil.which("claude") or "claude"

    async def _run(self, prompt: str) -> str:
        args = [self.command, "-p", prompt, "--output-format", "json", "--max-turns", "1", "--permission-mode", "plan"]
        try:
            process = await asyncio.create_subprocess_exec(*args, cwd=str(settings.BASE_DIR), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
        except FileNotFoundError as exc:
            raise RuntimeError("Claude Code CLI was not found. Install Claude Code and sign in with your Claude account first.") from exc
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise RuntimeError("Claude Code request timed out") from exc
        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip()[-1000:]
            raise RuntimeError(detail or f"Claude Code exited with code {process.returncode}")
        raw = stdout.decode("utf-8", errors="replace").strip()
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict) and isinstance(payload.get("result"), str):
                return payload["result"]
            if isinstance(payload, dict) and isinstance(payload.get("text"), str):
                return payload["text"]
            return raw
        except ValueError:
            return raw

    async def _json_call(self, prompt: str) -> Dict[str, Any]:
        text = await self._run(prompt)
        start, end = text.find("{"), text.rfind("}") + 1
        if start < 0 or end <= start:
            raise RuntimeError("Claude Code returned non-JSON output")
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            raise RuntimeError("Claude Code returned invalid JSON") from exc

    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        return await self._json_call("Return ONLY valid JSON with keys explanation and steps. Each step must contain description, tool, risk_level, dependencies. " + f"Task: {task}\nMemory context: {memory_context}")

    async def reason_step(self, task: str, step: StepBase, prior_observations: List[Dict[str, Any]], tools_available: List[str]) -> Dict[str, Any]:
        return await self._json_call("Return ONLY valid JSON with keys thought, narration, tool, params. Choose only an available tool. " + json.dumps({"task": task, "step": step.model_dump(), "observations": prior_observations[-5:], "tools": tools_available}))


class GeminiLLMProvider(OpenAILLMProvider):
    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')}:generateContent?key={api_key}"

    async def _json_call(self, system: str, prompt: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(self.endpoint, json={"contents": [{"parts": [{"text": f"{system}\n{prompt}"}]}]})
                response.raise_for_status()
                text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
                start, end = text.find("{"), text.rfind("}") + 1
                return json.loads(text[start:end]) if start >= 0 and end > start else {}
        except Exception as exc:
            raise RuntimeError(f"Gemini provider request failed: {exc}") from exc


class OpenAICompatibleLLMProvider(OpenAILLMProvider):
    """Provider for Ollama, LM Studio, and other OpenAI-compatible servers."""
    def __init__(self, endpoint: str, model: str, api_key: str = ""):
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/") + "/chat/completions"
        self.model = model

    async def _json_call(self, system: str, prompt: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                headers = {"Content-Type": "application/json"}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                response = await client.post(
                    self.endpoint,
                    headers=headers,
                    json={
                        "model": self.model,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                return json.loads(response.json()["choices"][0]["message"]["content"])
        except Exception:
            return {}

class OfflineHeuristicProvider(BaseLLMProvider):
    """
    Deterministic knowledge-work engine tailored to PRD & usecases.md personas.
    Ensures the system executes reliably without API keys.
    """
    def generate_plan_sync(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        task_lower = task.lower()
        
        # UC-1: Organize files
        if "organize" in task_lower or "downloads" in task_lower or "sort" in task_lower:
            inventory_tool = "bridge_list_files" if settings.BRIDGE_AGENT_URL else "list_files"
            move_tool = "bridge_move_file" if settings.BRIDGE_AGENT_URL else "move_file"
            return {
                "explanation": "I have created a structured plan to inventory the folder, categorize items by extension and purpose, and safely reorganize them with an activity summary.",
                "steps": [
                    {"description": "Scan and inventory target folder contents", "tool": inventory_tool, "risk_level": "low", "dependencies": []},
                    {"description": "Analyze file metadata and determine organization schema", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Move files into categorized subfolders", "tool": move_tool, "risk_level": "medium", "dependencies": ["step-2"]},
                    {"description": "Generate folder organization summary report", "tool": "create_document", "risk_level": "low", "dependencies": ["step-3"]}
                ]
            }
            
        # UC-2: Expense Spreadsheet
        if "spreadsheet" in task_lower or "expense" in task_lower or "receipt" in task_lower or "xlsx" in task_lower or "csv" in task_lower:
            return {
                "explanation": "I will inspect receipts/expenses, normalize line items, calculate totals, and generate a formatted Excel spreadsheet deliverable.",
                "steps": [
                    {"description": "Scan and read raw expense data sources", "tool": "read_file", "risk_level": "low", "dependencies": []},
                    {"description": "Process and categorize line items, dates, and amounts", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Build formatted spreadsheet with summary totals", "tool": "create_document", "risk_level": "medium", "dependencies": ["step-2"]},
                    {"description": "Generate expense verification breakdown report", "tool": "create_document", "risk_level": "low", "dependencies": ["step-3"]}
                ]
            }

        # UC-3: Draft report from notes and data
        if "meeting notes" in task_lower or "quarterly report" in task_lower or "first-draft" in task_lower:
            return {
                "explanation": "I will read the supplied notes and data, structure the findings, and generate a clearly marked first-draft report.",
                "steps": [
                    {"description": "Read meeting notes and supporting data files", "tool": "read_file", "risk_level": "low", "dependencies": []},
                    {"description": "Outline findings and draft report sections", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Generate formatted first-draft report", "tool": "create_document", "risk_level": "medium", "dependencies": ["step-2"]}
                ]
            }

        # UC-7: Browser research with user takeover at checkout/login
        if "flight" in task_lower or "booking" in task_lower or "browser" in task_lower or "captcha" in task_lower:
            return {
                "explanation": "I will research options in the granted browser session, then hand control back to you before login, payment, or submission.",
                "steps": [
                    {"description": "Search live sites for matching travel options", "tool": "browser_automation", "risk_level": "low", "dependencies": []},
                    {"description": "Hand browser control to the user at the checkout or login step", "tool": "browser_automation", "risk_level": "high", "dependencies": ["step-1"]}
                ]
            }

        # UC-4: Competitor Research & Analysis. When the user asks for ten
        # competitors, make the fan-out explicit in the task graph instead of
        # pretending that one generic search satisfies the use case.
        if "competitor" in task_lower and ("10" in task_lower or "ten" in task_lower):
            search_steps = [
                {
                    "description": f"Research competitor {index} using public sources",
                    "tool": "web_search",
                    "risk_level": "low",
                    "dependencies": [],
                }
                for index in range(1, 11)
            ]
            fetch_steps = [
                {
                    "description": f"Fetch and verify sources for competitor {index}",
                    "tool": "web_fetch",
                    "risk_level": "low",
                    "dependencies": [f"step-{index}"],
                }
                for index in range(1, 11)
            ]
            fetch_ids = [f"step-{index}" for index in range(11, 21)]
            search_steps.extend(fetch_steps)
            search_steps.extend([
                {
                    "description": "Merge competitor findings and flag conflicting or missing data",
                    "tool": "execute_code",
                    "risk_level": "low",
                    "dependencies": fetch_ids,
                },
                {
                    "description": "Compile a cited comparison report",
                    "tool": "create_document",
                    "risk_level": "medium",
                    "dependencies": ["step-21"],
                },
            ])
            return {
                "explanation": "I will fan out ten independent competitor research workstreams, merge conflicts visibly, and produce a cited comparison report.",
                "steps": search_steps,
            }

        # UC-4: Competitor Research & Analysis
        if "research" in task_lower or "competitor" in task_lower or "compare" in task_lower:
            return {
                "explanation": "I will conduct multi-source web research across key competitors, extract feature and pricing matrices, and synthesize a comprehensive comparison report.",
                "steps": [
                    {"description": "Search web for market landscape and competitor offerings", "tool": "web_search", "risk_level": "low", "dependencies": []},
                    {"description": "Fetch detailed feature specifications and pricing pages", "tool": "web_fetch", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Analyze and structure comparison matrix", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-2"]},
                    {"description": "Compile comprehensive competitive analysis report", "tool": "create_document", "risk_level": "medium", "dependencies": ["step-3"]}
                ]
            }

        # UC-5: Weekly digest / email draft
        if "digest" in task_lower or "email" in task_lower or "ticket" in task_lower or "send" in task_lower:
            return {
                "explanation": "I will aggregate activity data, compile a weekly digest, draft the email review, and prepare an external send gate requiring explicit approval.",
                "steps": [
                    {"description": "Aggregate recent activity and support tickets", "tool": "read_file", "risk_level": "low", "dependencies": []},
                    {"description": "Summarize key issues, resolutions, and trends", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Format weekly executive digest document", "tool": "create_document", "risk_level": "low", "dependencies": ["step-2"]},
                    {"description": "Send weekly digest email to team stakeholders", "tool": "send_email", "risk_level": "high", "dependencies": ["step-3"]}
                ]
            }

        # UC-8: Duplicate cleanup (High Risk)
        if "clean" in task_lower or "duplicate" in task_lower or "delete" in task_lower:
            return {
                "explanation": "I will scan files, compute hash duplicates, generate a consolidation plan, and request approval before purging duplicate copies.",
                "steps": [
                    {"description": "Inventory files and calculate checksums", "tool": "execute_code", "risk_level": "low", "dependencies": []},
                    {"description": "Propose deduplication manifest", "tool": "create_file", "risk_level": "low", "dependencies": ["step-1"]},
                    {"description": "Remove duplicate files with session trash backup", "tool": "delete_file", "risk_level": "high", "dependencies": ["step-2"]}
                ]
            }

        # General Knowledge Work Default Plan
        return {
            "explanation": f"I analyzed your request: '{task}'. Here is the execution plan to research, process, and generate clean deliverables.",
            "steps": [
                {"description": "Analyze requirements and prepare execution workspace", "tool": "execute_code", "risk_level": "low", "dependencies": []},
                {"description": "Process data and perform required computations", "tool": "execute_code", "risk_level": "low", "dependencies": ["step-1"]},
                {"description": "Generate polished deliverable artifact", "tool": "create_document", "risk_level": "medium", "dependencies": ["step-2"]}
            ]
        }

    async def generate_plan(self, task: str, memory_context: str = "") -> Dict[str, Any]:
        return annotate_memory_context(self.generate_plan_sync(task, memory_context), memory_context)

    def reason_step_sync(
        self,
        task: str,
        step: StepBase,
        prior_observations: List[Dict[str, Any]],
        tools_available: List[str]
    ) -> Dict[str, Any]:
        tool = step.tool
        desc = step.description.lower()
        
        thought = f"Executing step '{step.description}'. Using tool '{tool}' to fulfill this objective."
        narration = f"Working on: {step.description}..."
        
        # Tool parameter heuristics
        params: Dict[str, Any] = {}
        if tool == "execute_code":
            params = {
                "language": "python",
                "code": (
                    "# Development preview: no user source data was provided to this offline planner.\n"
                    "result = {'status': 'preview_only', 'message': 'No source data was available; no factual transformation was performed.'}\n"
                    "print(result)"
                )
            }
            narration = "Running a sandbox preview; source data is required for factual processing..."
        elif tool == "create_document":
            doc_type = "md"
            if "spreadsheet" in task.lower() or "expense" in task.lower() or "xlsx" in task.lower():
                doc_type = "xlsx"
            elif "deck" in task.lower() or "slide" in task.lower() or "pptx" in task.lower():
                doc_type = "pptx"
            elif "docx" in task.lower() or "report" in task.lower():
                doc_type = "docx"
                
            params = {
                "title": f"{task[:40]} Deliverable",
                "document_type": doc_type,
                "content": f"# Preview Deliverable\n\nTask: {task}\n\n## Status\nThis offline planning preview did not receive source data or a live model result. No factual findings are asserted. Supply the requested inputs and configure a live provider before treating this as a completed deliverable.\n"
            }
            narration = f"Generating deliverable {doc_type.upper()} document..."
        elif tool == "read_file":
            params = {"path": "input_data.json"}
            narration = "Reading input data files..."
        elif tool == "list_files":
            params = {"path": "."}
            narration = "Scanning and indexing directory..."
        elif tool == "write_file":
            params = {"path": "output.txt", "content": f"Coagent Output for: {task}"}
            narration = "Writing output files..."
        elif tool == "move_file":
            params = {"source": "input.txt", "destination": "organized/input.txt"}
            narration = "Moving files into the approved organization..."
        elif tool in {"bridge_list_files", "bridge_read_file"}:
            params = {"folder": "", "relative_file": "." if tool == "bridge_list_files" else "input.txt"}
            narration = "Requesting the explicitly granted local bridge folder..."
        elif tool == "bridge_move_file":
            params = {"folder": "", "relative_file": "input.txt", "destination_file": "organized/input.txt"}
            narration = "Moving files inside the explicitly granted local folder..."
        elif tool == "delete_file":
            params = {"path": "duplicate_sample.tmp"}
            narration = "Requesting approval to purge file..."
        elif tool == "send_email":
            params = {
                "recipient": "team@example.com",
                "subject": f"Weekly Digest: {task[:30]}",
                "body": "Here is the compiled weekly report for your review."
            }
            narration = "Preparing email dispatch (requires approval)..."
        elif tool == "web_search":
            query = step.description if "competitor" in desc else task
            params = {"query": query[:120]}
            narration = f"Searching web for '{query[:45]}...'..."
        elif tool == "web_fetch":
            source_url = None
            for observation in reversed(prior_observations):
                for item in (observation.get("result") or {}).get("results", []):
                    if isinstance(item, dict) and item.get("url"):
                        source_url = item["url"]
                        break
                if source_url:
                    break
            params = {"url": source_url or "https://example.com/industry-data"}
            narration = "Fetching and verifying a live research source..."
        elif tool == "browser_automation":
            if "takeover" in desc or "login" in desc or "payment" in desc or "checkout" in desc:
                params = {"action": "takeover", "url": "https://example.com/checkout"}
                narration = "Handing the browser back to you for a sensitive step..."
            else:
                params = {"action": "navigate", "url": "https://www.google.com/travel"}
                narration = "Researching options in the granted browser session..."
        else:
            params = {"task": task}

        return {
            "thought": thought,
            "narration": narration,
            "tool": tool,
            "params": params
        }

    async def reason_step(
        self,
        task: str,
        step: StepBase,
        prior_observations: List[Dict[str, Any]],
        tools_available: List[str]
    ) -> Dict[str, Any]:
        return self.reason_step_sync(task, step, prior_observations, tools_available)

_provider_store = settings.DATA_DIR / "llm_provider.dpapi"
_runtime_provider: Dict[str, str] = {}

_saved = load_secret(_provider_store)
if _saved:
    try:
        loaded = json.loads(_saved.decode("utf-8"))
        if isinstance(loaded, dict):
            _runtime_provider = {str(k): str(v) for k, v in loaded.items()}
    except (ValueError, UnicodeDecodeError):
        _runtime_provider = {}


def configure_runtime_provider(provider: str, api_key: str = "", endpoint: str = "", model: str = "", account_id: str = "") -> None:
    global _runtime_provider
    _runtime_provider = {"provider": provider, "api_key": api_key, "endpoint": endpoint, "model": model, "account_id": account_id}
    if provider == "offline_heuristic":
        delete_secret(_provider_store)
    else:
        save_secret(_provider_store, json.dumps(_runtime_provider).encode("utf-8"))


def current_provider_config() -> Dict[str, Any]:
    provider = _runtime_provider.get("provider") or settings.DEFAULT_PROVIDER
    key = _runtime_provider.get("api_key", "")
    configured = bool(key) if provider in {"openai", "anthropic", "gemini"} else provider in {"openai_codex", "anthropic_claude", "ollama", "lm_studio"}
    return {"provider": provider, "model": _runtime_provider.get("model") or os.getenv("OPENAI_MODEL", "gpt-4o-mini"), "configured": configured, "account_id": _runtime_provider.get("account_id") or None}


def get_llm_client_for_account(provider: str, api_key: str = "", endpoint: str = "", model: str = "") -> BaseLLMProvider:
    """Construct a provider client from an explicitly selected account."""
    if provider == "openai_codex":
        return OpenAICodexCLIProvider()
    if provider == "anthropic_claude":
        return AnthropicClaudeCLIProvider()
    if provider == "openai" and api_key:
        client = OpenAILLMProvider(api_key)
        if model:
            client.model = model
        return client
    if provider == "gemini" and api_key:
        return GeminiLLMProvider(api_key)
    if provider == "anthropic" and api_key:
        return AnthropicLLMProvider(api_key)
    if provider in {"ollama", "lm_studio"}:
        resolved_endpoint = endpoint or ("http://127.0.0.1:11434/v1" if provider == "ollama" else "http://127.0.0.1:1234/v1")
        resolved_model = model or ("llama3.2" if provider == "ollama" else "local-model")
        return OpenAICompatibleLLMProvider(resolved_endpoint, resolved_model, api_key)
    return OfflineHeuristicProvider()


def get_llm_client() -> BaseLLMProvider:
    provider = _runtime_provider.get("provider") or settings.DEFAULT_PROVIDER
    api_key = _runtime_provider.get("api_key", "") or {
        "openai": settings.OPENAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
        "gemini": settings.GEMINI_API_KEY,
    }.get(provider, "")
    if provider == "openai_codex":
        return OpenAICodexCLIProvider()
    if provider == "anthropic_claude":
        return AnthropicClaudeCLIProvider()
    if provider == "openai" and api_key:
        return get_llm_client_for_account(provider, api_key, _runtime_provider.get("endpoint", ""), _runtime_provider.get("model", ""))
    if provider == "gemini" and api_key:
        return get_llm_client_for_account(provider, api_key, _runtime_provider.get("endpoint", ""), _runtime_provider.get("model", ""))
    if provider == "anthropic" and api_key:
        return get_llm_client_for_account(provider, api_key, _runtime_provider.get("endpoint", ""), _runtime_provider.get("model", ""))
    if provider in {"ollama", "lm_studio"}:
        endpoint = _runtime_provider.get("endpoint") or ("http://127.0.0.1:11434/v1" if provider == "ollama" else "http://127.0.0.1:1234/v1")
        model = _runtime_provider.get("model") or ("llama3.2" if provider == "ollama" else "local-model")
        return OpenAICompatibleLLMProvider(endpoint, model, api_key)
    return OfflineHeuristicProvider()
