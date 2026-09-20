import logging
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.document import Document, DocumentChunk
from app.models.query import Query, QueryCitation, QueryDocument
from app.schemas.query import (
    CitationResponse,
    QueryRequest,
    QueryResponse,
    QuerySearchRequest,
    RetrievalResult,
)
from fastapi.responses import StreamingResponse
from app.services.generation import FALLBACK_ANSWER, GenerationService
from app.services.retrieval import RetrievalService
from app.services.streaming import stream_grounded_answer

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
    "/stream",
    summary="Streaming Grounded Document Q&A via SSE",
    description=(
        "Streams natural-language grounded answer tokens in real-time via Server-Sent Events (SSE). "
        "Emits progress status, token deltas, anti-hallucination gate rejections, and verified citations."
    ),
)
async def ask_question_stream(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
):
    return StreamingResponse(
        stream_grounded_answer(
            question=request.question,
            document_ids=request.document_ids,
            top_k=request.top_k,
            threshold=request.threshold,
            session_id=request.session_id,
            db=db,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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


@router.get(
    "/history",
    response_model=List[QueryResponse],
    summary="Fetch Session Query History",
    description="Returns chronological query conversation history for a given session ID or recent queries.",
)
async def get_query_history(
    session_id: Optional[uuid.UUID] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> List[QueryResponse]:
    try:
        stmt = (
            select(Query)
            .options(
                selectinload(Query.citations)
                .selectinload(QueryCitation.chunk)
                .selectinload(DocumentChunk.document)
            )
            .order_by(Query.created_at.asc())
        )
        if session_id:
            stmt = stmt.where(Query.session_id == session_id)
        stmt = stmt.limit(limit)

        result = await db.execute(stmt)
        queries = result.scalars().all()

        responses: List[QueryResponse] = []
        for q in queries:
            cits: List[CitationResponse] = []
            for c in q.citations:
                if c.chunk:
                    doc_name = (
                        c.chunk.document.original_filename
                        if c.chunk.document
                        else "document.pdf"
                    )
                    snippet = c.chunk.content.strip()[:250] + (
                        "..." if len(c.chunk.content.strip()) > 250 else ""
                    )
                    cits.append(
                        CitationResponse(
                            chunk_id=c.chunk_id,
                            document_id=c.chunk.document_id,
                            original_filename=doc_name,
                            page_number=c.chunk.page_number,
                            snippet=snippet,
                            relevance_score=c.relevance_score or 0.0,
                        )
                    )
            responses.append(
                QueryResponse(
                    query_id=q.id,
                    question=q.question_text,
                    answer=q.answer_text or "",
                    confidence=q.confidence_score or 0.0,
                    is_grounded=q.is_grounded,
                    citations=cits,
                    created_at=q.created_at.isoformat() if q.created_at else None,
                )
            )
        return responses
    except Exception as err:
        logger.error(f"Failed to fetch query history: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch query history: {str(err)}",
        )


@router.delete(
    "/sessions/{session_id}",
    summary="Delete Session Conversation",
    description="Deletes all queries and associated citations for a given session ID.",
)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        stmt = delete(Query).where(Query.session_id == session_id)
        await db.execute(stmt)
        await db.commit()
        return {"status": "ok", "message": f"Session {session_id} deleted successfully."}
    except Exception as err:
        await db.rollback()
        logger.error(f"Failed to delete session {session_id}: {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(err)}",
        )


