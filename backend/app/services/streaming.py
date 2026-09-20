import json
import logging
import uuid
from dataclasses import dataclass
from typing import AsyncGenerator, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.query import Query, QueryCitation, QueryDocument
from app.services.generation import FALLBACK_ANSWER, GenerationService
from app.services.retrieval import RetrievalService

logger = logging.getLogger("scanity.streaming")


@dataclass
class SSEEvent:
    """Represents a discrete Server-Sent Event frame."""
    event: str
    data: str
    id: Optional[str] = None


def format_sse(event: SSEEvent) -> str:
    """
    Encodes an SSEEvent into the standard Server-Sent Events wire format:
    event: <event_name>\n
    data: <data_line_1>\n
    \n
    """
    lines = []
    if event.id is not None:
        lines.append(f"id: {event.id}")
    lines.append(f"event: {event.event}")
    for line in event.data.splitlines():
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


async def stream_grounded_answer(
    question: str,
    document_ids: Optional[List[uuid.UUID]],
    top_k: Optional[int],
    threshold: Optional[float],
    session_id: Optional[uuid.UUID],
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """
    Asynchronously yields Server-Sent Events representing each stage of the grounded Q&A pipeline:
    1. event: status -> 'embedding'
    2. event: status -> 'retrieving'
    3. If gate rejects:
       event: gate_rejected -> {top_similarity, threshold, fallback_answer}
       event: done -> {query_id, is_grounded: False}
    4. If gate passes:
       event: status -> 'generating'
       loop:
           event: token -> {delta: ...}
       event: status -> 'validating_citations'
       event: citations -> {citations: [...], confidence, is_grounded}
       event: done -> {query_id, is_grounded: True}
    """
    try:
        # 1. Pipeline Stage: Embedding query
        yield format_sse(
            SSEEvent(
                event="status",
                data=json.dumps({"step": "embedding", "message": "Generating query embedding vector..."}),
            )
        )

        # 2. Pipeline Stage: Vector retrieval
        yield format_sse(
            SSEEvent(
                event="status",
                data=json.dumps({"step": "retrieving", "message": "Scanning pgvector for nearest chunk neighbors..."}),
            )
        )

        retrieval_service = RetrievalService(db=db)
        retrieval_result = await retrieval_service.search(
            query_text=question,
            document_ids=document_ids,
            top_k=top_k,
            threshold=threshold,
        )

        # 3. Anti-hallucination gate verification
        if not retrieval_result.meets_threshold or not retrieval_result.chunks:
            logger.info(
                f"Query '{question[:40]}' rejected by anti-hallucination gate "
                f"(top_similarity={retrieval_result.top_similarity:.4f} < {retrieval_result.threshold:.2f})."
            )

            # Persist rejected query record
            query_record = Query(
                session_id=session_id,
                question_text=question,
                answer_text=FALLBACK_ANSWER,
                confidence_score=0.0,
                is_grounded=False,
            )
            db.add(query_record)
            await db.flush()

            if document_ids:
                for doc_id in document_ids:
                    db.add(QueryDocument(query_id=query_record.id, document_id=doc_id))

            await db.commit()
            await db.refresh(query_record)

            yield format_sse(
                SSEEvent(
                    event="gate_rejected",
                    data=json.dumps(
                        {
                            "top_similarity": retrieval_result.top_similarity,
                            "threshold": retrieval_result.threshold,
                            "fallback_answer": FALLBACK_ANSWER,
                        }
                    ),
                )
            )
            yield format_sse(
                SSEEvent(
                    event="done",
                    data=json.dumps(
                        {
                            "query_id": str(query_record.id),
                            "is_grounded": False,
                            "confidence": 0.0,
                            "created_at": query_record.created_at.isoformat() if query_record.created_at else None,
                        }
                    ),
                )
            )
            return

        # 4. Pipeline Stage: Token generation stream
        yield format_sse(
            SSEEvent(
                event="status",
                data=json.dumps({"step": "generating", "message": "Synthesizing grounded response..."}),
            )
        )

        generation_service = GenerationService()
        answer_parts: List[str] = []

        async for delta in generation_service.generate_answer_stream(
            question=question,
            candidate_chunks=retrieval_result.chunks,
        ):
            answer_parts.append(delta)
            yield format_sse(
                SSEEvent(
                    event="token",
                    data=json.dumps({"delta": delta}),
                )
            )

        full_answer = "".join(answer_parts).strip()
        if not full_answer:
            full_answer = FALLBACK_ANSWER

        # 5. Pipeline Stage: Structured citation extraction & validation
        yield format_sse(
            SSEEvent(
                event="status",
                data=json.dumps({"step": "validating_citations", "message": "Extracting and validating source citations..."}),
            )
        )

        validated_citations, confidence, is_grounded = (
            await generation_service.extract_structured_citations(
                question=question,
                answer_text=full_answer,
                candidate_chunks=retrieval_result.chunks,
            )
        )

        # 6. Database Audit Persistence
        query_record = Query(
            session_id=session_id,
            question_text=question,
            answer_text=full_answer,
            confidence_score=confidence,
            is_grounded=is_grounded,
        )
        db.add(query_record)
        await db.flush()

        involved_doc_ids = (
            set(document_ids)
            if document_ids
            else {c.document_id for c in retrieval_result.chunks}
        )
        for doc_id in involved_doc_ids:
            db.add(QueryDocument(query_id=query_record.id, document_id=doc_id))

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

        # 7. Yield citations event
        yield format_sse(
            SSEEvent(
                event="citations",
                data=json.dumps(
                    {
                        "citations": [c.model_dump(mode="json") for c in validated_citations],
                        "confidence": confidence,
                        "is_grounded": is_grounded,
                    }
                ),
            )
        )

        # 8. Yield completion event
        yield format_sse(
            SSEEvent(
                event="done",
                data=json.dumps(
                    {
                        "query_id": str(query_record.id),
                        "is_grounded": is_grounded,
                        "confidence": confidence,
                        "created_at": query_record.created_at.isoformat() if query_record.created_at else None,
                    }
                ),
            )
        )

    except Exception as err:
        logger.exception(f"Unhandled error during grounded answer streaming: {err}")
        yield format_sse(
            SSEEvent(
                event="error",
                data=json.dumps({"message": str(err)}),
            )
        )
