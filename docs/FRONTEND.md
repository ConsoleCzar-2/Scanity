# Frontend Architecture & Design Specification

> Note: **Step 8 (Frontend Initialization)** and **Step 9 (Frontend UI Components & Interactive Experience)** are fully completed. The Next.js 15 App Router architecture, TypeScript schemas, typed API client, formatting utilities, enterprise dark theme dashboard shell, and all interactive components are fully operational.

## 1. Overview & Technology Stack

The Scanity frontend is a modern, responsive Single Page Application (SPA) built using **Next.js 15 App Router** (Next 16.3.4), **React 19**, **TypeScript 5**, and **Tailwind CSS v4**. It communicates with the FastAPI backend through versioned REST endpoints (`/api/v1`).

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 App Router | Server and client components, optimized asset delivery, route management |
| UI Library | React 19 | Declarative UI, state management, and modern component lifecycle |
| Language | TypeScript 5 | End-to-end type safety matching FastAPI Pydantic schemas |
| Styling | Tailwind CSS v4 | Utility-first styling, native CSS variables, crisp two-tone theme |
| Icons | Lucide React | Modern, accessible, and lightweight iconography |
| HTTP Client | Fetch API | Typed API client with response validation, adaptive polling, and streaming |

---

## 2. Directory Structure (`frontend/`)

