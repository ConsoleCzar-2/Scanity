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

## 4. Scaffolded Endpoints (Planned for Steps 4 – 7)

The following endpoints are scheduled for full implementation in upcoming steps:

### 4.1 Document Ingestion (Step 4 & 5)

#### `POST /api/v1/documents/upload`
Uploads a single or multiple PDF files. Dispatches an asynchronous Celery task to parse, chunk, and embed the content.
* **Request:** `multipart/form-data` with `file: UploadFile`
* **Response (202 Accepted):**
```json
{
  "document_id": "01a071df-5994-70a2-af14-618727cb1a4f",
  "filename": "quarterly_financials.pdf",
  "status": "pending",
  "message": "Document uploaded successfully. Processing queued."
}
```

#### `GET /api/v1/documents/{id}/status`
Polls the processing state of an uploaded document.
* **Path Parameter:** `id: UUID`
* **Response (200 OK):**
```json
{
  "document_id": "01a071df-5994-70a2-af14-618727cb1a4f",
  "filename": "quarterly_financials.pdf",
  "status": "ready",
  "page_count": 14,
  "total_chunks": 42,
  "processed_at": "2026-09-05T14:32:10Z"
}
```

#### `GET /api/v1/documents`
Lists all uploaded documents and their current statuses.

#### `DELETE /api/v1/documents/{id}`
Deletes a document record and cascades the deletion to all associated chunks in `pgvector`.

---

### 4.2 Semantic Query & Grounded Answer (Step 6 & 7)

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
