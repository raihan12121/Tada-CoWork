"""Small dependency-free trace context used by the local deployment.

It provides the same correlation contract that an OpenTelemetry exporter can
consume later without forcing the offline/local runtime to install a collector.
"""

from contextvars import ContextVar
import uuid
from typing import Optional

_trace_id: ContextVar[Optional[str]] = ContextVar("coagent_trace_id", default=None)


def new_trace_id() -> str:
    return uuid.uuid4().hex


def set_trace_id(value: str):
    return _trace_id.set(value)


def reset_trace_id(token) -> None:
    _trace_id.reset(token)


def get_trace_id() -> Optional[str]:
    return _trace_id.get()
