import os
import sys
import io
import time
import socket
import urllib.request
import threading
import traceback
import ctypes
from pathlib import Path

# 1. Setup user data directory first
USER_DATA_DIR = Path(os.getenv("APPDATA", Path.home())) / "AnyWork"
USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
(USER_DATA_DIR / "data").mkdir(parents=True, exist_ok=True)
(USER_DATA_DIR / "sandboxes").mkdir(parents=True, exist_ok=True)
os.environ["COAGENT_DATA_DIR"] = str(USER_DATA_DIR)

# Migrate database from legacy Coagent if present
old_data_dir = Path(os.getenv("APPDATA", Path.home())) / "Coagent"
old_db = old_data_dir / "data" / "coagent.db"
new_db = USER_DATA_DIR / "data" / "coagent.db"
if old_db.exists() and not new_db.exists():
    try:
        import shutil
        shutil.copy2(old_db, new_db)
    except Exception:
        pass

def log_debug(msg: str):
    try:
        with open(USER_DATA_DIR / "launcher.log", "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
            f.flush()
    except Exception:
        pass

# 2. In GUI mode (console=False on Windows), sys.stdout and sys.stderr are None.
# Redirect them to persistent log files so isatty() and write() never fail.
if sys.stdout is None:
    try:
        sys.stdout = open(USER_DATA_DIR / "app_output.log", "a", encoding="utf-8", buffering=1)
    except Exception:
        sys.stdout = io.StringIO()

if sys.stderr is None:
    try:
        sys.stderr = open(USER_DATA_DIR / "app_error.log", "a", encoding="utf-8", buffering=1)
    except Exception:
        sys.stderr = io.StringIO()

def handle_thread_exception(args):
    log_debug(f"UNHANDLED THREAD EXCEPTION in {args.thread.name}: {args.exc_type} - {args.exc_value}\n{''.join(traceback.format_tb(args.exc_traceback))}")

threading.excepthook = handle_thread_exception

# 3. Named Mutex for single-instance enforcement
ERROR_ALREADY_EXISTS = 183
kernel32 = ctypes.windll.kernel32
mutex_handle = kernel32.CreateMutexW(None, False, "Local\\AnyWorkDesktopAppMutex_2026")
if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
    log_debug("Another instance of AnyWork is already running. Focusing existing window.")
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, "AnyWork")
        if hwnd:
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            user32.SetForegroundWindow(hwnd)
    except Exception:
        pass
    sys.exit(0)

# 4. Setup base directories
if getattr(sys, "frozen", False):
    ROOT_DIR = Path(sys._MEIPASS)
    EXE_DIR = Path(sys.executable).parent
else:
    ROOT_DIR = Path(__file__).resolve().parent.parent
    EXE_DIR = ROOT_DIR

BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    os.chdir(str(USER_DATA_DIR))
except Exception:
    pass

WINDOW_TITLE = "AnyWork"

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

def wait_for_backend_ready(port: int, max_wait: float = 12.0) -> bool:
    """Poll localhost health endpoint until the server is ready."""
    start = time.time()
    while time.time() - start < max_wait:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False

def show_error_dialog(title: str, message: str):
    """Show native Windows error message box."""
    try:
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR
    except Exception:
        pass

def main():
    log_debug("=== AnyWork Desktop Launcher Started ===")
    port = find_available_port(8000)
    log_debug(f"Assigned localhost port: {port}")

    # Start FastAPI backend orchestrator in background thread
    try:
        import uvicorn
        from app.main import app
        log_debug("Successfully loaded FastAPI app module.")
    except Exception as imp_err:
        log_debug(f"FAILED TO IMPORT FASTAPI APP: {imp_err}\n{traceback.format_exc()}")
        raise

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_config=None,
        access_log=False,
    )
    server = uvicorn.Server(config)

    def run_server():
        try:
            log_debug("Starting uvicorn server in background thread...")
            server.run()
            log_debug("Uvicorn server exited normally.")
        except Exception as srv_err:
            log_debug(f"UVICORN SERVER CRASHED: {srv_err}\n{traceback.format_exc()}")

    server_thread = threading.Thread(target=run_server, daemon=True, name="UvicornBackendThread")
    server_thread.start()

    log_debug(f"Waiting for backend orchestrator readiness on port {port}...")
    if wait_for_backend_ready(port):
        log_debug("Backend orchestrator is ready and healthy.")
    else:
        log_debug("Warning: Backend readiness check timed out. Launching webview anyway.")

    # Create and launch native Edge Chromium WebView2 window
    try:
        import webview
        log_debug(f"pywebview imported successfully from {getattr(webview, '__file__', 'internal')}")
    except Exception as wv_imp_err:
        log_debug(f"FAILED TO IMPORT PYWEBVIEW: {wv_imp_err}\n{traceback.format_exc()}")
        raise

    try:
        log_debug("Creating WebView2 window...")
        window = webview.create_window(
            title=WINDOW_TITLE,
            url=f"http://127.0.0.1:{port}/",
            width=1340,
            height=880,
            min_size=(960, 640),
            background_color="#0b0f17",
        )
        log_debug("Starting WebView2 native window loop...")
        webview.start(gui="edgechromium", debug=False)
        log_debug("WebView2 window closed by user. Shutting down AnyWork.")
    except Exception as wv_err:
        log_debug(f"WEBVIEW RUNTIME CRASH: {wv_err}\n{traceback.format_exc()}")
        raise

    # Clean shutdown
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
        log_debug(f"FATAL STARTUP EXCEPTION: {exc}\n{err_msg}")
        show_error_dialog(
            "AnyWork Startup Error",
            f"AnyWork encountered an error and could not start.\n\nError: {exc}\n\nDetails saved to:\n{crash_log}"
        )
        sys.exit(1)
