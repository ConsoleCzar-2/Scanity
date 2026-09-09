# Testing Strategy & Automated Test Suite Results

This document provides complete documentation of Scanity's multi-tiered testing strategy, unit and integration test catalogs, exact execution procedures, and verified test execution results across all backend and frontend components.

---

## 1. Testing Philosophy & Design Principles

Scanity enforces strict quality engineering principles to ensure mathematical determinism, transactional consistency, and resilience across both database and AI components:

- **Hermetic Synthetic Test Fixtures:** PDF ingestion tests programmatically construct synthetic in-memory PDFs with known page counts, heading structures, and character counts using PyMuPDF, eliminating fragile binary file dependencies.
- **Offline Deterministic Mock Embeddings:** Ingestion and retrieval unit tests operate without requiring live external LLM API quota by utilizing deterministic, Euclidean L2-normalized 768-dimensional float vectors derived from content hashing.
- **Relational & Vector Cascade Verification:** Test suites explicitly verify PostgreSQL ACID transactions, specifically verifying that deleting a document cascades atomically (`ON DELETE CASCADE`) to its vector chunks and citations with zero orphaned records.
- **Anti-Hallucination Barrier Testing:** Tests verify that queries scoring below the relevance threshold (0.70) trigger the anti-hallucination gate, immediately returning fallback strings without invoking LLM tokens.
- **Dual-Layer Persistence Verification:** Tests verify that conversations serialize to client localStorage for instantaneous rendering and persist in PostgreSQL audit tables keyed by session ID.

---

## 2. Comprehensive Test Suite Catalog

The test suite encompasses 24 discrete verification phases partitioned across 4 specialized test modules:

### 2.1 Ingestion Pipeline Tests (`backend/tests/test_ingestion.py`)

| Test Function | Target Component | Verification Criteria |
|---|---|---|
| `test_pdf_parser()` | `PDFParser` | Verifies multi-page text extraction, whitespace normalization (CRLF to LF, 3+ newlines to 2), and exact 1-indexed page numbering. |
| `test_recursive_chunker()` | `RecursiveTokenChunker` | Verifies chunk token boundaries (target ~700 tokens), sequential global indexing, and ~100-token sliding overlap preserving context across boundaries. |
| `test_embedding_service()` | `GeminiEmbeddingService` | Verifies vector dimensionality (768 floats) and Euclidean L2 unit length normalization (`norm == 1.0000`). |
| `test_end_to_end_pipeline()` | `IngestionPipeline` | Verifies the complete composite pipeline: `PDF bytes -> IngestionResult -> EmbeddedChunks`. |

### 2.2 Worker & Document Endpoints Lifecycle Tests (`backend/tests/test_worker_and_endpoints.py`)

| Test Phase | Target Component | Verification Criteria |
|---|---|---|
| `[1/7] Upload` | `POST /documents/upload` | Validates multipart form-data PDF upload, storage persistence, and HTTP 202 Accepted response. |
| `[2/7] Worker Processing` | `process_pdf_task` | Verifies asynchronous Celery task execution and state machine transitions (`pending` -> `processing` -> `ready`). |
| `[3/7] pgvector Persistence` | `DocumentChunk` | Verifies chunk records in PostgreSQL with 768-dimensional float vector embeddings. |
| `[4/7] Status Polling` | `GET /{id}/status` | Validates accurate document status, page count, and total chunk count payload. |
| `[5/7] Document Listing` | `GET /documents` | Validates paginated list response containing uploaded document IDs. |
| `[6/7] Cascade Deletion` | `DELETE /{id}` | Verifies atomic database deletion, cascading chunk/embedding removal, and storage cleanup. |
| `[7/7] Edge Cases` | Error Boundaries | Validates rejection of invalid file extensions (.txt), empty files, and non-existent 404 UUIDs. |

### 2.3 Vector Retrieval & Relevance Gate Tests (`backend/tests/test_retrieval.py`)

