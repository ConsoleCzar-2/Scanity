import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.query import QuerySearchRequest, RetrievalResult
from app.services.retrieval import RetrievalService

logger = logging.getLogger("scanity.api.query")
router = APIRouter()


@router.post(
    "/search",
    response_model=RetrievalResult,
    summary="Vector Search & Relevance Gate Inspection",
    description=(
        "Embeds a question, performs k-Nearest Neighbors (KNN) search in PostgreSQL via pgvector, "
        "applies multi-document scoping, and evaluates the anti-hallucination relevance threshold gate."
    ),
)
async def search_chunks(
    request: QuerySearchRequest,
    db: AsyncSession = Depends(get_db),
) -> RetrievalResult:
    try:
        retrieval_service = RetrievalService(db=db)
        return await retrieval_service.search(
            query_text=request.question,
            document_ids=request.document_ids,
            top_k=request.top_k,
            threshold=request.threshold,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        logger.error(f"Error during vector retrieval: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during vector retrieval: {str(err)}",
        )
