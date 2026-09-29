@echo off
title Coagent Local Bridge Companion
echo ===================================================
echo   Coagent Local Desktop Bridge Agent (v1.0)
echo ===================================================
echo Starting local bridge on http://127.0.0.1:8765...
echo Connecting to Orchestrator at http://127.0.0.1:8000...
echo.

cd /d "%~dp0\.."
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" bridge\agent.py --serve --token dev-only-local-bridge-secret --orchestrator http://127.0.0.1:8000 --allow-browser --port 8765
pause
