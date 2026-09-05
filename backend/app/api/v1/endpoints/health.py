from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings

router = APIRouter()

@router.get("/health", summary="Health and Database Connectivity Check")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Verifies that the FastAPI server is running, environment variables are loaded,
    and the asynchronous PostgreSQL database connection is operational.
    """
    db_status = "disconnected"
    try:
        result = await db.execute(text("SELECT 1"))
        if result.scalar() == 1:
            db_status = "connected"
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "app_name": settings.APP_NAME,
                "environment": settings.APP_ENV,
                "database": "error",
                "error": str(e),
            }
        )

    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": db_status,
        "message": "Scanity API and Database are fully operational!",
    }
