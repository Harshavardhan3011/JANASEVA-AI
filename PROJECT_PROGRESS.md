# JANASEVA AI progress

The existing React and Express project was copied into the working workspace without its private environment file. The React routes, API module boundaries and scholarship demo were reused. The earlier simulated source citations, extraction and success paths were replaced.

| Phase | Requirements and implementation | Dependencies | Verified result | Status |
| --- | --- | --- | --- | --- |
| Foundation | React/Vite UI, Express API, local PostgreSQL, environment validation and health/readiness endpoints | Node and npm | All services started, readiness returned 200 through Vite, build and type checks passed | COMPLETED |
| Core | Account, JWT session revocation, owned applications, dashboard and conversations | API and PostgreSQL | Registration and sign-out passed. Access by a second account returned 404. | COMPLETED |
| Intelligence | Indexed Ministry publications, citations, deterministic fresh-applicant screening, PDF extraction, image OCR and applicant review | Seed, pgvector, Tesseract | Policy retrieval, threshold boundaries, missing evidence, OCR and PDF extraction passed locally | COMPLETED |
| Execution | Private Playwright screenshot, two explicit approvals, mock portal and retry | Chromium and prepared application | Unauthorized starts and direct posts were rejected. A failed submission returned 502. Retrying returned the portal-issued reference. | COMPLETED |
| Tracking | Persistent application state, approval audit, browser session events and citizen activity view | Database and workflow | Browser refresh and database reopen preserved the record. Replaying final approval preserved one receipt. | COMPLETED |
| Local verification | Build, type-check, lint, automated backend and browser journey | All local modules | Production build, type check, lint, 9 backend tests and the full React browser walkthrough passed | COMPLETED |
| Hosted verification | Supabase migrations and Storage, Docker worker, Vercel build and live model providers | Dedicated hosted project, deployment target, credentials | Configuration and setup instructions are included. Live credentialed services are unverified. | NOT STARTED |

## Changes by area

- `frontend/src` contains the new landing, assistant, dashboard, evidence review, approval, receipt and audit views. Existing registration and authenticated navigation connect the screens.
- `backend/src` contains parameterized PostgreSQL persistence, authorization, source retrieval, document extraction, eligibility, the Playwright worker and integration tests.
- `mock-portal/server.js` validates signed access and stores idempotent demonstration receipts.
- `database/` contains the schema, RLS, session and workflow integrity migration, and the published PM-USP CSSS source seed.
- `docs/` contains the API contract, architecture, setup and test guides, browser test and sample evidence. The frontend Vercel config and backend Dockerfile describe hosted deployment.

## Verification details

Local initialization applied the base schema, workflow/session additions and policy seed. The hosted RLS and Storage branch has not been applied in this environment. The local API and browser tests exercised registration and revocation, scheme evidence, ownership gates, document review, both browser checkpoints, receipt replay and audit history. Official PDFs are linked from the National Scholarship Portal's published scheme listing. The optional live PDF intake and remote model/embedding providers were not verified with credentials.

The demonstrated workflow covers fresh PM-USP CSSS screening and a simulated portal submission. Local document extraction supports text PDFs and English OCR for PNG/JPEG. A scanned PDF must be converted to an image for OCR.
