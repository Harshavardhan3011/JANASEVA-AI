# JANASEVA AI
## Autonomous Public Service Execution Agent
### Software Requirements Specification (SRS) & Technical Implementation Blueprint

**Project Category:** Agentic AI / Digital Governance  
**Hackathon Track:** Track 1 – Civic Pulse, Digital Governance & Public Information  
**Development Duration:** 48 Hours  
**Development Model:** Individual Developer + AI Coding Agents  
**Project Type:** Full-Stack AI Web Application

---

# 1. PROJECT OVERVIEW

## 1.1 Project Vision

JANASEVA AI is an AI-powered autonomous public service assistant that simplifies government-service applications by transforming complex administrative procedures into guided, intelligent and partially automated workflows.

Citizens should not need to understand complicated government websites, search through multiple notifications or manually interpret every application requirement.

They should be able to explain what they need in natural language.

JANASEVA AI then identifies relevant services, retrieves official government guidelines, evaluates eligibility, identifies required documents, prepares application information and uses browser automation to complete supported application workflows with human authorization.

## 1.2 Core Product Philosophy

The platform must follow three principles:

1. **Intelligence:** Understand citizen requirements and government policies.
2. **Execution:** Perform meaningful multi-step tasks rather than merely generating answers.
3. **Trust:** Maintain source citations, transparent decisions, human approval and an auditable execution history.

## 1.3 Primary Use Case

A student wants to apply for a government scholarship.

The student describes their situation in natural language.

JANASEVA AI:

1. Understands the request.
2. Identifies potentially relevant scholarship schemes.
3. Retrieves official scheme guidelines.
4. Evaluates eligibility using deterministic rules.
5. Identifies missing information and documents.
6. Accepts and processes supporting documents.
7. Prepares the application.
8. Requests user approval.
9. Uses Playwright to interact with a supported application portal.
10. Validates the completed form.
11. Requests final submission authorization.
12. Records the result and available application reference information.

The initial implementation must focus on one complete scholarship workflow rather than attempting to integrate every government service.

---

# 2. PROJECT SCOPE

## 2.1 Must-Have Features

The following features are mandatory for the first working version.

| ID | Feature | Priority |
|---|---|---|
| F01 | Citizen authentication | High |
| F02 | AI conversational interface | Critical |
| F03 | Natural-language intent detection | Critical |
| F04 | Government scheme discovery | Critical |
| F05 | Official-document RAG | Critical |
| F06 | Source citations | Critical |
| F07 | Deterministic eligibility evaluation | Critical |
| F08 | Document upload and OCR | High |
| F09 | Missing-document detection | High |
| F10 | Application preparation | Critical |
| F11 | Browser automation using Playwright | Critical |
| F12 | Human approval workflow | Critical |
| F13 | Application tracking dashboard | High |
| F14 | Agent execution history | High |
| F15 | Error handling and recovery | Critical |

## 2.2 Secondary Features

Implement these only after the core workflow is functional.

- Telugu and English language support.
- Voice input and output.
- Multiple scheme recommendations.
- Automated form-field mapping.
- Browser navigation recovery.
- Email notifications.
- Downloadable application summaries.
- Administrative document management.

## 2.3 Explicitly Out of Scope

Do not implement these in the initial hackathon version:

- Integration with every Indian government portal.
- Real payment processing.
- CAPTCHA bypass.
- OTP interception or authentication bypass.
- Unauthorized government account access.
- Autonomous submission without user approval.
- Training a foundation language model.
- Building a custom OCR model.
- Mobile applications.
- Complex multi-agent frameworks without a demonstrated need.

---

# 3. TECHNICAL STACK

Use the following stack consistently throughout the project.

## 3.1 Frontend

- React 19
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Axios
- Lucide React
- React Hook Form
- Zod
- Recharts (for dashboard visualizations)

## 3.2 Backend

- Node.js
- Express.js
- TypeScript
- Zod validation
- REST API architecture
- JWT authentication or Supabase Auth integration

## 3.3 AI Layer

- Gemini API or OpenAI API
- Provider-independent LLM service interface
- Function/tool calling
- Structured JSON outputs
- Retrieval-Augmented Generation (RAG)
- Embedding-based document retrieval

Never hardcode API keys or tie application business logic directly to one model provider.

