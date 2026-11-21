# Certificate directory and guides

Implemented 21 November 2026. The live API probe returned HTTP 200 for both readiness and `/api/v1/schemes?type=citizen_service`, with an empty certificate array. The screenshot alone does not identify the earlier transport failure. Previously the entire page depended on this API and had no directory content. The updated page keeps a bundled public directory visible, shows catalog errors separately, and offers a retry. It preserves existing catalog IDs, saved records, login redirects and account permissions.

## Coverage

27 categories: income, caste/community, residence/domicile/nativity, EWS, OBC/non-creamy layer, birth, death, marriage, disability/UDID, pensioner life, legal heir/surviving family, minority, nationality/citizenship, police clearance/character, bonafide/study, transfer, migration, degree/provisional/marks, land ownership/possession, encumbrance, farmer/agriculturist, solvency, unmarried/no impediment, medical fitness, vaccination, name change/gazette, and business/establishment registration.

31 entries include six source guides and general directory entries. These categories are discovery aids: not every state issues every certificate, and a registration service is not necessarily a certificate application. All 36 state/UT government homepages are included as directory links, not asserted to be direct service forms. Services India and ServicePlus are additional discovery links. These directories timed out or returned a gateway error during this check; they are not counted as successfully verified service guides.

## Source guides actually opened and read

| Guide | Official evidence | Fields supported |
| --- | --- | --- |
| UDID disability | https://depwd.gov.in/en/udid-scheme/ | Eligibility, documents, assessment/application steps, NIL fee, official portal |
| Jeevan Pramaan | https://jeevanpramaan.gov.in/v1.0/misc/faq | Eligible pension authorities/exclusions, identity/pension information, assisted authentication, Pramaan ID and tracking |
| Nandyal integrated caste | https://nandyal.ap.gov.in/service/caste-certificate/ | Community coverage, document list, MeeSeva/Sachivalayam channel; page last updated July 2025 |
| APSeva income | https://apseva.ap.gov.in/assets/User-Manuals/EoDB%20SOP%20final.pdf#page=4 | Income evidence and identity alternatives, APSeva submission, revenue verification, tracking/download |
| APSeva birth | Same PDF, page 2 | Submission, registrar verification, tracking/download |
| APSeva death | Same PDF, page 3 | Submission, registrar verification, tracking/download |

Read on 21 November 2026. A source-read date does not prove a current open application window. The AP manual's old fees and turnaround targets are deliberately not presented as current verified charges. “NA” in a document table is not interpreted as proof that no documents are required. Missing dates, contact details and processing times remain unknown. Nandyal instructions remain district-specific. The old HTTP MeeSeva link is not promoted as a verified direct application button.

Other checked candidates: Bihar ServicePlus, UDID portal root, CRS, ServicePlus service list and West Bengal EWS timed out; MEA PCC returned 403; Uttarakhand EWS returned 404. An outdated Karnal page mixed birth/death instructions; its requirements were not imported. None of these failures authorize copying snippets or guessing requirements.

## Implementation and AI access

`backend/src/modules/schemes/certificate-directory.json` is the public reference dataset. `frontend/src/data/certificate-directory.json` is its checked-in public snapshot so frontend-only Vercel builds need no files outside their project root. Backend tests enforce exact parity; copy the dataset to the frontend snapshot when changing guides. Source guides list supporting URLs and the fields each source supports. This curated directory is kept separate from database-published records and cannot overwrite reviewed catalog values.

- `/certificates`: filtered directory plus published catalog records.
- `/certificates/guides/:slug`: source guide or general navigation guide, state selector, official links, and Ask AI action. Direct links and refreshes work through the existing SPA rewrite.
- `/certificates/:id`: existing published record, save/checklist support unchanged.
- `GET /api/v1/schemes/certificate-directory`: machine-readable public guides and portal links; no database required.
- Assistant: searches certificate titles/aliases and supplied/profile state; retrieves these source summaries and official URLs as evidence, returns guide links, and asks for state when needed. Existing published service answers now include documents and application steps that were previously omitted.

The assistant does not claim to visit every link live on each question. This directory does not add unrestricted outbound fetching or silently enable blocked sources. Existing approved-source discovery remains server-side. New complete service records still use the evidence-aware import/publishing pipeline. General directory entries have no fabricated application URL, document list, fee or verified date. Adding more detailed guides requires reading the exact official service source and recording its scope and evidence; merely adding a URL does not verify a service.

## Setup and verification

No schema migration, additional secret or environment variable is required. Build/deploy **both frontend and backend**. The frontend directory works with the existing API version; assistant guide retrieval needs this backend commit deployed. Render was inspected read-only and was not manually redeployed by this task.

Commands:

```sh
npm run typecheck
npm run lint
npm run build
npm test
node docs/certificates-smoke.cjs
node docs/records-smoke.cjs
```

The focused backend checks cover 36 jurisdictions, unique stable slugs, official HTTPS source hosts, unknown requirements, and preventing AP data from appearing as Telangana requirements. The browser check covers source-guide documents and application links, direct reload, desktop/mobile width, assistant retrieval without a model key, and directory availability during an aborted catalog request. The existing records smoke suite checks published-certificate filtering, legacy links, login-to-save and account flows. Only synthetic accounts and isolated local database fixtures are used; no demo data is inserted into production.

Local results: full build, typecheck and lint passed; all 18 backend tests passed; both the focused certificates browser check and existing records browser suite passed. The parity check also passed after moving the frontend snapshot inside its Vercel project root. Vite retains its existing bundle-size warning; the build succeeds.

Remaining scope: service-specific instructions for every jurisdiction and category are not yet verified; 36 portal links do not imply that coverage. Production deployment and the updated deployed assistant must be checked after both services ship this commit.
