# LegalMet AI — Scan. Verify. Detect. Comply.

AI-assisted Legal Metrology compliance checking for packaged commodities. Enforcement officers upload package images, the system extracts declarations via OCR, validates them with a configurable rule engine, and stores inspection history.

> **Disclaimer:** AI-assisted screening only. Results (Compliant / Potential Violation / Manual Review Required / Unable to Verify) are advisory and **not legally binding**.

## Architecture

- `client/` — React + Vite, React Router, Tesseract.js (browser OCR), plain CSS with variables (no Tailwind)
- `server/` — Express, JWT role-based auth (officer/admin), Multer uploads, JSON-file storage, local rule engine + optional AI-service proxy
- `ai-service/` — FastAPI: image preprocessing (PIL) → OCR (pytesseract) → regex declaration extraction → configurable rule engine
- `dataset/` — reference material: `pdf/` (official Legal Metrology PDF + PyMuPDF extractor), `images/` (sample labels), `ocr/` (extraction caches), `legalMetrologyRules.json` (screening rule dataset, mirrors the rule DB)

Rule curation pipeline (PDF → verified structured rules):

```bash
python dataset/extract_pdf.py        # PDF -> text (+ OCR fallback for scans)
python dataset/extract_sections.py   # text -> relevant sections -> rule_candidates.json (pending)
python dataset/review_rules.py       # HUMAN verification -> approved records in legalMetrologyRules.json
```

Approved records carry the exact verified quote (`requirement`), `sourcePage`,
`sourceDocument` and `status: "active"` — e.g. LM-001 with
`"requirement": "EXACT TEXT FROM VERIFIED SOURCE"`. Both rule engines
understand this schema (grouping labels like `"category": "Declaration"` never
exclude a rule; only product-category scopes do).

## Quick start

### 1. AI service (FastAPI: OCR + extraction + rules)
```bash
cd ai-service
pip install -r requirements.txt
python main.py   # :8001
```
Requires the **Tesseract binary** (5.x) for real OCR — install via
`winget install UB-Mannheim.TesseractOCR` on Windows (the service resolves
`TESSERACT_CMD`, PATH, then default install locations) or `apt install
tesseract-ocr` on Linux. Endpoints:

- `POST /ocr` (image) → `{text, confidence, blocks[]}`; stores the original
  image untouched plus the OpenCV-processed copy (resize, grayscale, denoise,
  CLAHE contrast, adaptive threshold) under `ai-service/storage/`
- `POST /extract` (text) → structured declarations, each
  `{value, confidence, status: FOUND|NOT_FOUND}` — never invented
- `POST /analyze` (image + category) and `POST /evaluate` (text) → full
  compliance report `{checks, passed, failed, manualReview, score, status}`

The results page shows the product hero (name, status, circular score with
applicable/passed/failed counts), a declaration table (Result + confidence),
issue cards (rule ID, detection status, confidence band, image evidence,
recommended action — advisory only), the product image with Original/Annotated
tabs (OCR regions labeled MRP / Net Quantity / Manufacturer), and a
readability panel (OCR confidence, character pixel height, resolution, blur,
contrast). Physical font size is reported only with a supplied scale —
otherwise the panel honestly states it could not be reliably determined.

### 2. Server
```bash
cd server
npm install
npm run dev    # :5000
```

### 3. Client
```bash
cd client
npm install
npm run dev    # :5173
```
Set `VITE_API_URL=http://localhost:5000` in `client/.env` if needed.

## How scanning works

1. Officer uploads images on **Scan Product** (drag-and-drop, JPG/JPEG/PNG/WEBP).
2. On **Start Compliance Scan**, `client/src/services/scanPipeline.js` walks the
   visible stages — Image uploaded → Image quality checked (real canvas-based
   resolution/brightness/blur gate) → Text detected (reuses provided text, else
   real Tesseract.js OCR with live %) → Extracting declarations → Applying
   compliance rules → Generating result. Every stage completes on a real
   milestone; there are no artificial delays.
3. `POST /api/inspections/scan` tries `AI_SERVICE_URL/analyze` (real AI service)
   and falls back to the built-in engine (`server/services/ocrService.js` is the
   marked seam) — the app works with or without Python/Tesseract.
4. Rule engine (`ai-service/rules/default_rules.json`, editable by admins at
   **Rule Engine**) decides pass/fail per check; score = % of required checks passed.
5. Verdicts: `Potential Violation` (any required fail), `Compliant` (100%),
   `Manual Review Required`, `Unable to Verify`.

## API design

Thin routes in `server/routes/` delegate to `server/controllers/` and
`server/services/` (analysis pipeline, products, report builder, rule engine).

