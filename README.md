# Scanity: Enterprise AI-Powered Document Q&A System

Scanity is an asynchronous, decoupled, enterprise-grade Retrieval-Augmented Generation (RAG) system engineered with FastAPI, PostgreSQL 16 (`pgvector`), Celery, Redis, Google Gemini, and Next.js 15.

Scanity allows organizations to ingest complex, high-volume PDF documents and query them in natural language, receiving factual answers strictly grounded in document text with page-level citations and mathematical anti-hallucination guardrails.

---

## 1. Key Architectural Highlights

- **Decoupled Asynchronous Processing (Celery + Redis):** CPU-intensive PDF parsing (PyMuPDF) and vector embedding generation are completely offloaded to persistent Celery worker queues, preserving sub-20ms FastAPI response latency.
- **Unified Relational & Vector Persistence (PostgreSQL 16 + pgvector):** Relational document metadata and high-dimensional vector embeddings coexist in a single ACID-compliant database, ensuring atomic cascading deletes (`ON DELETE CASCADE`) with zero orphaned "ghost embeddings."
- **High-Performance HNSW Vector Indexing:** Fast approximate nearest-neighbor search via Hierarchical Navigable Small World (`hnsw`) graphs using `vector_cosine_ops` for sub-5ms vector retrieval.
- **Time-Ordered Primary Keys (RFC 9562 UUIDv7):** Combines a 48-bit millisecond Unix timestamp with cryptographic entropy to maintain sequential B-tree inserts and prevent index fragmentation.
- **Anti-Hallucination Relevance Threshold Gate:** Rejects off-topic or low-similarity queries ($< 0.70$ cosine similarity) before passing context to the LLM, eliminating hallucinated answers at the source.
- **Modern Next.js 15 App Router Architecture:** Clean separation into public landing (`/` with Skiper-style card stacking scroll), authentication (`/login` with RBAC demo accounts and self-registration), and enterprise workspace (`/chat` with live document scoping and progressive pipeline feedback).
- **Rate-Limit & Production Resilient Ingestion:** Automatic exponential backoff for Google API 429 quota exhaustion, multi-file batch upload, and roadmap for local on-premise embedding using `intfloat/e5-large` (1024-D).

---

## 2. Implementation Roadmap & Current Status

- [x] **Step 1: Infrastructure Setup (Docker Compose)** - PostgreSQL 16 with `pgvector`, Redis 7, and pgAdmin.
- [x] **Step 2: Backend Initialization & Environment Setup** - Python 3.12 virtual environment, FastAPI scaffolding, and CORS middleware.
- [x] **Step 3: Database Models & Migrations** - Enterprise modular layout, UUIDv7 keys, `Vector(768)` models, and Alembic migrations.
- [x] **Step 4: Core Ingestion Pipeline** - PyMuPDF page-preserving extraction, ~700-token recursive chunking with 100-token sliding overlap, and Gemini `gemini-embedding-001`.
- [x] **Step 5: Celery Worker Integration** - Decoupled async processing queue via Redis, storage service abstraction, and RESTful document management endpoints.
- [x] **Step 6: Retrieval System (Vector Search & Relevance Gate)** - Cosine similarity search (`<=>`), HNSW-accelerated top-k retrieval, multi-document scoping, and anti-hallucination threshold gating.
- [x] **Step 7: Generation System (Grounded Q&A & Citation Validation)** - Grounded structured output with Gemini 3.5 Flash Lite, post-hoc citation validation, and audit database persistence.
- [x] **Step 8: Frontend Initialization** - Next.js 15 App Router, TypeScript 5, Tailwind CSS v4, typed API client, and enterprise dark dashboard shell.
- [x] **Step 9: Frontend UI Components & Interactive Experience** - Drag-and-drop upload panel, adaptive polling badges, navigation drawer, telemetry modal, progressive answer streaming, and verified citation popovers.
- [x] **Step 10: Production Hardening, Rate-Limit Resilience & UX Refinements** - Skiper UI card-stacking scroll on landing page, admin parameter tuning sliders, multi-file PDF upload, React 19 hydration synchronization, AFC deprecation fix, dynamic API 429 backoff, and progressive pipeline stepper.
- [ ] **Step 11: Future Extensions** - Local high-performance embedding model (`intfloat/e5-large`), Server-Sent Events (SSE) streaming, hybrid full-text search, and multi-tenant JWT auth.

---

## 3. Quick Start Guide

### 3.1 Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Node.js 18+ & npm (for Next.js 15 frontend)
- WSL2 (optional, for multi-process Linux Celery workers on Windows)

