# Frontend Architecture & Design Specification

> Note: **Step 8 (Frontend Initialization)** is fully completed. The Next.js 15 App Router architecture, TypeScript schemas, typed API client, formatting utilities, and dark theme dashboard shell are operational. **Step 9 (Frontend UI Components)** will implement the modular upload, document list, message container, citation chips, and popover components.

## 1. Overview & Technology Stack

The Scanity frontend is a modern, responsive Single Page Application (SPA) built using **Next.js 15 App Router** (Next 16.3.4), **React 19**, **TypeScript 5**, and **Tailwind CSS v4**. It communicates with the FastAPI backend through versioned REST endpoints (`/api/v1`).

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 App Router | Server and client components, optimized asset delivery, route management |
| UI Library | React 19 | Declarative UI, state management, and modern component lifecycle |
| Language | TypeScript 5 | End-to-end type safety matching FastAPI Pydantic schemas |
| Styling | Tailwind CSS v4 | Utility-first styling, native CSS variables, sleek dark theme |
| Icons | Lucide React | Modern, accessible, and lightweight iconography |
| HTTP Client | Fetch API | Typed API client with response validation and polling |

---

## 2. Directory Structure (`frontend/`)

```
frontend/
|-- app/
|   |-- favicon.ico             # Application favicon
|   |-- globals.css             # Tailwind v4 theme variables, glassmorphism, scrollbars
|   |-- layout.tsx              # Root layout with font imports, metadata, and dark theme
|   |-- page.tsx                # Main single-page dashboard (Live backend probe & 2-pane layout)
|-- components/                 # Modular UI components (Scheduled for Step 9)
|   |-- layout/
|   |   |-- Header.tsx          # Application header with status indicator and repository links
|   |   |-- Sidebar.tsx         # Document drawer and navigation controls
|   |-- upload/
|   |   |-- UploadDropzone.tsx  # Drag-and-drop PDF upload component with file validation
|   |   |-- DocumentList.tsx    # List of uploaded documents with live status indicators
|   |   |-- StatusBadge.tsx     # Color-coded badge (Pending, Processing, Ready, Failed)
|   |-- chat/
|   |   |-- ChatContainer.tsx   # Message thread container with auto-scroll
|   |   |-- MessageItem.tsx     # User prompt and assistant grounded answer cards
|   |   |-- CitationChip.tsx    # Interactive citation badge (Page number, relevance score)
|   |   |-- CitationModal.tsx   # Popover displaying cited chunk text snippet
|   |   |-- QueryInput.tsx      # Prompt input bar with send button and loading spinner
|   |   |-- FallbackCard.tsx    # Anti-hallucination warning card for ungrounded queries
|-- lib/
|   |-- api.ts                  # Strongly typed API client & polling logic
|   |-- constants.ts            # API base URLs, upload limits, polling intervals
|   |-- utils.ts                # Formatting helpers (bytes to MB, dates, confidence percentages)
|-- types/
|   |-- api.ts                  # TypeScript interfaces matching FastAPI Pydantic models
|-- .env.example                # Safe frontend environment template
|-- .env.local                  # Local development environment configuration
|-- next.config.ts              # Next.js config with backend API proxy rewrites
|-- postcss.config.mjs          # PostCSS configuration
|-- tsconfig.json               # TypeScript compiler configuration
|-- package.json                # Project dependencies and run scripts
|-- README.md                   # Frontend setup and running instructions
```

---

## 3. UI Layout Wireframe

The user interface follows a two-column desktop layout that collapses to a tabbed view on mobile devices:

```
+---------------------------------------------------------------------------------------+
|  Scanity | Enterprise Document Q&A                      Backend: Connected [Port 8000]|
+-------------------------------------------+-------------------------------------------+
| [ Left Pane: Document Ingestion ]         | [ Right Pane: Grounded Q&A Assistant ]   |
|                                           |                                           |
| +---------------------------------------+ |  +-------------------------------------+  |
| | Drag and drop PDF files here          | |  | User: What is the Q3 operating      |  |
| | Supports up to 25MB (.pdf)            | |  |       margin reported?              |  |
| +---------------------------------------+ |  +-------------------------------------+  |
|                                           |                                           |
| Uploaded Documents:                       |  +-------------------------------------+  |
| - Financial_Report_2026.pdf               |  | Scanity: The operating margin for   |  |
|   Pages: 18 | Chunks: 52 [Ready]          |  | Q3 was 18.4%, driven by lower       |  |
| - Security_Whitepaper.pdf                 |  | supply chain overhead.              |  |
|   Pages: -- | Chunks: -- [Processing]     |  |                                     |  |
|                                           |  | Citations:                          |  |
| Scope Queries To:                         |  | [Page 7 (Score: 89%)] [Page 12]     |  |
| [*] All Documents   [ ] Selected Only     |  +-------------------------------------+  |
|                                           |                                           |
|                                           |  [Ask a question about your documents...] |
+-------------------------------------------+-------------------------------------------+
```

