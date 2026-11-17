import { Request, Response } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { SCHEME_ID, retrievePolicyEvidence } from '../policy/policy.controller';
import { applicantSchema, evaluateEligibility } from '../eligibility/eligibility.engine';
import { checkRevision, editable, owned, record, step } from './workflow.repo';
import { executePhase } from '../browser/browser.controller';

export const requiredDocs = ['INCOME_CERTIFICATE','MARKSHEET'] as const;
const approval = z.object({ authorized:z.literal(true), revision:z.number().int().nonnegative() });

export async function createApplication(req: Request, res: Response) {
  z.object({ scheme_id:z.literal(SCHEME_ID).optional() }).parse(req.body);
  const user = req.user!;
  const db = await database();
  const evidence = await retrievePolicyEvidence('family income percentile regular degree');
  if (!evidence.length) throw new AppError('No verified evidence is available for this scheme.',503,'POLICY_UNAVAILABLE');
  const id = await db.transaction(async tx => {
    const { rows:[created] } = await tx.query<{ id:string }>(
      "insert into public.applications(user_id,scheme_id,workflow_state) values($1,$2,'REQUESTED') returning id",
      [user.id,SCHEME_ID]);
    const app = await owned(created.id,user.id,tx,true);
    await record(tx,app.id,'REQUESTED','createApplication');
    await step(tx,app,'SERVICE_IDENTIFIED');
    await record(tx,app.id,'SERVICE_IDENTIFIED','discoverServices');
    await step(tx,app,'POLICY_RETRIEVED');
    await tx.query('update public.applications set policy_citations=CAST($2 AS jsonb) where id=$1',[app.id,JSON.stringify(evidence)]);
    await record(tx,app.id,'POLICY_RETRIEVED','retrievePolicyEvidence');
    await step(tx,app,'ELIGIBILITY_PENDING');
    return app.id;
  });
  successResponse(res,await owned(id,user.id),201);
}

export async function getApplications(req: Request, res: Response) {
  const { rows } = await (await database()).query(
    'select a.*,row_to_json(s.*) as scheme from public.applications a join public.schemes s on s.id=a.scheme_id where a.user_id=$1 order by a.created_at desc',
    [req.user!.id]);
  successResponse(res,rows);
}

export async function getApplicationById(req: Request,res: Response) {
  successResponse(res,await owned(String(req.params.id),req.user!.id));
}

export async function prepareApplication(req: Request,res: Response) {
  const input = z.object({ applicant_data:applicantSchema, revision:z.number().int().nonnegative() }).parse(req.body);
  const userId = req.user!.id;
  const id = String(req.params.id);
  const db = await database();
  const outcome = await db.transaction(async tx => {
    const app = await owned(id,userId,tx,true);
    checkRevision(app,input.revision);
    if (!editable.includes(app.workflow_state) || app.scheme_id !== SCHEME_ID) throw AppError.conflict('This application cannot be edited.');
    const eligibility = evaluateEligibility(input.applicant_data);
    await tx.query('update public.applications set applicant_data_json=$2, eligibility_result=$3, revision=revision+1,updated_at=now() where id=$1',
      [app.id,JSON.stringify(input.applicant_data),JSON.stringify(eligibility)]);
    await tx.query('delete from public.eligibility_checks where application_id=$1',[app.id]);
    for (const item of eligibility.conditions) {
      await tx.query(`insert into public.eligibility_checks
        (application_id,condition_name,result,user_value,required_value,evidence,explanation)
        values($1,$2,$3,$4,$5,$6,$7)`, [
        app.id,item.condition,item.result,String(item.user_value),String(item.required_value),item.evidence,item.explanation]);
    }
    await record(tx,app.id,'ELIGIBILITY_EVALUATED','evaluateEligibility');
    if (eligibility.overall !== 'ELIGIBLE') {
      if (app.workflow_state === 'DOCUMENTS_PENDING') await step(tx,app,'ELIGIBILITY_PENDING');
      return { missing_documents: [] };
    }
    if (app.workflow_state === 'ELIGIBILITY_PENDING') {
      await step(tx,app,'ELIGIBILITY_COMPLETED');
      await step(tx,app,'DOCUMENTS_PENDING');
    }
    const { rows } = await tx.query<{ document_type:string }>(
      "select document_type from public.uploaded_documents where application_id=$1 and user_id=$2 and validation_status='VALID'",[app.id,userId]);
    const missing = requiredDocs.filter(type => !rows.some(row => row.document_type === type));
    if (missing.length) return { missing_documents:missing };
    await step(tx,app,'DOCUMENTS_READY');
    await step(tx,app,'APPLICATION_PREPARED');
    await tx.query('update public.applications set prepared_at=now() where id=$1',[app.id]);
    await record(tx,app.id,'APPLICATION_PREPARED','prepareApplication');
    await step(tx,app,'APPROVAL_PENDING');
    return { missing_documents:[] };
  });
  successResponse(res,{ ...await owned(id,userId), ...outcome });
}

export async function approvePreparation(req: Request,res: Response) {
  const input = approval.parse(req.body);
  const id = String(req.params.id);
  const user = req.user!;
  const db = await database();
  await db.transaction(async tx => {
    const app = await owned(id,user.id,tx,true);
    checkRevision(app,input.revision);
    if (app.workflow_state !== 'APPROVAL_PENDING') throw AppError.conflict('The application must be prepared before browser approval.');
    await step(tx,app,'BROWSER_EXECUTION_PENDING');
    await tx.query("insert into public.approvals(application_id,approval_type,status,approved_at) values($1,'APPLICATION_PREPARATION','APPROVED',now())",[id]);
    await record(tx,id,'CHECKPOINT_1_APPROVED','approvePreparation');
  });
  successResponse(res,await owned(id,user.id));
}

export async function approveSubmission(req: Request,res: Response) {
  const input = approval.parse(req.body);
  successResponse(res,await executePhase(String(req.params.id),req.user!,'submit',input.revision));
}

export async function cancelApplication(req: Request,res: Response) {
  const db = await database();
  const id = String(req.params.id);
  await db.transaction(async tx => {
    const app = await owned(id,req.user!.id,tx,true);
    if (app.browser_phase || !app.workflow_state || app.workflow_state === 'SUBMISSION_COMPLETED') throw AppError.conflict('The application cannot be cancelled in this state.');
    const previousApproval = await tx.query("select id from public.approvals where application_id=$1 and approval_type='FINAL_SUBMISSION' and status='APPROVED' limit 1",[id]);
    if (previousApproval.rows.length) throw AppError.conflict('A final approval is already recorded. Retry the demo submission to reconcile its receipt.');
    await step(tx,app,'CANCELLED');
    await record(tx,app.id,'CANCELLED','cancelApplication');
  });
  successResponse(res,await owned(id,req.user!.id));
}