Create an abstraction that allows changing the LLM provider without rewriting the application.

## 3.4 Database and Storage

- Supabase PostgreSQL
- pgvector extension for embeddings
- Supabase Storage for uploaded documents
- Supabase Auth where applicable

Use Row Level Security (RLS) for user-specific records and private document access.

## 3.5 Browser Automation

- Playwright
- Chromium
- Dedicated browser automation service
- Explicit workflow states
- Screenshot capture
- Controlled retries
- Human authorization checkpoints

## 3.6 Document Processing

- PDF text extraction
- Tesseract OCR or an OCR API
- Structured field extraction using LLMs
- Zod validation for extracted data

## 3.7 Deployment

- Frontend: Vercel
- Backend: Render or another Node-compatible hosting service
- Database: Supabase
- Browser automation: Backend worker or supported browser execution environment

Do not assume browser automation will work in a serverless function with unrestricted browser dependencies. Verify the selected hosting environment before deployment.

---

# 4. SYSTEM ARCHITECTURE

Implement the application using modular architecture.

## 4.1 High-Level Architecture

Citizen
    |
    v
React Frontend
    |
    v
Express API Backend
    |
    v
AI Orchestrator
    |
    +---- Intent Detection
    |
    +---- Service Discovery
    |
    +---- Policy RAG
    |
    +---- Eligibility Engine
    |
    +---- Document Intelligence
    |
    +---- Application Preparation
    |
    +---- Human Approval
    |
    +---- Playwright Browser Agent
    |
    +---- Application Tracking
    |
    v
Supabase PostgreSQL + Storage

## 4.2 AI Orchestrator

The AI orchestrator is the central coordination component.

It must:

- Understand the citizen's request.
- Identify the requested service.
- Determine which tools are necessary.
- Maintain workflow state.
- Invoke tools in the correct order.
- Validate tool outputs.
- Handle missing information.
- Avoid repeating completed tasks.
- Stop when human approval is required.
- Record every important action.

The orchestrator must not have unrestricted access to arbitrary backend operations.

Use a controlled set of tools with predefined schemas.

## 4.3 Required AI Tools

Implement these tools as independent backend services.

### Tool 1: discoverServices

Input:
- User request
- Location
- Citizen category
- Relevant user context

Output:
- Matching scheme IDs
- Scheme names
- Official source URLs
- Relevance explanation

### Tool 2: retrievePolicyEvidence

Input:
- Scheme ID
- User question
- Optional search query

Output:
- Relevant document sections
- Source title
- Source URL
- Document version or verification date
- Extracted evidence

### Tool 3: evaluateEligibility

Input:
- Scheme ID
- Structured user information

Output:
- Overall assessment
- Individual condition results
- Missing information
- Supporting evidence

The tool must execute deterministic rules rather than ask an LLM to independently decide eligibility.

### Tool 4: processDocuments

Input:
- Uploaded document ID
- Expected document type

Output:
- Detected document type
- Extracted fields
- Validation results
- Missing fields
- Review warnings

### Tool 5: prepareApplication

Input:
- Scheme ID
- Verified user information
- Extracted document information

Output:
- Structured application data
- Missing fields
- Validation errors
- Application readiness status

### Tool 6: executeBrowserWorkflow

Input:
- Application ID
- Approved workflow ID
- Permitted browser actions

Output:
- Execution status
- Completed steps
- Screenshots
- Validation errors
- Next required action

This tool must never independently authorize final submission.

### Tool 7: getApplicationStatus

Input:
- Application ID

Output:
- Current status
- Completed steps
- Pending actions
- Available reference number
- Execution history

---

# 5. AGENT WORKFLOW AND STATE MANAGEMENT

Use a deterministic workflow state machine.

Required states:

REQUESTED
SERVICE_IDENTIFIED
POLICY_RETRIEVED
ELIGIBILITY_PENDING
ELIGIBILITY_COMPLETED
DOCUMENTS_PENDING
DOCUMENTS_READY
APPLICATION_PREPARED
APPROVAL_PENDING
BROWSER_EXECUTION_PENDING
FORM_FILLED
FINAL_APPROVAL_PENDING
SUBMISSION_COMPLETED
FAILED
CANCELLED

Allowed transitions must be explicitly validated.

Example:

REQUESTED
    |
SERVICE_IDENTIFIED
    |
