-- ============================================================================
-- JANASEVA AI - Initial Database Schema Migration (001_initial_schema.sql)
-- ============================================================================

-- Enable required extensions

CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    preferred_language VARCHAR(10) DEFAULT 'en' CHECK (preferred_language IN ('en', 'te')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. schemes
CREATE TABLE IF NOT EXISTS schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(255) NOT NULL,
    official_url TEXT NOT NULL,
    eligibility_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. policy_documents
CREATE TABLE IF NOT EXISTS policy_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL,
    document_version VARCHAR(50) DEFAULT '1.0',
    publication_date DATE,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    storage_path TEXT,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'PROCESSING', 'INDEXED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. document_chunks (for pgvector RAG)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_document_id UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- default 768 for gemini text-embedding-004
    page_number INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. applications
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
    workflow_state VARCHAR(50) NOT NULL DEFAULT 'REQUESTED' CHECK (workflow_state IN (
        'REQUESTED',
        'SERVICE_IDENTIFIED',
        'POLICY_RETRIEVED',
        'ELIGIBILITY_PENDING',
        'ELIGIBILITY_COMPLETED',
        'DOCUMENTS_PENDING',
        'DOCUMENTS_READY',
        'APPLICATION_PREPARED',
        'APPROVAL_PENDING',
        'BROWSER_EXECUTION_PENDING',
        'FORM_FILLED',
        'FINAL_APPROVAL_PENDING',
        'SUBMISSION_COMPLETED',
        'FAILED',
        'CANCELLED'
    )),
    applicant_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    eligibility_result JSONB,
    prepared_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    reference_number VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. uploaded_documents
CREATE TABLE IF NOT EXISTS uploaded_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL CHECK (document_type IN (
        'INCOME_CERTIFICATE',
        'STUDENT_ID',
        'MARKSHEET',
        'BONAFIDE_CERTIFICATE',
        'CASTE_CERTIFICATE',
        'OTHER'
    )),
    storage_path TEXT NOT NULL,
    extracted_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN (
        'PENDING',
        'VALID',
        'INVALID',
        'NEEDS_REVIEW'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. eligibility_checks
CREATE TABLE IF NOT EXISTS eligibility_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    condition_name VARCHAR(100) NOT NULL,
    result VARCHAR(50) NOT NULL CHECK (result IN ('PASS', 'FAIL', 'MISSING', 'NEEDS_REVIEW')),
    user_value TEXT,
    required_value TEXT,
    evidence TEXT,
    explanation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. approvals
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN ('APPLICATION_PREPARATION', 'FINAL_SUBMISSION')),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. agent_events (Audit Trail)
CREATE TABLE IF NOT EXISTS agent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    action_name VARCHAR(100) NOT NULL,
    input_summary JSONB DEFAULT '{}'::jsonb,
    output_summary JSONB DEFAULT '{}'::jsonb,
    execution_status VARCHAR(50) NOT NULL CHECK (execution_status IN ('SUCCESS', 'FAILED', 'IN_PROGRESS', 'PENDING_APPROVAL')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. browser_sessions
CREATE TABLE IF NOT EXISTS browser_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    session_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (session_status IN (
        'PENDING',
        'RUNNING',
        'PAUSED_FOR_APPROVAL',
        'COMPLETED',
        'FAILED',
        'ABORTED'
    )),
    current_step VARCHAR(100),
    screenshot_path TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance & vector search
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_schemes_status ON schemes(status);
CREATE INDEX IF NOT EXISTS idx_policy_documents_scheme_id ON policy_documents(scheme_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_policy_doc ON document_chunks(policy_document_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_scheme_id ON applications(scheme_id);
CREATE INDEX IF NOT EXISTS idx_applications_workflow_state ON applications(workflow_state);
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_app_id ON uploaded_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_user_id ON uploaded_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_checks_app_id ON eligibility_checks(application_id);
CREATE INDEX IF NOT EXISTS idx_approvals_app_id ON approvals(application_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_app_id ON agent_events(application_id);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_app_id ON browser_sessions(application_id);

-- Trigger to auto-update updated_at timestamp on applications
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_applications_updated_at ON applications;
CREATE TRIGGER trigger_applications_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