```
frontend/
|-- app/
|   |-- favicon.ico             # Application favicon
|   |-- globals.css             # Tailwind v4 theme variables, enterprise panels, keyframe animations
|   |-- layout.tsx              # Root layout with font imports, metadata, and dark theme
|   |-- page.tsx                # Public Landing Page with scroll-driven hero fade and photo card rise
|   |-- login/
|   |   |-- page.tsx            # Authentication Page (Sign In & Customer Registration, Demo logins)
|   |-- chat/
|   |   |-- page.tsx            # Authenticated Workspace Page (Document Catalog & Grounded Q&A)
|-- components/                 # Modular UI components (Completed in Step 9)
|   |-- landing/
|   |   |-- LandingPage.tsx     # Solacc-inspired minimal public landing page with technical ledger
|   |-- layout/
|   |   |-- Header.tsx          # Edge-to-edge header with extreme-anchored hamburger, user avatar, and link to /
|   |   |-- SidebarDrawer.tsx   # Navigation drawer with chat history, RBAC parameter controls, and telemetry
|   |   |-- ProfileModal.tsx    # User profile identity management dialog (Name, Email, Role badge)
|   |-- upload/
|   |   |-- UploadDropzone.tsx  # Drag-and-drop PDF upload component with file validation
|   |   |-- DocumentList.tsx    # List of uploaded documents with adaptive polling and selection
|   |   |-- StatusBadge.tsx     # Color-coded badge (Pending, Processing, Ready, Failed)
|   |-- chat/
|   |   |-- ChatContainer.tsx   # Message thread container with auto-scroll and progressive streaming
|   |   |-- MessageItem.tsx     # User prompt and assistant grounded answer cards
|   |   |-- CitationChip.tsx    # Interactive citation badge (Page number, relevance score)
|   |   |-- CitationModal.tsx   # Popover displaying cited chunk text snippet and metadata
|   |   |-- QueryInput.tsx      # Prompt input bar with send button and loading spinner
|   |   |-- FallbackCard.tsx    # Anti-hallucination warning card for ungrounded queries
|   |-- admin/
|   |   |-- AdminLogsModal.tsx  # Multi-service interactive health probing & dynamic root telemetry dialog
|-- lib/
|   |-- api.ts                  # Strongly typed API client & polling logic
|   |-- auth.ts                 # Authentication, customer registration, session management, and RBAC
|   |-- constants.ts            # API base URLs, upload limits, polling intervals
|   |-- utils.ts                # Formatting helpers (bytes to MB, dates, confidence percentages)
|-- types/
|   |-- api.ts                  # TypeScript interfaces matching FastAPI Pydantic models
|-- .env.example                # Safe frontend environment template
|-- .env.local                  # Local development environment configuration
|-- next.config.ts              # Next.js config with backend API proxy rewrites and root .env loading
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
  * Rejects files larger than `MAX_FILE_SIZE` (default: 50MB).
  * Supports simultaneous **multi-file upload** (batch selection and multi-file drag-and-drop).
* **Upload State Machine:**
  * `idle`: Shows drag-and-drop invitation with multi-file support notice.
  * `dragging`: Border highlights with high-contrast accent ring.
  * `uploading`: Dispatches batch upload requests iteratively to `POST /api/v1/documents/upload` and enqueues newly returned document IDs into the live polling registry.
  * `success`: Triggers callback to parent to add document IDs to tracking queue.
  * `error`: Displays actionable error message (e.g., "File is not a valid PDF").

### 4.2 `DocumentList` & `StatusBadge`
* **Adaptive Backoff Polling Architecture:**
  * When documents are in non-terminal states (`pending` or `processing`), an effect-driven polling loop checks `GET /api/v1/documents/{id}/status`.
  * Applies smart exponential backoff ($2\text{s} \to 3\text{s} \to 4.5\text{s} \to \dots \to 12\text{s}$) to avoid overloading backend resources.
  * When all documents reach terminal states (`ready` or `failed`), polling is completely suspended (zero ongoing network requests).
* **Document Scope Management:**
  * Individual document checkboxes allow users to restrict RAG retrieval to specific files.
  * Global "Select All" and "Clear" actions provide immediate multi-document scoping.
* **Status Badges:**
  * `pending` (Amber): Upload acknowledged; queued in Celery message broker.
  * `processing` (Indigo): Actively parsing pages, chunking text, or computing pgvector embeddings.
  * `ready` (Emerald Green): Fully indexed in PostgreSQL with HNSW vector index; ready for queries.
  * `failed` (Rose Red): Processing encountered an unrecoverable format or parsing error (hover for error detail).

### 4.3 `ChatContainer`, `MessageItem`, & `QueryInput`
* **Progressive Pipeline Stepper Feedback:**
  * To prevent silent wait periods during backend pipeline execution (~4.5s round trip), an assistant card renders immediately with a rotating loader and progressive phase descriptions:
    * **0.0s:** *"Generating query embedding vector..."*
    * **1.2s:** *"Scanning pgvector cosine index across document chunks..."*
    * **2.4s:** *"Synthesizing verified grounded response with Gemini 3.5 Flash Lite..."*
* **Typewriter Pacing:**
  * Once the response payload is received from the backend, a smooth token-by-token typewriter pacing (40ms per token) renders the prose before snapping verified citation tags into view.
* **Message Structure:**
  * Displays user prompt aligned to right in dark slate bubble (`bg-slate-900 border-slate-800`).
  * Displays assistant answer card in high-contrast panel (`bg-slate-900/90 border-slate-800`).
  * Accompanied by confidence rating meter (e.g., `94% Groundedness`).
  * Renders list of interactive `CitationChip` elements with source page numbers.
* **Keyboard Navigation:**
  * `Enter` submits query, while `Shift+Enter` inserts newlines.
  * Dynamic scoping indicator tag shows whether querying all documents or isolated scoped files.

### 4.4 `CitationChip` & `CitationModal`
* **Visual Representation:** High-contrast pill badge displaying `Page {n} | {relevance}%`.
* **Interactivity:**
  * Hovering or clicking the chip opens an accessible modal popover displaying:
    * Source document filename.
    * Exact source page number.
    * Verbatim chunk snippet extracted from the PDF.
    * Cosine similarity relevance score.
    * Unique chunk UUID for enterprise auditing.

### 4.5 `FallbackCard` (Anti-Hallucination Guardrail)
* When the backend returns `is_grounded: false` or the relevance threshold ($0.70$) is not met:
  * The response is rendered with a prominent refusal card (`bg-amber-950/20 border-amber-800/40`).
  * The text displays: *"Not found in the provided document(s)."*
  * Explains that no text chunks in the selected documents met the similarity threshold, preventing hallucinations.

### 4.6 Navigation Drawer & Admin Modify Parameters (`SidebarDrawer`)
* **Navigation Links & Sessions:**
  * Collapsible left-hand drawer containing conversation sessions and documentation links.
* **Admin-Only "Modify Parameters" Sliders:**
  * **Minimum Relevance Gate Threshold Slider:** Range 0.50 to 0.95 with visible min/max labels, compact handles, and distinct track colors.
  * **Top-K Retrieved Chunks Slider:** Range 1 to 20 with real-time numeric counter.
  * "Reset to Defaults" action restoring 0.70 threshold and 5 chunks.
  * Restricted via Role-Based Access Control (RBAC): hidden for standard customer accounts.

### 4.7 Landing Page Card-Stacking Scroll Dynamics (`LandingPage.tsx`)
* **Skiper UI (`skiper16`) Stacking Mechanics:**
  * The 4 core architectural cards (pgvector HNSW, Celery + Redis, Gemini 3.5 Flash Lite, Anti-Hallucination Gate) use sticky positioning (`sticky top-28`).
  * A passive scroll listener calculates each card's viewport progress. As the user scrolls, each preceding card scales down slightly (e.g. scale 0.95, 0.90) and rotates subtly as the next card stacks directly on top.
* **Hero Section Transition:**
  * The hero headline smoothly scales backward and fades in opacity as the architecture cards rise into the foreground.

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

---

## 8. Hydration Safety & State Synchronization (React 19 & Next.js 15)

In Next.js 15 App Router applications, reading client-side storage (`window.localStorage`) inside component initialization (`useState(() => getCurrentUser())`) creates hydration divergence:
- During Server-Side Rendering (SSR), `window` is undefined, rendering null user state.
- During client hydration, `localStorage` returns the stored user JSON, producing a markup mismatch error ("Hydration failed because the server rendered HTML didn't match the client").

### Solution Architecture
Scanity implements React 19's native `useSyncExternalStore` hook paired with a referentially stable snapshot cache in `frontend/lib/auth.ts`:
1. **Subscription Mechanism**: `subscribeToUser(callback)` listens to browser `storage` events and custom `auth:change` dispatch events.
2. **Referential Snapshot Cache (`getSnapshot`)**:
   ```typescript
   let cachedUserRaw: string | null = null;
   let cachedUserObj: UserSession | null = null;

   export function getCurrentUser(): UserSession | null {
     if (typeof window === 'undefined') return null;
     const raw = localStorage.getItem(AUTH_STORAGE_KEY);
     if (raw !== cachedUserRaw) {
       cachedUserRaw = raw;
       cachedUserObj = raw ? JSON.parse(raw) : null;
     }
     return cachedUserObj;
   }
   ```
3. **SSR Safety (`getServerSnapshot`)**: Always returns `null` on the server.
4. **Hook Consumption (`frontend/app/chat/page.tsx`)**:
   ```typescript
   const currentUser = useSyncExternalStore(
     subscribeToUser,
     getCurrentUser,
     () => null
   );
   ```
This pattern guarantees zero hydration mismatches, ensures reactivity across browser tabs, and prevents React 19 infinite re-render cycles.

