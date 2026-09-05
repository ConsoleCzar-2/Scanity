# Scanity Documentation

Welcome to the official documentation for **Scanity**, an enterprise-grade AI-powered Document Q&A system built with FastAPI, PostgreSQL (`pgvector`), Celery, Redis, and Next.js.

Scanity enables users to upload PDF documents and ask natural-language questions, receiving answers strictly grounded in the document text with page-level citations and an anti-hallucination guardrail layer.

---

## 📚 Documentation Index

| Guide | Description |
|---|---|
| [System Architecture](ARCHITECTURE.md) | Decoupled tiers, modular backend structure, RAG design, and key architectural trade-offs. |
| [Database & Schema](DATABASE.md) | PostgreSQL + pgvector setup, UUIDv7 time-ordered keys, ERD, tables catalog, and Alembic migrations. |
| [API Reference](API.md) | REST endpoints, request/response schemas, CORS rules, and health probe documentation. |
| [UML & Sequence Diagrams](UML.md) | Comprehensive class diagrams, ingestion sequence, and query validation workflows. |

---

## ⚡ Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Node.js 18+ (for frontend in Step 8)

### 2. Infrastructure Setup
Start PostgreSQL with `pgvector` and Redis:
```powershell
docker compose up -d db redis
```
> Note: The database is mapped to host port `5433` (`5433:5432`) to prevent collisions with any host-installed PostgreSQL services.

### 3. Backend Setup
From the repository root:
```powershell
cd backend

# Activate virtual environment
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload
```

### 4. Verify System Health
```powershell
curl http://localhost:8000/api/v1/health
```
Expected output:
```json
{
  "status": "ok",
  "app_name": "Scanity",
  "environment": "development",
  "database": "connected",
  "message": "Scanity API and Database are fully operational!"
}
```

Interactive API docs are available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 🗺️ Implementation Roadmap

- [x] **Step 1: Infrastructure Setup (Docker Compose)** — Postgres + pgvector, Redis, and pgAdmin.
- [x] **Step 2: Backend Initialization & Environment Setup** — Python 3.12 virtual environment, FastAPI scaffolding, and CORS.
- [x] **Step 3: Database Models & Migrations** — Enterprise modular backend, UUIDv7 primary keys, pgvector `Vector(768)` with HNSW index, and Alembic migrations.
- [ ] **Step 4: Core Ingestion Pipeline** — PyMuPDF extraction, ~700-token chunking with 100-token overlap, and Gemini `embedding-001` integration.
- [ ] **Step 5: Celery Worker Integration** — Decoupled async processing queue via Redis and upload status tracking.
- [ ] **Step 6: Retrieval System** — Cosine similarity search (`<=>`), top-k retrieval, and relevance threshold gating.
- [ ] **Step 7: Generation System** — Grounded structured output with Gemini, citation verification, and fallback guards.
- [ ] **Step 8: Frontend Initialization** — Next.js 15 App Router, TypeScript, and Tailwind CSS.
- [ ] **Step 9: Frontend UI** — Drag-and-drop upload panel, polling badges, and chat interface with citation chips.
- [ ] **Step 10: Final Polish & Production Readiness** — Containerized deployment and documentation.
