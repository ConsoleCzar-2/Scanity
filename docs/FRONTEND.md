# Frontend Architecture & Design Specification

> Note: This document outlines the planned design and architectural specification for the frontend tier. It is scheduled for active implementation in **Step 8 (Frontend Initialization)** and **Step 9 (Frontend UI Components)**. It will be incrementally updated with exact implementation details, real component structures, and live tests as those steps are executed.

## 1. Overview & Technology Stack

The Scanity frontend is a modern, responsive Single Page Application (SPA) built using **Next.js 15 App Router** and **Tailwind CSS**. It communicates with the FastAPI backend through versioned REST endpoints.

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server and client components, optimized asset delivery, route management |
| Language | TypeScript 5 | End-to-end type safety with shared API data contracts |
| Styling | Tailwind CSS | Utility-first responsive design, dark/light themes, custom token system |
| State & Polling | React Hooks / TanStack Query | Client state, upload progress, and document processing status polling |
| Icons | Lucide React | Lightweight, tree-shakable iconography |
| HTTP Client | Fetch API / Axios | Strongly typed backend communication with standard error handling |

---

## 2. Directory Structure (`frontend/`)

```
frontend/
|-- app/
|   |-- layout.tsx              # Root layout with font imports, metadata, and theme provider
|   |-- page.tsx                # Main single-page dashboard (Split-view: Upload & Chat)
|   |-- globals.css             # Tailwind base layers, variables, and custom scrollbars
|-- components/
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
|   |-- api.ts                  # Centralized API service functions (upload, status, query)
|   |-- constants.ts            # API base URLs, polling intervals, maximum file size
|   |-- utils.ts                # Formatting helpers (bytes to MB, dates, confidence percentages)
|-- types/
|   |-- api.ts                  # TypeScript interfaces matching FastAPI Pydantic models
|-- tailwind.config.ts          # Tailwind theme configuration and custom color tokens
|-- tsconfig.json               # TypeScript compiler configuration
|-- package.json                # Project dependencies and run scripts
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

## 5. API Client Layer (`lib/api.ts`)

Centralized service functions encapsulating HTTP calls:

```typescript
export interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  message: string;
}

export interface DocumentStatusResponse {
  document_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  page_count?: number;
  total_chunks?: number;
  processed_at?: string;
  error_message?: string;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  page_number: number;
  snippet: string;
  relevance_score: number;
}

export interface QueryResponse {
  query_id: string;
  answer: string;
  confidence: number;
  is_grounded: boolean;
  citations: Citation[];
}

// Upload PDF document
export async function uploadDocument(file: File): Promise<DocumentUploadResponse>;

// Poll processing status
export async function getDocumentStatus(id: string): Promise<DocumentStatusResponse>;

// Submit natural-language question
export async function submitQuery(
  question: string, 
  documentIds?: string[], 
  topK: number = 5
): Promise<QueryResponse>;
```

---

## 6. Environment Configuration

The frontend consumes environment variables prefixed with `NEXT_PUBLIC_` so they are accessible in client components:

```env
# URL to FastAPI backend
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# Maximum upload size in bytes (25MB)
NEXT_PUBLIC_MAX_FILE_SIZE_BYTES=26214400

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
