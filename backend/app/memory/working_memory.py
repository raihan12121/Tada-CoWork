from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

class WorkingMemory:
    """
    Session working memory (in LLM context).
    Supports progressive compaction: older tool outputs are summarized
    while preserving decision rationale.
    """
    def __init__(self, session_id: str, max_active_turns: int = 10):
        self.session_id = session_id
        self.max_active_turns = max_active_turns
        self.history: List[Dict[str, Any]] = []
        self.compacted_summary: Optional[str] = None

    def add_turn(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        self.history.append({
            "role": role,
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self._check_and_compact()

    def _check_and_compact(self):
        if len(self.history) <= self.max_active_turns:
            return

        # Compact older turns
        turns_to_compact = self.history[:-self.max_active_turns]
        self.history = self.history[-self.max_active_turns:]

        summaries = []
        for t in turns_to_compact:
            meta = t.get("metadata", {})
            if meta.get("tool"):
                summaries.append(f"Used tool '{meta['tool']}' on step {meta.get('step_id', '')}: completed.")
            elif t["role"] == "user":
                summaries.append(f"User instruction: {t['content'][:60]}...")
            else:
                summaries.append(f"Agent action: {t['content'][:60]}...")

        new_summary_chunk = "; ".join(summaries)
        if self.compacted_summary:
            self.compacted_summary += f"\n- {new_summary_chunk}"
        else:
            self.compacted_summary = f"Prior session progress summary:\n- {new_summary_chunk}"

    def get_context_digest(self) -> str:
        parts = []
        if self.compacted_summary:
            parts.append(self.compacted_summary)
            
        for t in self.history:
            parts.append(f"[{t['role'].upper()}]: {t['content']}")
            
        return "\n".join(parts)
