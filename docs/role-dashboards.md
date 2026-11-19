# Role-based dashboards

The existing Express/TypeScript, React/Vite, bcrypt, JWT plus database session system is retained. The server verifies email and checks current administrator authorization on every private API request. Browser-stored user details are never used to grant access.

## Final route map

| Route | Access and behavior |
| --- | --- |
| `/` | Public home, search and Log in/account menu |
| `/schemes` | Public listings |
| `/schemes/:id` | Public detail; existing stable UUID URLs preserved |
| `/ask` | Public assistant; saving/conversation storage requires login |
| `/assistant` | Compatibility redirect to `/ask`, preserving the question query |
| `/login`, `/register` | Public authentication |
| `/verify-email`, `/check-email` | Explicit email confirmation and resend/cooldown respectively |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/accept-invitation` | Existing verified administrator invitation flow |
| `/dashboard` | Verified account's recommendations, saved schemes and verified deadlines |
| `/dashboard/saved` | That account's saved scheme cards, official links and remove action |
| `/dashboard/checklists` | Document/application preparation progress for saved schemes |
| `/dashboard/profile` | Optional state, district, occupation, education, age and income preferences |
| `/dashboard/notices` | Verified users can submit local notices for administrator review |
| `/my-schemes` | Existing personal eligibility assessments and publication alerts |
| `/admin` | Admin overview with count links and fast Review/Discovery links |
| `/admin/schemes` | Search/filter catalog, revisions, source-backed editor, publication and archiving |
| `/admin/review` | Conflicts, failed extractions, possible duplicates and review decisions |
| `/admin/review/notices` | Existing submitted-notice review, now with reasons and auditing |
| `/admin/sources` | Source registry, health, intervals and coverage gaps |
| `/admin/discovery` | Durable requests, source runs, outcomes, retries and Sync now |
| `/admin/users` | Account search, verification state and protected admin invitations |
| `/admin/audit` | Scheme/source/access history, distinguishing admin and automated changes |
| `/schemes/admin` | Admin-only compatibility redirect |
| `/schemes/monitor` | Role-aware redirect to personal notice submission or administrator notice review |

Existing document, guided application and tracking URLs remain protected and available.

## Routing and account isolation

Protected routes wait for `/auth/me` before rendering. Cached user roles are ignored. Unverified sessions go to verification; intended internal destinations persist until login. Regular users land at `/dashboard`, admins at `/admin`. A regular user cannot select an admin URL through `next`. Unknown, external and authentication-loop return destinations are rejected.

The Save action stores an internal scheme destination including `save=1`; after authentication, the detail page performs the idempotent save. Account-specific React state is remounted on account changes, requests are cancelled on unmount, and logout removes session/client account state. APIs derive the owner from the authenticated session. Saves retain the existing `(user_id,scheme_id)` primary key. Profile partial updates merge preferences so saving only a location does not erase education/income. Archived catalog entries remain in personal saved data with an archive notice and remove action.

Recommendations explain published category, keyword and coverage matches and say **May match**. Saved optional age/income preferences are not treated as proof of eligibility. Current application deadlines continue to require published official evidence.

## Database migration

`012_role_dashboards.sql` adds:

- `admin_audit`, including actor, action, entity and reason.
- `discovery_requests`, with status, attempts, worker ownership and expiring lease.
- A partial unique index permitting one active discovery request across processes.
- Request IDs on existing source runs, plus review disposition and mandatory-admin-review flags on versions.

It does not replace users, saved schemes, progress, existing scheme IDs or published descriptions. RLS is enabled on the new private tables and browser roles have no grants. Migration 012 has been applied and verified on the existing Supabase project. Other environments should run `npm run db:migrate` with server-side `DATABASE_URL` before deploying the new backend.

Manual revisions preserve the published version and require an administrator to publish. The automatic pipeline cannot publish an unfinished admin edit. Rejections keep the published record, record a reason and suppress re-publication of unchanged rejected evidence. Editing or genuinely changed source text can create a new reviewable revision. Explicit admin publication can restore an archived scheme; automated sync cannot undo an archive.

## Discovery after deployment

Both API-triggered and scheduled checks use the same persisted request queue and existing official-source importer. A database lease plus unique active-request index prevents overlapping runs across the API and scheduled worker. A heartbeat extends a running lease; after interruption an expired lease is recoverable. Worker-level failures retry up to three attempts. Source-specific failures retain their previous published record and remain visible in source/run outcomes. The public catalog uses uncached database reads, so publication appears without a redeploy.

The Render account was inspected with the owner's authorization: JANASEVA is a **Free web service**, and no Render cron service is currently deployed. The in-process timer alone cannot cover periods when that service sleeps.

A daily GitHub Actions scheduler is included at `.github/workflows/scheme-sync.yml`. It runs the existing standalone worker against the shared database at **02:00 UTC / 07:30 India time**, without website visitors. GitHub schedules may be delayed and inactive public repositories can have scheduled workflows disabled; monitor actual run history. The existing Render cron Blueprint remains an alternative if a Render cron service is provisioned. Avoid enabling two schedulers unnecessarily; database leases still protect against overlap.

To activate the GitHub scheduler:

1. Deploy/push the tested code to the default branch after SMTP is ready.
2. In GitHub repository **Settings → Secrets and variables → Actions**, set `JANASEVA_DATABASE_URL` to the server-side TLS database connection for the same Supabase project.
3. Set `JANASEVA_LLM_API_KEY` and optional variable `JANASEVA_LLM_PROVIDER` (`gemini` or `openai`, default Gemini). AI generation needs the existing provider's valid key. Set `JANASEVA_TAVILY_API_KEY` or `JANASEVA_SCHEME_SEARCH_API_KEY` for search-based discovery; configured document/listing connectors can run without search credentials.
4. Enable Actions, open **Daily scheme discovery → Run workflow**, and verify its request, source outcomes and counts at `/admin/discovery`. No SMTP or Supabase service-role key is needed by this worker.
5. Confirm the next scheduled run occurs without visiting the website. Configured per-source intervals are honored when a worker runs; a daily external worker provides daily checks while Render is asleep, not fifteen-minute coverage during sleep.

The worker command is `npm run schemes:sync` (after building the backend). It also retains abandoned-registration cleanup from the email-auth change.

Production SMTP remains required for the existing verification, reset and admin invitation flows. Use [email-auth.md](email-auth.md) and `.env.example`; keep all credentials server-side. The frontend still needs only its API URL, including `/api/v1`. The Vercel SPA rewrite already supports direct subroute refreshes.

## Verification and deployment status

The full backend suite passes all 13 tests; TypeScript, ESLint and production builds also pass. The GitHub scheduler YAML parses successfully.

Local checks exercise two independently registered and API-verified users, separate saves, checklist ownership, forbidden identity overrides, admin authorization, invitation/bootstrap verification, durable request deduplication, concurrent worker claims, source-outage preservation, expired-lease recovery, revision history, rejected changes and audit actors.

The browser test exercises verification, ordinary/admin redirects, protected Save return for both roles, two-account switching in one browser, profile editing, direct dashboard subroute refresh, forged cached-admin rejection, password reset, mobile layout widths, direct admin page refreshes and the queued/completed Sync now display.

Email is captured locally, and discovery tests use controlled official-host/document and AI fixtures. Those are never inserted into production. These tests verify application behavior; they do not prove current government-portal availability, production SMTP arrival, or a production scheduled run.

Commands:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:auth-ui
```