---

## 4. Key Component Specifications

### 4.1 `UploadDropzone`
* **File Validation:**
  * Enforces `application/pdf` MIME type.
  * Rejects files larger than `MAX_FILE_SIZE` (default: 25MB).
  * Computes client-side checksum or displays instant visual feedback.
* **Upload State Machine:**
  * `idle`: Shows drag-and-drop invitation.
  * `dragging`: Border highlights with accent color.
  * `uploading`: Shows indeterminate progress bar.
  * `success`: Triggers callback to parent to add document ID to tracking queue.
  * `error`: Displays actionable error message (e.g., "File is not a valid PDF").

### 4.2 `DocumentList` & `StatusBadge`
* **Polling Architecture:**
  * When a document is in `pending` or `processing` state, a polling timer (`setInterval`) checks `GET /api/v1/documents/{id}/status` every 2 seconds.
  * Once the document transitions to `ready` or `failed`, polling stops automatically.
* **Status Badges:**
  * `pending` (Yellow / Amber): Upload acknowledged; queued in message broker.
  * `processing` (Blue / Indigo): Actively parsing pages, chunking text, or computing embeddings.
  * `ready` (Emerald Green): Fully indexed in PostgreSQL with HNSW vector index; available for queries.
  * `failed` (Rose Red): Processing encountered an unrecoverable format or parsing error.

### 4.3 `ChatContainer` & `MessageItem`
* **Message Structure:**
  * Displays user prompt aligned to right with distinct user styling.
  * Displays model answer aligned to left.
* **Grounded Answer Rendering:**
  * Displays answer text.
  * Accompanied by confidence rating meter (e.g., `94% Groundedness`).
  * Renders list of interactive `CitationChip` elements.

### 4.4 `CitationChip` & `CitationModal`
* **Visual Representation:** Pill badge displaying `Page {n} | {relevance}%`.
* **Interactivity:**
  * Hovering or clicking the chip opens a modal/popover displaying:
    * Source document filename.
    * Exact source page number.
    * Verbatim chunk snippet extracted from the PDF.
    * Cosine similarity relevance score.

### 4.5 `FallbackCard` (Anti-Hallucination Guardrail)
* When the backend returns `is_grounded: false` or the relevance threshold is not met:
  * The response is rendered with a neutral warning border.
  * The text displays: *"Not found in the provided document(s)."*
  * Explains that no text chunks in the selected documents exceeded the relevance threshold (0.70 cosine similarity).
  * No hallucinated content is rendered.

---

## 5. API Client Layer (`lib/api.ts` and `types/api.ts`)

Centralized service functions encapsulating strongly typed HTTP calls to the FastAPI backend:

```typescript
import type {
  DocumentResponse,
  DocumentDetailResponse,
  DocumentListResponse,
  QueryRequest,
  QueryResponse,
  HealthResponse,
} from '@/types/api';

// Live backend health probe
checkHealth(): Promise<HealthResponse>;

// Upload PDF document with validation
uploadDocument(file: File): Promise<DocumentResponse>;

// Poll document processing status until terminal state ('ready' or 'failed')
pollDocumentStatus(
  documentId: string,
  onUpdate?: (doc: DocumentDetailResponse) => void,
  intervalMs?: number,
  maxAttempts?: number
): Promise<DocumentDetailResponse>;

// List all indexed documents
listDocuments(page?: number, pageSize?: number): Promise<DocumentListResponse>;

// Delete document and its chunk vectors
deleteDocument(documentId: string): Promise<{ success: boolean; message: string }>;

// Submit natural-language question with optional document scope and similarity threshold
askQuestion(request: QueryRequest): Promise<QueryResponse>;
```

---

## 6. Environment Configuration

The frontend consumes environment variables prefixed with `NEXT_PUBLIC_` to be accessible within client components:

```env
# URL to FastAPI backend (defaults to http://localhost:8000/api/v1)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

# Maximum upload size in bytes (50MB)
NEXT_PUBLIC_MAX_FILE_SIZE_BYTES=52428800

# Status polling interval in milliseconds
NEXT_PUBLIC_POLL_INTERVAL_MS=2000
```

---

## 7. Responsive Design & Accessibility

* **Breakpoints:**
  * Desktop ($\ge 1024\text{px}$): Dual-pane split view (35% left sidebar, 65% right chat window).
  * Mobile/Tablet ($< 1024\text{px}$): Single pane with tab switcher (`Documents` vs `Chat`).
* **Accessibility (a11y):**
  * All interactive elements have descriptive `aria-label` attributes.
  * Keyboard navigation for modal dismissal (`Esc`), upload triggering (`Enter`/`Space`), and query submission (`Enter`).
  * Contrast ratios meet WCAG 2.1 AA standards for both light and dark modes.
