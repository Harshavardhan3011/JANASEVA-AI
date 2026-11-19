# JANASEVA AI

JANASEVA AI helps people find government schemes and official notices that are easy to miss. Browse by category and location, then check eligibility, benefits, application deadlines and links to the issuing authority. The goal is to make schemes easier to discover worldwide, starting with official sources in India.

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

## Find schemes and use your dashboard

Visitors can search at `/schemes` and ask questions at `/assistant`. Search checks published names, aliases, categories and locations. The assistant selects relevant database records with the existing AI provider and falls back to deterministic catalog search if that provider is unavailable. It cites the official source, states missing requirements and avoids confirming an application window from an old catalog date.

Sign in to use `/dashboard`. The optional profile stores state, district, occupation, age range and income range. Recommendations explain coverage and occupation matches. Other eligibility conditions remain subject to the official guideline. Save or remove schemes, check verified upcoming deadlines, follow publication changes and keep a personal document/application-step checklist on each detail page. Existing guided applications remain at their original URLs.

## Sources and deployment

The source registry at `/schemes/admin` includes myScheme, its State/UT directory, India.gov.in, IGOD, DBT Bharat, NSP listings and student announcements, JanSamarth, and PIB. Review-key authentication protects registry changes, sync and publication. Access-pending portals are listed with their intended purpose and are disabled until the supported automated access method is verified. myScheme requires written authorization and an API integration.

Run `npm run db:migrate` against the hosted database before deploying this update. Migration `009_scheme_finder.sql` adds source registration, recheck requests, optional profile fields, aliases and personal checklist progress. Existing records and public scheme IDs are preserved.

The Render sync Blueprint runs daily at 02:00 UTC (07:30 India time). It checks due sources independently of site visitors. Deploy the separate `Dockerfile.scheme-sync` service against the same database and configure its existing AI and search credentials. An existing Render cron service must have its schedule updated in Render or through its Blueprint. The local checkout cannot confirm that a hosted scheduler is running. See [source access and operations](docs/government-schemes.md).

## Verify or deploy

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

See [architecture](docs/architecture.md), [API](docs/api-specification.md), [deployment](docs/setup-guide.md), [test coverage](docs/testing-guide.md), and [project progress](PROJECT_PROGRESS.md).