**Pending production checks:** code deployment after SMTP configuration, actual verification/reset email delivery, new dashboard routing in the deployed frontend, Actions secrets and the first manual/scheduled worker run. Production migration and private-table access checks are verified; production end-to-end flows are not yet verified.

References: [Render cron execution](https://render.com/docs/cronjobs), [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Main implementation files

- Routing and authorization: `frontend/src/App.tsx`, `components/ProtectedRoute.tsx`, `contexts/AuthContext.tsx`, `services/authDestination.ts`, and the existing server auth/reviewer middleware.
- Personal UI: `layouts/PersonalLayout.tsx`, `pages/DashboardPage.tsx`, `components/SchemeCard.tsx`, `components/SchemeChecklist.tsx`; ownership APIs in `backend/src/modules/citizen/citizen.routes.ts`.
- Admin UI: `layouts/AdminLayout.tsx`, `pages/AdminPages.tsx`, `pages/SchemeAdminPage.tsx`, `pages/SchemeMonitorPage.tsx`.
- Admin API, queue and audit: `backend/src/modules/catalog/dashboard.admin.ts`, `catalog.queue.ts`, `catalog.audit.ts`, and the existing catalog/monitor repositories and routes.
- Deployment/schema: `database/migrations/012_role_dashboards.sql`, both migration runners, `backend/src/run-scheme-sync.ts`, and `.github/workflows/scheme-sync.yml`.
- Verification: `backend/src/tests/roles.test.ts`, the existing auth/catalog/monitor tests, and `docs/auth-smoke.cjs`.
