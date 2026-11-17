# REST API

Base path is `/api/v1`. A successful data response uses `{"success":true,"data":…}`. Errors use `{"success":false,"error":{"code":"…","message":"…"}}`. Health endpoints expose service status and the screenshot endpoint returns a private PNG.

Send `Authorization: Bearer <token>` for authenticated endpoints. Register and login return a user and a token. Logout invalidates that session. An unknown or another citizen's record returns 404.

| Method and path | Behavior |
| --- | --- |
| GET `/health`, `/ready` | Process and database readiness |
| POST `/auth/register`, `/auth/login` | Create an account/session or authenticate with email and password |
| GET `/auth/me`, POST `/auth/logout` | Read profile or end session |
| GET `/schemes`, `/schemes/:id` | Published active scheme |
| POST `/schemes/search` | Search with `query` |
| POST `/policy/query`, GET `/policy/documents` | Search with `question` or list verified editions |
| POST `/assistant/chat`, `/assistant/continue` | Send `message` and optional `conversation_id` |
| GET `/assistant/conversations`, `/assistant/conversations/:id` | List and load owned history |
| POST `/eligibility/evaluate` | Screen partial `applicant_data` without saving |
| GET `/eligibility/:applicationId` | Read an owned saved assessment |
| POST `/applications`, GET `/applications`, `/applications/:id` | Create, list or retrieve application |
| POST `/applications/:id/prepare` | Validate and save `applicant_data` with current `revision`. Enforce required reviewed documents |
| POST `/applications/:id/approve-preparation` | Supply `authorized: true` and current `revision` |
| POST `/browser/:applicationId/start` | Fill the demo form at the browser checkpoint |
| GET `/browser/:applicationId/status`, `/events`, `/screenshot` | Owned browser state, workflow events and private PNG. The latter two paths share the application prefix |
| POST `/applications/:id/approve-submission` | Supply `authorized: true` and current `revision`. Sends the demo form and returns receipt only on confirmation |
| POST `/applications/:id/cancel` | Cancel an allowed application |
| POST `/documents/upload` | Multipart fields `document`, `application_id`, `document_type` |
| GET `/documents`, `/documents/:id` | Owned metadata, optional application filter on list |
| POST `/documents/:id/process`, `/documents/:id/review` | Re-extract fields or confirm with `reviewed: true` |
| DELETE `/documents/:id` | Remove owned document from an editable application |
| GET `/tracking/:applicationId`, `/tracking/:applicationId/history` | Owned status and audit events |

The policy corpus is seeded from curated Ministry passages. Vector indexing is an operator command. An operator can POST to `/policy/documents/ingest` with `source` set to `guidelines` or `faq` and the independent `POLICY_INGEST_KEY` bearer credential. Intake archives the allowlisted Ministry PDF for review. Publication of updated excerpts and eligibility rules requires a reviewed seed update.