POLICY_RETRIEVED
    |
ELIGIBILITY_COMPLETED
    |
DOCUMENTS_READY
    |
APPLICATION_PREPARED
    |
APPROVAL_PENDING
    |
BROWSER_EXECUTION_PENDING
    |
FORM_FILLED
    |
FINAL_APPROVAL_PENDING
    |
SUBMISSION_COMPLETED

The backend must reject invalid transitions.

Persist workflow state in the database so that page refreshes, server restarts and interrupted workflows do not silently lose progress.

---

# 6. RETRIEVAL-AUGMENTED GENERATION (RAG)

## 6.1 Purpose

The RAG system provides reliable answers based on indexed government documents.

It must prioritize official government sources.

## 6.2 Initial Knowledge Base

Start with a small, curated set of official scholarship documents.

Each document should have:

- Document ID
- Scheme ID
- Document title
- Government department
- Source URL
- Publication date, when available
- Effective date, when available
- Last verified date
- Document version
- Extracted text
- Embedding vectors

Never present sample documents as verified official policy documents.

## 6.3 RAG Pipeline

1. Upload or ingest an authorized source document.
2. Extract PDF text.
3. Clean and normalize the extracted content.
4. Divide the document into meaningful chunks.
5. Generate embeddings.
6. Store chunks and embeddings in pgvector.
7. Retrieve relevant chunks using semantic search.
8. Filter by scheme and document status.
9. Pass evidence to the LLM.
10. Generate a structured answer.
11. Attach source citations.

## 6.4 Citation Requirements

Every policy-related response must provide:

- Source document name.
- Relevant section or page, where available.
- Official source URL.
- Supporting evidence.
- Last verified date.

If evidence is insufficient, the system must say that the answer could not be verified.

It must not invent a government rule or source.

---

# 7. ELIGIBILITY ENGINE

Eligibility evaluation must use deterministic business rules.

Do not rely on free-form LLM reasoning for final eligibility decisions.

## 7.1 Example Rules

For a sample scholarship:

- Student enrollment status.
- Academic qualification.
- Annual family income threshold.
- Category or certificate requirements.
- Institution eligibility.
- Other scheme-specific conditions.

The actual rules must be populated from the selected official scheme guidelines.

## 7.2 Output Structure

Each condition should return:

{
  "condition": "annual_family_income",
  "result": "PASS",
  "user_value": 150000,
  "required_value": 250000,
  "evidence": "Official guideline reference",
  "explanation": "Income is within the stated threshold"
}

Allowed results:

- PASS
- FAIL
- MISSING
- NEEDS_REVIEW

Overall results:

- ELIGIBLE
- CONDITIONALLY_ELIGIBLE
- NOT_ELIGIBLE
- INSUFFICIENT_INFORMATION

The engine must distinguish an unknown value from a failed condition.

The LLM can explain results but cannot change them.

---

# 8. DOCUMENT INTELLIGENCE

## 8.1 Supported Documents

For the initial version:

- Income certificate
- Student identity document
- Academic marksheet
- Bonafide certificate
- Category certificate, if relevant to the chosen scheme

## 8.2 Processing Pipeline

Upload
  -> File validation
  -> Private storage
  -> Text extraction/OCR
  -> Structured field extraction
  -> Schema validation
  -> Missing field detection
  -> User review

## 8.3 Required Safeguards

- Restrict file types and file sizes.
- Validate actual file content.
- Store documents privately.
- Never expose private storage URLs publicly.
- Do not trust OCR output without user review.
- Never claim authenticity based only on OCR.
- Avoid retaining unnecessary sensitive information.

---

# 9. BROWSER AUTOMATION

This is the signature feature of JANASEVA AI.

## 9.1 Initial Implementation Strategy

Create a local mock scholarship portal.

This portal should imitate a real application website and include:

- Login/demo access.
- Applicant information form.
- Academic details.
- Family income information.
- Document checklist.
- Application review.
- Submission confirmation.
- Demo reference number.

Use Playwright to interact with this portal.

## 9.2 Browser Agent Capabilities

The browser agent should:

1. Open the approved portal.
2. Inspect the current page.
3. Identify expected form fields.
4. Map structured application data to fields.
5. Fill the permitted fields.
6. Validate required information.
7. Detect errors.
8. Capture screenshots.
9. Save execution results.
10. Stop at the authorization checkpoint.

