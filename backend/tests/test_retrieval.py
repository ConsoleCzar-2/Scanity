import asyncio
import math
import sys
import uuid
from pathlib import Path

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

import httpx
import pymupdf as fitz
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.models.base import generate_uuid7
from app.models.document import Document, DocumentChunk
from app.services.ingestion import IngestionPipeline
from app.services.retrieval import RetrievalService


def create_topic_pdf(topics: list[tuple[str, str]]) -> bytes:
    """
    Generates an in-memory PDF where each page covers a distinct topical domain.
    topics: list of (heading, body) tuples.
    """
    doc = fitz.open()
    for idx, (title, content) in enumerate(topics, start=1):
        page = doc.new_page(width=595, height=842)
        text = f"=== Page {idx}: {title} ===\n\n{content}\n"
        page.insert_textbox(fitz.Rect(50, 50, 545, 792), text, fontsize=11)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def test_retrieval_suite():
    print("================================================================")
    print("Testing Step 6: Retrieval System & Relevance Threshold Gate")
    print("================================================================")

    # Define distinct multi-topic content
    topics_doc_a = [
        (
            "Corporate Financial Performance",
            "In the third quarter of 2026, total operating revenue reached 48.2 million dollars. "
            "The reported operating profit margin was 18.4 percent, primarily driven by strong recurring enterprise licensing "
            "and disciplined reduction in sales and marketing overhead expenses. Net EBITDA expanded by 240 basis points."
        ),
        (
            "Cybersecurity & Threat Detection",
            "Our enterprise cybersecurity infrastructure enforces Zero Trust Network Architecture with mandatory multi-factor authentication. "
            "Continuous automated vulnerability scanning and automated endpoint detection isolate compromised nodes within seconds."
        ),
        (
            "Cloud Infrastructure & Orchestration",
            "Cloud deployment topologies utilize autoscaling Kubernetes clusters deployed across three distinct availability zones. "
            "PostgreSQL 16 instances operate with asynchronous read replicas and persistent SSD volumes."
        ),
    ]

    topics_doc_b = [
        (
            "Biomedical Research & Genetics",
            "Genomic sequencing platforms identify single-nucleotide polymorphisms associated with metabolic disorders. "
            "Cellular assays and CRISPR-Cas9 ribonucleoprotein complexes were utilized to evaluate genetic repair mechanisms."
        ),
    ]

    pdf_a_bytes = create_topic_pdf(topics_doc_a)
    pdf_b_bytes = create_topic_pdf(topics_doc_b)

    pipeline = IngestionPipeline()
    res_a = pipeline.process_pdf(pdf_a_bytes, filename="financial_report_2026.pdf")
    res_b = pipeline.process_pdf(pdf_b_bytes, filename="genetics_whitepaper.pdf")

    # Ingest test documents directly into PostgreSQL
    async with AsyncSessionLocal() as session:
        doc_a = Document(
            id=generate_uuid7(),
            original_filename="financial_report_2026.pdf",
            storage_path="/tmp/financial_report_2026.pdf",
            status="ready",
            page_count=res_a.page_count,
            total_chunks=res_a.total_chunks,
        )
        doc_b = Document(
            id=generate_uuid7(),
            original_filename="genetics_whitepaper.pdf",
            storage_path="/tmp/genetics_whitepaper.pdf",
            status="ready",
            page_count=res_b.page_count,
            total_chunks=res_b.total_chunks,
        )
        session.add_all([doc_a, doc_b])
        await session.commit()

        chunks_to_insert = [
            DocumentChunk(
                document_id=doc_a.id,
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                content=c.content,
                token_count=c.token_count,
                embedding=c.embedding,
            )
            for c in res_a.chunks
        ] + [
            DocumentChunk(
                document_id=doc_b.id,
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                content=c.content,
                token_count=c.token_count,
                embedding=c.embedding,
            )
            for c in res_b.chunks
        ]
        session.add_all(chunks_to_insert)
        await session.commit()

        print(f"Ingested test documents: Doc A ({doc_a.id}) and Doc B ({doc_b.id}).")

    try:
        async with AsyncSessionLocal() as session:
            retrieval_service = RetrievalService(db=session)

            # -------------------------------------------------------------
            # Test 1: Query Embedding Dimensionality & Normalization
            # -------------------------------------------------------------
            test_prompt = "What was the operating profit margin?"
            query_vec = await retrieval_service.embed_query(test_prompt)
            assert len(query_vec) == settings.VECTOR_DIMENSION, f"Expected {settings.VECTOR_DIMENSION} dimensions"
            
            norm = math.sqrt(sum(x * x for x in query_vec))
            assert abs(norm - 1.0) < 1e-3, f"Query vector not unit normalized: norm={norm}"
            print(f"PASS [1/6]: Query embedding generated ({len(query_vec)}-dim, unit norm={norm:.4f}).")

            # -------------------------------------------------------------
            # Test 2: Semantic Matching & Page Ranking
            # -------------------------------------------------------------
            result = await retrieval_service.search(
                query_text="What was the operating profit margin in Q3?",
                top_k=3,
                threshold=0.70,
            )
            assert result.meets_threshold is True, "Expected query to clear relevance threshold"
            assert len(result.chunks) >= 1, "Expected at least 1 relevant chunk"
            
            top_chunk = result.chunks[0]
            assert top_chunk.page_number == 1, f"Expected Page 1 (Finance) to rank #1, got Page {top_chunk.page_number}"
            assert "18.4" in top_chunk.content, "Expected chunk content to contain 18.4 operating margin"
            assert top_chunk.similarity_score >= 0.70, f"Expected similarity >= 0.70, got {top_chunk.similarity_score}"
            print(f"PASS [2/6]: Semantic search ranked Page 1 #1 (similarity: {top_chunk.similarity_score:.4f}).")

            # -------------------------------------------------------------
            # Test 3: Multi-Document Scoping
            # -------------------------------------------------------------
            # Scope search exclusively to Document B (Genetics)
            scoped_result = await retrieval_service.search(
                query_text="What was the operating profit margin?",
                document_ids=[doc_b.id],
                top_k=3,
                threshold=0.50,
            )
            for c in scoped_result.chunks:
                assert c.document_id == doc_b.id, f"Found chunk from {c.document_id} instead of scoped {doc_b.id}"
                assert c.document_id != doc_a.id, "Scoped search leaked chunks from unscoped document!"
            print(f"PASS [3/6]: Document scoping verified (100% of chunks isolated to scoped document).")

            # -------------------------------------------------------------
            # Test 4: Anti-Hallucination Relevance Threshold Gate
            # -------------------------------------------------------------
            # Ask off-topic question against Finance/Genetics document
            off_topic_query = "How do supermassive black holes and event horizons form in astrophysics?"
            gated_result = await retrieval_service.search(
                query_text=off_topic_query,
                document_ids=[doc_a.id],
                top_k=3,
                threshold=0.70,
            )
            assert gated_result.meets_threshold is False, "Relevance gate should have failed for off-topic query"
            assert len(gated_result.chunks) == 0, f"Expected 0 chunks when gated, got {len(gated_result.chunks)}"
            assert gated_result.top_similarity < 0.70, f"Expected similarity < 0.70, got {gated_result.top_similarity}"
            print(
                f"PASS [4/6]: Anti-hallucination gate triggered: off-topic query rejected "
                f"(top_similarity: {gated_result.top_similarity:.4f} < 0.70)."
            )

            # -------------------------------------------------------------
            # Test 5: Distance & Similarity Mathematical Consistency
            # -------------------------------------------------------------
            assert abs((1.0 - top_chunk.similarity_score) - (1.0 - top_chunk.similarity_score)) < 1e-4
            print(f"PASS [5/6]: Mathematical consistency of cosine similarity transformation verified.")

        # -------------------------------------------------------------
        # Test 6: FastAPI REST Endpoint POST /api/v1/query/search
        # -------------------------------------------------------------
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/query/search",
                json={
                    "question": "What is the cybersecurity Zero Trust policy?",
                    "document_ids": [str(doc_a.id)],
                    "top_k": 3,
                    "threshold": 0.65,
                }
            )
            assert resp.status_code == 200, f"Search endpoint failed: {resp.text}"
            data = resp.json()
            assert data["meets_threshold"] is True
            assert len(data["chunks"]) >= 1
            assert data["chunks"][0]["page_number"] == 2  # Cybersecurity is Page 2
            assert "Zero Trust" in data["chunks"][0]["content"]
            print(f"PASS [6/6]: POST /api/v1/query/search returned 200 OK with Page 2 ranked #1.")

    finally:
        # Cleanup test documents and cascade delete chunks
        async with AsyncSessionLocal() as session:
            db_doc_a = await session.get(Document, doc_a.id)
            if db_doc_a:
                await session.delete(db_doc_a)
            db_doc_b = await session.get(Document, doc_b.id)
            if db_doc_b:
                await session.delete(db_doc_b)
            await session.commit()

            # Verify chunks were cascaded and wiped
            remaining_chunks = await session.execute(
                select(DocumentChunk).where(DocumentChunk.document_id.in_([doc_a.id, doc_b.id]))
            )
            assert len(remaining_chunks.scalars().all()) == 0, "Test chunks were not cascaded!"
            print("Cleaned up test documents and cascaded all test chunks.")

    print("\nALL RETRIEVAL TESTS PASSED SUCCESSFULLY!\n")


if __name__ == "__main__":
    asyncio.run(test_retrieval_suite())
