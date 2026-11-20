# Government information expansion

This increment extends the existing scheme catalogue, authentication, saved records, publication pointer, source registry and worker. Existing scheme IDs and URLs remain valid. New structured information is stored in the version description's optional `record` object; legacy descriptions remain readable.

## What changed

- Shared types: scheme, citizen service, public notice, recruitment, exam, result, regulatory guide, notification, department directory, helpline, grievance channel, RTI guidance, scheme update, event and FAQ.
- A record has source-backed title/authority, jurisdiction, original language, independent date entries, type-specific facts, and related references. Missing dates/times use null; absent factual sections stay empty and show meaningful unknown labels where needed.
- Publication, registration deadline, application opening/closing, hearing, event, effective and result dates are separate. Tomorrow resolves only against a cited publication date in Asia/Kolkata, never the current clock. Invalid or ambiguous dates remain unverified.
- Events/notices do not inherit Apply buttons. Applicable services/recruitment/schemes may offer a verified application URL; regulations expose official notification links. Related records resolve only to an unambiguous published record, otherwise to a catalogue search or a supplied official reference.
- Public search supports type, category, state, department, audience and status. Cards show type, jurisdiction, audience, key benefit where relevant, important dates, source and verification time.
- Public questions retrieve published records first and return evidence, the next action and source links. Signed-in profile context is read only for that account. Non-Latin questions can use provider-assisted keyword translation, and answers can follow the question's language or an explicit language request. Translation failure retains original source information. No model availability or translation accuracy is implied by fixture tests.
- Personal preparation drafts prefill account name/email and explicitly saved state/district/occupation/education. Exact age and income are never inferred from bands. Drafts can be edited and marked reviewed, then copied into an external official portal. The platform does not submit these drafts externally.
- The home page has scheme/service/notice prompts; details have prominent date cards; dashboards expose profile completion and preparation drafts. Closed mobile navigation is removed from keyboard focus, with Escape support.
- Administrators can edit structured fields and evidence, inspect extraction diagnostics and comparisons, refetch a source, add categories, and inspect actual published coverage separately from configured sources.

## Why extraction/autofill was failing

1. Every import was described as a welfare scheme, even when it was an Adalat, meeting or rule. The AI prompt and output schema did not provide event/registration/legal fields, so the database and frontend could not show them separately.
2. PDF parsing caught exceptions and returned empty text, obscuring the extraction stage. The old 60-page limit could miss the English section of a long bilingual Gazette. The parser now records errors, total pages, extracted character counts and truncation. Long documents keep opening/English/final excerpts and remain flagged for review. Scanned PDFs still require an accessible text version or OCR preparation; no unbounded browser/OCR job is silently launched on the small API host.
3. A single malformed claim could discard the whole AI response. Valid individual claims are now retained, malformed ones are omitted with review issues, and citation conflicts remain quarantined for admin inspection. Failed providers retain an extractive source preview and never replace published content.
4. PDF application channels were not mapped to the public application field. Explicit Form Submission URLs on approved official hosts can now be retained. Named sections of multi-service documents are scoped before generation to avoid mixing one service's fee/documents into another.
5. There was no general personal form-draft model. Preparation drafts now use the signed-in account's confirmed data, with review before copying. They do not claim to be complete official forms.
6. Editing/AI retry could overwrite manually edited draft text. Manual edits are now marked and protected. Refetching changed official material creates a proposed revision, preserving the published version and requiring review when earlier human edits exist.

## Publication and identity rules

Automatic publication requires matching source quotations, supported figures/dates, readable evidence, and no unresolved review issues. Each new typed record must have classification and authority evidence. Schemes need benefits and audience/eligibility; events need an event date; notices need a relevant verified date; services need documents and an application channel; recruitment needs posts and qualifications; regulations need a reference number. An absent application URL does not make a notice or event invalid.

