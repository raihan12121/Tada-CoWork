import os
import shutil
import sys
from pathlib import Path

import pytest_asyncio

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Isolate test data *before* app.config is imported: the audit chain, SQLite
# database, sandboxes and artifacts must never touch the developer's real
# runtime state (or each other's chains).
TEST_DATA_DIR = backend_dir.parent / "data" / "test-runtime"
if os.getenv("COAGENT_TEST_KEEP_DATA") != "1":
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
os.environ["COAGENT_DATA_DIR"] = str(TEST_DATA_DIR)

from app.core.llm import configure_runtime_provider  # noqa: E402 - needs sys.path insert above
from app.db.session import init_db  # noqa: E402 - needs sys.path insert above


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    await init_db()
    # Tests must not inherit a developer's persisted desktop provider/account.
    configure_runtime_provider("offline_heuristic")
