from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import init_db
from app.api.sessions import router as sessions_router
from app.api.approvals import router as approvals_router
from app.api.artifacts import router as artifacts_router
from app.api.memory import router as memory_router
from app.api.schedules import router as schedules_router
from app.api.admin import router as admin_router
from app.api.bridge import router as bridge_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    await init_db()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous cowork-style AI work agent backend orchestrator",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router, prefix=settings.API_V1_STR)
app.include_router(approvals_router, prefix=settings.API_V1_STR)
app.include_router(artifacts_router, prefix=settings.API_V1_STR)
app.include_router(memory_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(bridge_router, prefix=settings.API_V1_STR)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "provider": settings.DEFAULT_PROVIDER
    }

# Mount static frontend dist if available
from pathlib import Path
import sys
from fastapi.staticfiles import StaticFiles

candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(getattr(sys, "_MEIPASS", "")) / "frontend" / "dist",
    Path(sys.executable).parent / "_internal" / "frontend" / "dist",
    Path(sys.executable).parent / "frontend" / "dist",
    Path.cwd() / "frontend" / "dist"
]

frontend_dist = None
for c in candidates:
    if c and c.exists() and (c / "index.html").exists():
        frontend_dist = c
        break

if frontend_dist:
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


