# Explore Schemes: workflow audit and catalog backfill

28 November 2026. Uses the existing Express/TypeScript backend, PostgreSQL versioned catalog, React frontend, approved-source reader, admin controls and GitHub Actions scheduler. No schema migration or additional secret is required.

## Baseline and root causes

The connected production database contained 34 active records and only one linked published detail version. The two state records were T-Fiber and Saakshar Bharat, with official RangaReddy district URLs. Several saved tasks reported AI model HTTP 404 errors. Existing user accounts and saves are outside the ingestion role’s permissions.

The audit traced the primary source → reader → extraction → validation → versioned database → public API → detail page:

- A failed primary fetch or extraction terminated a record before known alternate sources or official search could recover it.
- Backfill selection excluded some partially populated records. Routine enqueueing reset retry bookkeeping and queued timestamps, weakening bounded retries and fair processing.
- Long legacy descriptions were being passed as identity aliases despite the shorter alias schema limit.
- Official HTML issuer information in the HTML title was discarded outside the main content. T-Fiber’s readable scheme facts therefore lacked authority evidence for publication.
- The fallback parser was limited to numbered scholarship guidelines. It did not understand clearly labelled state pages with beneficiaries, in-kind benefits and application instructions.
- A numeric-amount requirement incorrectly treated non-monetary benefits as unresolved. Narrative differences between an overview and a supporting portal could also block valid enrichment as a conflict.
- Any failed previously used supporting source blocked all new publication, even when validated new fields were available and old verified claims were retained.
- Review flags could carry over from an already approved version. Actual pending human edits now remain explicitly in review; they are never overwritten.
- Public details rendered empty sections and a field-failure table. Application URLs from legacy rows were not consistently distinguished from verified published application links.

## Changes

Every active scheme can be enqueued. A single stable task per scheme, SKIP LOCKED leases, a worker token, persisted results and bounded exponential backoff remain in use. Routine scheduling does not reset pending work or exhaustively retry review items. Explicit admin retry remains supported.

Each record first uses its known source, then known supporting links and official-search alternatives using the scheme name, available aliases, jurisdiction and department. Every used result is opened through the existing approved-host, robots, public-DNS, redirect, timeout, size and extraction checks. A failed record does not stop the batch. Unapproved myScheme access is not silently enabled.

Gemini JSON generation strips an optional models/ prefix and can recover a 404 by listing models available to the existing server key and choosing a supported stable Flash text model. Authentication and quota failures are not retried as model-discovery problems. Keys remain in headers, and provider bodies and secrets are excluded from saved errors. Existing exact-excerpt fallback remains available, now also supporting explicitly labelled state source sections.

All extracted material remains untrusted evidence. Structured output, claim quotations/hashes, identity, jurisdiction and version checks still gate publication. Model summaries are in English; original official text and titles remain available to admins. The deterministic fallback retains exact source wording and is identified as extractive rather than successful AI generation. Unsupported regional/scanned content remains pending rather than being guessed.

Old verified values, source evidence and application links are retained on empty updates. Differing material eligibility, dates or amounts still go to review. Dates are not inferred from broken links or page date ranges. Undated supporting sources can provide same-scheme missing facts only when both sources have no conflicting explicit version; explicit incompatible cycles remain blocked.

Results retain source attempts, field verification states, changed fields and conflicts. New successful imports, manual retry, scheduled source updates and record rechecks use the shared enrichment flow. Failed checks retain the published version. The API already uses Cache-Control: no-store and joins the current published version on each request. A newly published revision is visible on reload without creating a new scheme row or requiring a redeploy.

Public detail sections require populated claims. Source links and verification dates remain visible. Empty eligibility, document, deadline or contact sections are omitted; admins can inspect unresolved fields and exact source material. Legacy-only application links are suppressed; information and guideline links remain available.

## Verification

The existing full backend suite passed 19 tests. Additional focused checks cover:

- Central CSSS: primary guidelines plus a second official-source timeline, stable ID, source-linked documents/amounts and no duplicates.
- A primary outage followed by a successful known official guideline fallback.
- Reviewed wording and pending manual draft preservation, and source outages retaining the published page.
- T-Fiber’s actual official-page format: readable overview, public beneficiaries, in-kind benefit and information-channel instructions; no invented income threshold, document list, date window or Apply URL.
- Model-404 recovery with an authenticated model list, cached reuse, and secret-safe 401 handling.
- Real API and desktop/mobile browser reloads using captured official fixtures, including duplicate-safe reruns.

The live RangaReddy T-Fiber page was also fetched through the actual robots-aware reader and extracted successfully. Its historic page date range was not treated as an application window. Live catalog-wide processing results are recorded after the connected worker run; local fixture success is not represented as production backfill success.

## Commands and deployment

```sh
npm run build
npm run lint
npm test
node docs/enrichment-smoke.cjs
npm run schemes:backfill -- --limit=100 --retry
npm run schemes:backfill -- --limit=100
```

Production worker: `.github/workflows/scheme-backfill.yml` (manual resumable batches) and `.github/workflows/scheme-sync.yml` (daily 02:00 UTC). Both share the existing production database and ingestion role. Run overlapping jobs through the existing concurrency group. No website visitor is needed.

Existing configuration: JANASEVA_DATABASE_URL or JANASEVA_INGESTION_DATABASE_URL, JANASEVA_LLM_API_KEY, optional JANASEVA_LLM_MODEL / JANASEVA_LLM_PROVIDER, and JANASEVA_TAVILY_API_KEY or JANASEVA_SCHEME_SEARCH_API_KEY. These are GitHub secret/variable names, not credential values. The worker installs the existing verified Supabase CA. Render API equivalents remain DATABASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER, TAVILY_API_KEY / SCHEME_SEARCH_API_KEY. SCHEME_ENRICHMENT_ENABLED is explicitly enabled in the daily workflow.

Live scan/update/review/failure counts and any deployment gate are pending the production verification step below.

## Production pass and PDF follow-up

Approved commit 50a1b72 was deployed to Render (dep-dc58mih7lnhs73b300kg) and Vercel. GitHub Actions run 46124051082 checked all 34 active schemes: 2 published, 1 unchanged, 5 review and 26 failed. The action correctly failed rather than claiming all records were complete. Both state publications reused their existing scheme IDs.

This pass exposed a 61-page NSP disability guideline containing 114,158 readable characters, beyond the former 60,000-character limit. The bounded limit is now 240,000, retaining size/page/time limits. Nested headings such as 3.2 ELIGIBILITY and contiguous multiline title evidence are supported. A scanned official Telangana form was successfully OCR-read in a local real-document check (1,005 characters). Poppler is installed in production Docker images and both worker workflows; English OCR processes at most five pages sequentially. All OCR output remains incomplete/review, including short scans, because transcription errors must not automatically publish amounts or conditions. Other scanned languages still require an appropriate supported OCR configuration or an accessible native-text source.

Readable partial sources are retained as drafts after alternate sources are tried. Missing-overview drafts remain in review. Failed rechecks update the field-check report while retaining prior published values and their original verification date. No new database migration or secret is required. Final retry counts are recorded after the follow-up worker finishes.
