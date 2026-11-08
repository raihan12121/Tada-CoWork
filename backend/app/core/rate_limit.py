"""In-process sliding-window rate limiting.

Deliberately dependency-free: a single-process desktop deployment does not need
Redis, and the goal is to stop runaway retry loops and unbounded token burn —
not to be a billing meter. Limits are per (principal, workspace) key.
"""

import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple

from app.config import settings


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = max(0, int(limit))
        self.window_seconds = float(window_seconds)
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> Tuple[bool, float]:
        """Return (allowed, retry_after_seconds)."""
        if self.limit <= 0:
            return True, 0.0
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            cutoff = now - self.window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False, max(0.0, bucket[0] + self.window_seconds - now)
            bucket.append(now)
            return True, 0.0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


session_creation_limiter = SlidingWindowLimiter(settings.RATE_LIMIT_PER_MINUTE)
terminal_command_limiter = SlidingWindowLimiter(settings.TERMINAL_RATE_LIMIT_PER_MINUTE)
