// ============================================================================
// JANASEVA AI - Shared TypeScript Types & Interfaces
// ============================================================================

export type WorkflowState =
  | 'REQUESTED'
  | 'SERVICE_IDENTIFIED'
  | 'POLICY_RETRIEVED'
  | 'ELIGIBILITY_PENDING'
  | 'ELIGIBILITY_COMPLETED'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_READY'
  | 'APPLICATION_PREPARED'
  | 'APPROVAL_PENDING'
  | 'BROWSER_EXECUTION_PENDING'
  | 'FORM_FILLED'
  | 'FINAL_APPROVAL_PENDING'
  | 'SUBMISSION_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ConditionResult = 'PASS' | 'FAIL' | 'MISSING' | 'NEEDS_REVIEW';

export type OverallEligibility =
  | 'ELIGIBLE'
  | 'CONDITIONALLY_ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'INSUFFICIENT_INFORMATION';

export type DocumentType =
  | 'INCOME_CERTIFICATE'
  | 'STUDENT_ID'
  | 'MARKSHEET'
  | 'BONAFIDE_CERTIFICATE'
  | 'CASTE_CERTIFICATE'
  | 'OTHER';

export type ValidationStatus = 'PENDING' | 'VALID' | 'INVALID' | 'NEEDS_REVIEW';

export type ApprovalType = 'APPLICATION_PREPARATION' | 'FINAL_SUBMISSION';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type BrowserSessionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export interface User {
  id: string;
  name: string;
  email: string;
  preferred_language?: 'en' | 'te';
  created_at: string;
}

export interface Scheme {
  id: string;
  scheme_name: string;
  description: string;
  department: string;
  official_url: string;
  eligibility_rules_json: Record<string, any>;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  last_verified_at?: string;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  scheme_id: string;
  workflow_state: WorkflowState;
  applicant_data_json: Record<string, any>;
  eligibility_result?: EligibilityResult;
  prepared_at?: string;
  submitted_at?: string;
  reference_number?: string;
  created_at: string;
  updated_at: string;
  scheme?: Scheme;
}

export interface PolicyDocument {
  id: string;
  scheme_id: string;
  title: string;
  source_url: string;
  document_version: string;
  publication_date?: string;
  last_verified_at: string;
  storage_path?: string;
  processing_status: 'PENDING' | 'PROCESSING' | 'INDEXED' | 'FAILED';
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  policy_document_id: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  page_number?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface UploadedDocument {
  id: string;
  user_id: string;
  application_id?: string;
  document_type: DocumentType;
  storage_path: string;
  extracted_data_json: Record<string, any>;
  validation_status: ValidationStatus;
  created_at: string;
}

export interface EligibilityCondition {
  condition: string;
  result: ConditionResult;
  user_value?: string | number | null;
  required_value?: string | number | null;
  evidence?: string;
  explanation: string;
}

export interface EligibilityResult {
  overall: OverallEligibility;
  conditions: EligibilityCondition[];
  missing_fields?: string[];
  summary?: string;
}

export interface EligibilityCheckRecord {
  id: string;
  application_id: string;
  condition_name: string;
  result: ConditionResult;
  user_value?: string;
  required_value?: string;
  evidence?: string;
  explanation?: string;
  created_at: string;
}

export interface Approval {
  id: string;
  application_id: string;
  approval_type: ApprovalType;
  status: ApprovalStatus;
  approved_at?: string;
  created_at: string;
}

export interface AgentEvent {
  id: string;
  application_id?: string;
  event_type: string;
  action_name: string;
  input_summary?: Record<string, any>;
  output_summary?: Record<string, any>;
  execution_status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS' | 'PENDING_APPROVAL';
  error_message?: string;
  created_at: string;
}

export interface BrowserSession {
  id: string;
  application_id: string;
  session_status: BrowserSessionStatus;
  current_step?: string;
  screenshot_path?: string;
  started_at: string;
  completed_at?: string;
}

export interface Citation {
  source_document_name: string;
  section?: string;
  page?: number;
  official_url: string;
  evidence: string;
  verified_date: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  suggested_actions?: string[];
  timestamp: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
