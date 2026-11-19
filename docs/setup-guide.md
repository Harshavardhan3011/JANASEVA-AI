# Hosted setup

For login, email verification and password recovery, complete [SMTP setup](email-auth.md) before deploying the authentication update.

The Dockerfile packages the Express API, the mock portal, Playwright Chromium and its native dependencies. The portal listens on loopback in the production container. Deploy a single worker with persistent storage mounted at `/app/.data` for demo receipts. Configure the container read/health check at `/api/v1/ready`.

1. Create a Supabase project for JANASEVA AI. Set `DATABASE_URL` in the root environment file with a TLS-enabled direct database or session-pooler connection. Run `npm run db:migrate` from the project root after installing backend dependencies. The migrator records applied files and seeds the active scheme.
2. Set `NODE_ENV=production`, `DATABASE_URL`, `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, independent `JWT_SECRET` and `PORTAL_SECRET` with at least 32 characters, and `FRONTEND_URL` to the production frontend origin. Use the private `documents` bucket created by the migration. Configure the host runtime port through `PORT`.
3. Build and deploy the Dockerfile to a browser-capable Node host, such as Render. Use HTTPS at the host ingress and leave the mock portal on `http://127.0.0.1:3002`.
4. Set the Vercel project's root to `frontend`. Choose Vite with build command `npm run build` and output directory `dist`. Set `VITE_API_URL` to the HTTPS backend URL including `/api/v1`. Deploy the frontend and verify health, registration, both approvals, and the returned receipt in the deployed browser.

## Optional AI configuration

Set `LLM_PROVIDER` to `gemini` or `openai` and set the corresponding `LLM_API_KEY` and optional model. For semantic retrieval, set `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY` and optional model, then run `npm run policy:index`. When the embedding model changes, reindex all passages. Queries are sent to a configured model provider. Documents are processed in the backend and use no external AI service.

The frontend receives the API URL only. Use a separate environment and service credentials for the hosted demo.
