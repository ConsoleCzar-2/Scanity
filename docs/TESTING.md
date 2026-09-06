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

### 2.2 Worker & Document Endpoints Lifecycle Tests (`backend/tests/test_worker_and_endpoints.py`)

| Test Phase | Target Component | Verification Criteria |
|---|---|---|
| `[1/7] Upload` | `POST /documents/upload` | Form-data PDF validation, storage persistence, and HTTP 202 Accepted response. |
| `[2/7] Worker Processing` | `process_pdf_task` | State transitions: `pending` -> `processing` -> `ready` with accurate page counts. |
| `[3/7] pgvector Persistence` | `DocumentChunk` | Verifies chunk records in PostgreSQL with 768-dimensional float embeddings. |
| `[4/7] Status Polling` | `GET /{id}/status` | Validates accurate document status, page counts, and total chunks payload. |
| `[5/7] Document Listing` | `GET /documents` | Validates paginated list response containing uploaded document IDs. |
| `[6/7] Cascade Deletion` | `DELETE /{id}` | Atomically wipes DB record, cascades deletion to all chunks/embeddings, and deletes file from disk. |
| `[7/7] Edge Cases` | Error Boundaries | Tests rejection of invalid extensions (.txt), empty uploads, and non-existent 404 UUIDs. |

### 2.3 Retrieval System & Relevance Gate Tests (`backend/tests/test_retrieval.py`)

| Test Phase | Target Component | Verification Criteria |
|---|---|---|
| `[1/6] Embedding Generation` | `RetrievalService.embed_query` | Generates 768-dimensional float embedding with Euclidean unit normalization. |
| `[2/6] Semantic Ranking` | `RetrievalService.search` | Top-k KNN retrieval using pgvector `<=>` ranks relevant page #1 with high similarity. |
| `[3/6] Document Scoping` | `document_ids` filter | Enforces multi-document scoping; 100% of returned chunks match the target document ID. |
| `[4/6] Relevance Gate` | Anti-hallucination filter | Rejects off-topic queries ($< 0.70$ similarity), returning `meets_threshold=False` and suppressing chunks. |
| `[5/6] Math Consistency` | Distance transformation | Validates invariant relation $s = 1 - d$ across all distance values. |
| `[6/6] REST API Search` | `POST /query/search` | Tests FastAPI endpoint returning 200 OK with ranked chunks and threshold flags. |

---

## 3. How to Execute Tests

### 3.1 Run Ingestion Unit Tests
From the `backend/` directory with the virtual environment activated:
```powershell
cd backend
.\venv\Scripts\activate

# Run the ingestion unit test suite
python tests/test_ingestion.py
```

### 3.2 Run Worker & Endpoint Lifecycle Tests
```powershell
cd backend
.\venv\Scripts\activate

# Run the worker and document endpoints test suite
python tests/test_worker_and_endpoints.py
```

#### Expected Test Output:
```
================================================================
Testing Step 5: Celery Worker & Document Endpoints Lifecycle
================================================================
PASS [1/7]: Uploaded document with status 'pending' (HTTP 202).
PASS [2/7]: Worker processed 3 pages into 3 chunks.
PASS [3/7]: Verified 3 chunks in PostgreSQL with 768-dim embeddings.
PASS [4/7]: GET /{id}/status returned 'ready' with 3 chunks.
PASS [5/7]: GET /api/v1/documents successfully listed documents.
PASS [6/7]: DELETE /{id} deleted DB record, cascaded all pgvector chunks, and deleted disk file.
PASS [7/7]: Edge cases handled correctly (invalid extensions, empty uploads, 404 lookups).

ALL STEP 5 AUTOMATED TESTS PASSED SUCCESSFULLY!
```

### 3.3 Run Retrieval System & Relevance Gate Tests
```powershell
cd backend
.\venv\Scripts\activate

# Run the retrieval system test suite
python tests/test_retrieval.py
```

#### Expected Test Output:
```
================================================================
Testing Step 6: Retrieval System & Relevance Threshold Gate
================================================================
PASS [1/6]: Query embedding generated (768-dim, unit norm=1.0000).
PASS [2/6]: Semantic search ranked Page 1 #1 (similarity: 0.7624).
PASS [3/6]: Document scoping verified (100% of chunks isolated to scoped document).
PASS [4/6]: Anti-hallucination gate triggered: off-topic query rejected (top_similarity: 0.6106 < 0.70).
PASS [5/6]: Mathematical consistency of cosine similarity transformation verified.
PASS [6/6]: POST /api/v1/query/search returned 200 OK with Page 2 ranked #1.

ALL STEP 6 RETRIEVAL TESTS PASSED SUCCESSFULLY!
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
