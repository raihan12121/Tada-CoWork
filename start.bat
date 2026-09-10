@echo off
echo Starting Coagent (Tada-CoWork)...

start cmd /k ".venv\Scripts\python -m uvicorn app.main:app --app-dir backend --reload --port 8000"
start cmd /k "cd frontend && npm run dev"

echo Backend running on http://127.0.0.1:8000
echo Frontend running on http://localhost:5173
