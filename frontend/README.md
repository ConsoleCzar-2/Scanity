# Scanity Frontend - Next.js 15 App Router

The modern user interface for Scanity, engineered with **Next.js 15 (Next 16.3.4)**, **React 19**, **TypeScript 5**, and **Tailwind CSS v4**.

---

## 1. Architecture & Routes

The application is structured into clean, dedicated routes via the Next.js App Router:

| Route | Component | Description |
|---|---|---|
| `/` | `app/page.tsx` | Public architectural landing page featuring the technical capability ledger, live backend probe, and Skiper UI (`skiper16`) card-stacking scroll animation. |
| `/login` | `app/login/page.tsx` | Authentication page providing one-click demo logins for Admin and Customer roles, as well as customer self-registration. |
| `/chat` | `app/chat/page.tsx` | Authenticated document management and grounded Q&A workspace with live scoping, Admin Modify Parameters drawer, and progressive stepper feedback. |

---

## 2. Key Features

- **Skiper UI Card-Stacking Dynamics (`components/landing/LandingPage.tsx`):** Sticky card positioning (`sticky top-28`) and scroll progress calculations that smoothly stack, scale down, and rotate core capability cards on scroll.
- **Admin Modify Parameters Panel (`components/layout/SidebarDrawer.tsx`):** Compact slider controls with distinct track styling and min/max boundary labels for tuning relevance threshold (0.50 to 0.95) and top-k (1 to 20).
- **Multi-File PDF Ingestion (`components/upload/UploadDropzone.tsx`):** Batch selection and multi-file drag-and-drop support with client-side MIME (`application/pdf`) and 50MB size validation.
- **Progressive Stepper & Natural Typing (`components/chat/ChatContainer.tsx`):** Renders immediate assistant feedback during backend RAG stages, followed by natural token-by-token typewriter playback and verified citation popovers.
- **Hydration Safety (`app/chat/page.tsx` & `lib/auth.ts`):** Utilizes React 19 `useSyncExternalStore` paired with a referentially stable snapshot cache, completely preventing server/client hydration mismatch errors.
- **Role-Based Access Control (`lib/auth.ts`):** Admin accounts can access parameter tuning and system telemetry health probes. Self-registered accounts are restricted to customer privileges.

---

## 3. Getting Started

### Prerequisites
- Node.js 18.17+ or 20+
- npm 9+

### Installation
```powershell
cd frontend
npm install
```

### Environment Configuration
Create `.env.local` if custom backend host is required:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_MAX_FILE_SIZE_BYTES=52428800
NEXT_PUBLIC_POLL_INTERVAL_MS=2000
```

### Development Server
```powershell
npm run dev
```
Open `http://localhost:3000` in your browser.

### Quality Assurance & Production Build
```powershell
# Run ESLint validation
npm run lint

# Compile production bundle and verify TypeScript types
npm run build
```

---

## 4. Component Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root HTML wrapper and dark theme tokens
│   ├── page.tsx                # Landing page with Skiper card stack
│   ├── login/page.tsx          # Role-based authentication page
│   └── chat/page.tsx           # Workspace page with document catalog & chat
├── components/
│   ├── landing/LandingPage.tsx # Technical ledger & card stacking dynamics
│   ├── layout/
│   │   ├── Header.tsx          # Edge-to-edge top bar with brand link to /
│   │   ├── SidebarDrawer.tsx   # Admin Modify Parameters sliders & navigation
│   │   └── ProfileModal.tsx    # User identity dialog
│   ├── upload/
│   │   ├── UploadDropzone.tsx  # Multi-file PDF upload dropzone
│   │   ├── DocumentList.tsx    # Catalog view with adaptive polling & scoping
│   │   └── StatusBadge.tsx     # Color-coded state pills
│   ├── chat/
│   │   ├── ChatContainer.tsx   # Message thread & progressive stepper
│   │   ├── MessageItem.tsx     # Assistant card & confidence meter
│   │   ├── QueryInput.tsx      # Prompt input bar with scoping tags
│   │   ├── CitationChip.tsx    # Page number & relevance pill badge
│   │   ├── CitationModal.tsx   # Verbatim PDF chunk excerpt popover
│   │   └── FallbackCard.tsx    # Anti-hallucination refusal card
│   └── admin/
│       └── AdminLogsModal.tsx  # Live multi-service latency & telemetry dialog
├── lib/
│   ├── api.ts                  # Typed HTTP client
│   ├── auth.ts                 # Session store with useSyncExternalStore
│   ├── constants.ts            # Configuration constants
│   └── utils.ts                # Formatting utilities
└── types/
    └── api.ts                  # TypeScript interfaces matching backend models
```
