import logging
import uuid
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Document, DocumentChunk
from app.schemas.query import RetrievalResult, RetrievedChunk
from app.services.ingestion import GeminiEmbeddingService

logger = logging.getLogger("scanity.retrieval")


class RetrievalService:
    """
    Service responsible for vector similarity search in PostgreSQL via pgvector,
    multi-document scoping, and anti-hallucination relevance threshold gating.
    """

    def __init__(
        self,
        db: AsyncSession,
        embedding_service: Optional[GeminiEmbeddingService] = None,
    ) -> None:
        self.db = db
        self.embedding_service = embedding_service or GeminiEmbeddingService()

    async def embed_query(self, query_text: str) -> List[float]:
        """
        Generates a 768-dimensional float embedding vector for the user query.
        """
        cleaned_query = query_text.strip()
        if not cleaned_query:
            raise ValueError("Query text cannot be empty.")

        # Generates embedding using the exact same model and normalization as chunk ingestion
        return self.embedding_service.get_embedding(cleaned_query)

    async def search(
        self,
        query_text: str,
        document_ids: Optional[List[uuid.UUID]] = None,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
    ) -> RetrievalResult:
        """
        Performs k-Nearest Neighbors (KNN) vector search accelerated by PostgreSQL's HNSW index,
        applies document scoping, and evaluates the anti-hallucination relevance threshold gate.

        Args:
            query_text: Natural language user question.
            document_ids: Optional list of document UUIDs to scope retrieval.
            top_k: Maximum number of nearest neighbors to retrieve (defaults to settings.DEFAULT_TOP_K).
            threshold: Minimum cosine similarity required to pass the gate (defaults to settings.RELEVANCE_THRESHOLD).

        Returns:
            RetrievalResult: Contains ranked chunks, similarity scores, and gating decision flag.
        """
        effective_top_k = top_k or settings.DEFAULT_TOP_K
        effective_threshold = (
            threshold if threshold is not None else settings.RELEVANCE_THRESHOLD
        )

        # 1. Embed user query into 768-dimensional vector
        query_vector = await self.embed_query(query_text)

        # 2. Build KNN query using pgvector's <=> cosine distance operator
        # Distance <=> measures cosine distance: distance = 1 - cosine_similarity
        distance_expr = DocumentChunk.embedding.cosine_distance(query_vector).label("distance")

        stmt = (
            select(
                DocumentChunk,
                distance_expr,
                Document.original_filename,
            )
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(Document.status == "ready")
            .order_by(distance_expr)
            .limit(effective_top_k)
        )

        # Apply multi-document scoping if specified
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))

        # 3. Execute query
        result = await self.db.execute(stmt)
        rows = result.all()

        if not rows:
            logger.info(f"Vector search for '{query_text[:40]}' returned 0 rows in database.")
            return RetrievalResult(
                query_text=query_text,
                meets_threshold=False,
                threshold=effective_threshold,
                top_similarity=0.0,
                total_retrieved=0,
                chunks=[],
            )

        # 4. Transform cosine distances to similarity scores: similarity = 1.0 - distance
        candidates: List[RetrievedChunk] = []
        similarities: List[float] = []

        for chunk, dist_val, filename in rows:
            distance = float(dist_val) if dist_val is not None else 1.0
            # Bound cosine similarity between 0.0 and 1.0
            similarity = max(0.0, min(1.0, 1.0 - distance))
            similarities.append(similarity)

            candidates.append(
                RetrievedChunk(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    document_filename=filename,
                    page_number=chunk.page_number,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    similarity_score=round(similarity, 4),
                )
            )

        top_similarity = max(similarities) if similarities else 0.0

        # 5. Anti-Hallucination Relevance Threshold Gate
        # If the highest similarity does not clear the threshold, the query is off-topic
        meets_threshold = top_similarity >= effective_threshold

        if not meets_threshold:
            logger.info(
                f"Relevance Gate Triggered: Top similarity {top_similarity:.4f} "
                f"< threshold {effective_threshold:.4f} for query '{query_text[:40]}'. "
                "Filtering all chunks to prevent hallucination."
            )
            return RetrievalResult(
                query_text=query_text,
                meets_threshold=False,
                threshold=effective_threshold,
                top_similarity=round(top_similarity, 4),
                total_retrieved=0,
                chunks=[],
            )

        # Filter to chunks that individually meet or approach relevance criteria
        # (retraining top chunks sorted descending by similarity)
        valid_chunks = [c for c in candidates if c.similarity_score >= (effective_threshold - 0.10)]
        if not valid_chunks:
            valid_chunks = [candidates[0]]

        logger.info(
            f"Retrieval Success: {len(valid_chunks)} chunks retrieved (top similarity: {top_similarity:.4f}) "
            f"for query '{query_text[:40]}'."
        )

        return RetrievalResult(
            query_text=query_text,
            meets_threshold=True,
            threshold=effective_threshold,
            top_similarity=round(top_similarity, 4),
            total_retrieved=len(valid_chunks),
            chunks=valid_chunks,
        )
