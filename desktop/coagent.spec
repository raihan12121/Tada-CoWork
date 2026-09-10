# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from pathlib import Path

block_cipher = None

BASE_DIR = Path(r"D:\App Development\Omayk Cowork")
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

datas = [
    (str(FRONTEND_DIST), "frontend/dist"),
    (str(BACKEND_DIR / "app"), "backend/app")
]

hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "aiosqlite",
    "sqlalchemy",
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    "pydantic",
    "fastapi",
    "openpyxl",
    "docx",
    "pptx",
    "reportlab",
    "reportlab.lib",
    "reportlab.pdfgen",
    "httpx",
    "email_validator"
]

a = Analysis(
    [r"D:\App Development\Omayk Cowork\desktop\launcher.py"],
    pathex=[str(BASE_DIR), str(BACKEND_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter", "torch"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Coagent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True, # Console shows real-time logs and allows easy monitoring
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Coagent",
)
