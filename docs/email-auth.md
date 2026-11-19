# Authentication and production email

JANASEVA uses its existing Express, bcrypt and server-session authentication. Supabase stores the application's tables; this is not Supabase Auth. Configure SMTP on the **Render API service**, not in Supabase Auth or Vercel.

## Set up SMTP before deploying the authentication change

1. Create a [Brevo](https://www.brevo.com/) account and activate transactional email. Its documented free allowance is 300 sends/day; provider limits and approval still apply.
2. In Brevo, add and verify a sender. Prefer a domain you own. Copy the domain-authentication DNS records Brevo supplies into your DNS provider, including DKIM and verification records and the recommended DMARC configuration. Add or merge SPF only as instructed by your provider; do not publish two SPF records. Wait until Brevo reports the sender/domain authenticated. You cannot authenticate the shared `vercel.app` or `onrender.com` domains. A recipient Gmail address is not automatically an authorized sender.
3. Open **Settings → SMTP & API → SMTP**, copy the SMTP login and generate an SMTP key. Use that SMTP key as `SMTP_PASS`, not the account password or HTTP API key.
4. Open Render → JANASEVA API service → **Environment**. Add the following keys individually, preserving existing database and application secrets:

   | Key | Value |
   | --- | --- |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_PORT` | `2525` |
   | `SMTP_SECURE` | `false` (the mailer requires STARTTLS) |
   | `SMTP_USER` | SMTP login copied from Brevo |
   | `SMTP_PASS` | Generated SMTP key |
   | `SMTP_FROM` | `JANASEVA AI <your-verified-sender@example.com>` using your actual verified sender |
   | `APP_PUBLIC_URL` | `https://frontend-alpha-five-81.vercel.app` or your actual public frontend origin |
   | `TRUST_PROXY_HOPS` | `1` for the Render reverse proxy; default `0` locally |

5. Choose **Save only** until the new code is ready; these values become active on the next deployment. Do not prefix secrets with `VITE_`, commit them, or paste them into chat. Keep the existing `FRONTEND_URL` pointing at the same frontend origin and Vercel's `VITE_API_URL` pointing at the Render API including `/api/v1`.
6. Apply migrations using `npm run db:migrate` from the root with server-side `DATABASE_URL`, after `npm ci --prefix backend`. Migration `011_email_auth.sql` is additive and leaves existing users and saved schemes intact. On the current Supabase project, this migration has already been applied and verified; do not insert replacement accounts.
7. Deploy the backend and frontend, check `/api/v1/ready`, then perform the real-inbox checks below. Existing accounts without evidence of verification will need to verify on their next login. Public browsing remains available.

Render Free blocks outbound ports 25, 465 and 587. Port 2525 is supported by Brevo; connectivity and TLS must still be verified from the deployed service. If you use another SMTP provider, use its documented TLS settings and a port your hosting plan permits. Never disable certificate checking.

References: [Render port restrictions](https://render.com/docs/free#other-limitations), [Render environment save options](https://render.com/docs/configure-environment-variables), [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [Brevo ports](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525), [Brevo free limits](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans).

## Account behavior

- Registration always creates a pending regular user. It rejects client-supplied roles, normalizes email and enforces uniqueness in the database. SMTP failure retains the account and shows a retry path.
- Verification and reset links put their random token in a URL fragment, which is not sent in HTTP requests. The page captures and removes it from the address bar and requires explicit confirmation. Opening a link alone does not consume it. The database stores only SHA-256 token hashes. Replacement links invalidate earlier links.
- Existing accounts are preserved. `email_verified_at` is retained if already present. Accounts without verification evidence are gated on their next sign-in; their saved schemes remain intact.
- Password recovery gives the same response for eligible and unknown addresses. Only verified accounts receive a reset. Reset atomically changes the password, consumes the token and revokes all sessions and other reset tokens.
- The first administrator uses the existing server-side `Adminmail` and `AdminPass` bootstrap. The email must now be verified before an admin session is created. Rotate this bootstrap password in Render; regular password recovery does not change `AdminPass`.
- Verified administrators can invite another administrator in `/admin/users`. The recipient must confirm the email link and set a password before receiving the role. Invitations are single-use, tied to their email, and audited with the inviting admin ID. All admin APIs require an authenticated administrator; legacy review keys no longer grant access.
- Email requests are limited by IP and a hashed normalized email key (five per purpose per hour). Link-confirmation/reset attempts are limited by IP. Resends also have a per-account cooldown.
- The frontend validates internal return destinations. A visitor saving a scheme returns to its detail page and the save action after login. Admin login redirects to `/admin/users`.

## Optional settings and cleanup

`EMAIL_VERIFY_TTL_MINUTES=60`, `PASSWORD_RESET_TTL_MINUTES=30`, `AUTH_EMAIL_COOLDOWN_SECONDS=60`, `PENDING_REGISTRATION_DAYS=30` are configurable server settings.

See [role-dashboards.md](role-dashboards.md) for the final routes and daily scheduler activation.

The standalone `npm run schemes:sync` command also runs abandoned-registration cleanup. Ensure the existing daily scheduler runs this command. Cleanup removes only new, unverified, regular pending registrations older than the configured retention period and without saved schemes, applications or documents. Legacy accounts are explicitly excluded. The scheduler needs `DATABASE_URL`; it does not need SMTP secrets just to clean up. Pending users must be excluded from any future verified-user statistics (`email_verified_at is not null`).

## Verification

Run:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:auth-ui
```

The backend auth test uses an isolated PGlite database and an in-memory SMTP substitute. It covers pending access denial, role injection, replacement/expired/reused links, scanner-safe GET requests, concurrent reset, old password/session rejection, admin invitation/permissions/audit, delivery failure/retry, request throttling and safe cleanup. Existing backend tests continue to cover user ownership and saved schemes.

The browser test starts an isolated API and Vite instance on port 5175. It exercises real frontend forms through verification, dashboard access, saving, logout and password reset, then verifies saved schemes remain and mobile login/registration are reachable. Emails are captured in memory and never sent. This test must not be described as production SMTP delivery verification.

For deployed verification, use the nominated test inbox without committing its address or password to the repository:

1. Register or sign in to the existing account. Confirm the check-email screen, resend countdown and dashboard denial before verification.
2. Confirm actual inbox arrival, sender and correct frontend domain. Open the link; verify the account is still pending until clicking Confirm. Confirm once, then test link reuse rejection.
3. Log in and save a scheme. Request password recovery and confirm a second email actually arrives. Reset the password, log in with the new password and check the saved scheme remains. Confirm old password, previous sessions and reset-link reuse fail.
4. Verify a regular account receives 403 from the admin API. Complete the bootstrap verification and one admin invitation.

**Current production delivery status: unverified.** SMTP is not yet configured by the owner. The additive migration is applied, but the authentication code must be deployed together with working SMTP to avoid stranding existing users at verification.