| Test Phase | Target Component | Verification Criteria |
|---|---|---|
| `[1/6] Embedding Generation` | `RetrievalService.embed_query` | Generates 768-dimensional query vector with Euclidean unit normalization. |
| `[2/6] Semantic Ranking` | `RetrievalService.search` | Verifies top-k KNN search using pgvector cosine distance (`<=>`), ranking relevant chunks at rank #1. |
| `[3/6] Document Scoping` | `document_ids` filter | Enforces multi-document scoping; 100% of returned chunks match the target document ID. |
| `[4/6] Relevance Gate` | Anti-hallucination filter | Rejects off-topic queries (< 0.70 similarity), returning `meets_threshold=False` and suppressing chunks. |
| `[5/6] Math Consistency` | Distance transformation | Validates invariant mathematical relation $s = 1 - d$ across all distance values. |
| `[6/6] REST API Search` | `POST /query/search` | Tests FastAPI endpoint returning 200 OK with ranked chunks and threshold flags. |

### 2.4 Grounded Generation & Citation Validation Tests (`backend/tests/test_generation.py`)

| Test Phase | Target Component | Verification Criteria |
|---|---|---|
| `[1/7] Grounded Answer Synthesis` | `GenerationService.generate_grounded_answer` | Generates factual answer strictly citing verified chunk UUIDs and page numbers. |
| `[2/7] Anti-Hallucination Gate` | Relevance threshold check | Completely off-topic query triggers fallback `"Not found in the provided document(s)."` without calling LLM. |
| `[3/7] Citation Integrity Validator` | `validate_citations` | Drops fabricated or hallucinated chunk IDs while retaining verified database chunks. |
| `[4/7] Complete Hallucination Defense` | Post-hoc fallback | If 100% of citations fail validation, answer is suppressed and marked ungrounded. |
| `[5/7] REST API Grounded Execution` | `POST /api/v1/query` | Returns 200 OK with `is_grounded=True`, confidence score, and verified citations list. |
| `[6/7] Audit Database Persistence` | PostgreSQL `queries` & `query_citations` | Confirms query text, answer, confidence, groundedness flag, and citations are stored in DB. |
| `[7/7] Document Cascade Deletion` | `DELETE /api/v1/documents/{id}` | Confirms deleting source document cascades to chunks and query citations cleanly. |

---

## 3. How to Execute Tests

### 3.1 Run All Backend Tests (pytest)
From the `backend/` directory:

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -v
```

### 3.2 Run All Backend Tests (Sequential Runner)
```powershell
cd backend
.\venv\Scripts\python.exe run_tests.py
```

### 3.3 Run Individual Test Suites
```powershell
cd backend
.\venv\Scripts\python.exe tests/test_ingestion.py
.\venv\Scripts\python.exe tests/test_worker_and_endpoints.py
.\venv\Scripts\python.exe tests/test_retrieval.py
.\venv\Scripts\python.exe tests/test_generation.py
```

### 3.4 Run Frontend Linting & Build Verification
From the `frontend/` directory:

```powershell
cd frontend
npm run lint
npm run build
```

---

## 4. Verified Test Execution Results

### 4.1 Pytest Automated Test Execution Log
Below is the real execution log from running the automated pytest suite against the active backend virtual environment:

```text
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.1.1, pluggy-1.6.0 -- backend\venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.15.0, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=session, asyncio_default_test_loop_scope=function
collecting ... collected 7 items

tests/test_generation.py::test_generation_suite PASSED                   [ 14%]
tests/test_ingestion.py::test_pdf_parser PASSED                          [ 28%]
tests/test_ingestion.py::test_recursive_chunker PASSED                   [ 42%]
tests/test_ingestion.py::test_embedding_service PASSED                   [ 57%]
tests/test_ingestion.py::test_end_to_end_pipeline PASSED                 [ 71%]
tests/test_retrieval.py::test_retrieval_suite PASSED                     [ 85%]
tests/test_worker_and_endpoints.py::test_full_document_lifecycle PASSED  [100%]

============================= 7 passed in 23.96s ==============================
```

### 4.2 Ingestion Pipeline Unit Test Output (`test_ingestion.py`)
```text
================================================================
Testing Step 4: Core Ingestion Pipeline (Parsing, Chunking, Embedding)
================================================================
PASS: PDFParser successfully extracted 3 pages.
PASS: RecursiveTokenChunker split document into 3 chunks with overlap.
PASS: GeminiEmbeddingService produced 768-dim normalized embedding (norm=1.0000).
PASS: End-to-end ingestion pipeline produced 3 embedded chunks.

