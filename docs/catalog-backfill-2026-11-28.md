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

The connected production results and remaining verification gaps are recorded below.

## Production pass and PDF follow-up

Approved commit 50a1b72 was deployed to Render (dep-dc58mih7lnhs73b300kg) and Vercel. GitHub Actions run 46124051082 checked all 34 active schemes: 2 published, 1 unchanged, 5 review and 26 failed. The action correctly failed rather than claiming all records were complete. Both state publications reused their existing scheme IDs.

This pass exposed a 61-page NSP disability guideline containing 114,158 readable characters, beyond the former 60,000-character limit. The bounded limit is now 240,000, retaining size/page/time limits. Nested headings such as 3.2 ELIGIBILITY and contiguous multiline title evidence are supported. A scanned official Telangana form was successfully OCR-read in a local real-document check (1,005 characters). Poppler is installed in production Docker images and both worker workflows; English OCR processes at most five pages sequentially. All OCR output remains incomplete/review, including short scans, because transcription errors must not automatically publish amounts or conditions. Other scanned languages still require an appropriate supported OCR configuration or an accessible native-text source.

Readable partial sources are retained as drafts after alternate sources are tried. Missing-overview drafts remain in review. Failed rechecks update the field-check report while retaining prior published values and their original verification date. No new database migration or secret is required. The follow-up worker finished; its results are recorded below.

## Public before and after

Before this task, Saakshar Bharat and T-Fiber had legacy listing rows with no linked published detail JSON. Both now have published details at their existing IDs, verified on 28 November, with claim-level official URL/hash evidence:

- Saakshar Bharat: [RangaReddy official source](https://rangareddy.telangana.gov.in/scheme/saakshar-bharat-program/). The district source states ages 15–50 and directs applicants to the village Saakshar Bharat coordinator. The public page now shows the overview, benefit, eligibility, beneficiaries and application instructions. Documents, fees, a current date window and a direct application URL were not verified.
- T-Fiber: [RangaReddy official source](https://rangareddy.telangana.gov.in/scheme/t-fiber/). The public page now shows the digital-infrastructure overview, public beneficiaries, affordable reliable broadband benefit and the official information route. No invented income threshold, document checklist, deadline or Apply button was added.
- Central PM-USP CSSS: the existing published version retains nine eligibility claims, one document claim, seven application steps, a benefit and source-linked dates/contacts. Its last verified date remains 26 November rather than being falsely advanced when identical information is checked again. The actual production browser check confirms those details remain visible. The controlled primary-outage recovery and secondary-source deadline tests use isolated official fixtures; they are not claimed as a newly published live CSSS amendment.

The production API and stable Vercel site were tested at desktop 1440px and mobile 390px, including direct page loads and refreshes for all three IDs. There were no JavaScript page errors or horizontal overflow. Empty sections were absent, per-claim official links were present, and the state pages had no unverified Apply button.

Runtime follow-up commit d83ae25 is live on Render (dep-dc5944k9v7es739m1pb0). It also checks the entire bounded supporting-source text for identity and includes aliases/department in supplemental searches. Build, lint, the full 19-test backend suite, the final focused enrichment/provider tests and the API/browser smoke flow passed. The existing scheduled worker has observed schedule-triggered production runs, including GitHub run 45982450903 on 27 November; the new code was executed through the manual production backfill, not misreported as an already completed new scheduled run.

## Final connected production results

The retry [run 46125522243](https://github.com/Harshavardhan3011/JANASEVA-AI/actions/runs/46125522243) finished at 08:42 UTC on 28 November. It scanned all 34 active records: 0 further publications, 3 unchanged published descriptions, 16 review drafts and 15 failed checks. It returned a failure exit code because those fifteen records remain unresolved.

Across the original pass and retry, compared with the saved pre-task baseline:

| Result | Distinct existing schemes |
| --- | ---: |
| Scanned | 34 |
| Newly populated published detail pages | 2 |
| Existing publication retained unchanged | 1 |
| Proposed details retained for review | 16 |
| Extraction or verification failed | 15 |
| Fully verified across all ten tracked detail fields | 0 |
| Still has at least one field without verified public evidence | 34 |

The last two rows are completeness measures, not extra schemes. Even the three published descriptions have unresolved optional or unavailable fields: CSSS has 7/10 tracked fields verified, Saakshar Bharat 5/10 and T-Fiber 4/10. They are not falsely labelled fully complete, and missing information is not relabelled Not applicable.

Of the fifteen failed records, nine encountered provider quota/timeouts with no usable alternative extraction, five could not establish scheme identity in the opened official sources, and one failed the numeric claim/citation check. Alternate official-search URLs also returned 404s or non-readable material. These checks were not bypassed. The sixteen drafts likewise need review of source completeness, variant scope, authority evidence or other outstanding checks before publication.

The normal, non-forced [resume run 46126880759](https://github.com/Harshavardhan3011/JANASEVA-AI/actions/runs/46126880759) then succeeded on d83ae25: queued 0, scanned 0 and changed 0. The table still contains exactly 34 schemes, with 0 duplicate scheme-to-import links and 3 published detail versions. The retry itself retained all three published versions. No account, saved scheme or checklist data was changed by the ingestion role.

No migration, new SMTP setting or new secret is needed. The remaining operational gap is a usable AI quota/model for the existing GitHub JANASEVA_LLM_API_KEY and Render LLM_API_KEY (provider/model names JANASEVA_LLM_PROVIDER / JANASEVA_LLM_MODEL and LLM_PROVIDER / LLM_MODEL). Source identity and citation failures need corrected applicable official evidence, not relaxed validation. Failed tasks have bounded delayed retries; review items remain review until resolved. Use the existing admin retry or the manual backfill workflow after resolving a source/provider problem. English OCR data is bundled; custom OCR_LANG_PATH is optional, and non-English scanned PDFs remain unverified.

The next daily sync uses the existing 02:00 UTC workflow and processes the shared persistent queue. A manual retry remains: npm run schemes:backfill -- --limit=100 --retry, with SCHEME_ENRICHMENT_ENABLED=true and the existing restricted production database configuration. A non-forced resume omits --retry. No website visit or redeploy is needed for subsequent verified publications.

## Changed implementation files

- backend/src/modules/catalog/catalog.backfill.ts: full-catalog queue selection, primary fallback, partial drafts, field reports and safe reruns.
- catalog.enrichment.ts / catalog.identity.ts / catalog.repo.ts: labelled and nested extraction, full bounded identity checks, preserving verified values and publication gates.
- catalog.fetch.ts / catalog.ocr.ts / catalog.publishers.ts: retained HTML authority, bounded long PDF/native extraction, review-only OCR and verified district host.
- backend/src/ai/providers/llm.provider.ts: authenticated model-404 recovery and sanitized errors.
- backend/src/modules/catalog/catalog.job.ts and both .github/workflows/scheme-*.yml: shared live enrichment, counters and OCR worker setup.
- Dockerfile / Dockerfile.scheme-sync: Poppler installation.
- backend/src/modules/schemes/schemes.controller.ts: published application links and current version responses.
- frontend/src/pages/SchemeDetailPage.tsx, SchemeCard.tsx and SchemeAdminPage.tsx: populated public sections, verified Apply actions and admin unresolved-field wording.
- backend/src/tests/enrichment.test.ts / provider.test.ts, README.md and this report: regression checks and operating instructions.
