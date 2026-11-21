# Scheme detail enrichment and backfill

Implemented and checked on 21 November 2026. This extends the existing importer, published-version API, official reader, model provider, source registry and worker. It does not replace authentication or scheme IDs.

## Root cause traced

The hosted database had 34 scheme rows and **zero linked catalogue imports/published detail versions**. Most rows were seed/listing records containing a title and a short classification such as “Merit-based scheme”. The detail API reads rich sections from the published version; with no version it returned `detail: null`. The frontend could therefore show only a summary and unknown labels. A PDF link in a listing did not itself import that PDF. The old public recheck also rejected these legacy rows because they had no import.

The NSP reader had another problem: it selected the first `<main>` (navigation), ignored scheme titles in `<h6>` and timeline text in `<span>`, and extracted only “Schemes On NSP” from a 205 KB response. It now scopes the requested scholarship card and retains its official guideline/FAQ links and timeline. PDF Word metadata is replaced with the supplied scheme title when it is a document-editor filename. The PDF reader also retains the explicitly stated NSP application portal.

Previously every citation linked to the primary URL, and an admin revision copied the description without supplemental evidence. Both paths now preserve and display the actual field's evidence.

## Implemented flow

1. Fetch the approved primary source server-side using the existing robots, public-DNS, redirect, timeout, pacing and size checks.
2. Extract with the existing AI provider. When no model key exists, a deliberately limited fallback copies explicitly labelled guideline sections; unsupported formats fail clearly. This fallback is reported as **Labelled official excerpts**, never as successful AI generation.
3. Find missing eligibility, documents, numeric benefits, application steps, fees, application deadlines and contacts. Follow relevant official links and search the approved ministry/state registry using field-specific queries when a search key is configured. Open each result before extracting; search snippets are never used as evidence. At most four supplemental documents are opened per pass.
4. Check the named scheme, jurisdiction and applicable source version. Generic descriptions such as “Merit-based scheme” cannot serve as identity aliases. Fixed-cycle material with unclear applicability, incomplete extraction and conflicts are retained for review. A guideline applying from a year onwards may support an explicitly dated application-portal cycle. A 2025–26 FAQ cannot silently provide a 2026–27 deadline.
5. Fill missing fields, retain existing verified values, and route conflicting figures, dates or conditions for review. Each claim can carry `sourceUrl`, `sourceHash`, `scope` and an exact quotation. Captured source snapshots include fetch time and fingerprint. Hashes distinguish revisions at the same URL.
6. Publish through the existing validation/publication function. Admin-reviewed changes are preserved, and manually edited pending drafts are not replaced. A failed primary or previously verified supporting source retains the published page.

New imports and changed source versions use the same enrichment function. Scheduled jobs also resume the durable `scheme_enrichment_tasks` queue, three records per invocation. Admins can queue all incomplete records or retry one. Public refreshes use this queue too, including legacy records. Interrupted leases expire; temporary failures back off, and repeated failures require attention. Scheme IDs remain stable, including when several legacy variants share a guideline URL.

Public responses expose published claims and safe verification status, not raw source snapshots, internal errors or job logs. Admins can inspect captured texts, failed attempts and field-source selections. Browser roles cannot read the job table; the standalone CLI drops to `janaseva_ingestor`.

## Real before and after: PM-USP CSSS

Existing public ID: `518d8549-a22c-45bd-8a19-1484b42b30bd`.

| Field | Before | Verified after |
| --- | --- | --- |
| Rich details | `detail: null` | Published structured description |
| Eligibility | No detail section | Nine source-backed clauses, including above the 80th percentile, regular degree study and family income up to ₹4.5 lakh, with fresh/renewal conditions retained |
| Benefits | No detail section | Exact rate-and-duration passage, including ₹12,000 for the first three graduation years and the applicable ₹20,000 conditions; historical exceptions remain explicitly scoped |
| Documents | No detail section | Income certificate requirement for fresh applicants; this is the confirmed requirement in the guideline, not a claim that no other portal documents are needed |
| Application steps | No detail section | Seven guideline passages on online application, verification and timelines |
| Student deadline | Absent from the guideline | **30 November 2026**, separately cited to the NSP scheme card and scoped to 2026–27 |
| Contacts | No detail section | Grievance and Ministry contact passages |
| Application portal | Missing | Official NSP portal, explicitly named by the guideline |
| Fees / open-or-closed status | Unknown | Still unverified; no value or status was invented |

