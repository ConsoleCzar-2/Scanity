import asyncio
from pathlib import Path
import sys
import uuid

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

import httpx
import pymupdf as fitz
import pytest

from app.main import app
from app.models.document import Document
from app.services.ingestion import PDFParser
from app.services.storage import get_storage_service
from app.core.database import AsyncSessionLocal


def create_test_pdf(pages: int = 2) -> bytes:
    """Creates a simple in-memory PDF document."""
    doc = fitz.open()
    for page_num in range(1, pages + 1):
        page = doc.new_page(width=400, height=600)
        page.insert_text((50, 50), f"Test Page {page_num}", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_pdf_parser_render_page_image_valid():
    """Verifies that PDFParser.render_page_image produces valid PNG binary data."""
    pdf_bytes = create_test_pdf(pages=2)
    png_bytes = PDFParser.render_page_image(pdf_bytes, page_number=1, dpi=100)

    assert isinstance(png_bytes, bytes)
    assert len(png_bytes) > 0
    # PNG signature check: \x89PNG\r\n\x1a\n
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")


def test_pdf_parser_render_page_image_out_of_bounds():
    """Verifies that out-of-bounds page requests raise an IndexError."""
    pdf_bytes = create_test_pdf(pages=2)

    with pytest.raises(IndexError):
        PDFParser.render_page_image(pdf_bytes, page_number=0)

    with pytest.raises(IndexError):
        PDFParser.render_page_image(pdf_bytes, page_number=3)


@pytest.mark.asyncio
async def test_get_document_page_image_endpoint():
    """Tests the GET /api/v1/documents/{id}/pages/{page}/image endpoint."""
    pdf_bytes = create_test_pdf(pages=2)
    storage_service = get_storage_service()
    doc_id = uuid.uuid4()
    storage_path, file_hash = storage_service.save_file(
        file_content=pdf_bytes,
        original_filename="render_test.pdf",
        doc_id=str(doc_id),
    )

    async with AsyncSessionLocal() as db:
        document = Document(
            id=doc_id,
            original_filename="render_test.pdf",
            storage_path=storage_path,
            file_hash=file_hash,
            status="ready",
            page_count=2,
        )
        db.add(document)
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Valid page image fetch
        resp = await client.get(f"/api/v1/documents/{doc_id}/pages/1/image")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content.startswith(b"\x89PNG\r\n\x1a\n")
        assert "Cache-Control" in resp.headers

        # 2. Out of bounds page
        resp_oob = await client.get(f"/api/v1/documents/{doc_id}/pages/99/image")
        assert resp_oob.status_code == 400

        # 3. Nonexistent document
        non_existent_id = uuid.uuid4()
        resp_404 = await client.get(f"/api/v1/documents/{non_existent_id}/pages/1/image")
        assert resp_404.status_code == 404

    # Cleanup DB record and storage file
    async with AsyncSessionLocal() as db:
        await db.delete(document)
        await db.commit()
    storage_service.delete_file(storage_path)