## 9.3 Failure Recovery

Handle:

- Missing form fields.
- Unexpected navigation.
- Page loading failures.
- Timeouts.
- Invalid form values.
- Changed page structure.
- Interrupted browser sessions.

Use bounded retries.

Do not repeatedly execute an action that might have already succeeded.

## 9.4 Human Authorization

Two separate approvals are mandatory:

**Approval 1: Application preparation**

The user confirms the collected information and authorizes browser form preparation.

**Approval 2: Final submission**

The user reviews the completed form and explicitly authorizes submission.

The system must not interpret ordinary chat messages as sufficient authorization for consequential actions.

Never bypass CAPTCHA, OTP, payment verification or portal security mechanisms.

The mock portal should clearly identify its submissions as demonstrations.

---

# 10. DATABASE DESIGN

Create the following tables.

## 10.1 users

- id
- name
- email
- preferred_language
- created_at

## 10.2 schemes

- id
- scheme_name
- description
- department
- official_url
- eligibility_rules_json
- status
- last_verified_at
- created_at

## 10.3 policy_documents

- id
- scheme_id
- title
- source_url
- document_version
- publication_date
- last_verified_at
- storage_path
- processing_status

## 10.4 document_chunks

- id
- policy_document_id
- chunk_index
- content
- embedding
- page_number
- metadata

## 10.5 applications

- id
- user_id
- scheme_id
- workflow_state
- applicant_data_json
- eligibility_result
- prepared_at
- submitted_at
- reference_number
- created_at
- updated_at

## 10.6 uploaded_documents

- id
- user_id
- application_id
- document_type
- storage_path
- extracted_data_json
- validation_status
- created_at

## 10.7 eligibility_checks

- id
- application_id
- condition_name
- result
- user_value
- required_value
- evidence
- explanation
- created_at

## 10.8 approvals

- id
- application_id
- approval_type
- status
- approved_at
- created_at

## 10.9 agent_events

- id
- application_id
- event_type
- action_name
- input_summary
- output_summary
- execution_status
- error_message
- created_at

## 10.10 browser_sessions

- id
- application_id
- session_status
- current_step
- screenshot_path
- started_at
- completed_at

Use UUID primary keys, foreign keys, appropriate indexes and database constraints.

Use JSONB for flexible structured fields.

Do not store passwords, OTPs, API secrets or unnecessary identity information in audit records.

---

# 11. API SPECIFICATION

All backend routes must use consistent JSON response structures.

Base URL:

/api/v1

## Authentication

POST /auth/register

POST /auth/login

GET /auth/me

POST /auth/logout

## AI Assistant

POST /assistant/chat

POST /assistant/continue

GET /assistant/conversations

GET /assistant/conversations/:id

## Scheme Discovery

GET /schemes

GET /schemes/:id

POST /schemes/search

## Policy Intelligence

POST /policy/query

GET /policy/documents

POST /policy/documents/ingest

## Eligibility

POST /eligibility/evaluate

GET /eligibility/:applicationId

## Documents

POST /documents/upload

GET /documents/:id

POST /documents/:id/process

DELETE /documents/:id

## Applications

POST /applications

GET /applications

GET /applications/:id

POST /applications/:id/prepare

POST /applications/:id/approve-preparation

POST /applications/:id/approve-submission

POST /applications/:id/cancel

## Browser Automation

POST /browser/:applicationId/start

GET /browser/:applicationId/status

GET /browser/:applicationId/events

## Tracking

GET /tracking/:applicationId

GET /tracking/:applicationId/history

## System

GET /health

GET /ready

Protect all private endpoints with authentication and ownership checks.

Validate all request bodies using Zod.

Never trust application IDs supplied by a client without checking user ownership.

---

# 12. FRONTEND REQUIREMENTS

The interface must look like a professional government technology platform.

Design principles:

- Clean, modern, light interface.
- White or very light background.
- Professional blue/teal accent colors.
- Clear typography.
- Minimal visual clutter.
- Responsive desktop and mobile layouts.
- Accessible form controls.
- Meaningful loading and error states.
- No unnecessary animations.
- No exaggerated AI-generated visual effects.

## 12.1 Required Pages

### Page 1: Landing Page

Include:

