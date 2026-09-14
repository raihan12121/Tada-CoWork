from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from app.config import settings
from app.db.session import init_db
from app.api.sessions import router as sessions_router
from app.api.approvals import router as approvals_router
from app.api.artifacts import router as artifacts_router
from app.api.memory import router as memory_router
from app.api.schedules import router as schedules_router
from app.api.admin import router as admin_router
from app.api.bridge import router as bridge_router
from app.api.mcp import router as mcp_router
from app.engine.scheduler import scheduler_engine
from app.db.session import AsyncSessionLocal, DBOrganization
from sqlalchemy import select
from app.core.org_policy import org_policy_manager
from app.memory.long_term_memory import long_term_memory
from app.engine.session_manager import session_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBOrganization))
        for organization in result.scalars().all():
            org_policy_manager.load_row(organization)
    await long_term_memory.load_workspace_settings()
    await session_manager.recover_interrupted_sessions()
    await scheduler_engine.start()
    yield
    await scheduler_engine.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous cowork-style AI work agent backend orchestrator",
    lifespan=lifespan
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost",
    "http://127.0.0.1"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def optional_api_auth(request: Request, call_next):
    """Enable bearer-token protection in deployed environments without
    breaking the local desktop development flow when no token is configured."""
    if settings.API_AUTH_TOKEN and request.url.path.startswith(settings.API_V1_STR):
        authorization = request.headers.get("Authorization", "")
        if authorization != f"Bearer {settings.API_AUTH_TOKEN}":
            return JSONResponse(status_code=401, content={"detail": "Valid bearer token required."})
    return await call_next(request)

app.include_router(sessions_router, prefix=settings.API_V1_STR)
app.include_router(approvals_router, prefix=settings.API_V1_STR)
app.include_router(artifacts_router, prefix=settings.API_V1_STR)
app.include_router(memory_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(bridge_router, prefix=settings.API_V1_STR)
app.include_router(mcp_router, prefix=settings.API_V1_STR)

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