An administrator can review an explicitly incomplete excerpt and publish its supported information with the recorded reason. An administrator cannot bypass quotation/figure/date consistency checks. Older facts and fees are not silently represented as current verified application windows.

Canonical PIB release variants share an identity. Linked Hindi releases use their English-release identity, so different translation PRIDs do not create separate schemes. Separate state variants remain distinct. Title matching alone never merges independent government records. Reviewed content stays public when source access fails. Legacy published notices without a typed description are proposed for reclassification when revisited.

## Security boundaries

- All public listing/detail/assistant queries use published snapshots; raw text, drafts, internal errors and citizen data are excluded. Public recheck failures use a generic status instead of raw diagnostics.
- Existing verified-session middleware protects all personal APIs. Draft reads, edits and deletes include both draft ID and session user ID. The database uniquely constrains user/record drafts and keeps RLS enabled with browser access revoked.
- Existing administrator middleware protects imports, evidence, category/source changes and publication. Public registration cannot select a role.
- The standalone worker connects with `SET ROLE janaseva_ingestor`. It can access the necessary catalogue/job/audit tables, but cannot read accounts, sessions, citizen profiles or personal drafts. A private, fixed-search-path trigger emits follower alerts without granting the worker follower access.
- A dedicated ingestion database login can be supplied and must be granted membership in `janaseva_ingestor` by the database owner. If the existing server database connection is used, the worker still drops to that role for its pool. Web requests continue to use the web database connection.
- Scheduled pending-registration cleanup is preserved through a narrowly scoped private function. It validates retention bounds, removes only eligible abandoned new regular registrations without saved/application/document/draft data, and returns a count. The ingestion role cannot select account data or run arbitrary account updates. Browser roles cannot call this function.
- Provider keys and mail settings stay server-side. The approved-host, public-DNS, redirect and robots checks are retained. Retrieved content is evidence, never authority to execute code or change permissions.

## Migration and setup

Migration: `database/migrations/20261120134249_government_records.sql`. It was generated with Supabase CLI and integrated into both existing migration runners. It adds `human_edited`, `citizen_form_drafts`, `catalog_categories`, the ingestion role/policies, a private alert trigger, and two disabled source candidates. It inserts no demo/test records.

Follow-up migration: `database/migrations/20261120142343_ingestion_maintenance.sql` preserves the existing scheduled cleanup via a bounded private function without granting account access to the worker. It is integrated into the same migration runners.

Both migrations were applied to the existing hosted Supabase project. Verification confirmed existing account/scheme/save counts were unchanged, draft RLS is enabled, browser roles cannot read drafts, and the ingestion role can access the catalogue while lacking user/draft access. The worker can execute the bounded cleanup function; browser roles cannot. New private objects introduced no advisor WARN findings. Pre-existing project advisor warnings (including a public extension and older functions) remain outside this increment; deny-by-default private tables may intentionally have no browser RLS policies.

For other environments:

```sh
npm ci --prefix backend
npm run db:migrate
```

Deploy the API, frontend and scheduled worker from the same commit after applying the migration. API environment names remain those in `.env.example`. Optional new worker connection name: `INGESTION_DATABASE_URL`. Existing relevant names: `DATABASE_URL`, `SCHEME_SYNC_WORKER`, `SCHEME_CATALOG_ENABLED`, `SCHEME_CATALOG_AUTO_PUBLISH`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `TAVILY_API_KEY`, `SCHEME_SEARCH_API_KEY`, `FRONTEND_URL`, `APP_PUBLIC_URL`, `VITE_API_URL`.

### Production scheduler check

Read-only checks on 20 November 2026 found no dedicated Render cron service for this project. The GitHub workflow is scheduled daily at 02:00 UTC (07:30 IST). Scheduled run `44712189875` started at 09:36:42 UTC and failed at the source-check step with “The standalone scheduler requires DATABASE_URL.” It did not prove successful production ingestion.

