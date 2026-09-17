"""Small Windows-user-bound secret store for desktop-only credentials."""
import ctypes
import os
from ctypes import wintypes
from pathlib import Path


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _protect(data: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI is only available on Windows")
    crypt = ctypes.windll.crypt32
    kernel = ctypes.windll.kernel32
    source = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    in_blob = _Blob(len(data), source)
    out_blob = _Blob()
    if not crypt.CryptProtectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError(ctypes.get_last_error(), "CryptProtectData failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel.LocalFree(out_blob.pbData)


def _unprotect(data: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI is only available on Windows")
    crypt = ctypes.windll.crypt32
    kernel = ctypes.windll.kernel32
    source = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    in_blob = _Blob(len(data), source)
    out_blob = _Blob()
    if not crypt.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError(ctypes.get_last_error(), "CryptUnprotectData failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel.LocalFree(out_blob.pbData)


def save_secret(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_protect(data))


def load_secret(path: Path) -> bytes | None:
    if not path.exists():
        return None
    try:
        return _unprotect(path.read_bytes())
    except (OSError, RuntimeError, ValueError):
        return None


def delete_secret(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
