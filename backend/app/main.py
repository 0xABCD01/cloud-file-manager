from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.security import load_or_generate_keys
from app.api.v1.auth import router as auth_router
from app.api.v1.files import router as files_router
from app.api.v1.folders import router as folders_router
from app.api.v1.sharing import router as sharing_router
from app.api.v1.users import router as users_router


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_or_generate_keys()

    try:
        from app.core.storage import StorageService
        storage = StorageService()
        await storage.ensure_bucket()
    except Exception:
        pass

    yield


app = FastAPI(
    title=settings.app_name,
    description="Secure cloud file manager with end-to-end encryption, "
    "fine-grained permissions, and audit logging.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    return response


app.include_router(auth_router)
app.include_router(files_router)
app.include_router(folders_router)
app.include_router(sharing_router)
app.include_router(users_router)


@app.get("/health")
async def health():
    return {"status": "healthy", "app": settings.app_name}


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