Required setup: configure GitHub Actions secret `JANASEVA_DATABASE_URL`, or the new optional dedicated `JANASEVA_INGESTION_DATABASE_URL`. Supply `JANASEVA_LLM_API_KEY` and the chosen search secret `JANASEVA_TAVILY_API_KEY` or `JANASEVA_SCHEME_SEARCH_API_KEY`. Optional provider variable: `JANASEVA_LLM_PROVIDER`. These credentials are not frontend settings and their values must not enter Git or chat.

Run the workflow manually once after deployment, inspect both job status and per-source outcomes in `/admin/discovery`, then retain a successful scheduled run and public record as production evidence. A completed queue request can still contain failed sources. Render Free's sleeping API cannot guarantee unattended checks by itself. Read-only Render access was preserved; no host configuration or manual deployment was initiated by the agent.

## Official evidence tested

Live downloading/extraction was checked through the application's allowlisted, robots-aware reader. API/AI-generation/browser assertions replay captured official text and controlled model output in isolated databases. No fixtures were inserted into the production catalogue.

| Record | Official source | Live extraction result / checks |
| --- | --- | --- |
| SVAMITVA national review meeting | [PIB release 2338440](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2338440) | 2,622 characters; publication 19 November 2026; event 20 November 2026; agenda and parent scheme reference; no Apply button. |
| Delhi Pension Adalat | [English PIB release 2338511](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2338511), [Hindi release 2338571](https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2338571&lang=2&reg=48) | 1,701 / 3,769 characters; registration 27 November 2026, hearing 4 December 2026; hearing time unspecified; translations share a source identity. |
| Social Security (Central) Rules, 2026 | [Official Ministry Gazette PDF](https://www.labour.gov.in/static/uploads/2026/05/49aa9b62c2125499c37399b90e969d67.pdf) | 259 pages / 676,421 extracted characters before excerpting; English opening and Gazette reference retained; incomplete-document review required. |
| Social Security Rules FAQ | [Official Ministry FAQ](https://www.labour.gov.in/static/uploads/2026/01/6822c50fd310c60d9eb14f59ee4d9b2b.pdf) | 5 pages / 6,878 characters; related regulatory record link; the FAQ predates the final Gazette and requires review rather than being treated as final law. |
| AP income certificate | [AP Seva service SOP](https://apseva.ap.gov.in/assets/User-Manuals/EoDB%20SOP%20final.pdf) | 13 pages / 18,576 characters; income-certificate section names Tahsildar/Deputy Tahsildar, documents, processing time, fee and official submission channel. It is an older manual; freshness needs authority confirmation. |

The original `gramawardsachivalayam.ap.gov.in` service-manual endpoint failed DNS resolution in the runtime; the alternate official AP Seva SOP worked. Successful fetching does not itself authorize activating a new registry source; candidates remain disabled until access/freshness review.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:auth-ui
npm run test:records-ui
```

Backend checks include the above record types/dates, source quotations, null times, missing-value recovery, automatic event/notice publication, manual excerpt review, public/private isolation, duplicate/translated imports, preserved reviewed edits, source outage preservation, two-account draft isolation, and actual publication using the restricted ingestion role.

Final local results on 20 November 2026: type checking, lint, all three production builds, all 16 backend tests, and the desktop/mobile records browser flow passed. The test servers require local network access; the restricted-network attempt failed to connect, and the network-enabled rerun passed. The latest read-only Render check still showed commit `95a482b` live, so these changes were not yet validated on the deployed site.

Browser checks exercise public search, type filters, notice/event/service/regulatory details, assistant results/citations, reviewed profile-prefilled copyable drafts, mobile navigation, source coverage and the structured admin editor at desktop/mobile sizes. Screenshots are generated under `.data/records-ui`. The existing auth browser regression checks verification/reset, saves, account switching, admin redirects and editor recovery.

Production generation with a live model, scheduled successful ingestion, and post-deployment browser pages remain unverified until the new code is deployed and the missing worker secret is supplied. No email delivery or multilingual-generation success is inferred from local fixtures.