| Method & path | Access | Description |
|---|---|---|
| POST /api/auth/register, POST /api/auth/login, GET /api/auth/me | public / auth | JWT + bcrypt auth (ADMIN/OFFICER/VIEWER) |
| GET /api/users, POST /api/users, PUT /api/users/:id, DELETE /api/users/:id | ADMIN | User management |
| GET /api/products, GET /api/products/:id | auth | Product repository (+ inspection history) |
| GET /api/inspections, GET /api/inspections/:id, POST /api/inspections, PUT /api/inspections/:id, DELETE /api/inspections/:id | auth (role-scoped) | Inspection records |
| POST /api/inspections/scan | OFFICER/ADMIN | Legacy run-and-save scan alias |
| POST /api/scans, GET /api/scans/:id | OFFICER/ADMIN / auth | Run compliance scan / fetch result |
| GET /api/rules, POST /api/rules, PUT /api/rules, PUT /api/rules/:id, DELETE /api/rules/:id | ADMIN | Rule database (MongoDB `McRule` collection) |
| GET /api/rules/categories | auth | Category labels |
| GET /api/reports/summary, GET /api/reports/export.csv, GET /api/reports/:id | auth | Analytics, CSV, structured report |
| GET /api/dashboard | auth | Enforcement overview |

Error contract: `{error: "friendly message", code: "MACHINE_CODE"}` —
`FILE_TOO_LARGE` (413), `INVALID_IMAGE` (400), `UNAUTHENTICATED` (401),
`FORBIDDEN` (403), `NOT_FOUND`/`PRODUCT_NOT_FOUND`/`RULE_NOT_FOUND` (404),
`INVALID_RULE` (400), `REPORT_FAILED` (404/500). Stack traces are never
exposed; 5xx responses are generic with server-side logging.

Database models (`server/models/`): User, Product, Inspection (with
`inspectionId`/`productId`/`officerId` aliases, embedded checks, quality,
readability), Rule (`ruleId` LM-xxx), Violation (embedded shape + reports),
Report (cached structured reports). File storage mirrors the same API when
`MONGO_URI` is unset.

## Demo mode (SIH presentation)

Scan → Demo Mode offers three sample products (ABC Premium Biscuits, Farm
Fresh Toned Milk, Herbal Bathing Soap). The sample label text and a locally
rendered label image stand in for camera/AI input; extraction, the rule
engine and scoring run for real. Demo inspections are stored flagged
`demo: true` and badged "Demo Mode — demonstration data" — mock inputs are
never presented as live AI results. If OCR/AI services fail live, the demo
still works end to end.

## Frontend component library

Reusable primitives in `client/src/components/ui.jsx` (Button, Input, Select,
TextArea, Badge, Card, Table, Pagination, Loader, Toast + provider,
ImageUploader, EmptyState, Modal) styled once in `index.css` — 8px spacing
system, 14–16px body text, 18–28px headings, visible `:focus-visible` states,
verb-led button labels (Scan Product, View Inspection, Generate Report,
Download Report, Add Rule, Save Changes, Create User).

## Environment files

Backend (`server/.env`, see `server/.env.example`):

```env
PORT=5000
MONGO_URI=
JWT_SECRET=
AI_SERVICE_URL=http://localhost:8001
CLIENT_URL=http://localhost:5173
```

Frontend (`client/.env`, see `client/.env.example`): only `VITE_API_URL`.
Never commit `.env` (gitignored); never put secrets in frontend code.

Security: bcrypt password hashing, JWT auth, role authorization, image
type/size validation (10 MB), helmet headers, restrictive CORS, MongoDB
operator sanitization, auth rate limiting, server-side input validation, and
a startup warning when `JWT_SECRET` is unset.

## Roles & permissions (JWT + bcrypt + MongoDB)

| Capability | ADMIN | OFFICER | VIEWER |
|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ |
| Scan products | ✓ | ✓ | — |
| Inspections | all | own | all (read-only) |
| Products | manage | view | view |
| Rules | manage (page is ADMIN-only) | — | — |
| Reports | ✓ | own | ✓ |
| Users | manage | — | — |

ADMIN can create users, assign roles and activate/deactivate accounts
(deactivated accounts cannot log in). Inspections carry an optional location
and editable officer remarks (saved via `PUT /api/inspections/:id`).

Reports: per-inspection professional PDFs are generated in the browser
(`Generate PDF` / `Download Report`) with meta, product info, compliance
summary, declaration analysis, violations, manual-review items, remarks,
evidence images and the AI-aid disclaimer; CSV export and print views remain.

Set `MONGO_URI` in `server/.env` to persist users, inspections and the rule
database in MongoDB; without it the server uses JSON-file storage with the
same API. Rule category applicability (`category` / `requiredFor`) lives in
the rule database — categories on the Scan page are labels only.

Rules follow the MongoDB collection schema
`{ruleId (LM-001…), name, field/anyOf, description, category, validationType
(REQUIRED|OPTIONAL), severity, active, source, requiredFor}`. Rule sources are
generic Legal Metrology reference placeholders — map them to the official
notifications supplied for the project before enforcement use. Validation
returns `{passed[], failed[], manualReview[], score, status}` with
`COMPLIANT | POTENTIAL_VIOLATION | MANUAL_REVIEW | UNABLE_TO_VERIFY`;
`score = passed / applicable × 100`, shown with counts (e.g. 8 of 10).

## Design

Clean light government-style UI, CSS variables in `client/src/index.css`, responsive breakpoints <768px / 768–1024px / >1024px (sidebar → drawer, tables scroll, cards stack).
