import asyncio
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
from app.models.query import Query, QueryCitation, QueryDocument
from app.schemas.query import RawCitation, RetrievedChunk
from app.services.generation import FALLBACK_ANSWER, GenerationService
from app.services.ingestion import IngestionPipeline
from app.services.retrieval import RetrievalService


def create_sample_pdf() -> bytes:
    """Generates an in-memory PDF with known facts for grounded Q&A verification."""
    doc = fitz.open()
    
    # Page 1: Financial Performance
    page1 = doc.new_page(width=595, height=842)
    text1 = (
        "=== Page 1: Financial Performance ===\n\n"
        "In Q3 2026, Scanity achieved an operating profit margin of 18.4 percent. "
        "Total revenue reached 48.2 million dollars, driven by enterprise recurring subscriptions."
    )
    page1.insert_textbox(fitz.Rect(50, 50, 545, 792), text1, fontsize=11)

    # Page 2: Security & Encryption
    page2 = doc.new_page(width=595, height=842)
    text2 = (
        "=== Page 2: Security & Compliance ===\n\n"
        "Scanity utilizes AES-256 encryption at rest and TLS 1.3 in transit. "
        "All audit logs are stored in tamper-evident append-only storage for SOC 2 Type II compliance."
    )
    page2.insert_textbox(fitz.Rect(50, 50, 545, 792), text2, fontsize=11)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def test_generation_suite():
    print("================================================================")
    print("Testing Step 7: Grounded LLM Generation & Citation Validation")
    print("================================================================")

    pdf_bytes = create_sample_pdf()
    pipeline = IngestionPipeline()
    res = pipeline.process_pdf(pdf_bytes, filename="annual_review_2026.pdf")

    doc_id = generate_uuid7()
    created_chunk_ids = []

    # 1. Ingest test document into PostgreSQL
    async with AsyncSessionLocal() as session:
        doc = Document(
            id=doc_id,
            original_filename="annual_review_2026.pdf",
            storage_path="/tmp/annual_review_2026.pdf",
            status="ready",
            page_count=res.page_count,
            total_chunks=res.total_chunks,
        )
        session.add(doc)
        await session.commit()

        chunks_to_insert = [
            DocumentChunk(
                document_id=doc.id,
                chunk_index=c.chunk_index,
                page_number=c.page_number,
                content=c.content,
                token_count=c.token_count,
                embedding=c.embedding,
            )
            for c in res.chunks
        ]
        session.add_all(chunks_to_insert)
        await session.commit()

        for chunk in chunks_to_insert:
            created_chunk_ids.append(chunk.id)

        print(f"Ingested test document: {doc_id} with {len(created_chunk_ids)} chunks.")

    try:
        gen_service = GenerationService()

        # -------------------------------------------------------------
        # Test 1: Grounded Answer Synthesis & Citation Verification
        # -------------------------------------------------------------
        async with AsyncSessionLocal() as session:
            retrieval_service = RetrievalService(db=session)
            search_res = await retrieval_service.search(
                query_text="What was the operating profit margin in Q3 2026?",
                document_ids=[doc_id],
                top_k=3,
                threshold=0.70,
            )
            assert search_res.meets_threshold is True, "Expected query to pass relevance threshold"
            assert len(search_res.chunks) > 0, "Expected at least 1 candidate chunk"

            answer, citations, confidence, is_grounded = (
                await gen_service.generate_grounded_answer(
                    question="What was the operating profit margin in Q3 2026?",
                    candidate_chunks=search_res.chunks,
                )
            )

            assert is_grounded is True, "Answer must be marked as grounded"
            assert confidence > 0.0, f"Confidence score should be > 0.0, got {confidence}"
            assert len(citations) > 0, "Citations list must not be empty"
            assert any("18.4" in answer or "operating" in answer.lower() for _ in [1]), (
                f"Expected operating margin fact in answer, got: '{answer}'"
            )

            first_citation = citations[0]
            assert first_citation.chunk_id in created_chunk_ids, "Citation chunk_id must match real chunk"
            assert first_citation.page_number == 1, f"Expected page 1, got {first_citation.page_number}"
            assert len(first_citation.snippet) > 10, "Snippet must contain substantive excerpt"
            print(f"PASS [1/7]: Grounded answer generated with verified citation on page {first_citation.page_number}.")

        # -------------------------------------------------------------
        # Test 2: Anti-Hallucination Gate Rejection (Off-Topic Query)
        # -------------------------------------------------------------
        async with AsyncSessionLocal() as session:
            retrieval_service = RetrievalService(db=session)
            search_res = await retrieval_service.search(
                query_text="How do you make artisan sourdough bread at home?",
                document_ids=[doc_id],
                top_k=3,
                threshold=0.70,
            )
            assert search_res.meets_threshold is False, "Off-topic query should fail relevance threshold"
            assert len(search_res.chunks) == 0, "No chunks should be retrieved for rejected query"
            print(f"PASS [2/7]: Off-topic query successfully rejected by anti-hallucination gate.")

        # -------------------------------------------------------------
        # Test 3: Post-Hoc Citation Validator Defense (Drops Fake Chunks)
        # -------------------------------------------------------------
        real_chunk = search_res_candidates = [
            RetrievedChunk(
                chunk_id=created_chunk_ids[0],
                document_id=doc_id,
                document_filename="annual_review_2026.pdf",
                page_number=1,
                chunk_index=0,
                content="Operating profit margin was 18.4 percent.",
                similarity_score=0.92,
            )
        ]
        fake_chunk_id = str(uuid.uuid4())
        raw_citations = [
            RawCitation(chunk_id=str(created_chunk_ids[0]), page_number=1),
            RawCitation(chunk_id=fake_chunk_id, page_number=99),  # Hallucinated!
        ]

        validated = gen_service.validate_citations(raw_citations, search_res_candidates)
        assert len(validated) == 1, f"Expected 1 valid citation, got {len(validated)}"
        assert validated[0].chunk_id == created_chunk_ids[0], "Valid chunk ID was preserved"
        assert all(c.chunk_id != uuid.UUID(fake_chunk_id) for c in validated), "Hallucinated chunk was discarded"
        print("PASS [3/7]: Post-hoc citation validator discarded hallucinated chunk ID.")

        # -------------------------------------------------------------
        # Test 4: Complete Hallucination Defense (Fallback Triggered)
        # -------------------------------------------------------------
        all_fake_citations = [
            RawCitation(chunk_id=str(uuid.uuid4()), page_number=42),
            RawCitation(chunk_id=str(uuid.uuid4()), page_number=99),
        ]
        validated_empty = gen_service.validate_citations(all_fake_citations, search_res_candidates)
        assert len(validated_empty) == 0, "All hallucinated citations must be discarded"
        print("PASS [4/7]: Validator stripped 100% of unbacked citations.")

        # -------------------------------------------------------------
        # Test 5: HTTP POST /api/v1/query Grounded Execution & Persistence
        # -------------------------------------------------------------
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            test_question = "What encryption and security compliance does Scanity utilize at rest?"
            resp = await client.post(
                "/api/v1/query",
                json={
                    "question": test_question,
                    "document_ids": [str(doc_id)],
                    "top_k": 3,
                    "threshold": 0.70,
                },
            )
            assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}: {resp.text}"
            data = resp.json()
            assert "query_id" in data
            query_uuid = uuid.UUID(data["query_id"])
            assert data["is_grounded"] is True
            assert data["confidence"] > 0.0
            assert len(data["citations"]) > 0
            assert data["citations"][0]["page_number"] == 2
            print(f"PASS [5/7]: HTTP POST /api/v1/query returned grounded answer with Page 2 citation.")

            # Verify PostgreSQL audit persistence for this query
            async with AsyncSessionLocal() as session:
                q_stmt = select(Query).where(Query.id == query_uuid)
                q_result = await session.execute(q_stmt)
                stored_query = q_result.scalar_one_or_none()
                assert stored_query is not None, "Query record must exist in PostgreSQL"
                assert stored_query.is_grounded is True
                assert stored_query.question_text == test_question

                cit_stmt = select(QueryCitation).where(QueryCitation.query_id == query_uuid)
                cit_res = await session.execute(cit_stmt)
                stored_citations = cit_res.scalars().all()
                assert len(stored_citations) > 0, "Query citations must be stored in database"
                assert stored_citations[0].rank == 1
                print(f"PASS [6/7]: Audit persistence confirmed in queries and query_citations tables.")

            # ---------------------------------------------------------
            # Test 6: HTTP POST /api/v1/query Off-Topic Fallback
            # ---------------------------------------------------------
            resp_fallback = await client.post(
                "/api/v1/query",
                json={
                    "question": "What is the recipe for chocolate chip cookies?",
                    "document_ids": [str(doc_id)],
                },
            )
            assert resp_fallback.status_code == 200
            fallback_data = resp_fallback.json()
            assert fallback_data["is_grounded"] is False
            assert fallback_data["confidence"] == 0.0
            assert fallback_data["citations"] == []
            assert fallback_data["answer"] == FALLBACK_ANSWER

            # Verify ungrounded query is also logged in DB for observability
            fallback_query_id = uuid.UUID(fallback_data["query_id"])
            async with AsyncSessionLocal() as session:
                stored_fallback = await session.get(Query, fallback_query_id)
                assert stored_fallback is not None
                assert stored_fallback.is_grounded is False
                assert stored_fallback.answer_text == FALLBACK_ANSWER

        # -------------------------------------------------------------
        # Test 7: Cascade Deletion Integrity
        # -------------------------------------------------------------
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            del_resp = await client.delete(f"/api/v1/documents/{doc_id}")
            assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"

            async with AsyncSessionLocal() as session:
                # Document should be deleted
                doc_check = await session.get(Document, doc_id)
                assert doc_check is None, "Document must be deleted"

                # Associated chunks must be cascaded
                chunk_check = await session.execute(
                    select(DocumentChunk).where(DocumentChunk.document_id == doc_id)
                )
                assert len(chunk_check.scalars().all()) == 0, "Document chunks must be cascaded"

                # Query citations referencing the deleted chunk should be cleanly cascaded
                cit_check = await session.execute(
                    select(QueryCitation).where(QueryCitation.chunk_id.in_(created_chunk_ids))
                )
                assert len(cit_check.scalars().all()) == 0, "Query citations must cascade on chunk deletion"
            print("PASS [7/7]: Document cascade deletion verified across chunks and query citations.")

    finally:
        # Cleanup safety
        async with AsyncSessionLocal() as session:
            doc_cleanup = await session.get(Document, doc_id)
            if doc_cleanup:
                await session.delete(doc_cleanup)
                await session.commit()

    print("\nALL 7 GENERATION & CITATION VALIDATION TESTS PASSED SUCCESSFULLY!\n")


if __name__ == "__main__":
    asyncio.run(test_generation_suite())
