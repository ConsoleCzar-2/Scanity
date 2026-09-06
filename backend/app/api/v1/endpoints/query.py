import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.query import Query, QueryCitation, QueryDocument
from app.schemas.query import (
    CitationResponse,
    QueryRequest,
    QueryResponse,
    QuerySearchRequest,
    RetrievalResult,
)
from app.services.generation import FALLBACK_ANSWER, GenerationService
from app.services.retrieval import RetrievalService

logger = logging.getLogger("scanity.api.query")
router = APIRouter()


@router.post(
    "",
    response_model=QueryResponse,
    summary="Grounded Document Q&A with Citations",
    description=(
        "Answers a natural-language question strictly grounded in uploaded documents. "
        "Performs vector search with pgvector, applies the anti-hallucination threshold gate, "
        "prompts Gemini 3.5 Flash Lite with structured schema, performs post-hoc citation validation, "
        "and records the query and citations in PostgreSQL."
    ),
)
@router.post("/", response_model=QueryResponse, include_in_schema=False)
async def ask_question(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
) -> QueryResponse:
    try:
        retrieval_service = RetrievalService(db=db)
        retrieval_result = await retrieval_service.search(
            query_text=request.question,
            document_ids=request.document_ids,
            top_k=request.top_k,
            threshold=request.threshold,
        )

        # 1. Anti-hallucination gate check
        if not retrieval_result.meets_threshold or not retrieval_result.chunks:
            logger.info(
                f"Query '{request.question[:40]}' rejected by anti-hallucination gate "
                f"(top_similarity={retrieval_result.top_similarity:.4f} < {retrieval_result.threshold:.2f})."
            )
            query_record = Query(
                session_id=request.session_id,
                question_text=request.question,
                answer_text=FALLBACK_ANSWER,
                confidence_score=0.0,
                is_grounded=False,
            )
            db.add(query_record)
            await db.flush()

            if request.document_ids:
                for doc_id in request.document_ids:
                    db.add(QueryDocument(query_id=query_record.id, document_id=doc_id))

            await db.commit()
            await db.refresh(query_record)

            return QueryResponse(
                query_id=query_record.id,
                question=query_record.question_text,
                answer=query_record.answer_text,
                confidence=query_record.confidence_score or 0.0,
                is_grounded=query_record.is_grounded,
                citations=[],
                created_at=query_record.created_at.isoformat() if query_record.created_at else None,
            )

        # 2. Synthesize grounded answer via Gemini 3.5 Flash Lite
        generation_service = GenerationService()
        answer_text, validated_citations, confidence, is_grounded = (
            await generation_service.generate_grounded_answer(
                question=request.question,
                candidate_chunks=retrieval_result.chunks,
            )
        )

        # 3. Persist query audit record and citations in PostgreSQL
        query_record = Query(
            session_id=request.session_id,
            question_text=request.question,
            answer_text=answer_text,
            confidence_score=confidence,
            is_grounded=is_grounded,
        )
        db.add(query_record)
        await db.flush()

        # Link document relationships
        involved_doc_ids = (
            set(request.document_ids)
            if request.document_ids
            else {c.document_id for c in retrieval_result.chunks}
        )
        for doc_id in involved_doc_ids:
            db.add(QueryDocument(query_id=query_record.id, document_id=doc_id))

        # Link validated citation records
        for rank, cit in enumerate(validated_citations, start=1):
            cit_record = QueryCitation(
                query_id=query_record.id,
                chunk_id=cit.chunk_id,
                relevance_score=cit.relevance_score,
                rank=rank,
            )
            db.add(cit_record)

        await db.commit()
        await db.refresh(query_record)

        return QueryResponse(
            query_id=query_record.id,
            question=query_record.question_text,
            answer=query_record.answer_text,
            confidence=query_record.confidence_score or 0.0,
            is_grounded=query_record.is_grounded,
            citations=validated_citations,
            created_at=query_record.created_at.isoformat() if query_record.created_at else None,
        )

    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        await db.rollback()
        logger.error(f"Error executing grounded Q&A: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while answering your question: {str(err)}",
        )


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

