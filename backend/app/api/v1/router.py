from fastapi import APIRouter
from app.api.v1.endpoints import documents, health, query

api_v1_router = APIRouter()

# Include endpoint subrouters
api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_v1_router.include_router(query.router, prefix="/query", tags=["Query"])
