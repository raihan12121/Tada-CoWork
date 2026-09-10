import os
import sys
import shutil
import asyncio
import tempfile
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from app.config import settings

class SandboxSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.sandbox_dir = settings.SANDBOXES_DIR / session_id
        self.trash_dir = self.sandbox_dir / ".trash"
        self.versions_dir = self.sandbox_dir / ".versions"
        self.artifacts_dir = self.sandbox_dir / "artifacts"
        
        self.sandbox_dir.mkdir(parents=True, exist_ok=True)
        self.trash_dir.mkdir(parents=True, exist_ok=True)
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    def resolve_path(self, relative_path: str) -> Path:
        """
        Guarantees path cannot escape the sandbox root (prevents path traversal ../).
        """
        # Clean relative path
        norm_path = os.path.normpath(relative_path).lstrip("/\\")
        full_path = (self.sandbox_dir / norm_path).resolve()
        
        # Verify it stays strictly inside sandbox_dir
        if not str(full_path).startswith(str(self.sandbox_dir.resolve())):
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
        
        if language == "python":
            script_path = self.sandbox_dir / f"_run_{int(time.time()*1000)}.py"
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)
            cmd = [sys.executable, str(script_path)]
        elif language in ("node", "javascript"):
            script_path = self.sandbox_dir / f"_run_{int(time.time()*1000)}.js"
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
            "PATH": os.environ.get("PATH", "")
        }

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

class SandboxManager:
    def __init__(self):
        self._sandboxes: Dict[str, SandboxSession] = {}

    def get_or_create(self, session_id: str) -> SandboxSession:
        if session_id not in self._sandboxes:
            self._sandboxes[session_id] = SandboxSession(session_id)
        return self._sandboxes[session_id]

    def remove(self, session_id: str):
        if session_id in self._sandboxes:
            self._sandboxes[session_id].destroy()
            del self._sandboxes[session_id]

sandbox_manager = SandboxManager()
