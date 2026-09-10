import os
import sys
import time
import socket
import urllib.request
import json
import webbrowser
import threading
import traceback
import ctypes
from pathlib import Path

# Setup base paths
if getattr(sys, "frozen", False):
    ROOT_DIR = Path(sys._MEIPASS)
    EXE_DIR = Path(sys.executable).parent
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent
    EXE_DIR = ROOT_DIR

BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure writable data directory in %APPDATA%/Coagent
USER_DATA_DIR = Path(os.getenv("APPDATA", Path.home())) / "Coagent"
USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["COAGENT_DATA_DIR"] = str(USER_DATA_DIR)

# Switch working directory to user data dir so any relative writes go to AppData
try:
    os.chdir(str(USER_DATA_DIR))
except Exception:
    pass

def is_coagent_running(port: int = 8000) -> bool:
    """Check if another Coagent instance is already running on port."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return "Coagent" in data.get("service", "")
    except Exception:
        return False
    return False

def find_available_port(start_port: int = 8000, max_attempts: int = 20) -> int:
    """Find the first available TCP port."""
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return start_port

def open_browser(port: int):
    time.sleep(1.0)
    url = f"http://127.0.0.1:{port}/"
    print(f"[Coagent Desktop] Opening browser interface at: {url}")
    webbrowser.open(url)

def show_error_dialog(title: str, message: str):
    """Show native Windows error dialog."""
    try:
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR
    except Exception:
        print(f"[{title}] {message}", file=sys.stderr)

def main():
    print("=" * 65)
    print("   Coagent (Tada-CoWork) — Autonomous Work Agent")
    print("   Version: 1.0.0 (Windows PC Desktop Edition)")
    print("=" * 65)
    print(f"[Coagent] Working data directory: {USER_DATA_DIR.resolve()}")

    target_port = 8000

    # 1. Check if Coagent is already running
    if is_coagent_running(target_port):
        print(f"[Coagent] An active instance of Coagent is already running on port {target_port}.")
        print(f"[Coagent] Bringing up the application in your browser...")
        open_browser(target_port)
        time.sleep(1.5)
        sys.exit(0)

    # 2. Check if port is free or find an open port
    available_port = find_available_port(target_port)
    if available_port != target_port:
        print(f"[Coagent] Port {target_port} is busy. Switched to port {available_port}.")

    # 3. Schedule browser opening
    threading.Thread(target=open_browser, args=(available_port,), daemon=True).start()

    # 4. Import application & boot uvicorn
    import uvicorn
    from app.main import app

    print(f"[Coagent] Starting local orchestrator service on http://127.0.0.1:{available_port}...")
    uvicorn.run(app, host="127.0.0.1", port=available_port, log_level="info")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        err_msg = traceback.format_exc()
        crash_log = USER_DATA_DIR / "crash.log"
        try:
            crash_log.write_text(err_msg, encoding="utf-8")
        except Exception:
            pass
        show_error_dialog(
            "Coagent Startup Error",
            f"Coagent failed to start.\n\nError: {exc}\n\nLog saved to:\n{crash_log}\n\nPlease check the log file or restart your computer."
        )
        sys.exit(1)
