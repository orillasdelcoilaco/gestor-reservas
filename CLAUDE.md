# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (main server)
```bash
cd backend
npm start          # Run server (node index.js)
```
Server runs on port **4001** (or `PORT` env var). There is no separate lint or test script.

### Vehicle-Docs React SPA
```bash
# Development (Vite dev server with proxy to backend)
cd apps/vehicle-docs/web
npm run dev

# Production build — REQUIRED after any .jsx/.tsx/.css change
cd apps/vehicle-docs/web
npm run build
```
> The backend serves the **compiled `dist/`** folder, not the source. Changes to React files are invisible until you run `npm run build`.

### Build from backend directory
```bash
cd backend
npm run build:vehicle-docs   # Runs the Vite build from the backend scripts
```

## Architecture

### Two Frontend Paradigms in One Project
1. **Legacy HTML/JS** — `backend/frontend/*.html` files served statically at `/`. These are monolithic pages with inline JS, rendered server-side via Express static middleware.
2. **React SPA** — `apps/vehicle-docs/web/` built with Vite, served at `/vehiculos/app/`. This is the modern approach and where new features are being built.

### Request Flow
```
Browser → Express (port 4001)
  ├── /               → backend/frontend/ (static HTML)
  ├── /vehiculos/app/ → apps/vehicle-docs/web/dist/ (React SPA, SPA fallback)
  ├── /api/*          → routes/*.js → services/*.js → Firestore/Storage
  └── /ical/*         → public iCal feeds (no auth)
```

### Authentication
- All `/api/*` routes (except `/auth/*` and `/ical/*`) require a Firebase ID token via `Authorization: Bearer <token>` header
- Middleware: `backend/utils/authMiddleware.js` — validates token, attaches `req.user` with `uid` and `familyGroup`
- Frontend stores token in `localStorage` as `firebaseIdToken`

### Vehicle-Docs Module (`/api/vehicle-docs`)
This is the most complex recent addition. Key concepts:

- **`/extract` POST** — Takes an uploaded image, runs it through OpenCV Docker microservice (port 5000) or Sharp fallback, then sends a **cropped single-copy color image** to Gemini AI for OCR. Returns extracted document data + full-resolution original image (for display) + QR image.
- **`/documents` POST** — Saves the confirmed document. Stores `color.jpg` (full original, no crop) in Firebase Storage. The crop is only for Gemini, never for storage.
- Image processing pipeline: OpenCV Docker (`processDocumentV3`) → Sharp fallback (`processDocumentForInspection`)
- AI model cascade: `gemini-2.0-flash` → `gemini-1.5-flash-8b` → `gemini-2.5-flash` (quota-aware retry)
- Document type aliases: `REVISION_TECNICA` → `REVISION`, `PERMISO_CIRCULACION` → `PERMISO` (canonical types used everywhere in frontend)

### Firestore Data Model (Vehicle-Docs)
```
vehicles/{vehicleId}
  documentTypes/{type}          # type = PADRON | REVISION | SOAP | PERMISO
    history/{historyId}
      images: { color, processed, back, qr, thumbnail }  # Storage URLs
      expiryDate: Timestamp
      issueDate: Timestamp
      reviewedData: { patente, issueDate, expiryDate, ... }
      data: { same as reviewedData }
```

### Firebase Configuration
- **Production (Render):** credentials from `/etc/secrets/serviceAccountKey.json`
- **Development:** `./serviceAccountKey.json` in backend directory
- **Storage bucket:** `reservas-sodc.firebasestorage.app`

### Key Environment Variables (`backend/.env`)
```
GOOGLE_API_KEY      # Gemini AI (vehicle-docs OCR)
OPENAI_API_KEY      # OpenAI fallback
TELEGRAM_TOKEN      # Telegram bot notifications
FIREBASE_SERVICE_ACCOUNT  # JSON string of service account (Render deployment)
AI_ENABLED          # true/false toggle for AI features
PORT                # Default 4001
```

### OpenCV Microservice
A Docker container runs at `http://localhost:5000` providing document processing. The backend gracefully falls back to Sharp (Node.js) if Docker is unavailable. Multi-copy detection (quadruplicate/triplicate certificates) uses H/W aspect ratio: `>1.2` = 4 copies, `>0.8` = 3 copies.

### External Integrations
- **Google Drive** — report storage and retrieval
- **Google Contacts** — CRM sync
- **Gemini AI** — OCR for vehicle documents + planning suggestions
- **Telegram** — push notifications via bot
- **Booking.com** — reconciliation module
- **iCal** — public calendar feeds for booking channels

## Important Conventions

- **FormData uploads:** Never set `Content-Type: multipart/form-data` manually in axios — let axios set the boundary automatically. Only set `Authorization` header.
- **`expiryDate` field naming:** The frontend sends `expiryDate`/`issueDate` (English). The backend must check both `parsedReviewedData.expiryDate` and legacy `parsedReviewedData.fechaVencimiento`.
- **Type normalization:** Always normalize document types before comparing or querying. Use the `legacyAlias` map (`REVISION_TECNICA → REVISION`, `PERMISO_CIRCULACION → PERMISO`).
- **`color.jpg` is the display image** — it's the full original, just resized. The cropped version is only ever used transiently for Gemini and never persisted.