- JANASEVA AI branding.
- Product description.
- Key capabilities.
- How it works.
- Supported services.
- Sign-in and registration links.

### Page 2: Authentication

Include:

- Registration.
- Login.
- Form validation.
- Error messages.
- Secure session handling.

### Page 3: Main Dashboard

Include:

- Welcome section.
- Start a new application.
- Recent applications.
- Pending approvals.
- Application statistics.
- Recent activity.

### Page 4: AI Assistant

Include:

- Chat interface.
- Message history.
- Natural-language input.
- Language selection.
- Source citations.
- Scheme recommendations.
- Workflow status.
- Document upload.

### Page 5: Eligibility Results

Include:

- Overall eligibility status.
- Individual conditions.
- Pass/fail/missing status.
- Supporting evidence.
- Next steps.

### Page 6: Document Center

Include:

- Upload area.
- Uploaded documents.
- Detected document type.
- Extracted fields.
- Validation status.
- Missing document warnings.

### Page 7: Application Review

Include:

- Applicant information.
- Selected scheme.
- Eligibility summary.
- Document checklist.
- Form data.
- Preparation approval.
- Final submission approval.

### Page 8: Browser Execution Monitor

Include:

- Current browser workflow state.
- Completed steps.
- Pending steps.
- Error messages.
- Screenshots.
- Execution history.

### Page 9: Application Tracking

Include:

- Application reference.
- Current status.
- Progress timeline.
- Submission receipt, if available.
- Audit history.

---

# 13. ERROR HANDLING AND RELIABILITY

Implement centralized error handling.

Required cases:

- LLM API failure.
- LLM rate limiting.
- Invalid model response.
- Embedding service failure.
- Document extraction failure.
- OCR failure.
- Unsupported document format.
- Database connection failure.
- Authentication failure.
- Invalid workflow transition.
- Browser timeout.
- Browser navigation failure.
- Duplicate execution attempt.
- Unauthorized submission attempt.

Use:

- Structured logging.
- Request IDs.
- Workflow IDs.
- Bounded retries.
- Idempotency checks.
- Graceful error messages.
- Persistent workflow states.

If the AI provider fails, do not fabricate answers. Preserve completed workflow data and explain which feature is temporarily unavailable.

---

# 14. SECURITY REQUIREMENTS

Security is a core requirement, not an optional enhancement.

1. Keep API keys in environment variables.
2. Never expose secret keys to the frontend.
3. Use authenticated endpoints.
4. Enforce row-level access controls.
5. Validate all user inputs.
6. Restrict uploaded file types and sizes.
7. Store documents in private storage.
8. Prevent unauthorized browser access.
9. Require explicit approval for consequential actions.
10. Sanitize browser and document inputs.
11. Treat retrieved web content as untrusted data.
12. Prevent prompt injection from documents and websites from overriding system instructions.
13. Keep sensitive information out of logs.
14. Implement reasonable API rate limits.
15. Provide document deletion functionality.

The browser agent must operate within an allowlisted set of permitted domains and actions.

---

# 15. TESTING REQUIREMENTS

Create a reproducible test suite.

## 15.1 Functional Tests

- User registration and login.
- Scheme discovery.
- Policy retrieval.
- Source citation generation.
- Eligibility evaluation.
- Document upload.
- OCR extraction.
- Application preparation.
- Approval handling.
- Browser form completion.
- Application tracking.

## 15.2 Eligibility Test Cases

Test at least these scenarios:

1. All eligibility conditions satisfied.
2. Income above the allowed threshold.
3. Missing mandatory certificate.
4. Student status not verified.
5. Incomplete application data.
6. Conflicting extracted information.

## 15.3 Browser Tests

Test:

1. Successful form completion.
2. Missing required field.
3. Invalid field value.
4. Unexpected page navigation.
5. Browser timeout.
6. User cancellation.
7. Submission blocked without approval.
8. Duplicate submission prevention.

## 15.4 Security Tests

Test:

- Unauthorized application access.
- Cross-user document access.
- Invalid file upload.
- Missing authentication token.
- Invalid approval requests.
- Attempts to invoke restricted browser actions.

## 15.5 Acceptance Criteria

The MVP is complete only when:

