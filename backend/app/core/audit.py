import hashlib
import json
import os
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from app.config import settings

class AuditLogger:
    def __init__(self, log_dir: Optional[str] = None):
        self.log_dir = log_dir or str(settings.DATA_DIR / "audit")
        os.makedirs(self.log_dir, exist_ok=True)
        self.log_file = os.path.join(self.log_dir, "audit_chain.jsonl")
        self._last_hash = self._get_latest_hash()
        self._lock = threading.Lock()

    def _get_latest_hash(self) -> str:
        if not os.path.exists(self.log_file):
            return "0" * 64
        
        last_line = ""
        try:
            with open(self.log_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        last_line = line.strip()
            if last_line:
                entry = json.loads(last_line)
                return entry.get("hash", "0" * 64)
        except Exception:
            pass
        return "0" * 64

    def log_event(
        self,
        session_id: str,
        event_type: str, # "tool_call", "approval_requested", "approval_resolved", "plan_created", "plan_revised", "session_status"
        actor: str, # "system", "executor", "user", "admin"
        details: Dict[str, Any],
        step_id: Optional[str] = None
    ) -> Dict[str, Any]:
        timestamp = datetime.now(timezone.utc).isoformat()

        def redact(value: Any) -> Any:
            if isinstance(value, dict):
                return {
                    key: ("[REDACTED]" if any(marker in key.lower() for marker in ("token", "secret", "password", "api_key", "authorization")) else redact(item))
                    for key, item in value.items()
                }
            if isinstance(value, list):
                return [redact(item) for item in value]
            return value

        details = redact(details)
        
        payload_to_hash = {
            "session_id": session_id,
            "step_id": step_id,
            "event_type": event_type,
            "actor": actor,
            "details": details,
            "timestamp": timestamp,
            "prev_hash": self._last_hash
        }
        
        entry_hash = hashlib.sha256(
            json.dumps(payload_to_hash, sort_keys=True).encode("utf-8")
        ).hexdigest()
        
        record = {
            **payload_to_hash,
            "hash": entry_hash
        }
        
        # Parallel executor branches share this logger, so the hash-chain
        # update and append must be atomic as one critical section.
        with self._lock:
            payload_to_hash["prev_hash"] = self._last_hash
            entry_hash = hashlib.sha256(
                json.dumps(payload_to_hash, sort_keys=True).encode("utf-8")
            ).hexdigest()
            record = {**payload_to_hash, "hash": entry_hash}
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
            self._last_hash = entry_hash
        return record

    def verify_integrity(self) -> Tuple[bool, Optional[str]]:
        if not os.path.exists(self.log_file):
            return True, None
            
        prev_hash = "0" * 64
        line_num = 0
        with open(self.log_file, "r", encoding="utf-8") as f:
            for line in f:
                line_num += 1
                if not line.strip():
                    continue
                entry = json.loads(line.strip())
                if entry.get("prev_hash") != prev_hash:
                    return False, f"Hash mismatch at line {line_num}: expected prev {prev_hash}, found {entry.get('prev_hash')}"
                
                payload = {
                    "session_id": entry["session_id"],
                    "step_id": entry.get("step_id"),
                    "event_type": entry["event_type"],
                    "actor": entry["actor"],
                    "details": entry["details"],
                    "timestamp": entry["timestamp"],
                    "prev_hash": entry["prev_hash"]
                }
                computed = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
                if computed != entry.get("hash"):
                    return False, f"Corrupted entry hash at line {line_num}"
                prev_hash = entry["hash"]
                
        return True, None

    def export_audit_log(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        entries = []
        if not os.path.exists(self.log_file):
            return entries
            
        with open(self.log_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                entry = json.loads(line.strip())
                if session_id is None or entry.get("session_id") == session_id:
                    entries.append(entry)
        return entries

from typing import Tuple
audit_logger = AuditLogger()
