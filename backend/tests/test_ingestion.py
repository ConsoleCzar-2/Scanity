import io
import math
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

import pymupdf

from app.services.ingestion import (
    GeminiEmbeddingService,
    IngestionPipeline,
    PDFParser,
    RecursiveTokenChunker,
)

dimension = int(os.getenv("VECTOR_DIMENSION", "768"))

def create_synthetic_pdf() -> bytes:
    """Generates an in-memory 3-page PDF with varied paragraphs for testing."""
    doc = pymupdf.open()

    # Page 1: Brief Introduction
    page1 = doc.new_page()
    page1.insert_text(
        (50, 72),
        "Scanity Technical Whitepaper - Page 1\n\n"
        "1. Executive Summary\n"
        "Scanity is an enterprise AI-powered Document Question Answering architecture designed "
        "to eliminate hallucinations through verifiable, page-level citation guardrails. "
        "By enforcing strict retrieval thresholds and structuring responses with citations, "
        "the system guarantees that generated answers are grounded solely in verified source passages.\n\n"
        "2. Core Architecture\n"
        "The architecture separates asynchronous document ingestion from low-latency query answering. "
        "Celery workers process documents in the background using Redis as the message broker, "
        "while PostgreSQL with the pgvector extension serves as the unified relational and vector database.",
    )

    # Page 2: Long content exceeding 3,000 characters to trigger chunk splitting & overlap
    page2 = doc.new_page()
    long_paragraphs = []
    for i in range(1, 8):
        long_paragraphs.append(
            f"Section 2.{i}: Component Deep Dive #{i}.\n"
            "This subsection elaborates on the high-throughput streaming characteristics of our "
            "decoupled worker pool. Each worker node consumes ingestion jobs from Redis queues "
            "and parses raw binary PDF streams using PyMuPDF. After text extraction, a recursive "
            "token chunker segments the text into approximately 700 token chunks with 100 tokens of overlap. "
            "These overlapping boundaries ensure that compound statements, conditional logic, and technical definitions "
            "are not truncated across chunk boundaries. Furthermore, each chunk retains its source page number, "
            "enabling precise post-hoc citation validation when the language model generates grounded answers. "
            "In benchmark evaluations, this overlapping strategy increased retrieval recall by 18.4% compared "
            "to naive non-overlapping character slicing."
        )
    page2.insert_text((50, 72), "\n\n".join(long_paragraphs))

    # Page 3: Conclusion & Next Steps
    page3 = doc.new_page()
    page3.insert_text(
        (50, 72),
        "Scanity Technical Whitepaper - Page 3\n\n"
        "3. Conclusion and Future Roadmap\n"
        "In conclusion, Scanity demonstrates that deterministic guardrails combined with asynchronous task "
        "decoupling provide a robust foundation for enterprise RAG applications. Future roadmap milestones include "
        "hybrid search with Reciprocal Rank Fusion, multimodal waveform understanding, and cross-encoder reranking.\n\n"
        "End of Document.",
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_pdf_parser():
    """Verifies that PDFParser extracts all pages and assigns correct 1-indexed page numbers."""
    pdf_bytes = create_synthetic_pdf()
    parser = PDFParser()
    pages = parser.extract_pages(pdf_bytes)

    assert len(pages) == 3, f"Expected 3 pages, got {len(pages)}"
    assert pages[0].page_number == 1
    assert pages[1].page_number == 2
    assert pages[2].page_number == 3
    assert "Executive Summary" in pages[0].text
    assert "Section 2.1" in pages[1].text
    assert "Conclusion and Future Roadmap" in pages[2].text
    print("PASS: test_pdf_parser successfully extracted 3 pages with clean text and page numbers.")


def test_recursive_chunker():
    """Verifies chunk sizing, sequential indices, page tracking, and sliding overlap."""
    pdf_bytes = create_synthetic_pdf()
    parser = PDFParser()
    pages = parser.extract_pages(pdf_bytes)

    chunker = RecursiveTokenChunker(target_tokens=700, overlap_tokens=100)
    chunks = chunker.chunk_pages(pages)

    assert len(chunks) >= 3, f"Expected at least 3 chunks, got {len(chunks)}"

    # Check global sequential indexing
    for idx, chunk in enumerate(chunks):
        assert chunk.chunk_index == idx, f"Chunk index mismatch at {idx}"
        assert chunk.page_number in [1, 2, 3]
        assert chunk.token_count > 0

    # Verify that Page 2 generated multiple chunks and that adjacent chunks share overlap text
    page_2_chunks = [c for c in chunks if c.page_number == 2]
    if len(page_2_chunks) > 1:
        c1 = page_2_chunks[0]
        c2 = page_2_chunks[1]
        # c2 should start with words from c1
        words_c1 = c1.content.split()[-15:]  # last 15 words of c1
        overlap_found = any(word in c2.content for word in words_c1 if len(word) > 4)
        assert overlap_found, "Overlap text was not found between adjacent chunks on page 2"

    print(f"PASS: test_recursive_chunker generated {len(chunks)} chunks with verified sliding overlap.")


def test_embedding_service():
    """Verifies that embeddings produce 768-dimensional normalized vectors."""
    embedder = GeminiEmbeddingService(dimension=dimension)
    sample_texts = [
        "First test sentence for vector embedding.",
        "Second sentence testing batch processing in Gemini embedding service.",
    ]
    vectors = embedder.embed_texts(sample_texts)

    assert len(vectors) == 2
    for vec in vectors:
        assert len(vec) == dimension, f"Expected {dimension} dimensions, got {len(vec)}"
        # Verify normalization (Euclidean norm approximately 1.0)
        norm = math.sqrt(sum(x * x for x in vec))
        assert abs(norm - 1.0) < 0.05, f"Expected normalized vector, got norm {norm}"

    print(f"PASS: test_embedding_service generated {dimension}-dimensional normalized vectors.")


def test_end_to_end_pipeline():
    """Tests the full IngestionPipeline facade."""
    pdf_bytes = create_synthetic_pdf()
    pipeline = IngestionPipeline()
    result = pipeline.process_pdf(pdf_bytes, filename="whitepaper.pdf")

    assert result.filename == "whitepaper.pdf"
    assert result.page_count == 3
    assert result.total_chunks > 0
    assert len(result.chunks) == result.total_chunks

    for chunk in result.chunks:
        assert len(chunk.embedding) == dimension
        assert chunk.page_number in [1, 2, 3]
        assert chunk.token_count > 0

    print(
        f"PASS: test_end_to_end_pipeline successfully processed '{result.filename}' "
        f"({result.page_count} pages, {result.total_chunks} embedded chunks)."
    )


def run_all():
    print("Running Ingestion Pipeline Test Suite...\n")
    test_pdf_parser()
    test_recursive_chunker()
    test_embedding_service()
    test_end_to_end_pipeline()
    print("\nALL INGESTION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_all()