- A citizen can register and log in.
- The user can describe a service requirement in natural language.
- The AI can identify a supported scholarship scheme.
- The system can retrieve relevant official policy evidence.
- Policy answers include source references.
- Eligibility conditions are evaluated deterministically.
- Documents can be uploaded and processed.
- Missing information is identified.
- An application can be prepared.
- The user must explicitly approve browser preparation.
- Playwright can complete the mock application form.
- Final submission is blocked until explicit approval.
- A successful mock submission generates a demo reference number.
- Application status and execution history persist after refresh.
- Errors are handled without losing workflow data.

---

# 16. 48-HOUR IMPLEMENTATION PLAN

## Phase 1: Foundation (Hours 0–4)

- Inspect the repository.
- Initialize frontend and backend.
- Configure Supabase.
- Set up environment variables.
- Create database schema.
- Establish API conventions.
- Create base UI.

Deliverable: Running full-stack application.

## Phase 2: AI Intelligence (Hours 4–12)

- Integrate LLM provider.
- Build conversational interface.
- Implement intent detection.
- Implement scheme discovery.
- Implement RAG.
- Add source citations.

Deliverable: AI assistant that understands scholarship requirements and answers from official documents.

## Phase 3: Eligibility and Documents (Hours 12–20)

- Implement eligibility rules.
- Create document upload.
- Integrate OCR.
- Build structured extraction.
- Detect missing documents.
- Connect all services.

Deliverable: Complete eligibility and document assessment.

## Phase 4: Application Automation (Hours 20–30)

- Create mock scholarship portal.
- Build Playwright worker.
- Implement field mapping.
- Implement form validation.
- Add approval checkpoints.
- Add browser screenshots.
- Implement failure handling.

Deliverable: Working autonomous browser workflow.

## Phase 5: Tracking and UI (Hours 30–38)

- Build application dashboard.
- Add status tracking.
- Implement agent history.
- Improve interface.
- Add responsive design.
- Add Telugu language support if feasible.

Deliverable: Integrated end-to-end application.

## Phase 6: Testing and Submission (Hours 38–48)

- Run functional tests.
- Run security checks.
- Fix critical bugs.
- Verify deployed environment.
- Prepare demo data.
- Record backup demonstration.
- Prepare architecture documentation.
- Prepare hackathon presentation.

Deliverable: Tested, demonstrable hackathon MVP.

---

# 17. PROJECT STRUCTURE

Use a clean modular monorepo.

janaseva-ai/
|
|-- frontend/
|   |-- src/
|       |-- components/
|       |-- pages/
|       |-- layouts/
|       |-- hooks/
|       |-- services/
|       |-- contexts/
|       |-- types/
|       |-- utils/
|       |-- routes/
|       |-- styles/
|
|-- backend/
|   |-- src/
|       |-- config/
|       |-- middleware/
|       |-- modules/
|       |   |-- auth/
|       |   |-- assistant/
|       |   |-- schemes/
|       |   |-- policy/
|       |   |-- eligibility/
|       |   |-- documents/
|       |   |-- applications/
|       |   |-- browser/
|       |   |-- tracking/
|       |-- ai/
|       |   |-- orchestrator/
|       |   |-- providers/
|       |   |-- tools/
|       |   |-- rag/
|       |-- workers/
|       |-- shared/
|       |-- utils/
|       |-- tests/
|
|-- mock-portal/
|   |-- src/
|   |-- tests/
|
|-- database/
|   |-- migrations/
|   |-- seed/
|
|-- docs/
|   |-- architecture.md
|   |-- api-specification.md
|   |-- setup-guide.md
|   |-- testing-guide.md
|
|-- .env.example
|-- .gitignore
|-- README.md
|-- package.json

The coding agent may adjust this structure when necessary, but it must preserve clear frontend, backend, AI, database and browser-automation boundaries.

---

# 18. ENVIRONMENT CONFIGURATION

Create an `.env.example` file.

Include appropriate placeholders for:

NODE_ENV=
PORT=

FRONTEND_URL=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=

EMBEDDING_PROVIDER=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=

JWT_SECRET=

STORAGE_BUCKET=

BROWSER_HEADLESS=
BROWSER_TIMEOUT=

Never commit actual credentials.

The service-role key must remain exclusively on the backend.

Document which variables are mandatory and which are optional.

---

# 19. REQUIRED PROJECT DELIVERABLES

The final repository must contain:

