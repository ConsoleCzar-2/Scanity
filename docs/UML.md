# UML & System Diagrams

This document provides formal UML diagrams illustrating Scanity's object models, component dependencies, and runtime sequences.

---

## 1. Domain Class Diagram (SQLAlchemy Models)

```mermaid
classDiagram
    class Base {
        <<DeclarativeBase>>
    }

    class Document {
        +UUID id
        +String original_filename
        +String storage_path
        +String file_hash
        +String status
        +Integer page_count
        +Integer total_chunks
        +DateTime uploaded_at
        +DateTime processed_at
        +List~DocumentChunk~ chunks
        +List~QueryDocument~ query_documents
    }

    class DocumentChunk {
        +UUID id
        +UUID document_id
        +Integer chunk_index
        +Integer page_number
        +String content
        +Integer token_count
        +Vector(768) embedding
        +DateTime created_at
        +Document document
        +List~QueryCitation~ citations
    }

    class Query {
        +UUID id
        +UUID session_id
        +String question_text
        +String answer_text
        +Float confidence_score
        +Boolean is_grounded
        +DateTime created_at
        +List~QueryDocument~ query_documents
        +List~QueryCitation~ citations
    }

    class QueryDocument {
        +UUID query_id
        +UUID document_id
        +Query query
        +Document document
    }

    class QueryCitation {
        +UUID id
        +UUID query_id
        +UUID chunk_id
        +Float relevance_score
        +Integer rank
        +Query query
        +DocumentChunk chunk
    }

    Base <|-- Document
    Base <|-- DocumentChunk
    Base <|-- Query
    Base <|-- QueryDocument
    Base <|-- QueryCitation

    Document "1" *-- "many" DocumentChunk : cascades delete
    Document "1" *-- "many" QueryDocument : cascades delete
    Query "1" *-- "many" QueryDocument : cascades delete
    Query "1" *-- "many" QueryCitation : cascades delete
    DocumentChunk "1" *-- "many" QueryCitation : cascades delete
```

---

## 2. Component Diagram

```mermaid
flowchart TD
    subgraph PresentationTier [Presentation Tier]
        NextApp[Next.js 15 Client App]
    end

    subgraph APILayer [API Gateway Tier]
        FastAPIApp[FastAPI Engine]
        V1Router[API v1 Router]
        HealthEndpoint[Health Endpoint]
        DocEndpoint[Documents Endpoint]
        QueryEndpoint[Query Endpoint]
    end

    subgraph DomainCore [Core & Domain Models]
        CoreConfig[app.core.config]
        CoreDB[app.core.database]
        Models[app.models]
    end

    subgraph ServiceTier [Business Logic Tier]
        StorageSvc[Storage Service<br/>app/services/storage.py]
        IngestionSvc[Ingestion Pipeline<br/>app/services/ingestion.py]
        RetrievalSvc[Retrieval Service<br/>app/services/retrieval.py]
        GenerationSvc[Generation Service<br/>app/services/generation.py]
    end

    subgraph WorkerTier [Worker Tier]
        CeleryWorker[Celery Task Worker<br/>app/workers/tasks.py]
    end

    subgraph PersistenceTier [Persistence Tier]
        Postgres[(PostgreSQL 16 + pgvector)]
        RedisStore[(Redis 7 Cache / Broker)]
    end

    NextApp --> FastAPIApp
    FastAPIApp --> V1Router
    V1Router --> HealthEndpoint
    V1Router --> DocEndpoint
    V1Router --> QueryEndpoint

    FastAPIApp --> CoreConfig
    FastAPIApp --> CoreDB
    HealthEndpoint --> CoreDB
    DocEndpoint --> StorageSvc
    DocEndpoint --> RedisStore
    DocEndpoint --> CoreDB
    QueryEndpoint --> RetrievalSvc
    QueryEndpoint --> GenerationSvc

    RedisStore --> CeleryWorker
    CeleryWorker --> StorageSvc
    CeleryWorker --> IngestionSvc
    CeleryWorker --> Postgres

    RetrievalSvc --> Postgres
    GenerationSvc --> Postgres
    CoreDB --> Postgres
```

---

## 3. Runtime Sequence Diagrams

### 3.1 Document Upload & Ingestion Flow
Demonstrates the asynchronous decoupling of PDF parsing and embedding generation using Celery and Redis.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Browser)
    participant API as FastAPI (Web Tier)
    participant DB as PostgreSQL 16
    participant Redis as Redis Broker
    participant Worker as Celery Worker
    participant Gemini as Gemini Embedding API

    User->>API: POST /api/v1/documents/upload (PDF File)
    API->>API: Save PDF to /uploads disk storage
    API->>DB: INSERT into documents (status='pending', id=UUIDv7)
    API->>Redis: Enqueue process_pdf_task(document_id, file_path)
    API-->>User: 202 Accepted {document_id, status='pending'}

    Note over Redis, Worker: Asynchronous Background Processing
    Redis->>Worker: Dispatch process_pdf_task
    Worker->>DB: UPDATE documents SET status='processing'
    Worker->>Worker: Extract text per page with PyMuPDF
    Worker->>Worker: Split text into ~700-token chunks with 100-token overlap
    Worker->>Gemini: POST /models/gemini-embedding-001 (batch text chunks)
    Gemini-->>Worker: Return 768-dimensional float arrays
    Worker->>DB: Batch INSERT into document_chunks (UUIDv7, vectors, page_numbers)
    Worker->>DB: UPDATE documents SET status='ready', total_chunks=N
    
    User->>API: GET /api/v1/documents/{id}/status
    API->>DB: SELECT status, total_chunks FROM documents WHERE id=UUID
    DB-->>API: {status: 'ready', total_chunks: N}
    API-->>User: 200 OK {status: 'ready'}
```

---

### 3.2 Grounded Retrieval & Answer Generation Flow
Illustrates vector similarity ranking, the relevance threshold gate, structured output generation, and post-hoc citation validation.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Browser)
    participant API as FastAPI (Web Tier)
    participant GeminiEmbed as Gemini Embedding API
    participant DB as PostgreSQL (pgvector)
    participant GeminiLLM as Gemini 3.5 Flash Lite

    User->>API: POST /api/v1/query {question, document_ids}
    API->>GeminiEmbed: Embed user question
    GeminiEmbed-->>API: 768-dimensional query vector
    
    API->>DB: SELECT * FROM document_chunks WHERE document_id IN (...) ORDER BY embedding <=> query_vector LIMIT 5
    DB-->>API: Top 5 chunks with cosine distance scores

    alt Top Chunk Similarity < Relevance Threshold (0.70)
        Note over API: Anti-Hallucination Guardrail Triggered
        API-->>User: 200 OK {answer: "Not found in the provided document(s).", citations: []}
    else Top Chunk Similarity >= 0.70
        API->>GeminiLLM: Grounded Prompt (Question + Retrieved Chunks + JSON Schema)
        GeminiLLM-->>API: JSON: {answer, citations: [{chunk_id, page}], confidence}
        
        API->>API: Post-Hoc Citation Validator (verify cited chunk_ids were retrieved)
        API->>DB: INSERT into queries & query_citations (UUIDv7)
        API-->>User: 200 OK {answer, citations, confidence, is_grounded: true}
    end
```
