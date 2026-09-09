# Scanity Documentation

Welcome to the official documentation for **Scanity**, an enterprise-grade AI-powered Document Q&A system built with FastAPI, PostgreSQL (`pgvector`), Celery, Redis, and Next.js.

Scanity enables users to upload PDF documents and ask natural-language questions, receiving answers strictly grounded in the document text with page-level citations and an anti-hallucination guardrail layer.

---

## Documentation Index

| Guide | Description |
|---|---|
| [System Architecture](ARCHITECTURE.md) | Decoupled tiers, modular backend structure, RAG design, and key architectural trade-offs. |
| [Ingestion & Workers](INGESTION_AND_WORKERS.md) | PDF extraction with PyMuPDF, recursive token chunking with sliding overlap, L2 vector normalization, and Celery worker architecture. |
| [Database & Schema](DATABASE.md) | PostgreSQL + pgvector setup, UUIDv7 time-ordered keys, ERD, tables catalog, session query tracking, and Alembic migrations. |
| [API Reference](API.md) | REST endpoints, query history APIs, request/response schemas, CORS rules, and health probe documentation. |
| [Frontend Architecture](FRONTEND.md) | Next.js 15 App Router specifications, component hierarchy, session storage, polling state machine, and citation chip UI. |
| [Deployment & Operations](DEPLOYMENT.md) | Multi-container Docker topology, port allocations, persistent volumes, environment configs, and health probes. |
| [Testing Strategy & Results](TESTING.md) | Ingestion unit tests, synthetic multi-page PDF generation, database cascade tests, full execution logs, and frontend verification. |
| [UML & Sequence Diagrams](UML.md) | Comprehensive class diagrams, ingestion sequence, query validation, and session management workflows. |

---

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Node.js 18+ (for frontend)

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

### 4. Background Celery Worker
In a separate terminal, launch the Celery task worker:

**Windows Native (PowerShell):**
```powershell
cd backend
.\venv\Scripts\activate
celery -A app.workers.celery_app worker --loglevel=info -P solo
```

**WSL (Linux Subsystem):**
```bash
cd /mnt/c/Users/ABHIRUP/Documents/GitHub/Scanity/backend
source venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
```

### 5. Frontend Setup & Run
From the repository root:
```powershell
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Or build and test production bundle
npm run build
npm run lint
```
The frontend application will be live at `http://localhost:3000` with live backend connectivity to `http://localhost:8000`.

### 6. Verify System Health & Document Endpoints
```powershell
# Check health probe
curl http://localhost:8000/api/v1/health

# Check documents list
curl http://localhost:8000/api/v1/documents
```
Expected health probe output:
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

