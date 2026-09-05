from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.api.v1.endpoints.health import router as health_router
from app.core.config import settings

app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description="Backend API for AI-Powered Document Q&A System with pgvector and Celery",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGINS_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
# Root health check endpoint for quick infrastructure / container checks
app.include_router(health_router, tags=["Health"])

# API v1 endpoints
app.include_router(api_v1_router, prefix="/api/v1")
