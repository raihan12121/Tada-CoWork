import os
import sys
import time
import argparse
import json
import threading
import urllib.request
import ssl
import shutil
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import List, Optional

class LocalBridgeAgent:
    """
    Coagent Desktop Companion Process (TRD FR-16 - FR-20).
    Exposes scoped folders to the orchestrator over authenticated channel.
    Rejects any path outside granted folders.
    """
    def __init__(self, token: str, granted_folders: Optional[List[str]] = None):
        self.token = token
        self.granted_folders = [Path(f).resolve() for f in (granted_folders or [])]
        self._playwright = None
        self._browser = None
        self._page = None

    def add_folder(self, folder_path: str):
        p = Path(folder_path).resolve()
        if p.exists() and p.is_dir():
            self.granted_folders.append(p)
            print(f"[Bridge] Granted folder access: {p}")
        else:
            print(f"[Bridge Error] Invalid folder: {folder_path}")

    def revoke_folder(self, folder_path: str):
        p = Path(folder_path).resolve()
        self.granted_folders = [f for f in self.granted_folders if f != p]
        print(f"[Bridge] Revoked folder access: {p}")

    def verify_path_access(self, target_path: str) -> Path:
        resolved = Path(target_path).resolve()
        for granted in self.granted_folders:
            try:
                # Check if target is inside granted folder
                resolved.relative_to(granted)
                return resolved
            except ValueError:
                continue
        raise PermissionError(f"Security Alert: Path '{target_path}' is out-of-scope. Access denied.")

    def read_file(self, target_path: str) -> str:
        safe_path = self.verify_path_access(target_path)
        if not safe_path.is_file():
            raise FileNotFoundError(f"Not a file: {safe_path}")
        return safe_path.read_text(encoding="utf-8", errors="replace")

    def list_folder(self, folder_path: str) -> List[str]:
        safe_path = self.verify_path_access(folder_path)
        return [f.name for f in safe_path.iterdir()]

    def file_action(self, payload: dict) -> dict:
        folder = Path(payload.get("folder", "")).resolve()
        relative_file = payload.get("relative_file", "")
        action = payload.get("action", "read")
        if folder not in self.granted_folders:
            raise PermissionError("Folder is not granted by this bridge process.")
        target = self.verify_path_access(str(folder / relative_file))
        if action == "list":
            if not target.is_dir():
                raise FileNotFoundError("Granted directory not found.")
            return {"action": "list", "path": str(target), "items": [item.name for item in target.iterdir()]}
        if action == "read":
            if not target.is_file():
                raise FileNotFoundError("Granted file not found.")
            return {"action": "read", "path": str(target), "content": target.read_text(encoding="utf-8", errors="replace")}
        if action == "move":
            destination = payload.get("destination_file", "")
            if not destination:
                raise ValueError("destination_file is required for move actions.")
            destination_path = self.verify_path_access(str(folder / destination))
            if destination_path.exists():
                raise FileExistsError("Destination already exists.")
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(destination_path))
            return {"action": "move", "source": str(target), "destination": str(destination_path)}
        raise ValueError(f"Unsupported bridge action: {action}")

    def browser_action(self, payload: dict) -> dict:
        """Execute a browser action through an optional Playwright install."""
        action = payload.get("action", "")
        if action == "takeover":
            return {"success": False, "status": "takeover_required", "message": "User takeover is required."}
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return {"success": False, "status": "unsupported", "error": "Install Playwright in the bridge environment to enable browser control."}
        try:
            if self._playwright is None:
                self._playwright = sync_playwright().start()
                self._browser = self._playwright.chromium.launch(headless=False)
                self._page = self._browser.new_page()
            page = self._page
            if action == "navigate":
                page.goto(payload.get("url", ""), wait_until="domcontentloaded")
                return {"success": True, "status": "navigated", "url": page.url}
            if action == "click":
                page.locator(payload.get("selector", "")).click()
                return {"success": True, "status": "clicked", "url": page.url}
            if action == "type":
                page.locator(payload.get("selector", "")).fill(payload.get("text", ""))
                return {"success": True, "status": "typed", "url": page.url}
            if action == "screenshot":
                page.screenshot(path="coagent-screenshot.png", type="png")
                return {"success": True, "status": "screenshot", "path": "coagent-screenshot.png", "url": page.url}
            return {"success": False, "error": f"Unsupported browser action: {action}"}
        except Exception as exc:
            return {"success": False, "status": "browser_error", "error": str(exc)}

