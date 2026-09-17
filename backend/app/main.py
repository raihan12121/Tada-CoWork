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
from app.api.settings_api import router as settings_router
from app.api.provider_accounts import router as provider_accounts_router
from app.engine.scheduler import scheduler_engine
from app.db.session import AsyncSessionLocal, DBOrganization
from sqlalchemy import select
from app.core.org_policy import org_policy_manager
from app.memory.long_term_memory import long_term_memory
from app.engine.session_manager import session_manager
from app.core.tracing import new_trace_id, set_trace_id, reset_trace_id
from app.core.identity import anonymous_principal, parse_identity_token, identity_verification_configured

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_ENV.lower() == "production":
        configuration_errors = []
        if settings.SANDBOX_BACKEND.lower() not in {"docker", "managed"}:
            configuration_errors.append("SANDBOX_BACKEND=docker or a configured managed adapter")
        if settings.SANDBOX_BACKEND.lower() == "managed" and not settings.MANAGED_SANDBOX_URL:
            configuration_errors.append("COAGENT_MANAGED_SANDBOX_URL")
        if settings.SANDBOX_BACKEND.lower() == "managed" and not settings.MANAGED_SANDBOX_URL.lower().startswith("https://"):
            configuration_errors.append("COAGENT_MANAGED_SANDBOX_URL using HTTPS")
        if settings.SANDBOX_BACKEND.lower() == "managed" and not settings.MANAGED_SANDBOX_TOKEN:
            configuration_errors.append("COAGENT_MANAGED_SANDBOX_TOKEN")
        if settings.DEFAULT_PROVIDER.lower() == "offline_heuristic":
            configuration_errors.append("a real LLM_PROVIDER")
        elif settings.DEFAULT_PROVIDER.lower() == "anthropic" and not settings.ANTHROPIC_API_KEY:
            configuration_errors.append("ANTHROPIC_API_KEY")
        elif settings.DEFAULT_PROVIDER.lower() == "openai" and not settings.OPENAI_API_KEY:
            configuration_errors.append("OPENAI_API_KEY")
        elif settings.DEFAULT_PROVIDER.lower() == "gemini" and not settings.GEMINI_API_KEY:
            configuration_errors.append("GEMINI_API_KEY")
        if not settings.API_AUTH_TOKEN:
            configuration_errors.append("COAGENT_API_AUTH_TOKEN")
        if not settings.ADMIN_TOKEN:
            configuration_errors.append("COAGENT_ADMIN_TOKEN")
        if not settings.BRIDGE_SECRET:
            configuration_errors.append("BRIDGE_SECRET")
        if not (settings.IDENTITY_SECRET or settings.OIDC_JWKS_URL):
            configuration_errors.append("COAGENT_IDENTITY_SECRET or OIDC identity configuration")
        if settings.OIDC_JWKS_URL and not settings.OIDC_ISSUER:
            configuration_errors.append("COAGENT_OIDC_ISSUER")
        if settings.OIDC_JWKS_URL and not settings.OIDC_AUDIENCE:
            configuration_errors.append("COAGENT_OIDC_AUDIENCE")
        if not settings.MARKETPLACE_SIGNING_SECRET:
            configuration_errors.append("COAGENT_MARKETPLACE_SIGNING_SECRET")
        if not settings.DEPLOYMENT_REGION or settings.DEPLOYMENT_REGION.lower() == "local":
            configuration_errors.append("COAGENT_DEPLOYMENT_REGION")
        if configuration_errors:
            raise RuntimeError("Production configuration incomplete; configure: " + ", ".join(configuration_errors))
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
        static_valid = authorization == f"Bearer {settings.API_AUTH_TOKEN}"
        identity_valid = False
        if not static_valid and identity_verification_configured() and authorization.startswith("Bearer "):
            try:
                parse_identity_token(authorization.removeprefix("Bearer ").strip())
                identity_valid = True
            except ValueError:
                identity_valid = False
        if not static_valid and not identity_valid:
            return JSONResponse(status_code=401, content={"detail": "Valid bearer token required."})
    return await call_next(request)


@app.middleware("http")
async def trace_context(request: Request, call_next):
    incoming = request.headers.get("X-Trace-ID", "").strip()
    trace_id = incoming if incoming and len(incoming) <= 128 else new_trace_id()
    token = set_trace_id(trace_id)
    try:
        response = await call_next(request)
        response.headers["X-Trace-ID"] = trace_id
        return response
    finally:
        reset_trace_id(token)


@app.middleware("http")
async def identity_context(request: Request, call_next):
    principal = anonymous_principal()
    if identity_verification_configured() and request.url.path.startswith(settings.API_V1_STR):
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            try:
                principal = parse_identity_token(authorization.removeprefix("Bearer ").strip())
            except ValueError:
                return JSONResponse(status_code=401, content={"detail": "Valid signed identity token required."})
    request.state.principal = principal
    return await call_next(request)

app.include_router(sessions_router, prefix=settings.API_V1_STR)
app.include_router(approvals_router, prefix=settings.API_V1_STR)
app.include_router(artifacts_router, prefix=settings.API_V1_STR)
app.include_router(memory_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)
app.include_router(bridge_router, prefix=settings.API_V1_STR)
app.include_router(mcp_router, prefix=settings.API_V1_STR)
app.include_router(settings_router, prefix=settings.API_V1_STR)
app.include_router(provider_accounts_router, prefix=settings.API_V1_STR)

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
