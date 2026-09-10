import os
import sys
import time
import socket
import urllib.request
import threading
import traceback
import ctypes
from pathlib import Path

# Setup base directories
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

try:
    os.chdir(str(USER_DATA_DIR))
except Exception:
    pass

WINDOW_TITLE = "Coagent"

def bring_existing_window_to_foreground() -> bool:
    """If an existing Coagent desktop window is running, focus it and return True."""
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, WINDOW_TITLE)
        if hwnd:
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            user32.SetForegroundWindow(hwnd)
            return True
    except Exception:
        pass
    return False

def find_available_port(start_port: int = 8000, max_attempts: int = 30) -> int:
    """Find the first available localhost TCP port."""
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return start_port

def wait_for_backend_ready(port: int, max_wait: float = 4.0) -> bool:
    """Poll localhost health endpoint until the server is ready."""
    start = time.time()
    while time.time() - start < max_wait:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
            with urllib.request.urlopen(req, timeout=0.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.08)
    return False

def show_error_dialog(title: str, message: str):
    """Show native Windows error message box."""
    try:
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR
    except Exception:
        pass

def main():
    # 1. Check if another instance is already running
    if bring_existing_window_to_foreground():
        sys.exit(0)

    # 2. Pick open port
    port = find_available_port(8000)

    # 3. Start backend orchestrator in daemon thread
    import uvicorn
    from app.main import app

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="error",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    # Wait for server ready
    wait_for_backend_ready(port)

    # 4. Create and launch native desktop window (Edge Chromium WebView2)
    import webview

    window = webview.create_window(
        title=WINDOW_TITLE,
        url=f"http://127.0.0.1:{port}/",
        width=1340,
        height=880,
        min_size=(960, 640),
        background_color="#0b0f17",
    )

    # Start native UI event loop
    webview.start(gui="edgechromium", debug=False)

    # 5. Clean shutdown when window is closed
    server.should_exit = True
    sys.exit(0)

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
            f"Coagent encountered an error and could not start.\n\nError: {exc}\n\nDetails saved to:\n{crash_log}"
        )
        sys.exit(1)