1. Complete React frontend.
2. Complete Node.js backend.
3. Working AI orchestrator.
4. Working RAG pipeline.
5. Curated scholarship knowledge base.
6. Deterministic eligibility engine.
7. Document upload and processing.
8. Functional mock scholarship portal.
9. Playwright browser automation.
10. Human approval workflow.
11. Application tracking.
12. Database migrations.
13. Seed data.
14. Automated tests.
15. `.env.example`.
16. Complete README.
17. Architecture documentation.
18. API documentation.
19. Setup and deployment instructions.
20. Demo credentials and test scenario, using non-sensitive sample data.

---

# 20. IMPLEMENTATION RULES FOR AI CODING AGENTS

These instructions are mandatory.

## Rule 1: Repository Inspection First

Before changing any files:

- Inspect the entire existing repository structure.
- Read package.json files.
- Read existing documentation.
- Inspect existing components and API routes.
- Inspect existing database configuration.
- Identify reusable code.
- Identify existing bugs.
- Identify incomplete implementations.

Do not assume the repository is empty.

## Rule 2: Architecture Before Implementation

Create an implementation plan based on this specification.

Identify dependencies and implementation order.

Do not start by generating hundreds of unrelated files.

## Rule 3: Preserve Existing Working Functionality

Do not unnecessarily replace working configurations, dependencies or existing features.

Explain any architectural change before implementing it.

## Rule 4: Complete Implementations Only

When modifying a file:

- Provide the complete updated file.
- Do not leave partial code snippets as the implementation.
- Do not leave placeholder functions.
- Do not leave TODO comments for mandatory features.
- Do not create fake API integrations.
- Do not claim functionality works without testing it.

## Rule 5: No Fake AI Features

Every advertised AI feature must connect to a real implemented service or a clearly identified deterministic fallback.

Do not create a button that merely displays a hardcoded success message.

Mock data is permitted only when clearly identified as demo data.

## Rule 6: API Contract Consistency

Frontend and backend must share consistent request and response schemas.

Do not independently invent API structures in different modules.

Use shared TypeScript types or a documented API contract.

## Rule 7: Database Integrity

Create version-controlled database migrations.

Do not rely on manually created production tables.

Provide repeatable seed scripts.

Verify database constraints and access policies.

## Rule 8: Security

Do not expose credentials, disable authentication, bypass RLS or remove authorization checks to make the demo work.

## Rule 9: Testing

After each major implementation phase:

- Run type checking.
- Run linting.
- Run relevant tests.
- Run production builds.
- Fix all critical errors before proceeding.

## Rule 10: Final Verification

At completion, provide:

- Implemented feature list.
- Incomplete feature list.
- Files created and modified.
- Database migration status.
- API endpoint status.
- Test results.
- Build results.
- Deployment status.
- Exact setup commands.
- Known limitations.

Never claim deployment or integration success unless it has been verified.

---

# 21. DEFINITION OF DONE

JANASEVA AI must demonstrate the following complete scenario:

A citizen describes a scholarship requirement.

The AI identifies a relevant scheme and retrieves its official guidelines.

The eligibility engine evaluates the user's information.

The document processor identifies missing information.

The user completes the missing requirements.

The system prepares the application.

The user authorizes browser execution.

Playwright opens the mock government portal and fills the form.

The system validates the form and requests final submission approval.

The user approves the action.

The mock application is submitted.

The system generates a demonstration reference number.

The dashboard displays the completed workflow and its audit history.

All important states survive page refreshes.

No mandatory feature is represented by a fake success response.

**This complete end-to-end journey is the primary acceptance test for the hackathon project.**

---

# FINAL DEVELOPMENT DIRECTIVE

Build JANASEVA AI as a reliable, explainable, agentic public-service execution platform.

Prioritize one complete scholarship workflow over broad but incomplete government-service coverage.

Use real AI capabilities for natural-language understanding, policy retrieval, tool selection and structured document interpretation.

Use deterministic business logic for eligibility and workflow validation.

Use Playwright for genuine browser interaction.

Require explicit human authorization for consequential actions.

Maintain traceability for every important decision and execution step.

The final product must be a functional full-stack application, not a static prototype, presentation-only concept or chatbot demonstration.

**Success means demonstrating that an AI system can move from understanding a citizen's request to preparing and executing a real browser workflow safely, transparently and reliably.**