def serve(agent: LocalBridgeAgent, host: str, port: int, certfile: Optional[str] = None, keyfile: Optional[str] = None):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, payload: dict):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._json(200, {"status": "alive", "granted_folders": [str(p) for p in agent.granted_folders]})
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            if self.headers.get("X-Bridge-Token") != agent.token:
                self._json(401, {"error": "invalid bridge token"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/browser":
                result = agent.browser_action(payload)
                self._json(200 if result.get("success") else 503, result)
            elif self.path == "/grant_folder":
                agent.add_folder(payload.get("folder_path", ""))
                self._json(200, {"status": "granted"})
            elif self.path == "/revoke_folder":
                agent.revoke_folder(payload.get("folder_path", ""))
                self._json(200, {"status": "revoked"})
            elif self.path == "/file":
                try:
                    self._json(200, agent.file_action(payload))
                except PermissionError as exc:
                    self._json(403, {"error": str(exc)})
                except FileNotFoundError as exc:
                    self._json(404, {"error": str(exc)})
                except Exception as exc:
                    self._json(400, {"error": str(exc)})
            else:
                self._json(404, {"error": "not found"})

        def log_message(self, *_args):
            return

    server = HTTPServer((host, port), Handler)
    if bool(certfile) != bool(keyfile):
        raise ValueError("Both --certfile and --keyfile are required for TLS bridge transport.")
    if certfile and keyfile:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=certfile, keyfile=keyfile)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()

def register_with_orchestrator(orchestrator: str, agent: LocalBridgeAgent, session_id: Optional[str], allow_browser: bool):
    payload = json.dumps({
        "client_name": "coagent-python-bridge",
        "granted_folders": [str(folder) for folder in agent.granted_folders],
        "allow_browser_control": allow_browser,
        "session_id": session_id,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{orchestrator.rstrip('/')}/v1/bridge/register",
        data=payload,
        headers={"Content-Type": "application/json", "X-Bridge-Token": agent.token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        registration = json.loads(response.read().decode("utf-8"))
    session_token = registration.get("session_token")
    master_token = agent.token
    if session_token:
        # The HTTP file/browser server uses the session-scoped token. The
        # master token remains private to registration and heartbeat calls.
        agent.token = session_token

    def heartbeat():
        while True:
            try:
                heartbeat_request = urllib.request.Request(
                    f"{orchestrator.rstrip('/')}/v1/bridge/heartbeat",
                    headers={"X-Bridge-Token": master_token},
                    method="POST",
                )
                with urllib.request.urlopen(heartbeat_request, timeout=10):
                    pass
            except Exception:
                pass
            time.sleep(30)

    threading.Thread(target=heartbeat, daemon=True).start()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Coagent Desktop Local Bridge Agent")
    parser.add_argument("--token", default=os.getenv("BRIDGE_SECRET", ""), help="Session bridge auth token")
    parser.add_argument("--folder", action="append", help="Grant folder path")
    parser.add_argument("--serve", action="store_true", help="Run the authenticated bridge HTTP transport")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--orchestrator", default="", help="Orchestrator URL used to register this bridge")
    parser.add_argument("--session-id", default=None, help="Session whose grants this bridge serves")
    parser.add_argument("--allow-browser", action="store_true", help="Grant browser control for the registered session")
    parser.add_argument("--certfile", default="", help="TLS certificate PEM for encrypted bridge transport")
    parser.add_argument("--keyfile", default="", help="TLS private-key PEM for encrypted bridge transport")
    args = parser.parse_args()

    agent = LocalBridgeAgent(token=args.token, granted_folders=args.folder or [])
    print("[Bridge Active] Coagent Local Bridge Agent started.")
    print(f"[Bridge] Granted folders: {[str(p) for p in agent.granted_folders]}")
    if args.serve:
        if not agent.token:
            raise SystemExit("A non-empty --token or BRIDGE_SECRET is required for bridge serving.")
        if args.orchestrator:
            try:
                register_with_orchestrator(args.orchestrator, agent, args.session_id, args.allow_browser)
                print("[Bridge] Registered with orchestrator.")
            except Exception as exc:
                print(f"[Bridge Warning] Orchestrator registration failed: {exc}")
        scheme = "https" if args.certfile and args.keyfile else "http"
        print(f"[Bridge] {scheme.upper()} transport listening on {scheme}://{args.host}:{args.port}")
        serve(agent, args.host, args.port, args.certfile or None, args.keyfile or None)
