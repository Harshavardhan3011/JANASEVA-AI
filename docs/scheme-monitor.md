# Scheme Monitor

Open **Schemes → Scheme Monitor** in the signed-in workspace. The running Node backend checks for due sources every minute. Each registered source is due every six hours by default. Source status shows the last successful or failed check and the next scheduled check.

## Initial sources

| Source | How it is used |
| --- | --- |
| [PIB press releases RSS](https://www.pib.gov.in/ViewRss.aspx?lang=2&reg=3) | The pilot monitors the Hindi feed. Scheme-related releases go to review with available article text. A valid empty feed is recorded as a successful check with zero candidates. |
| [Telangana Department of Agriculture](https://rythubharosa.telangana.gov.in/) | Publishes the Rythu Bharosa reference when the official profile matches its registered layout. |
| [Ranga Reddy district schemes](https://rangareddy.telangana.gov.in/schemes/) | Publishes scheme cards with same-host official detail links. The listing is indexed as a district reference. Application dates stay blank unless stated explicitly. |

The National Scholarship Portal CSV catalog remains a reviewed import. The scheduler never removes a listing because a source is unavailable, empty, or changed its layout. An official application link is displayed when a reviewer records one. The presence of a listing alone does not establish that applications are open.

## Review and local notices

For local development run `npm run monitor:key` in a private terminal, then paste the generated key into **Reviewer workspace** while signed in. The browser keeps the key in memory for that page. Set a distinct `SCHEME_MONITOR_KEY` of at least 32 characters in production.

- **Check sources now** schedules the registered checks immediately. Review candidates appear after the check finishes and the queue is refreshed.
- Signed-in citizens can upload a public village notice as a PNG, JPEG or PDF. English image OCR and text-based PDFs supply evidence for the reviewer. Scanned PDF pages can be submitted as clear images. A scanned notice may be reviewed from its original attachment even if text extraction finds nothing.
- A reviewer confirms the issuing authority, geography and source. For a paper-only notice, enter the official issuing office’s website. The original file and OCR text stay private. Only the approved listing appears in the catalog.
- If `LLM_API_KEY` is configured, the existing Gemini or OpenAI provider drafts benefits, eligibility and deadlines from official RSS evidence. The review queue shows the original evidence. The extraction model cannot approve or publish a listing. Citizen attachments are processed locally.

New versions retain the prior observations. Same-source updates reuse the scheme ID. Potential cross-source duplicates and revisions that lose verified details go to review. The public directory filters by category, state, district and village. Village names are recorded by the reviewer. Automatic matching against the Local Government Directory is outside this version.

## Expanding registered sources

The registry lives in `public.scheme_monitor_sources`. The migration shows the initial URL and configuration examples. Add official government sources by choosing the adapter that matches the publisher:

- `state_profile` needs `title` and `state` in `source_config`. It reads the heading and adjacent summary. The optional `category` and `description` are public metadata supplied by the operator.
- `district_catalog` needs `state` and `district`. It reads the first page of S3WAAS-style scheme cards that link to a scheme on the same government host. Inspect a new site before registering it because these layouts can vary.
- `pib_rss` monitors the PIB's national press release feed.

A different source format needs a parser before it can be scheduled. Set `enabled=false` on a registry row to pause that source. Set `SCHEME_MONITOR_ENABLED=false` to pause automatic scheduling for the service while preserving manual checks. Apply the migrations before starting a hosted backend. No hosted migration or remote AI credentials are required for the local pilot.
