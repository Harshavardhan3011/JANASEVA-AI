# Government Schemes publishing

The public catalog is available at `/schemes`. Each existing and newly published scheme has a stable `/schemes/:id` page. The public API returns only the published version. Listing and detail responses use `Cache-Control: no-store` so the Vercel-hosted frontend can read new records without a frontend deployment.

## Sources and access

| Source | Access and behavior | Default interval |
| --- | --- | --- |
| [Press Information Bureau](https://www.pib.gov.in/ViewRss.aspx?lang=2&reg=3) | Official RSS for discovery. The worker fetches matching release pages through the allowlist and robots policy. Releases that do not clearly define a new scheme wait for review. | 15 minutes |
| [Andhra Pradesh NTR Bharosa pension order](https://sspensions.ap.gov.in/SSP/Documents/GO%20MS%2043%2013.06.2024.pdf) | Downloadable government PDF. The publisher's [About page](https://sspensions.ap.gov.in/SSP/Home/About) includes older amounts, so the import carries an explicit reconciliation note and requires review. | 15 minutes |
| [myScheme](https://search.myscheme.gov.in/terms-of-use) | Evaluated as a future source. Its site prohibits automated access without written authorization. [NeGD identifies API Setu as the authorized integration path](https://cdn.digitalindiacorporation.in/wp-content/uploads/2025/01/Ask-Our-Experts_-QA-myScheme.pdf). Obtain access and the supported API contract before adding a connector. | Approval pending |

No webhook was verified for the two enabled sources. The live fetcher checks robots directives at each allowlisted origin in a run, allows ordinary 404/410 absence of a robots file, bounds downloads and timeouts, and revalidates redirects. PM-KISAN's public PDF endpoint was also tested from the local runtime and failed TLS certificate verification, so it is available as a manual PDF source rather than an enabled poller. When automated access is unavailable, an authorized reviewer can upload a public official PDF and provide the original source URL. The source upload stays under review until verified.

## Automatic discovery across India

The **India-wide official scheme search** source searches one configured publisher per run. The publisher list includes central ministries and official portals for every state and union territory, plus selected department and district sites. It rotates publishers and search topics so one state does not dominate the results. The default interval is 60 minutes, with one search request and up to four candidate documents per run. The existing PIB and Andhra Pradesh sources keep their own intervals.

1. Apply migration `007_scheme_search.sql` with `npm run db:migrate` against the same hosted database used by the web API and scheduled worker.
2. Get a [Tavily API key](https://app.tavily.com/) and set `TAVILY_API_KEY` on Render's scheduled sync service alongside the existing model credentials. The hourly schedule uses up to 744 basic search credits in a 31-day month before manual runs or other usage, within [Tavily's 1,000-credit free quota](https://docs.tavily.com/documentation/api-credits). Existing Brave users can keep `SCHEME_SEARCH_API_KEY`. Tavily takes precedence when both keys are configured. To run discovery directly with **Sync now**, configure the selected key on the web service too. Keep search keys out of Vercel and GitHub.
3. Redeploy the API and the scheduled worker with the updated code. The existing `*/15 * * * *` Render schedule picks up due sources. Discovery defaults to hourly and can be adjusted under **Sources and sync runs**. Use **Trigger Run** on the Render cron service to start a due check immediately.
4. Under **Sources and sync runs**, check for an `external-scheduler` run for the India-wide search. A successful search can return no eligible candidates. Check the run's added, published, skipped and failed counts.

Search results supply URLs only. The worker fetches approved publishers directly, checks robots rules and validates redirects. Official evidence supplies the title and the AI-generated description. Unchanged pages skip generation. The existing publication checks accept cited, verifiable records and send ambiguous documents and conflicting or incomplete claims for review. Sites with blocked access, unreadable documents or pages absent from the search index can leave coverage gaps, particularly for district and village notices. The myScheme site is excluded from this search integration.

## Review and sync

1. Sign in, then open **Schemes → Manage schemes**. For local setup retrieve the existing reviewer key with `npm run monitor:key`. Production uses `SCHEME_MONITOR_KEY`.
2. Paste an official URL. Enter its scheme name, authority, government scheme ID if provided, state and category. Attach the official PDF when needed. **Import for review** captures the source and attempts structured generation using `LLM_PROVIDER` and `LLM_API_KEY`.
3. Open the imported version. Compare its original source text, cited claims, and any changes to the published version. Edit as needed and confirm verification before publishing. An empty section renders “Not specified in the official source.”
4. **Sync now** makes enabled sources due immediately. **Sources and sync runs** shows the last check and last successful sync, each source's interval, and added, updated, skipped, failed and published counts. Adjust intervals and pause sources there.

An unchanged source skips AI generation. A failed generation keeps the captured version and offers **Retry AI generation**. Automatic retries use backoff. Scheduled publication requires an authoritative source, readable evidence, a validated extractive description, and benefit and eligibility evidence. Plain-language paraphrases and conflicting or incomplete information go to the reviewer. The model sees delimited source content and returns validated JSON. Important numbers must occur in the exact cited text. Closure requires explicit official wording and is never inferred from a deadline. Publishing switches a database pointer in a transaction and keeps old versions. Existing guided applications continue to use their existing workflow.

## Production setup

The existing project describes a static Vercel frontend, a Node/Docker API (Render or a compatible host), and Supabase Postgres. The local source copy has no linked production project or live credential set.

1. On the intended environment, set the hosted `DATABASE_URL` and run `npm run db:migrate`. This applies `database/migrations/006_scheme_publications.sql` and seeds the two configured sources. The default local database applies it on startup.
2. Configure the backend's existing variables and supply `SCHEME_MONITOR_KEY`, `LLM_PROVIDER`, and `LLM_API_KEY`. Deploy the API Docker image and the Vite frontend with the intended `VITE_API_URL`. Keep keys only in backend or worker environment variables.
3. For an always-on Node service, the in-process scheduler checks for due sources each minute, including when no visitors are present. For a sleeping or serverless API, deploy the independent `Dockerfile.scheme-sync` as a scheduled job against the same database. `render-scheme-sync.yaml` is a Render Blueprint reference. Run its container every 15 minutes and set `SCHEME_CATALOG_ENABLED=false` on the web API if the independent job handles scheduled checks. The job has no HTTP endpoint and does not need web signing or Storage keys. The scheduler's startup lag and cron frequency govern the effective cadence jointly with the per-source interval.
4. From the deployed worker, run `node backend/dist/run-scheme-sync.js` for the next batch of due checks, or run `npm run schemes:sync` from a configured source checkout with backend dependencies installed. The hosted database coordinates worker leases and persists next-check times across restarts.
5. Leave the published app without visitors through one scheduled interval. In administration, verify a completed scheduled or external-scheduler run and inspect the source, version and resulting public URL. Do this on the intended host with real model credentials to confirm production behavior. No hosted run is claimed by the local tests.

## Changed areas

- `database/migrations/006_scheme_publications.sql` adds source, import, version and run tables with restricted access.
- `backend/src/modules/catalog/` handles access checks, deterministic extraction, AI validation, publication, and sync runs. The existing provider and reviewer authentication are reused.
- `backend/src/modules/schemes/schemes.controller.ts` serves public snapshots without caching. Existing scheme IDs are preserved.
- `frontend/src/pages/SchemeAdminPage.tsx`, `SchemeDetailPage.tsx`, and `SchemesPage.tsx` provide the reviewer workspace, sources and public detail filters.
- `Dockerfile.scheme-sync`, `render-scheme-sync.yaml` and the standalone command support a visitor-independent deployment.
- `backend/src/tests/catalog.test.ts` exercises scheduling without requests, AI JSON validation, manual review, public publication, deduplication, and failed-sync protection. For the downloaded official AP PDF fixture set `CATALOG_TEST_PDF`. Set `CATALOG_UI_URL` to the running frontend to exercise the published detail UI in Chromium. Tests use a controlled provider response and never use a live model key.

## Citizen assessments and publication alerts

Migration `008_citizen_scheme_alerts.sql` adds authenticated citizen location preferences, followed schemes, version-specific self-assessments, and an in-app alert inbox. Run `npm run db:migrate` against the hosted database before deploying the updated API and sync worker, then deploy the frontend. Local development applies the migration on initialization.

Citizens sign in, open a scheme and choose **Follow updates**, then open **My schemes** to mark each published eligibility or who-can-apply claim as met, unmet, or unknown. The checklist displays the original quotation and official source. Missing answers stay unknown. Citizens can save their state and compare it with the published coverage. These are self-reported assessments, and the issuing authority determines eligibility. This increment does not infer individual eligibility automatically from age or income.

Whenever the existing publication transaction changes a followed scheme's published version, a database trigger compares the published description sections and inserts a unique alert for each follower. The inbox shows previous and new claims, dates, documents, benefits and status. Failed imports and unpublished drafts produce no alerts. The next publication invalidates the previous assessment so a citizen can review current conditions. Alerts are generated in the database even when no citizen has the page open, and are retrieved when they next open My schemes. Email and push delivery are not configured.

The authenticated `/api/v1/citizen-schemes` routes scope every profile, watch, assessment, and alert operation to the signed-in user. The new tables have RLS enabled and no direct grants to browser roles. The catalog integration test verifies following idempotency, owner isolation, publication diffs, stale assessment rejection, unknown answers, and preservation after failed syncs.

## Simple scheme finder update — 19 November 2026

Migration 009 registers the requested discovery portals as access-review candidates. Their page URLs and intended roles are visible to administrators. An administrator can add or update an exact official gov.in/nic.in host, document its permitted access method and activate a listing/document connector. Feed/API contracts need a dedicated parser and remain access-review items until implemented. Directory links to previously unknown publishers require host approval.

Live source checks found readable myScheme information and its State/UT page, the National Portal homepage, the DBT ministry listing, and NSP listing/student-announcement pages. myScheme's published terms explicitly require written authorization for automated access. IGOD, the supplied JanSamarth page, the PIB all-releases URL, and robots endpoints could not be reliably fetched by the research client in this run. They remain pending access review. The existing PIB RSS and AP pension connectors remain available. Readability in the research client does not establish permission or successful production fetching.

The NSP listing and Students page show different scholarship dates and cycles. The finder retains historical records but does not promote their dates into a confirmed current deadline. Legacy records render an unverified-window explanation, and the assistant says when the current application window cannot be verified. Future published structured date evidence can support deadline cards. Known published sources receive daily tracking entries after publication. Rechecks create drafts and preserve the published snapshot until validation and review.

The public assistant uses catalog text, aliases, category and location ranking, then asks the configured model to select from those IDs. Public answers have no server-side conversation history. Signed-in conversations enforce ownership and retain context. AI failure falls back to the catalog. Missing/stale results request an approved-source check, and the running API can perform a draft-only sync without publishing newly discovered records. A durable recheck request remains in the database for the scheduled worker. Semantic embeddings are not added to the scheme catalog in this increment.

Optional profile age/income bands are saved, but recommendations currently explain jurisdiction and occupation/category evidence; they do not infer eligibility from those bands. Personal checklists persist independently of public descriptions and are scoped to the authenticated citizen. Verified deadline cards require cited application-date evidence, an explicit application status, and an unambiguous ISO date. Other date formats remain visible as source text without a synthesized deadline.

Deploy the API, frontend and worker from the same revision after migration 009. The Blueprint now schedules a daily run at 02:00 UTC. Configure DATABASE_URL and its trusted certificate on the worker, along with LLM_PROVIDER, LLM_MODEL, LLM_API_KEY and TAVILY_API_KEY. Keep SCHEME_CATALOG_ENABLED=false on the free web service when the separate worker owns polling. Render cron billing and availability depend on the hosting account. A production scheduled run remains unverified until its run history and public output can be checked.

Run `npm test`, `npm run build`, `npm run lint`, and `npm run test:ui` with the local frontend and API running. Integration fixtures use isolated temporary databases and never insert sample schemes into production. The browser test exercises the retained guided application, while the UI smoke test exercises the new finder and personal dashboard.
