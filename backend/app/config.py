import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SANDBOXES_DIR = BASE_DIR / "sandboxes"
DATA_DIR = BASE_DIR / "data"

SANDBOXES_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    PROJECT_NAME: str = "Coagent / Tada-CoWork"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/v1"
    
    # Storage paths
    BASE_DIR: Path = BASE_DIR
    SANDBOXES_DIR: Path = SANDBOXES_DIR
    DATA_DIR: Path = DATA_DIR
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR}/coagent.db")
    
    # LLM Settings
    DEFAULT_PROVIDER: str = os.getenv("LLM_PROVIDER", "offline_heuristic")  # "anthropic", "openai", "gemini", "offline_heuristic"
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Quotas & Limits
    DEFAULT_MAX_STEPS: int = int(os.getenv("DEFAULT_MAX_STEPS", "30"))
    DEFAULT_MAX_TOOL_CALLS: int = int(os.getenv("DEFAULT_MAX_TOOL_CALLS", "50"))
    DEFAULT_TIMEOUT_SECONDS: int = int(os.getenv("DEFAULT_TIMEOUT_SECONDS", "300"))
    DEFAULT_MAX_OUTPUT_BYTES: int = int(os.getenv("DEFAULT_MAX_OUTPUT_BYTES", "1048576")) # 1MB
    
    # Bridge Secret
    BRIDGE_SECRET: str = os.getenv("BRIDGE_SECRET", "coagent_local_bridge_secret_key_2026")

settings = Settings()
