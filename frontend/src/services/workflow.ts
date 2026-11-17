import { api } from './api';
import { isAxiosError } from 'axios';

export interface Details {
  name:string; institution_name:string; course_name:string;
  annual_family_income:number; board_percentile:number; regular_degree:boolean;
  recognized_institution:boolean; other_scholarship:boolean; gap_after_class_xii:boolean; fresh_first_year:boolean; board_listed:boolean;
}
export interface Application {
  id:string; workflow_state:string; revision:number; created_at:string; updated_at:string;
  browser_phase:string|null; browser_active?:boolean; reference_number?:string; submitted_at?:string;
  scheme?:{ scheme_name:string; official_url:string; description:string };
  applicant_data_json:Partial<Details>;
  eligibility_result?:{ overall:string; summary:string; conditions:Array<{ condition:string; result:string; required_value:string; evidence:string }> };
}
export interface CitizenDocument {
  id:string; application_id:string; document_type:string; validation_status:string;
  extracted_data_json:Record<string,string|number|boolean>;
}
export interface BrowserStatus { id:string; session_status:string; current_step:string; screenshot_path:string|null }
export const labels:Record<string,string> = {
  ELIGIBILITY_PENDING:'Eligibility screening', DOCUMENTS_PENDING:'Evidence review',
  APPROVAL_PENDING:'Ready for browser approval', BROWSER_EXECUTION_PENDING:'Browser preparation',
  FINAL_APPROVAL_PENDING:'Ready for final approval', SUBMISSION_COMPLETED:'Demo submitted', CANCELLED:'Cancelled',
};
export const documentLabels:Record<string,string> = {
  INCOME_CERTIFICATE:'Income certificate', MARKSHEET:'Class XII marksheet', STUDENT_ID:'Student ID',
  BONAFIDE_CERTIFICATE:'Bonafide certificate', CASTE_CERTIFICATE:'Category certificate',
};
export const statusLabel = (state:string) => labels[state] ?? state.replace(/_/g,' ').toLowerCase();
export const errorMessage = (error:unknown) => isAxiosError(error) ?
  error.response?.data?.error?.message || 'The service could not be reached. Try again.' :
  'Something went wrong. Try again.';
export async function startApplication(schemeId?: string) {
  const result = await api.post<{ data:Application }>('/applications',{ scheme_id: schemeId });
  return result.data.data;
}
