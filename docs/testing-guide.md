# Verification

Run `npm run build` for the frontend and backend TypeScript/production builds. Run `npm run typecheck`, `npm run lint` and `npm test` from the root after the four dependency installs in the README.

The backend test covers the eligibility boundary at ₹4,50,000 and just above 80th percentile, unknown answers, invalid state transitions and an authenticated journey against a temporary PostgreSQL database. The journey verifies source citations, cross-account isolation, direct portal rejection, image OCR, PDF extraction, applicant document review, both approval boundaries, private screenshot access, a portal-issued reference, replay behavior, audit events and sign-out revocation.

The browser test requires the bundle or supported branded Chromium channel. Think of the supplied income certificate and marksheet as fabricated demonstration evidence. The workflow does not verify their authenticity. Use the README's local walkthrough for a manual check of the frontend and API together.
With the development servers running and a successful build, run `npm run test:ui` to verify the same journey through the React app.
