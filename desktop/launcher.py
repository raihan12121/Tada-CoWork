import os
import sys
import time
import webbrowser
import threading
from pathlib import Path
import uvicorn

# Setup base paths
if getattr(sys, "frozen", False):
    # PyInstaller bundle directory
    ROOT_DIR = Path(sys._MEIPASS)
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent

BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Change working directory to user data directory or exe directory
USER_DATA_DIR = Path(os.getenv("APPDATA", ".")) / "Coagent"
USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.chdir(str(USER_DATA_DIR))

def open_browser(port: int = 8000):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}/"
    print(f"[Coagent Desktop] Opening interface at: {url}")
    webbrowser.open(url)

def main():
    print("=" * 60)
    print("  Coagent (Tada-CoWork) — Autonomous Work Agent")
    print("  Version: 1.0.0 (Windows PC Desktop Edition)")
    print("=" * 60)
    print(f"[Coagent] Working data folder: {USER_DATA_DIR.resolve()}")
    
    port = 8000
    # Launch browser thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    from app.main import app
    print(f"[Coagent] Starting local orchestrator service on port {port}...")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

if __name__ == "__main__":
    main()
