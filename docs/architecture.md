# Architecture

React and Vite provide the citizen workspace. Axios calls the Express REST API through the Vite proxy in development. The API uses PostgreSQL for authenticated sessions, conversations, eligibility checks, applications, approvals and browser events. Local PGlite uses the same application schema and seed as the hosted Supabase deployment. The API exclusively mediates citizen records and private files. The Supabase migration enables RLS and revokes direct application-table access for browser roles.

## Scholarship workflow

The assistant classifies citizen input into a small set of supported intents. Gemini or OpenAI can classify requests when configured. The API retrieves evidence scoped to the active scheme and serves the matched passages and their source metadata. The unconfigured path uses indexed official excerpts and deterministic classification. Optional 768-dimensional model embeddings add pgvector cosine similarity. Eligibility uses TypeScript inequalities and affirmative or negative answers. Unknown values differ from failed conditions. Class XII board-stream percentile and annual income are independent checks.

The application locks its row during each transition. A revision binds approval to the reviewed version. Screening and preparation store rules and evidence status. Uploads validate signatures and extract a small set of fields with PDF text extraction or image OCR. Acknowledging the document is an applicant review. Institution and selection verification are performed by the relevant authorities.

The first approval authorizes a Playwright fill-only session. The browser validates the known mock form and privately captures it. The second stage records an explicit approval before starting another Playwright session that fills and sends the stored dossier. The mock portal validates a server-only signature and saves an idempotent receipt. The API records completion only after Playwright reads the receipt. A failed operation leaves the applicable checkpoint available for retry. Owner checks apply to application, document, screenshot, session and audit requests.

## Source boundaries

The supported scheme and published test conditions are for fresh PM-USP CSSS screening. The demo evidence checklist consists of an income certificate and Class XII marksheet. The actual submission is confined to the demo portal. The included sources cover official scheme rules and the 2025–26 FAQ. Current deadlines are maintained by the National Scholarship Portal.

The repository separates the React frontend, Express backend, demo portal, database scripts and API contract. Browser execution runs in the backend process. Local OCR uses bundled English data. Text-based PDFs and PNG/JPEG image OCR are supported. Scanned PDF pages can be uploaded as PNG or JPEG for OCR.
