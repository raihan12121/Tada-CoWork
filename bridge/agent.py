import os
import sys
import time
import argparse
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

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Coagent Desktop Local Bridge Agent")
    parser.add_argument("--token", default="coagent_local_bridge_secret_key_2026", help="Session bridge auth token")
    parser.add_argument("--folder", action="append", help="Grant folder path")
    args = parser.parse_args()

    agent = LocalBridgeAgent(token=args.token, granted_folders=args.folder or ["."])
    print("[Bridge Active] Coagent Local Bridge Agent started.")
    print(f"[Bridge] Granted folders: {[str(p) for p in agent.granted_folders]}")
