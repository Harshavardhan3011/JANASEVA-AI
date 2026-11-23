# Certificate requirements and state selection

Updated 23 November 2026.

## Root cause and fix

The generic `/certificates/guides/income` page previously used its slug as the only guide lookup. Changing State/UT updated a government homepage link, but never selected `ap-income` or any other state guide. Consequently the page displayed empty generic fields even when official local details existed. The AP guide itself also omitted documented eligibility, charges and service targets.

The guide page now resolves certificate kind + state + explicit district. The selector sits before the details. The generic income URL with `?state=Andhra%20Pradesh` renders the APSeva procedure and survives reload. Switching to Telangana replaces the checklist and removes AP fees. District-only guidance is offered as an explicit link rather than silently applied to a whole state. Direct legacy source-guide URLs still work.

The listing groups by certificate kind and prioritizes available official guidance. Types awaiting detailed local sources are optional, clearly labelled entries. Unsupported jurisdictions have one coverage message and available-guide choices rather than a full page of empty eligibility, document, fee, contact and date sections. Annual application dates are not invented for ongoing certificate services.

## Current coverage

27 categories, 41 reference entries, 16 source-backed guides. Local evidence is available for six states/UTs, with Karnataka and Maharashtra currently represented by district-specific guides. National UDID and Jeevan Pramaan guides remain nationwide. Links to 36 state/UT homepages are directory fallbacks, not verified local service coverage.

| Official source actually opened/read | Guidance included |
| --- | --- |
| [APSeva citizen-service SOP](https://apseva.ap.gov.in/assets/User-Manuals/EoDB%20SOP%20final.pdf) | Income, birth, death, integrated community/nativity/DOB, Hindu marriage, encumbrance. Page-specific links support documents, issuer, documented fees, service targets and steps. |
| [Nandyal caste service](https://nandyal.ap.gov.in/service/caste-certificate/) | Separate district checklist; not substituted for statewide APSeva rules. |
| [Telangana income form](https://www.telangana.gov.in/wp-content/uploads/2023/03/IncomeGeneralApplicationForm.pdf#page=2), [MeeSeva forms](https://www.telangana.gov.in/services/meeseva-services/) and [FAQ](https://www.mgov.telangana.gov.in/faqnew.html) | Scanned PDF page 2 was downloaded, rendered with Poppler and visually read. Preserves the paper-form exception for Citizen Login, identity alternatives, income evidence and photograph. No unsupported current fee was copied from an old charter. |
| [Delhi Revenue income](https://revenue.delhi.gov.in/revenue/income-certificate) and [alternative offline guidance](https://revenue.delhi.gov.in/revenue/income-certificate-0) | Checklist, no application fee, area SDM/DC channel. Conflicting 14/21-day response times and checklist variants are explicitly flagged. |
| [Delhi domicile](https://revenue.delhi.gov.in/revenue/domicile-certificate) and [legacy guidance](https://revenue.delhi.gov.in/revenue/domicile-certificate-0) | Form/declaration, identity, three-year residence evidence, DOB proof, attestation, no application fee, official e-District route. |
| [Goa income](https://goaonline.gov.in/Appln/UIL/DeptServices?__DocId=REV&__ServiceId=REV07) | Purpose-specific documents, online registration/submission/tracking, one-day documented target and helpdesk. Conditional documents retain their conditions. |
| [Goa birth retrieval](https://goaonline.gov.in/Appln/Uil/DeptServices?__DocId=PSE&__ServiceId=PSE03) | Births registered from 1971 onward only. Preserves this service’s explicit no-supporting-documents statement; does not generalize to new/delayed birth registration. |
| [Tumakuru income](https://tumkur.nic.in/en/service/apply-for-income-certificate/) | District checklist, online/in-person route, documented charge; 21 days is labelled as the in-person target. |
| [Satara income](https://www.satara.gov.in/en/service/income-certificate/) | District checklist, mandatory declaration, conditional age/medical evidence, Aaple Sarkar service link and appeal officers. The table’s unlabelled time unit is not inferred. |
| [DEPwD UDID](https://depwd.gov.in/en/udid-scheme/) | National disability eligibility, documents, medical assessment, NIL fee and portal. |
| [Jeevan Pramaan FAQ](https://jeevanpramaan.gov.in/v1.0/misc/faq) | Pension-authority eligibility, exclusions, identity/pension details, authentication, Pramaan ID and tracking. |

New and expanded guides were checked on 23 November 2026. Existing national and Nandyal guides retain their actual earlier check dates in the dataset. A read date is not a guarantee of an open application window or a live portal fee. SOP charges and targets are attributed to that document and can be superseded. The AP birth/death SOP says NA in its checklist but mentions uploads in the procedure; that ambiguity is explained rather than treating NA as proof that no documents are necessary.

Kerala e-District, Tamil Nadu eSevai and other candidates were investigated; unavailable pages, access restrictions and incomplete source evidence were not turned into universal requirements. Complete detailed coverage of every certificate in every state is still pending.

## Implementation

- Canonical reference data: `backend/src/modules/schemes/certificate-directory.json`.
- Frontend-only Vercel snapshot: `frontend/src/data/certificate-directory.json`; tests enforce exact parity.
- `/certificates/guides/:slug` resolves jurisdiction locally; API outage cannot blank bundled guides.
- `GET /api/v1/schemes/certificate-directory` returns the machine-readable public dataset without requiring a database.
- The guide page additionally loads matching verified published records from `/schemes`, so discoveries subsequently published in the existing database remain reachable without a frontend redeploy.
- The assistant retrieves the same state-scoped guides, excludes generic duplicates when a source guide exists, preserves source conflicts, and requires an explicit district before using district facts.
- Existing database ingestion already includes certificate/service discovery topics. It remains server-side, official-host restricted and evidence-validated. This task does not enable unrestricted crawling, fabricate source records or overwrite reviewed catalog content.
- Account data, saved items and existing record URLs are preserved. No schema migration or additional environment variable is required.

## Verification and deployment

Commands:

```sh
npm run typecheck
npm run lint
npm run build
npm test
node docs/certificates-smoke.cjs
node docs/records-smoke.cjs
node docs/certificates-live.cjs
```

Backend checks cover matching source documents, AP amounts and service targets, Telangana’s Citizen Login exception, source-link parity, duplicate suppression, district isolation and Delhi’s explicit conflict. Browser verification covers the screenshot’s generic-income → AP selection path, reload, switches to Telangana/Goa, explicit Tumakuru selection, unsupported-state empty behavior, mobile layout, assistant retrieval and API outage fallback. Test accounts and fixtures remain isolated from production.

Deployment results are recorded after the production run is observed; a queued deploy is not reported as live. The live check uses public pages and one public assistant question, and does not create accounts, send emails or insert demo records.

Local release checks passed: typecheck/build, lint, all 18 backend tests, the existing records browser suite and the focused certificates browser suite. The initial parallel browser startup timed out; the sequential release run passed. Production results follow after deployment.
