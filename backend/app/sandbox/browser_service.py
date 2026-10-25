import os
import sys
import json
import time
import socket
import asyncio
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import httpx
import websockets

from app.config import settings

logger = logging.getLogger(__name__)

class BrowserService:
    """
    Native Chromium CDP (Chrome DevTools Protocol) Browser Service.
    Powers the GrokBot / MuseBot-style 'Agent Computer' browser with:
    - Persistent session cookies and logins in DATA_DIR / 'browser_profile'
    - Real headless Chromium execution (via native Edge or Chrome)
    - Live screencast frame streaming
    - Direct coordinate-based mouse clicking, scrolling, and keyboard typing
    - Safe fallback when no native browser binary is detected
    """
    def __init__(self):
        self.port: int = 9222
        self.process: Optional[subprocess.Popen] = None
        self.ws_url: Optional[str] = None
        self.current_url: str = "about:blank"
        self.current_title: str = "Blank Page"
        self._lock = asyncio.Lock()
        self._msg_id = 0
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

        # Persistent user data directory for browser profile (cookies, localStorage, session state)
        self.profile_dir = (settings.DATA_DIR / "browser_profile").resolve()
        self.profile_dir.mkdir(parents=True, exist_ok=True)

    def _find_browser_executable(self) -> Optional[str]:
        """Locates Microsoft Edge or Google Chrome on the host machine."""
        candidates = [
            os.environ.get("BROWSER_EXECUTABLE_PATH"),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ]
        for p in candidates:
            if p and os.path.exists(p):
                return p
        return None

    def _find_free_port(self, start_port: int = 9222) -> int:
        for p in range(start_port, start_port + 50):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(("127.0.0.1", p))
                    return p
                except OSError:
                    continue
        return start_port

    async def ensure_started(self) -> bool:
        """Starts the browser process if it is not already running."""
        async with self._lock:
            if self.process and self.process.poll() is None and self.ws_url:
                return True

            executable = self._find_browser_executable()
            if not executable:
                logger.warning("No native Chromium/Edge executable found on system.")
                return False

            self.port = self._find_free_port(9222)
            args = [
                executable,
                "--headless=new",
                f"--remote-debugging-port={self.port}",
                f"--user-data-dir={str(self.profile_dir)}",
                "--window-size=1280,800",
                "--hide-scrollbars=false",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled",
                "--remote-allow-origins=*",
                "about:blank"
            ]

            try:
                self.process = subprocess.Popen(
                    args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info(f"Started browser engine (PID: {self.process.pid}) on port {self.port}")
            except Exception as e:
                logger.error(f"Failed to launch browser binary: {e}")
                return False

            # Poll for CDP readiness
            for _ in range(25):
                await asyncio.sleep(0.2)
                try:
                    async with httpx.AsyncClient(timeout=2.0) as client:
                        resp = await client.get(f"http://127.0.0.1:{self.port}/json/list")
                        if resp.status_code == 200:
                            pages = resp.json()
                            if pages and len(pages) > 0:
                                self.ws_url = pages[0].get("webSocketDebuggerUrl")
                                if self.ws_url:
                                    break
                except Exception:
                    pass

            if not self.ws_url:
                logger.error("Failed to connect to browser CDP endpoint.")
                return False

            return True

    async def _send_cdp(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 15.0) -> Dict[str, Any]:
        """Sends a JSON-RPC command over CDP and awaits response."""
        if not await self.ensure_started():
            raise RuntimeError("Browser engine is not running.")

        self._msg_id += 1
        msg_id = self._msg_id
        payload = {
            "id": msg_id,
            "method": method,
            "params": params or {}
        }

        async with websockets.connect(self.ws_url, max_size=16 * 1024 * 1024) as ws:
            await ws.send(json.dumps(payload))
            start_t = time.monotonic()
            while time.monotonic() - start_t < timeout:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                data = json.loads(raw)
                if data.get("id") == msg_id:
                    if "error" in data:
                        raise RuntimeError(f"CDP error: {data['error']}")
                    return data.get("result", {})
            raise TimeoutError(f"CDP command {method} timed out.")

    async def navigate(self, url: str) -> Dict[str, Any]:
        """Navigates to the specified URL and updates current status."""
        if not url.startswith("http://") and not url.startswith("https://") and not url.startswith("about:"):
            url = f"https://{url}"

        self.current_url = url
        try:
            res = await self._send_cdp("Page.navigate", {"url": url}, timeout=20.0)
            await asyncio.sleep(1.0) # Allow DOM rendering
            
            # Retrieve title and actual URL
            eval_res = await self._send_cdp("Runtime.evaluate", {
                "expression": "JSON.stringify({title: document.title, url: window.location.href})"
            })
            val = json.loads(eval_res.get("result", {}).get("value", "{}"))
            self.current_title = val.get("title") or "Page"
            self.current_url = val.get("url") or url

            screenshot = await self.capture_screenshot()
            return {
                "success": True,
                "url": self.current_url,
                "title": self.current_title,
                "screenshot": screenshot
            }
        except Exception as e:
            logger.error(f"Browser navigation failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "url": url
            }

    async def capture_screenshot(self, format: str = "jpeg", quality: int = 75) -> str:
        """Captures a base64 encoded screenshot of the current page."""
        try:
            res = await self._send_cdp("Page.captureScreenshot", {
                "format": format,
                "quality": quality
            }, timeout=8.0)
            return res.get("data", "")
        except Exception as e:
            logger.warning(f"Screenshot capture error: {e}")
            return ""

    async def click(self, x: int, y: int, button: str = "left") -> Dict[str, Any]:
        """Dispatches mouse click at coordinates (x, y)."""
        try:
            await self._send_cdp("Input.dispatchMouseEvent", {
                "type": "mousePressed",
                "x": x,
                "y": y,
                "button": button,
                "clickCount": 1
            })
            await asyncio.sleep(0.05)
            await self._send_cdp("Input.dispatchMouseEvent", {
                "type": "mouseReleased",
                "x": x,
                "y": y,
                "button": button,
                "clickCount": 1
            })
            await asyncio.sleep(0.3)
            screenshot = await self.capture_screenshot()
            return {"success": True, "action": "click", "x": x, "y": y, "screenshot": screenshot}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def type_text(self, text: str) -> Dict[str, Any]:
        """Inserts text into the currently active element."""
        try:
            await self._send_cdp("Input.insertText", {"text": text})
            await asyncio.sleep(0.2)
            screenshot = await self.capture_screenshot()
            return {"success": True, "action": "type", "text": text, "screenshot": screenshot}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def press_key(self, key: str) -> Dict[str, Any]:
        """Dispatches keyboard key (e.g., 'Enter', 'Tab', 'Backspace')."""
        try:
            await self._send_cdp("Input.dispatchKeyEvent", {
                "type": "keyDown",
                "key": key
            })
            await asyncio.sleep(0.05)
            await self._send_cdp("Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": key
            })
            await asyncio.sleep(0.3)
            screenshot = await self.capture_screenshot()
            return {"success": True, "action": "press_key", "key": key, "screenshot": screenshot}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def scroll(self, delta_x: int = 0, delta_y: int = 300) -> Dict[str, Any]:
        """Scrolls the viewport."""
        try:
            await self._send_cdp("Input.dispatchMouseEvent", {
                "type": "mouseWheel",
                "x": 640,
                "y": 400,
                "deltaX": delta_x,
                "deltaY": delta_y
            })
            await asyncio.sleep(0.2)
            screenshot = await self.capture_screenshot()
            return {"success": True, "action": "scroll", "delta_y": delta_y, "screenshot": screenshot}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_page_text(self) -> str:
        """Extracts visible text content from the current page."""
        try:
            res = await self._send_cdp("Runtime.evaluate", {
                "expression": "document.body ? document.body.innerText : ''"
            })
            return res.get("result", {}).get("value", "")
        except Exception:
            return ""

    async def get_status(self) -> Dict[str, Any]:
        """Returns browser state."""
        alive = bool(self.process and self.process.poll() is None)
        return {
            "alive": alive,
            "url": self.current_url,
            "title": self.current_title,
            "port": self.port,
            "persistent_profile": str(self.profile_dir)
        }

    def close(self):
        """Terminates the browser process cleanly."""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None
            self.ws_url = None

browser_service = BrowserService()
