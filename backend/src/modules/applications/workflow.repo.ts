import { z } from 'zod';
import { database, Database } from '../../config/db';
import { AppError } from '../../shared/errors';
import { env } from '../../config/env';
import { EligibilityResult, WorkflowState } from '../../shared/types';
import { Applicant } from '../eligibility/eligibility.engine';
import { WorkflowStateMachine } from './workflow.state';

export interface ApplicationRow {
  id: string;
  user_id: string;
  scheme_id: string;
  workflow_state: WorkflowState;
  applicant_data_json: Partial<Applicant>;
  eligibility_result: EligibilityResult | null;
  browser_phase: string | null;
  browser_active?: boolean;
  browser_started_at: Date | string | null;
  revision: number;
  reference_number: string | null;
}

export async function owned(id: string, userId: string, db?: Database, lock = false) {
  const { rows:[app] } = await (db ?? await database()).query<ApplicationRow>(
    `select a.*, row_to_json(s.*) as scheme
      from public.applications a join public.schemes s on a.scheme_id=s.id
      where a.id=$1 and a.user_id=$2 ${lock ? 'for update of a' : ''}`, [z.uuid().parse(id),userId]);
  if (!app) throw AppError.notFound('Application not found');
  return { ...app, browser_active: browserActive(app) };
}
export function browserActive(app: ApplicationRow) {
  return Boolean(app.browser_phase && app.browser_started_at &&
    Date.now() - new Date(app.browser_started_at).getTime() < Math.max(180000,env.BROWSER_TIMEOUT * 15));
}

export async function record(db: Database, applicationId: string, event: string, action: string,
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS' | 'PENDING_APPROVAL' = 'SUCCESS') {
  await db.query(
    'insert into public.agent_events(application_id,event_type,action_name,execution_status,created_at) values($1,$2,$3,$4,clock_timestamp())',
    [applicationId,event,action,status]);
}

export async function step(db: Database, app: ApplicationRow, next: WorkflowState) {
  WorkflowStateMachine.validateTransition(app.workflow_state,next);
  await db.query('update public.applications set workflow_state=$2, updated_at=now(), revision=revision+1 where id=$1',[app.id,next]);
  app.workflow_state = next;
  app.revision += 1;
}

export function checkRevision(app: ApplicationRow, revision: number) {
  if (app.revision !== revision) throw AppError.conflict('This application changed. Reload and review the latest version.');
}

export const editable = ['ELIGIBILITY_PENDING','DOCUMENTS_PENDING'];
