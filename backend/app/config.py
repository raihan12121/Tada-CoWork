import os
import sys
from pathlib import Path


# In packaged mode or when installed in Program Files, write data to user's AppData
if getattr(sys, "frozen", False) or os.getenv("COAGENT_DATA_DIR") or "Program Files" in str(Path(__file__).resolve()):
    USER_BASE_DIR = Path(os.getenv("COAGENT_DATA_DIR", Path(os.getenv("APPDATA", Path.home())) / "Coagent"))
else:
    USER_BASE_DIR = Path(__file__).resolve().parent.parent.parent

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SANDBOXES_DIR = USER_BASE_DIR / "sandboxes"
DATA_DIR = USER_BASE_DIR / "data"

SANDBOXES_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PROJECT_NAME: str = "Coagent / Tada-CoWork"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/v1"
    API_AUTH_TOKEN: str = os.getenv("COAGENT_API_AUTH_TOKEN", "")
    ADMIN_TOKEN: str = os.getenv("COAGENT_ADMIN_TOKEN", "")
    DEFAULT_RETENTION_DAYS: int = int(os.getenv("COAGENT_RETENTION_DAYS", "30"))
    
    # Storage paths
    BASE_DIR: Path = BASE_DIR
    SANDBOXES_DIR: Path = SANDBOXES_DIR
    DATA_DIR: Path = DATA_DIR
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR.as_posix()}/coagent.db")
    
    # LLM Settings
    DEFAULT_PROVIDER: str = os.getenv("LLM_PROVIDER", "offline_heuristic")  # "anthropic", "openai", "gemini", "offline_heuristic"
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_ACCESS_TOKEN: str = os.getenv("COAGENT_GOOGLE_ACCESS_TOKEN", "")
    GITHUB_TOKEN: str = os.getenv("COAGENT_GITHUB_TOKEN", "")
    SLACK_TOKEN: str = os.getenv("COAGENT_SLACK_TOKEN", "")
    GOOGLE_GMAIL_ACCESS_TOKEN: str = os.getenv("COAGENT_GOOGLE_GMAIL_ACCESS_TOKEN", "")
    MICROSOFT_GRAPH_TOKEN: str = os.getenv("COAGENT_MICROSOFT_GRAPH_TOKEN", "")
    ALLOW_DEMO_FIXTURES: bool = os.getenv("COAGENT_ALLOW_DEMO_FIXTURES", "false").lower() == "true"
    DELIVERY_MODE: str = os.getenv("COAGENT_DELIVERY_MODE", "preview")
    SMTP_HOST: str = os.getenv("COAGENT_SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("COAGENT_SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("COAGENT_SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("COAGENT_SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("COAGENT_SMTP_FROM_EMAIL", "")
    
    # Quotas & Limits
    DEFAULT_MAX_STEPS: int = int(os.getenv("DEFAULT_MAX_STEPS", "30"))
    DEFAULT_MAX_TOOL_CALLS: int = int(os.getenv("DEFAULT_MAX_TOOL_CALLS", "50"))
    DEFAULT_TIMEOUT_SECONDS: int = int(os.getenv("DEFAULT_TIMEOUT_SECONDS", "300"))
    DEFAULT_MAX_OUTPUT_BYTES: int = int(os.getenv("DEFAULT_MAX_OUTPUT_BYTES", "1048576")) # 1MB
    ESTIMATED_TOOL_CALL_COST_USD: float = float(os.getenv("ESTIMATED_TOOL_CALL_COST_USD", "0.0001"))
    DEFAULT_MAX_CODE_BYTES: int = int(os.getenv("DEFAULT_MAX_CODE_BYTES", "262144"))
    SANDBOX_BACKEND: str = os.getenv("SANDBOX_BACKEND", "local")
    SANDBOX_NETWORK: str = os.getenv("SANDBOX_NETWORK", "none")
    SANDBOX_IMAGE: str = os.getenv("SANDBOX_IMAGE", "python:3.12-slim")
    SANDBOX_CPU_LIMIT: str = os.getenv("SANDBOX_CPU_LIMIT", "1.0")
    SANDBOX_MEMORY_LIMIT: str = os.getenv("SANDBOX_MEMORY_LIMIT", "512m")
    SANDBOX_PIDS_LIMIT: int = int(os.getenv("SANDBOX_PIDS_LIMIT", "64"))
    
    # Bridge Secret
    BRIDGE_SECRET: str = os.getenv("BRIDGE_SECRET", "dev-only-local-bridge-secret" if APP_ENV == "development" else "")
    BRIDGE_AGENT_URL: str = os.getenv("COAGENT_BRIDGE_AGENT_URL", "")
    ORCHESTRATOR_URL: str = os.getenv("COAGENT_ORCHESTRATOR_URL", "http://127.0.0.1:8000")

settings = Settings()
