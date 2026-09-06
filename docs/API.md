# API Reference

The Scanity backend exposes an asynchronous RESTful API powered by FastAPI.

---

## 1. General Specifications

* **Base URL (Local):** `http://localhost:8000`
* **Versioned Base URL:** `http://localhost:8000/api/v1`
* **Interactive Documentation:**
  * Swagger UI: `http://localhost:8000/docs`
  * ReDoc: `http://localhost:8000/redoc`
  * OpenAPI JSON: `http://localhost:8000/openapi.json`
* **Content Type:** `application/json` (unless uploading files with `multipart/form-data`)

---

## 2. CORS Policy

Configured dynamically from the environment (`CORS_ORIGINS` and `CORS_ORIGINS_REGEX`):
* Allows local Next.js frontend at `http://localhost:3000`.
* Allows production Vercel frontend deployments matching regex: `^https://.*\.vercel\.app$`.
* Permits credentials, all HTTP methods (`*`), and all headers (`*`).

---

## 3. Currently Implemented Endpoints

### 3.1 Health & Database Live Probe
Inspects the health of the FastAPI process and executes an asynchronous `SELECT 1` ping against PostgreSQL.

* **Method:** `GET`
* **Path:** `/health` (also accessible via `/api/v1/health`)
* **Tags:** `Health`
* **Authentication:** None

#### Response (200 OK — Healthy):
```json
{
  "status": "ok",
  "app_name": "Scanity",
  "environment": "development",
  "database": "connected",
  "message": "Scanity API and Database are fully operational!"
}
```

#### Response (503 Service Unavailable — Database Disconnected):
```json
{
  "detail": {
    "status": "unhealthy",
    "app_name": "Scanity",
    "environment": "development",
    "database": "error",
    "error": "connection to server at 'localhost', port 5433 failed"
  }
}
```

#### Curl Command:
```powershell
curl http://localhost:8000/api/v1/health
```

---

### 3.2 Document Upload
Uploads a PDF file, validates format and size ($\le 25\text{MB}$), generates sequential UUIDv7, saves to storage, creates a database record, and queues background ingestion in Celery.

* **Method:** `POST`
* **Path:** `/api/v1/documents/upload`
* **Tags:** `Documents`
* **Content-Type:** `multipart/form-data`
* **Request:** Form field `file: UploadFile` (PDF format only)

#### Response (202 Accepted):
```json
{
  "document_id": "01a072bf-568f-78bd-be89-2312cc9d86a3",
  "original_filename": "q3_financial_report.pdf",
  "status": "pending",
  "message": "Document uploaded successfully. Processing queued."
}
```

#### Curl Command:
```powershell
curl -X POST "http://localhost:8000/api/v1/documents/upload" -F "file=@tests/sample.pdf"
```

---

### 3.3 Poll Document Processing Status
Polls the parsing, chunking, and embedding state of an uploaded document.

* **Method:** `GET`
* **Path:** `/api/v1/documents/{id}/status`
* **Tags:** `Documents`
* **Path Parameter:** `id: UUID` (Document UUIDv7)

#### Response (200 OK — Ready):
```json
{
  "id": "01a072bf-568f-78bd-be89-2312cc9d86a3",
  "original_filename": "q3_financial_report.pdf",
  "status": "ready",
  "page_count": 3,
  "total_chunks": 3,
  "uploaded_at": "2026-09-05T18:05:37.848508Z",
  "processed_at": "2026-09-05T18:05:37.982000Z"
}
```

#### Response (200 OK — Processing):
```json
{
  "id": "01a072bf-568f-78bd-be89-2312cc9d86a3",
  "original_filename": "q3_financial_report.pdf",
  "status": "processing",
  "page_count": null,
  "total_chunks": null,
  "uploaded_at": "2026-09-05T18:05:37.848508Z",
  "processed_at": null
}
```

---

### 3.4 List Uploaded Documents
Returns a paginated list of all uploaded documents ordered chronologically by upload timestamp descending.

* **Method:** `GET`
* **Path:** `/api/v1/documents`
* **Tags:** `Documents`
* **Query Parameters:** `skip: int = 0`, `limit: int = 50`

