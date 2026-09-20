import asyncio
import json
from pathlib import Path
import sys
import uuid

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

import httpx
import pytest
from unittest.mock import AsyncMock, patch

from app.main import app
from app.schemas.query import RetrievalResult, RetrievedChunk
from app.services.streaming import SSEEvent, format_sse


def test_format_sse():
    """Validates SSE wire format construction."""
    event = SSEEvent(event="token", data='{"delta": "Hello world"}')
    wire = format_sse(event)
    assert wire == 'event: token\ndata: {"delta": "Hello world"}\n\n'

    event_with_id = SSEEvent(event="status", data='{"step": "embedding"}', id="101")
    wire_with_id = format_sse(event_with_id)
    assert wire_with_id == 'id: 101\nevent: status\ndata: {"step": "embedding"}\n\n'


def parse_sse_frames(raw_text: str):
    """Utility to parse text/event-stream content into a list of (event_type, json_data) tuples."""
    frames = []
    blocks = raw_text.strip().split("\n\n")
    for block in blocks:
        if not block.strip():
            continue
        event_name = "message"
        data_lines = []
        for line in block.split("\n"):
            line = line.strip()
            if line.startswith("event:"):
                event_name = line.replace("event:", "").strip()
            elif line.startswith("data:"):
                data_lines.append(line.replace("data:", "").strip())
        data_str = "\n".join(data_lines)
        try:
            parsed_data = json.loads(data_str)
        except Exception:
            parsed_data = data_str
        frames.append((event_name, parsed_data))
    return frames


@pytest.mark.asyncio
async def test_stream_grounded_answer_happy_path():
    """
    Tests the full SSE streaming pipeline when retrieval passes the threshold gate:
    1. Status: embedding
    2. Status: retrieving
    3. Status: generating
    4. Multiple Token deltas
    5. Status: validating_citations
    6. Citations payload
    7. Done payload
    """
    from app.core.database import AsyncSessionLocal
    from app.models.document import Document, DocumentChunk

    doc_id = uuid.uuid4()
    chunk_id = uuid.uuid4()

    # Create real document and chunk records in DB to satisfy foreign key constraints
    async with AsyncSessionLocal() as db:
        test_doc = Document(
            id=doc_id,
            original_filename="test.pdf",
            storage_path=f"/tmp/{doc_id}.pdf",
            status="ready",
            page_count=1,
        )
        test_chunk = DocumentChunk(
            id=chunk_id,
            document_id=doc_id,
            chunk_index=0,
            page_number=1,
            content="Artificial intelligence and neural networks are computing systems inspired by biological brains.",
            token_count=14,
        )
        db.add(test_doc)
        db.add(test_chunk)
        await db.commit()

    mock_chunk = RetrievedChunk(
        chunk_id=chunk_id,
        document_id=doc_id,
        document_filename="test.pdf",
        page_number=1,
        chunk_index=0,
        content="Artificial intelligence and neural networks are computing systems inspired by biological brains.",
        similarity_score=0.92,
    )

    mock_retrieval = RetrievalResult(
        query_text="What are neural networks?",
        meets_threshold=True,
        threshold=0.70,
        top_similarity=0.92,
        total_retrieved=1,
        chunks=[mock_chunk],
    )

    transport = httpx.ASGITransport(app=app)
    try:
        with patch("app.services.streaming.RetrievalService.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = mock_retrieval

            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(

                "/api/v1/query/stream",
                json={
                    "question": "What are neural networks?",
                    "document_ids": [str(doc_id)],
                    "threshold": 0.70,
                },
            )

            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            frames = parse_sse_frames(resp.text)
            event_types = [f[0] for f in frames]

            # Verify key event milestones in stream
            assert "status" in event_types
            assert "token" in event_types
            assert "citations" in event_types
            assert "done" in event_types

            # Verify status progression
            status_steps = [f[1].get("step") for f in frames if f[0] == "status"]
            assert "embedding" in status_steps
            assert "retrieving" in status_steps
            assert "generating" in status_steps
            assert "validating_citations" in status_steps

            # Verify citations event structure
            citations_event = next(f[1] for f in frames if f[0] == "citations")
            assert "citations" in citations_event
            assert "confidence" in citations_event
            assert citations_event["is_grounded"] is True

            # Verify done event
            done_event = next(f[1] for f in frames if f[0] == "done")
            assert "query_id" in done_event
            assert done_event["is_grounded"] is True
    finally:
        async with AsyncSessionLocal() as db:
            await db.delete(test_doc)
            await db.commit()


@pytest.mark.asyncio

async def test_stream_grounded_answer_gate_rejected():
    """
    Tests SSE streaming behavior when retrieval is below relevance threshold:
    Emits status -> gate_rejected -> done (with is_grounded: False).
    No token events should be emitted.
    """
    mock_retrieval = RetrievalResult(
        query_text="What is quantum gravity in cellular biology?",
        meets_threshold=False,
        threshold=0.70,
        top_similarity=0.45,
        total_retrieved=0,
        chunks=[],
    )

    transport = httpx.ASGITransport(app=app)
    with patch("app.services.streaming.RetrievalService.search", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = mock_retrieval

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/query/stream",
                json={
                    "question": "What is quantum gravity in cellular biology?",
                    "threshold": 0.70,
                },
            )

            assert resp.status_code == 200
            frames = parse_sse_frames(resp.text)
            event_types = [f[0] for f in frames]

            assert "status" in event_types
            assert "gate_rejected" in event_types
            assert "done" in event_types
            assert "token" not in event_types

            gate_event = next(f[1] for f in frames if f[0] == "gate_rejected")
            assert gate_event["top_similarity"] == 0.45
            assert "Not found" in gate_event["fallback_answer"]

            done_event = next(f[1] for f in frames if f[0] == "done")
            assert done_event["is_grounded"] is False
