# Deployment & Infrastructure Guide

> Note: Infrastructure services (PostgreSQL 16 with pgvector and Redis 7) are live from Step 1. Full multi-service container orchestration (including production containerization of backend, worker, and frontend) is scheduled for **Step 10 (Final Polish & Production Readiness)**. This document will be continuously updated with live deployment configurations as each step progresses.

## 1. System Topology & Container Architecture

Scanity uses a containerized microservices architecture coordinated via Docker Compose.

```mermaid
flowchart TD
    subgraph Client["Client Tier"]
        Browser["User Browser"]
    end

    subgraph Edge["Reverse Proxy / Edge"]
        Ingress["Host Network / Ingress"]
    end

    subgraph Frontend["Frontend Tier (Port 3000)"]
        NextApp["scanity_frontend<br/>Next.js 15 App Router"]
    end

    subgraph Backend["Backend Tier (Port 8000)"]
        FastAPI["scanity_backend<br/>FastAPI + Uvicorn"]
        Worker["scanity_worker<br/>Celery Worker Pool"]
    end

    subgraph Storage["State & Storage Tier"]
        DB["scanity_db (Port 5433:5432)<br/>PostgreSQL 16 + pgvector"]
        Redis["scanity_redis (Port 6379)<br/>Redis 7 Alpine"]
        Disk["/uploads<br/>Persistent Volume"]
    end

    Browser -->|HTTP :3000| NextApp
    NextApp -->|REST API :8000| FastAPI
    FastAPI -->|Enqueue Tasks| Redis
    FastAPI -->|Relational & Vector SQL| DB
    FastAPI -->|Store Raw PDF| Disk
    Redis -->|Consume Tasks| Worker
    Worker -->|Read Raw PDF| Disk
    Worker -->|Embeddings & Status| DB
```

---

## 2. Container Service Catalog

| Service Name | Image | Host Port | Internal Port | Purpose |
|---|---|---|---|---|
| `scanity_db` | `pgvector/pgvector:pg16` | `5433` | `5432` | Relational data, document metadata, and 768-dim HNSW vector search |
| `scanity_redis` | `redis:7-alpine` | `6379` | `6379` | Message broker and task queue for Celery background workers |
| `scanity_backend` | Python 3.12 Slim (FastAPI) | `8000` | `8000` | REST API, ingestion validation, and semantic query endpoints |
| `scanity_worker` | Python 3.12 Slim (Celery) | N/A | N/A | Asynchronous PDF text extraction, recursive chunking, and embedding generation |
| `scanity_frontend` | Node 20 Alpine (Next.js 15) | `3000` | `3000` | Web dashboard, drag-and-drop upload dropzone, and citation chat UI |
| `scanity_pgadmin` | `dpage/pgadmin4:latest` | `5050` | `80` | Optional web-based GUI for inspecting relational tables and vector indexes |

---

## 3. Host Port Allocation & Collision Safeguards

### 3.1 PostgreSQL Port Mapping (`5433:5432`)
* **Host Conflict:** On Windows and macOS developer machines, local PostgreSQL services frequently bind to host port `5432`.
* **Design Solution:** The Docker Compose definition maps the container's internal PostgreSQL port `5432` to host port **`5433`**.
* **Automatic Application Fallback:** The backend configuration in `app/core/config.py` automatically detects when the database URL specifies `localhost:5432` and re-routes to `localhost:5433` when running on a host machine.

---

## 4. Environment Configuration

All environment variables must be managed through `.env` files. A template is provided in `.env.example`.

### 4.1 Required Variables

```env
# Application Settings
APP_NAME=Scanity
APP_ENV=development
DEBUG=True
API_V1_STR=/api/v1
SECRET_KEY=generate_a_secure_random_string_in_production

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000", "http://127.0.0.1:3000"]
CORS_ORIGINS_REGEX=^https:\/\/.*\.vercel\.app$

# Database Settings (Host port 5433 for local docker container)
POSTGRES_USER=scanity_user
POSTGRES_PASSWORD=scanity_secure_password
POSTGRES_DB=scanity
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@localhost:5433/scanity

# Redis & Celery
REDIS_HOST=localhost
REDIS_PORT=6379
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Gemini AI & Embeddings
GEMINI_API_KEY=your_gemini_api_key_here
EMBEDDING_MODEL=gemini-embedding-001
VECTOR_DIMENSION=768
LLM_MODEL=gemini-3.5-flash-lite

# Ingestion Pipeline Tuning
CHUNK_SIZE_TOKENS=700
CHUNK_OVERLAP_TOKENS=100
MAX_UPLOAD_SIZE_MB=25

# Storage
UPLOAD_DIR=./uploads

# Retrieval & Guardrails
RELEVANCE_THRESHOLD=0.70
DEFAULT_TOP_K=5
```

---

## 5. Persistent Storage & Volumes

Scanity persists state across container restarts using named Docker volumes:

```yaml
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  uploads_data:
    driver: local
```

* **`postgres_data`:** Stores table records, B-tree indexes, and HNSW vector index files under `/var/lib/postgresql/data`.
* **`redis_data`:** Stores AOF/RDB snapshots of Celery queue state under `/data`.
* **`uploads_data`:** Mounts raw uploaded PDF files to both the FastAPI web server and the Celery worker container.

---

## 6. Step-by-Step Deployment Guide

### 6.1 Local Development Environment

1. **Start Core Infrastructure:**
   ```powershell
   docker compose up -d db redis
   ```

2. **Run Database Migrations:**
   ```powershell
   cd backend
   .\venv\Scripts\activate
   alembic upgrade head
   ```

3. **Start FastAPI Development Server:**
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Start Celery Worker (In a separate terminal):**
   ```powershell
   cd backend
   .\venv\Scripts\activate
   celery -A app.workers.celery_app worker --loglevel=info -P solo
   ```
   *(Note: The `-P solo` flag is required when running Celery natively on Windows).*

5. **Start Next.js Development Server (Step 8+):**
   ```powershell
   cd frontend
   npm run dev
   ```

---

## 7. Health Checks & Verification

### 7.1 Backend API & Database Ping
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

### 7.2 Redis Connectivity Check
```powershell
docker exec -it scanity_redis redis-cli ping
```
Expected output:
```
PONG
```

### 7.3 PostgreSQL Extension Verification
```powershell
docker exec -it scanity_db psql -U scanity_user -d scanity -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```
Expected output:
```
 extname | extversion 
---------+------------
 vector  | 0.8.6
(1 row)
```

---

## 8. Production Readiness & Security Checklist

* **Secrets Management:** Ensure `.env` is included in `.gitignore` and never committed to source control. Use environment injection or secrets management services in production.
* **Database Connection Pooling:** Configure async connection pool size (`pool_size=20`, `max_overflow=10`) in `app/core/database.py` based on available RAM and expected concurrency.
* **Worker Autoscaling:** Run multiple Celery worker concurrency slots (`--concurrency=4`) in Linux containers to parallelize multi-page PDF processing.
* **Database Backups:** Schedule regular automated backups using `pg_dump`:
  ```bash
  docker exec -t scanity_db pg_dump -U scanity_user -Fc scanity > backup_$(date +%Y%m%d).dump
  ```