#### Response (200 OK):
```json
{
  "total": 1,
  "documents": [
    {
      "id": "01a072bf-568f-78bd-be89-2312cc9d86a3",
      "original_filename": "q3_financial_report.pdf",
      "status": "ready",
      "page_count": 3,
      "total_chunks": 3,
      "uploaded_at": "2026-09-05T18:05:37.848508Z",
      "processed_at": "2026-09-05T18:05:37.982000Z"
    }
  ]
}
```

---

### 3.5 Delete Document
Deletes a document from the database (atomically cascading deletion to all chunks and 768-dim vector embeddings in PostgreSQL) and removes the physical file from storage.

* **Method:** `DELETE`
* **Path:** `/api/v1/documents/{id}`
* **Tags:** `Documents`
* **Path Parameter:** `id: UUID`

#### Response (200 OK):
```json
{
  "status": "ok",
  "message": "Document 'q3_financial_report.pdf' and all associated vector embeddings deleted successfully."
}
```

---

### 3.6 Vector Search & Relevance Gate Inspection
Embeds a question, performs k-Nearest Neighbors (KNN) search in PostgreSQL via pgvector, applies multi-document scoping, and evaluates the anti-hallucination relevance threshold gate.

* **Method:** `POST`
* **Path:** `/api/v1/query/search`
* **Tags:** `Query`
* **Authentication:** None
* **Request Body:**
```json
{
  "question": "What was the reported operating profit margin for Q3?",
  "document_ids": ["01a074e4-6feb-79c5-a1b0-5fff4b876659"],
  "top_k": 3,
  "threshold": 0.70
}
```

#### Response (200 OK — Relevance Threshold Cleared):
```json
{
  "query": "What was the reported operating profit margin for Q3?",
  "top_similarity": 0.7624,
  "meets_threshold": true,
  "threshold": 0.70,
  "chunks": [
    {
      "chunk_id": "01a074e4-6feb-79c5-a1b0-5fff4b876660",
      "document_id": "01a074e4-6feb-79c5-a1b0-5fff4b876659",
      "original_filename": "financial_report_2026.pdf",
      "page_number": 1,
      "chunk_index": 0,
      "content": "=== Page 1: Corporate Financial Performance ===\nIn the third quarter of 2026, total operating revenue reached 48.2 million dollars...",
      "similarity_score": 0.7624
    }
  ]
}
```

#### Response (200 OK — Anti-Hallucination Gate Rejection):
```json
{
  "query": "How to bake chocolate chip sourdough bread?",
  "top_similarity": 0.6106,
  "meets_threshold": false,
  "threshold": 0.70,
  "chunks": []
}
```

#### Curl Command:
```powershell
curl -X POST "http://localhost:8000/api/v1/query/search" -H "Content-Type: application/json" -d '{\"question\": \"What was the operating profit margin?\", \"top_k\": 3, \"threshold\": 0.70}'
```

---

## 4. Scaffolded Endpoints (Planned for Step 7)

### 4.1 Grounded Q&A Generation with Citations (Step 7)

#### `POST /api/v1/query`
Answers natural language questions strictly grounded in the uploaded documents.
* **Request Body:**
```json
{
  "question": "What was the reported operating margin for Q3?",
  "document_ids": ["01a071df-5994-70a2-af14-618727cb1a4f"],
  "top_k": 5
}
```
* **Response (200 OK — Answer Found):**
```json
{
  "query_id": "01a071df-88a2-70b1-bb12-918727cb1e89",
  "answer": "The operating margin reported for Q3 was 18.4%, driven by reduced supply chain overhead.",
  "confidence": 0.94,
  "is_grounded": true,
  "citations": [
    {
      "chunk_id": "01a071df-59a5-7b6f-aa99-31ec4e5e1bcb",
      "document_id": "01a071df-5994-70a2-af14-618727cb1a4f",
      "page_number": 7,
      "snippet": "...operating margin reached 18.4% in the third quarter...",
      "relevance_score": 0.892
    }
  ]
}
```
* **Response (200 OK — Fallback / Hallucination Prevention):**
```json
{
  "query_id": "01a071df-88a2-70b1-bb12-918727cb1e89",
  "answer": "Not found in the provided document(s).",
  "confidence": 0.0,
  "is_grounded": false,
  "citations": []
}
```