### 3.2 Infrastructure Setup
Start the PostgreSQL and Redis containers:
```powershell
docker compose up -d db redis
```
> Note: Database port is mapped to host port `5433` (`5433:5432`) to prevent collisions with any host-installed PostgreSQL services.

### 3.3 Backend Setup
Activate the virtual environment and apply database migrations:
```powershell
cd backend
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3.4 Launch Background Celery Worker
In a separate terminal:

**Windows Native (PowerShell):**
```powershell
cd backend
.\venv\Scripts\activate
celery -A app.workers.celery_app worker --loglevel=info -P solo
```

**WSL2 (Linux):**
```bash
cd /mnt/c/Users/ABHIRUP/Documents/GitHub/Scanity/backend
source venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
```

### 3.5 Frontend Setup & Dev Server
In a separate terminal:
```powershell
cd frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev

# Or build and test production bundle
npm run build
npm run lint
```
The frontend is accessible at:
- **Landing Page**: `http://localhost:3000/` (Features technical capability ledger and Skiper card-stacking scroll animation)
- **Authentication**: `http://localhost:3000/login` (Includes quick demo credentials for Admin and Customer roles, plus customer self-registration)
- **Workspace**: `http://localhost:3000/chat` (Multi-file document catalog, real-time scoping, Admin Modify Parameters sliders, and progressive Q&A)

---

## 4. Verification & Testing

### 4.1 Run All Tests at Once

Execute all test suites across the repository in a single command:

**Option A: Using pytest (Recommended)**
```powershell
cd backend

# Either activate the virtual environment:
.\venv\Scripts\activate
pytest -v

# Or run directly without script activation:
.\venv\Scripts\pytest.exe -v
```

**Option B: Using native Python test runner**
```powershell
cd backend
.\venv\Scripts\activate
python run_tests.py
```

### 4.2 Run Individual Test Suites
```powershell
# 1. Ingestion Pipeline Unit Tests
python tests/test_ingestion.py

# 2. Celery Worker & Document Lifecycle Tests
python tests/test_worker_and_endpoints.py

# 3. Vector Retrieval & Relevance Gate Tests
python tests/test_retrieval.py

# 4. Grounded Generation & Citation Validation Tests
python tests/test_generation.py
```

### 4.3 Frontend Verification & Linting
```powershell
cd frontend

# Run ESLint validation
npm run lint

# Run production build and TypeScript check
npm run build
```

### 4.4 Inspect Live System via API & Browser
- Web Dashboard: `http://localhost:3000` (Next.js 15 frontend)
- Health Probe: `curl http://localhost:8000/api/v1/health`
- Document List: `curl http://localhost:8000/api/v1/documents`
- Vector Search Inspection:
  ```powershell
  curl -X POST "http://localhost:8000/api/v1/query/search" -H "Content-Type: application/json" -d '{\"question\": \"What was the operating profit margin?\", \"top_k\": 3, \"threshold\": 0.70}'
  ```
- Grounded Q&A with Citations:
  ```powershell
  curl -X POST "http://localhost:8000/api/v1/query" -H "Content-Type: application/json" -d '{\"question\": \"What was the operating profit margin?\", \"top_k\": 3, \"threshold\": 0.70}'
  ```
- Interactive API Documentation:
  - Swagger UI: `http://localhost:8000/docs`
  - ReDoc: `http://localhost:8000/redoc`

---

## 5. Comprehensive Documentation Index

All technical design documents are maintained under the `docs/` directory:

| Document | Description |
|---|---|
| [System Architecture](docs/ARCHITECTURE.md) | Decoupled tiers, modular backend structure, RAG pipeline, and architectural trade-offs. |
| [Ingestion & Workers](docs/INGESTION_AND_WORKERS.md) | PyMuPDF parsing, ~700-token chunking with overlap, and Celery + Redis worker architecture. |
| [Database & Schema](docs/DATABASE.md) | PostgreSQL + pgvector setup, UUIDv7 primary keys, ERD, tables catalog, and HNSW indexes. |
| [API Reference](docs/API.md) | Complete documentation of all live REST endpoints, request/response schemas, and curl examples. |
| [Testing Strategy](docs/TESTING.md) | Test catalogs, synthetic PDF generation, database cascade testing, and run commands. |
| [Frontend Architecture](docs/FRONTEND.md) | Next.js 15 App Router specifications, component hierarchy, and citation chip UI design. |
| [Deployment & Operations](docs/DEPLOYMENT.md) | Container topology, port allocations, persistent volumes, environment configs, and health probes. |
| [UML & Sequence Diagrams](docs/UML.md) | Domain class diagrams, ingestion sequence, and query validation workflows. |
