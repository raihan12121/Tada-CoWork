import os
import sys
import shutil
import asyncio
import tempfile
import time
import httpx
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from app.config import settings

import re

SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")

class SandboxSession:
    def __init__(self, session_id: str):
        if not session_id or not SESSION_ID_PATTERN.match(session_id):
            raise ValueError(f"Invalid session_id '{session_id}': must be non-empty and contain only alphanumeric, dash, and underscore characters.")

        target_dir = (settings.SANDBOXES_DIR / session_id).resolve()
        sandboxes_root = settings.SANDBOXES_DIR.resolve()
        try:
            target_dir.relative_to(sandboxes_root)
        except ValueError:
            raise ValueError(f"Security error: Session path '{target_dir}' traverses outside sandbox root.")
        if target_dir == sandboxes_root:
            raise ValueError(f"Security error: Session path '{target_dir}' traverses outside sandbox root.")

        self.session_id = session_id
        self.sandbox_dir = target_dir
        self.trash_dir = self.sandbox_dir / ".trash"
        self.versions_dir = self.sandbox_dir / ".versions"
        self.artifacts_dir = self.sandbox_dir / "artifacts"
        
        self.sandbox_dir.mkdir(parents=True, exist_ok=True)
        self.trash_dir.mkdir(parents=True, exist_ok=True)
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    def disk_usage_bytes(self) -> int:
        """Return the total regular-file footprint of this session sandbox."""
        total = 0
        for item in self.sandbox_dir.rglob("*"):
            if item.is_file():
                try:
                    total += item.stat().st_size
                except OSError:
                    continue
        return total

    def ensure_disk_capacity(self, additional_bytes: int = 0) -> None:
        projected = self.disk_usage_bytes() + max(0, int(additional_bytes))
        if projected > settings.DEFAULT_MAX_DISK_BYTES:
            raise OSError(
                f"Session disk limit ({settings.DEFAULT_MAX_DISK_BYTES} bytes) exceeded; "
                f"projected usage is {projected} bytes."
            )

    def resolve_path(self, relative_path: str) -> Path:
        """
        Guarantees path cannot escape the sandbox root (prevents path traversal ../).
        """
        # Clean relative path
        norm_path = os.path.normpath(relative_path).lstrip("/\\")
        full_path = (self.sandbox_dir / norm_path).resolve()
        
        # Verify it stays strictly inside sandbox_dir
        try:
            full_path.relative_to(self.sandbox_dir.resolve())
        except ValueError:
            raise PermissionError(f"Access denied: Path '{relative_path}' attempts to traverse outside sandbox boundary.")
        return full_path

    async def execute_code(
        self,
        code: str,
        language: str = "python",
        timeout_seconds: int = 20
    ) -> Dict[str, Any]:
        """
        Runs code in an isolated subprocess within the sandbox directory.
        Enforces timeout, output size cap, and sanitized environment.
        """
        start_time = time.time()
        timeout_seconds = max(1, min(int(timeout_seconds), settings.DEFAULT_TIMEOUT_SECONDS))
        if len(code.encode("utf-8")) > settings.DEFAULT_MAX_CODE_BYTES:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Code payload exceeds the {settings.DEFAULT_MAX_CODE_BYTES}-byte limit.",
                "execution_time_ms": 0,
                "exit_code": -1,
            }
        
        if language == "python":
            script_path = self.sandbox_dir / f"_run_{int(time.time()*1000)}.py"
            self.ensure_disk_capacity(len(code.encode("utf-8")))
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)
            if getattr(sys, "frozen", False):
                worker = Path(sys.executable).with_name("CoagentSandboxWorker.exe")
                if not worker.exists():
                    return {
                        "success": False,
                        "stdout": "",
                        "stderr": "Packaged sandbox worker is missing. Reinstall the current Coagent build.",
                        "execution_time_ms": int((time.time() - start_time) * 1000),
                        "exit_code": -1,
                    }
                cmd = [str(worker), str(script_path)]
            else:
                cmd = [sys.executable, str(script_path)]
        elif language in ("node", "javascript"):
            script_path = self.sandbox_dir / f"_run_{int(time.time()*1000)}.js"
            self.ensure_disk_capacity(len(code.encode("utf-8")))
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)
            cmd = ["node", str(script_path)]
        else:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Unsupported language: {language}",
                "execution_time_ms": 0,
                "exit_code": -1
            }

        # Sanitized environment
        env = {
            "PYTHONUNBUFFERED": "1",
            "SANDBOX_ROOT": str(self.sandbox_dir),
            "PATH": os.environ.get("PATH", ""),
            "HOME": str(self.sandbox_dir),
            "TEMP": str(self.sandbox_dir),
            "TMP": str(self.sandbox_dir),
        }
        # Explicitly remove inherited credentials and interpreter injection
        # variables. Network isolation requires the container backend; local
        # mode remains a development fallback and is labelled accordingly.

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(self.sandbox_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout_seconds
                )
                exit_code = process.returncode
            except asyncio.TimeoutError:
                try:
                    process.kill()
                except Exception:
                    pass
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": f"Execution timed out after {timeout_seconds} seconds.",
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "exit_code": -1
                }
            finally:
                if script_path.exists():
                    try:
                        script_path.unlink()
                    except Exception:
                        pass

            # Cap output to avoid buffer bombs
            max_bytes = settings.DEFAULT_MAX_OUTPUT_BYTES
            stdout = stdout_bytes[:max_bytes].decode("utf-8", errors="replace")
            stderr = stderr_bytes[:max_bytes].decode("utf-8", errors="replace")
            try:
                self.ensure_disk_capacity(0)
            except OSError as exc:
                return {
                    "success": False,
                    "stdout": stdout,
                    "stderr": str(exc),
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "exit_code": -1,
                }
            
            if len(stdout_bytes) > max_bytes:
                stdout += "\n...[Output truncated to 1MB limit]..."

            return {
                "success": exit_code == 0,
                "stdout": stdout,
                "stderr": stderr,
                "execution_time_ms": int((time.time() - start_time) * 1000),
                "exit_code": exit_code
            }

        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Subprocess launch failed: {str(e)}",
                "execution_time_ms": int((time.time() - start_time) * 1000),
                "exit_code": -1
            }

    def destroy(self):
        """Cleanup sandbox files on session archive/destroy."""
        if self.sandbox_dir.exists():
            shutil.rmtree(self.sandbox_dir, ignore_errors=True)