Sources actually opened and read through the application:

- [Official CSSS guideline PDF](https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf): 8,360 extracted characters, applicable from academic year 2022–23 onwards.
- [NSP scheme listing](https://scholarships.gov.in/All-Scholarships): the CSSS card provides the separate student timeline; other schemes' verification dates are excluded.

Additional diagnosis: the Ministry FAQ URL returned 404 and the Ministry landing page returned no readable body in this runtime. The working NSP FAQ file was identified as 2025–26; it was not used to assert current-cycle conditions. These failures do not erase verified details.

The live fetch was processed through the actual application backfill, publication, database and API in an isolated database, followed by desktop/mobile page loads and reloads. A second pass skipped the same record and retained its published version. The validated source-only result was then applied to the hosted existing record in a guarded transaction via the database connector; the transaction refused to overwrite any concurrent detail revision. This connector replay is **not evidence of a successful deployed background run**.

Hosted result: **1 backfilled, 33 queued**, still 34 schemes and 6 accounts. A subsequent request to the deployed public API returned HTTP 200 with benefits, nine eligibility clauses, one confirmed document requirement, seven application steps, dates, contacts and the NSP deadline citation. No demo accounts or records were added to production.

## Migration and operation

`database/migrations/20261120150056_scheme_field_enrichment.sql` adds evidence/report columns and the resumable task table. It is integrated into both migration runners and was applied to the hosted database. RLS is enabled; `anon` and `authenticated` have no access, while the ingestion role has only its existing catalogue permissions plus queue access. Existing account/scheme counts were preserved. The advisor check reported no finding for the new table or columns; unrelated earlier project findings remain outside this change.

For another environment:

```sh
npm run db:migrate
npm run build
```

To queue/resume a bounded batch with server-side database configuration:

```sh
npm run schemes:backfill -- --limit=3
npm run schemes:backfill -- --scheme=518d8549-a22c-45bd-8a19-1484b42b30bd --retry --limit=1
```

The CLI forces the restricted ingestion identity. Use a login permitted to assume `janaseva_ingestor`. Repeating a completed record requires `--retry` or its next due check; interrupted/pending work resumes automatically. The API/admin queue shares the deployed daily discovery workflow and the running API's scheduled wakeups.

Relevant configuration **names only**: `DATABASE_URL`, optional `INGESTION_DATABASE_URL`, `SCHEME_ENRICHMENT_ENABLED`, `SCHEME_CATALOG_ENABLED`, `SCHEME_CATALOG_AUTO_PUBLISH`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `TAVILY_API_KEY` or `SCHEME_SEARCH_API_KEY`.

For the GitHub scheduler, database configuration uses `JANASEVA_DATABASE_URL` or `JANASEVA_INGESTION_DATABASE_URL`; model/search names are `JANASEVA_LLM_API_KEY`, `JANASEVA_TAVILY_API_KEY` or `JANASEVA_SCHEME_SEARCH_API_KEY`. Provider selection uses `JANASEVA_LLM_PROVIDER`. A read-only check on 21 November confirmed the database, model and Tavily secret names now exist; values were not inspected. The earlier failed daily run predates that check. The manual **Backfill scheme details** workflow can process a bounded batch or retry a specific existing UUID, using the same concurrency group as daily discovery. A source failure sets a failing CLI exit code while retaining durable retry state. Deploy the API and frontend for the new UI and API-triggered processing. No Render configuration was changed under the read-only authorization.

## Verification and remaining limits

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:enrichment-ui -- --live
npm run test:records-ui
```

The 17 backend tests passed, including second-source citations, unrelated scheme-card exclusion, wrong citation rejection, reviewed-value preservation, conflict retention, in-place reruns, source outages and scoped-worker permissions. The live CSSS browser test passed at desktop/mobile sizes after reload. Its before/after JSON and screenshots are written under `.data/enrichment-ui` and are not committed. CI can omit `--live` to replay captured official evidence without external access.

Remaining gaps: the other 33 records are queued, not claimed as enriched. Fees and definitive application status for CSSS remain unknown. A complete current-cycle document list may require another compatible official source. Live model generation was not verified because no local model credential was available; the live test used the transparent extractive fallback. Successful unattended production processing and deployment of the new UI remain unverified until the worker is configured and the code deployed.
