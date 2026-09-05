# Testing Strategy & Test Suite

This document outlines Scanity's testing strategy, automated test suites, and verification procedures.

---

## 1. Testing Philosophy

Scanity adheres to a multi-tiered verification strategy designed to ensure determinism and reliability across both database and AI components:
* **Zero External Dependencies in Tests:** Ingestion and retrieval tests do not require a live paid LLM API key; the system includes deterministic, unit-normalized mock vectors derived from content hashing.
* **Hermetic Synthetic Data:** PDF parsing tests programmatically generate synthetic in-memory PDFs with known page counts, heading structures, and character counts, avoiding brittle external binary file dependencies.
* **Integrity & Cascade Testing:** Every database model is verified for transactional consistency, specifically ensuring that deleting a document cascades cleanly to its vector chunks.
* **Dynamic Environment Sensitivity:** Test assertions dynamically adapt to environment settings (such as `VECTOR_DIMENSION` and `EMBEDDING_MODEL`).

---

## 2. Test Suite Catalog

### 2.1 Ingestion Pipeline Tests (`backend/tests/test_ingestion.py`)

| Test Function | Target Component | Verification Criteria |
|---|---|---|
| `test_pdf_parser()` | `PDFParser` | Verifies 3-page text extraction, whitespace normalization, and exact 1-indexed page numbering. |
| `test_recursive_chunker()` | `RecursiveTokenChunker` | Verifies chunk token boundaries ($\le 700$ tokens), sequential global indexing, and overlapping boundary words between adjacent chunks. |
| `test_embedding_service()` | `GeminiEmbeddingService` | Verifies vector dimensionality (`VECTOR_DIMENSION`, default 768) and Euclidean unit length ($\|v\|_2 \approx 1.0$). |
| `test_end_to_end_pipeline()` | `IngestionPipeline` | Tests complete flow: `PDF bytes -> IngestionResult -> EmbeddedChunks`. |

---

## 3. How to Execute Tests

### 3.1 Run Automated Unit Tests
From the `backend/` directory with the virtual environment activated:
```powershell
cd backend
.\venv\Scripts\activate

# Run the ingestion test suite
python tests/test_ingestion.py
```

#### Expected Test Output:
```
Running Ingestion Pipeline Test Suite...

PASS: test_pdf_parser successfully extracted 3 pages with clean text and page numbers.
PASS: test_recursive_chunker generated 3 chunks with verified sliding overlap.
PASS: test_embedding_service generated 768-dimensional normalized vectors.
PASS: test_end_to_end_pipeline successfully processed 'whitepaper.pdf' (3 pages, 3 embedded chunks).

ALL INGESTION TESTS PASSED SUCCESSFULLY!
```

---

## 4. Database & Infrastructure Testing

### 4.1 Verify pgvector Extension
Confirm the vector extension is active inside PostgreSQL:
```powershell
docker exec -it scanity_db psql -U scanity_user -d scanity -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```
*Expected Output:*
```
 extname | extversion 
---------+------------
 vector  | 0.8.6
(1 row)
```

### 4.2 Verify Table Schema & HNSW Index
Inspect the `document_chunks` table and its indexes:
```powershell
docker exec -it scanity_db psql -U scanity_user -d scanity -c "\d document_chunks"
```
*Expected Indexes:*
* `document_chunks_pkey`: Primary key B-tree on `(id)`.
* `ix_document_chunks_document_id`: B-tree on `(document_id)`.
* `ix_document_chunks_embedding`: **HNSW index** on `(embedding vector_cosine_ops)`.

### 4.3 Verify UUIDv7 & Foreign Key Cascade Deletions
Execute the following verification script in the backend virtual environment:
```powershell
python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.models import Document, DocumentChunk

async def verify():
    async with AsyncSessionLocal() as session:
        # Create doc
        doc = Document(original_filename='test.pdf', storage_path='/tmp/test.pdf', status='ready')
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        assert doc.id.version == 7, 'Document ID is not UUIDv7'

        # Create chunk
        chunk = DocumentChunk(document_id=doc.id, chunk_index=0, page_number=1, content='test', embedding=[0.1]*768)
        session.add(chunk)
        await session.commit()

        # Delete doc and verify cascade
        await session.delete(doc)
        await session.commit()

        # Verify chunk is gone from DB
        assert await session.get(DocumentChunk, chunk.id) is None
        print('PASS: UUIDv7 and cascade delete verified successfully!')

asyncio.run(verify())
"
```

---

## 5. API & Connectivity Probing

### 5.1 Health Check Probe
Tests that the FastAPI application is alive and can execute queries against PostgreSQL:
```powershell
curl http://localhost:8000/api/v1/health
```

#### Healthy Response (200 OK):
```json
{
  "status": "ok",
  "app_name": "Scanity",
  "environment": "development",
  "database": "connected",
  "message": "Scanity API and Database are fully operational!"
}
```