class DockerSandboxSession(SandboxSession):
    """Container-backed execution provider for production-like deployments.

    The local provider remains available for offline development, but it must
    not be treated as a security boundary. Docker mode isolates the process,
    disables network egress, drops Linux capabilities, and enforces container
    resource ceilings. A deployment can replace this provider with a
    Firecracker/E2B adapter without changing the executor contract.
    """

    async def execute_code(self, code: str, language: str = "python", timeout_seconds: int = 20) -> Dict[str, Any]:
        start_time = time.time()
        timeout_seconds = max(1, min(int(timeout_seconds), settings.DEFAULT_TIMEOUT_SECONDS))
        if len(code.encode("utf-8")) > settings.DEFAULT_MAX_CODE_BYTES:
            return {"success": False, "stdout": "", "stderr": "Code payload exceeds the configured limit.", "execution_time_ms": 0, "exit_code": -1}
        if language not in ("python",):
            return {"success": False, "stdout": "", "stderr": "Docker sandbox currently supports Python only.", "execution_time_ms": 0, "exit_code": -1}

        script_path = self.sandbox_dir / f"_run_{int(time.time() * 1000)}.py"
        self.ensure_disk_capacity(len(code.encode("utf-8")))
        script_path.write_text(code, encoding="utf-8")
        container_path = f"/workspace/{script_path.name}"
        network_arg = "none" if settings.SANDBOX_NETWORK.lower() == "none" else settings.SANDBOX_NETWORK
        cmd = [
            "docker", "run", "--rm",
            "--network", network_arg,
            "--cpus", settings.SANDBOX_CPU_LIMIT,
            "--memory", settings.SANDBOX_MEMORY_LIMIT,
            "--pids-limit", str(settings.SANDBOX_PIDS_LIMIT),
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "-v", f"{self.sandbox_dir.resolve()}:/workspace:rw",
            "-w", "/workspace",
            settings.SANDBOX_IMAGE,
            "python", container_path,
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                process.kill()
                return {"success": False, "stdout": "", "stderr": f"Execution timed out after {timeout_seconds} seconds.", "execution_time_ms": int((time.time() - start_time) * 1000), "exit_code": -1}
            max_bytes = settings.DEFAULT_MAX_OUTPUT_BYTES
            stdout = stdout_bytes[:max_bytes].decode("utf-8", errors="replace")
            stderr = stderr_bytes[:max_bytes].decode("utf-8", errors="replace")
            try:
                self.ensure_disk_capacity(0)
            except OSError as exc:
                return {"success": False, "stdout": stdout, "stderr": str(exc), "execution_time_ms": int((time.time() - start_time) * 1000), "exit_code": -1}
            return {"success": process.returncode == 0, "stdout": stdout, "stderr": stderr, "execution_time_ms": int((time.time() - start_time) * 1000), "exit_code": process.returncode}
        except FileNotFoundError:
            return {"success": False, "stdout": "", "stderr": "Docker executable is not available.", "execution_time_ms": int((time.time() - start_time) * 1000), "exit_code": -1}
        except Exception as exc:
            return {"success": False, "stdout": "", "stderr": f"Docker sandbox failed: {exc}", "execution_time_ms": int((time.time() - start_time) * 1000), "exit_code": -1}
        finally:
            script_path.unlink(missing_ok=True)


class ManagedSandboxSession(SandboxSession):
    """HTTP contract for a provider-owned isolated execution worker.

    The orchestrator sends code and limits to the managed worker; it never
    executes the payload locally in this mode. The provider owns the sandbox
    filesystem and isolation boundary, while this object preserves the tool
    contract used by the executor.
    """

    async def execute_code(self, code: str, language: str = "python", timeout_seconds: int = 20) -> Dict[str, Any]:
        started = time.time()
        if not settings.MANAGED_SANDBOX_URL:
            return {"success": False, "stdout": "", "stderr": "Managed sandbox URL is not configured.", "execution_time_ms": 0, "exit_code": -1}
        if len(code.encode("utf-8")) > settings.DEFAULT_MAX_CODE_BYTES:
            return {"success": False, "stdout": "", "stderr": "Code payload exceeds the configured limit.", "execution_time_ms": 0, "exit_code": -1}
        if language not in ("python", "node", "javascript"):
            return {"success": False, "stdout": "", "stderr": f"Unsupported language: {language}", "execution_time_ms": 0, "exit_code": -1}
        payload = {
            "session_id": self.session_id,
            "code": code,
            "language": "javascript" if language == "node" else language,
            "timeout_seconds": max(1, min(int(timeout_seconds), settings.DEFAULT_TIMEOUT_SECONDS)),
            "limits": {
                "max_output_bytes": settings.DEFAULT_MAX_OUTPUT_BYTES,
                "max_disk_bytes": settings.DEFAULT_MAX_DISK_BYTES,
                "cpu": settings.SANDBOX_CPU_LIMIT,
                "memory": settings.SANDBOX_MEMORY_LIMIT,
                "pids": settings.SANDBOX_PIDS_LIMIT,
                "network": settings.SANDBOX_NETWORK,
            },
        }
        headers = {"Authorization": f"Bearer {settings.MANAGED_SANDBOX_TOKEN}"} if settings.MANAGED_SANDBOX_TOKEN else {}
        try:
            async with httpx.AsyncClient(timeout=payload["timeout_seconds"] + 10) as client:
                response = await client.post(f"{settings.MANAGED_SANDBOX_URL.rstrip('/')}/v1/execute", json=payload, headers=headers)
            if response.status_code >= 400:
                return {"success": False, "stdout": "", "stderr": f"Managed sandbox returned HTTP {response.status_code}.", "execution_time_ms": int((time.time() - started) * 1000), "exit_code": -1}
            result = response.json()
            if not isinstance(result, dict) or not isinstance(result.get("success"), bool):
                raise ValueError("Managed sandbox response is missing a boolean success field")
            result.setdefault("stdout", "")
            result.setdefault("stderr", "")
            result.setdefault("exit_code", 0 if result["success"] else -1)
            result["execution_time_ms"] = int((time.time() - started) * 1000)
            return result
        except Exception as exc:
            return {"success": False, "stdout": "", "stderr": f"Managed sandbox request failed: {exc}", "execution_time_ms": int((time.time() - started) * 1000), "exit_code": -1}

class SandboxManager:
    def __init__(self):
        self._sandboxes: Dict[str, SandboxSession] = {}

    def get_or_create(self, session_id: str) -> SandboxSession:
        if session_id not in self._sandboxes:
            if settings.APP_ENV.lower() == "production" and settings.SANDBOX_BACKEND.lower() == "local":
                raise RuntimeError(
                    "Local subprocess sandbox is development-only. Configure SANDBOX_BACKEND=docker or a managed isolation adapter before production startup."
                )
            if settings.SANDBOX_BACKEND.lower() == "docker":
                self._sandboxes[session_id] = DockerSandboxSession(session_id)
            elif settings.SANDBOX_BACKEND.lower() == "managed":
                if not settings.MANAGED_SANDBOX_URL:
                    raise RuntimeError("Managed sandbox adapter requires COAGENT_MANAGED_SANDBOX_URL.")
                if settings.APP_ENV.lower() == "production" and not settings.MANAGED_SANDBOX_URL.lower().startswith("https://"):
                    raise RuntimeError("Managed sandbox URL must use HTTPS in production.")
                if settings.APP_ENV.lower() == "production" and not settings.MANAGED_SANDBOX_TOKEN:
                    raise RuntimeError("Managed sandbox adapter requires COAGENT_MANAGED_SANDBOX_TOKEN in production.")
                self._sandboxes[session_id] = ManagedSandboxSession(session_id)
            else:
                self._sandboxes[session_id] = SandboxSession(session_id)
        return self._sandboxes[session_id]

    def get_existing(self, session_id: str) -> Optional[SandboxSession]:
        return self._sandboxes.get(session_id)

    def archived_artifacts_dir(self, session_id: str) -> Path:
        if not SESSION_ID_PATTERN.match(session_id):
            raise ValueError("Invalid session ID")
        target = (settings.DATA_DIR / "artifacts" / session_id).resolve()
        root = (settings.DATA_DIR / "artifacts").resolve()
        try:
            target.relative_to(root)
        except ValueError:
            raise ValueError("Invalid artifact archive path")
        return target

    def finalize(self, session_id: str):
        """Move deliverables to durable artifact storage, then destroy the
        ephemeral session sandbox and its temporary working state."""
        sandbox = self._sandboxes.get(session_id)
        if not sandbox:
            return
        archive = self.archived_artifacts_dir(session_id)
        archive.mkdir(parents=True, exist_ok=True)
        if sandbox.artifacts_dir.exists():
            for item in sandbox.artifacts_dir.iterdir():
                shutil.move(str(item), str(archive / item.name))
        sandbox.destroy()
        self._sandboxes.pop(session_id, None)

    def remove(self, session_id: str):
        if session_id in self._sandboxes:
            self._sandboxes[session_id].destroy()
            del self._sandboxes[session_id]

sandbox_manager = SandboxManager()
