# JANASEVA AI

A citizen workspace for fresh **PM-USP CSSS** college scholarship screening. Ask the assistant a question, check the published conditions, review two supporting documents and authorize Playwright to prepare a demonstration portal form. A second explicit approval submits that form and returns a demo receipt.

The default run uses an embedded PostgreSQL database via PGlite, local private file storage and deterministic policy retrieval. It works without cloud credentials. Use fictitious applicant data and the supplied sample documents in the demonstration.

## Run locally

Prerequisites are Node.js 20.19+ and npm. On Windows the browser worker selects installed Google Chrome or Microsoft Edge. On macOS or Linux install the Playwright Chromium bundle.

```sh
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix mock-portal
npm run dev
```

Open [JANASEVA AI](http://localhost:5173). The API listens on port 3001 and the loopback mock portal on port 3002. The optional root `.env` uses the settings in `.env.example`. The local database, generated signing secrets, attachments and receipt files live under `.data/`. Keep one local API process per data directory.

Install Playwright Chromium if a supported browser is unavailable or on macOS/Linux. Linux environments may need the OS dependencies installed using Playwright's `--with-deps` option.

```sh
cd backend
npx playwright install chromium
cd ..
```

For bundled Chromium on Windows set `BROWSER_CHANNEL=bundled` in the root `.env`. To use installed Google Chrome, set `BROWSER_CHANNEL=chrome`.

## Demonstrate the complete workflow

1. Create a local account with a fictitious address such as `asha@example.test` and a password of at least eight characters.
2. Open **Schemes** and select **PM-USP CSSS**. Read the official guidelines, then choose **Start guided application**. You can also ask the assistant **Help me apply for a college scholarship**.
3. Enter **Asha Student**, **Example College**, **B.Sc.**, annual income **180000**, and board-stream percentile **92**. Answer **Yes** for regular degree, recognized institution entry into the first year after Class XII and inclusion on the published board list. Answer **No** for another scholarship and a gap after Class XII.
4. Upload [the sample income certificate](docs/demo/income-certificate.png) and [the sample marksheet](docs/demo/marksheet.pdf). Review the extracted values and confirm each document.
5. Prepare the reviewed application and explicitly authorize browser preparation. The app displays a screenshot from the mock portal.
6. Review the filled form and explicitly authorize submission. The portal issues a `DEMO-…` reference. Reload the application and open its activity history to see the approvals and recorded result.

Official screening uses the [Ministry guidelines](https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf) and the [2025–26 fresh-applicant FAQ](https://scholarships.gov.in/public/schemeGuidelines/FAQ_DOHE_CSSS.pdf). Consult the [National Scholarship Portal](https://scholarships.gov.in/) for live application windows and official submission.

## Refresh the scholarship catalog

The Schemes page includes the 31 records from the [default NSP listing](https://scholarships.gov.in/All-Scholarships) reviewed on 17 November 2026. For a refresh, review the official listings and update `database/seed/nsp_catalog.csv`. Keep each `scheme_key` stable and record the new check date. The NEC listing is tagged as a renewal deadline because NSP identifies it that way.

Run `python database/build-nsp-catalog.py` to regenerate the versioned SQL seed. Restart the local backend to apply it, or run `npm run db:migrate` against the configured hosted database. The import updates reviewed records by stable ID. Retire a removed listing by setting its database status to `ARCHIVED`.

For automatic checks of the pilot official sources and review of uploaded village notices, open [Scheme Monitor](http://localhost:5173/schemes/monitor). See the [monitor setup and operations guide](docs/scheme-monitor.md).

Use **Schemes → Manage schemes** for versioned official imports, AI descriptions, publication and production synchronization. See the [Government Schemes publishing guide](docs/government-schemes.md).

## Verify or deploy

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

See [architecture](docs/architecture.md), [API](docs/api-specification.md), [deployment](docs/setup-guide.md), [test coverage](docs/testing-guide.md), and [project progress](PROJECT_PROGRESS.md).