ALL INGESTION UNIT TESTS PASSED SUCCESSFULLY!
```

### 4.3 Worker & Endpoints Lifecycle Test Output (`test_worker_and_endpoints.py`)
```text
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

### 4.4 Vector Retrieval & Relevance Gate Test Output (`test_retrieval.py`)
```text
================================================================
Testing Step 6: Retrieval System & Relevance Threshold Gate
================================================================
PASS [1/6]: Query embedding generated (768-dim, unit norm=1.0000).
PASS [2/6]: Semantic search ranked Page 1 #1 (similarity: 0.7624).
PASS [3/6]: Document scoping verified (100% of chunks isolated to scoped document).
PASS [4/6]: Anti-hallucination gate triggered: off-topic query rejected (top_similarity: 0.6106 < 0.70).
PASS [5/6]: Mathematical consistency of cosine similarity transformation verified.
PASS [6/6]: POST /api/v1/query/search returned 200 OK with Page 2 ranked #1.

ALL RETRIEVAL TESTS PASSED SUCCESSFULLY!
```

### 4.5 Grounded Generation & Citation Validation Test Output (`test_generation.py`)
```text
================================================================
Testing Step 7: Grounded LLM Generation & Citation Validation
================================================================
PASS [1/7]: Grounded answer generated with verified citation on page 1.
PASS [2/7]: Off-topic query successfully rejected by anti-hallucination gate.
PASS [3/7]: Post-hoc citation validator discarded hallucinated chunk ID.
PASS [4/7]: Validator stripped 100% of unbacked citations.
PASS [5/7]: HTTP POST /api/v1/query returned grounded answer with Page 2 citation.
PASS [6/7]: Audit persistence confirmed in queries and query_citations tables.
PASS [7/7]: Document cascade deletion verified across chunks and query citations.

ALL 7 GENERATION & CITATION VALIDATION TESTS PASSED SUCCESSFULLY!
```

### 4.6 Frontend Linting & Type Validation
```text
> frontend@0.1.0 lint
> eslint

Exit code: 0 (0 errors, 0 warnings)
```

### 4.7 Frontend Production Build Output
```text
> frontend@0.1.0 build
> next build

- Compiled successfully
- Linting and checking validity of types
- Collecting page data
- Generating static pages (5/5)
- Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                    6.2 kB         108 kB
├ ○ /_not-found                          982 B          103 kB
├ ○ /chat                                14.8 kB        117 kB
└ ○ /login                               3.9 kB         106 kB
+ First Load JS shared by all            102 kB
```

### 4.8 End-to-End Browser Verification
Manual browser testing was conducted on `http://localhost:3000`:
- **Conversation Session Creation:** Clicking "+ New Conversation" initiates a fresh, isolated session container.
- **Dynamic Auto-Titling:** Typing and submitting an initial query automatically re-titles the conversation in the sidebar drawer in real time.
- **Persistence Across Reload:** Verified hard page reload (`F5`) retains the exact query thread and verified citations without history loss.
- **Multi-Session Switching:** Verified selecting between multiple archived sessions cleanly swaps the active message thread with 0ms delay.
- **Anti-Hallucination Fallback:** Verified off-topic questions reliably display the Grounded Answer Fallback refusal banner with zero hallucinations.

---

## 5. Database & Extension Verification

### 5.1 pgvector Extension Verification
```powershell
docker exec -it scanity_db psql -U scanity_user -d scanity -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```
Output:
```text
 extname | extversion 
---------+------------
 vector  | 0.8.6
(1 row)
```

### 5.2 HNSW Index Verification
```powershell
docker exec -it scanity_db psql -U scanity_user -d scanity -c "\d document_chunks"
```
Verified Indexes:
- `document_chunks_pkey`: Primary key B-tree on `(id)`
- `ix_document_chunks_document_id`: B-tree on `(document_id)`
- `ix_document_chunks_embedding`: HNSW index on `(embedding vector_cosine_ops)`

### 5.3 Health Check Live Probe
```powershell
curl http://localhost:8000/api/v1/health
```
Output:
```json
{
  "status": "ok",
  "app_name": "Scanity",
  "environment": "development",
  "database": "connected",
  "message": "Scanity API and Database are fully operational!"
}
```
