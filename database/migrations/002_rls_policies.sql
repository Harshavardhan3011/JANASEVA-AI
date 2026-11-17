-- ============================================================================
-- JANASEVA AI - Row Level Security Policies (002_rls_policies.sql)
-- ============================================================================

-- Enable RLS on user-specific tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;

-- Schemes and policy documents are public read
ALTER TABLE schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Public read for schemes & policy documents
CREATE POLICY "Public schemes read" ON schemes
    FOR SELECT USING (true);

CREATE POLICY "Public policy documents read" ON policy_documents
    FOR SELECT USING (true);

CREATE POLICY "Public document chunks read" ON document_chunks
    FOR SELECT USING (true);

-- User table access policies
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Application policies: users own their applications
CREATE POLICY "Users can view own applications" ON applications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own applications" ON applications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications" ON applications
    FOR UPDATE USING (auth.uid() = user_id);

-- Uploaded documents policies
CREATE POLICY "Users can view own documents" ON uploaded_documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upload documents" ON uploaded_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON uploaded_documents
    FOR DELETE USING (auth.uid() = user_id);

-- Eligibility checks: linked to application
CREATE POLICY "Users view checks for own application" ON eligibility_checks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM applications
            WHERE applications.id = eligibility_checks.application_id
            AND applications.user_id = auth.uid()
        )
    );

-- Approvals: linked to application
CREATE POLICY "Users view approvals for own application" ON approvals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM applications
            WHERE applications.id = approvals.application_id
            AND applications.user_id = auth.uid()
        )
    );

-- Agent events: linked to application
CREATE POLICY "Users view events for own application" ON agent_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM applications
            WHERE applications.id = agent_events.application_id
            AND applications.user_id = auth.uid()
        )
    );

-- Browser sessions: linked to application
CREATE POLICY "Users view browser sessions for own application" ON browser_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM applications
            WHERE applications.id = browser_sessions.application_id
            AND applications.user_id = auth.uid()
        )
    );
