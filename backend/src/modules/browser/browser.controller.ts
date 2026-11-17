import { Request,Response } from 'express';
import { database } from '../../config/db';
import { putPrivate,readPrivate } from '../../config/files';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { browserActive,checkRevision,owned,record,step } from '../applications/workflow.repo';
import { applicantSchema } from '../eligibility/eligibility.engine';
import { BrowserAutomationService } from './browser.service';

export async function executePhase(id: string,user: { id:string },phase: 'fill'|'submit',revision?: number) {
  const db = await database();
  const reservation = await db.transaction(async tx => {
    const app = await owned(id,user.id,tx,true);
    const expected = phase === 'fill' ? 'BROWSER_EXECUTION_PENDING' : 'FINAL_APPROVAL_PENDING';
    if ((phase === 'submit' && app.workflow_state === 'SUBMISSION_COMPLETED') ||
        (phase === 'fill' && app.workflow_state === 'FINAL_APPROVAL_PENDING')) return null;
    if (revision !== undefined) checkRevision(app,revision);
    if (app.workflow_state !== expected) throw AppError.conflict('The required approval checkpoint has not been reached.');
    if (browserActive(app)) {
      throw AppError.conflict('A browser operation is already running.');
    }
    if (app.browser_phase) {
      await tx.query("update public.browser_sessions set session_status='FAILED',current_step='Previous browser lease expired',completed_at=now() where id=$1",[app.browser_phase]);
      await record(tx,id,'BROWSER_LEASE_EXPIRED',phase,'FAILED');
    }
    const data = applicantSchema.parse(app.applicant_data_json);
    const { rows:[session] } = await tx.query<{ id:string }>(
      "insert into public.browser_sessions(application_id,session_status,current_step) values($1,'RUNNING',$2) returning id",
      [id,phase === 'fill' ? 'Filling mock portal form' : 'Sending approved demo form']);
    await tx.query('update public.applications set browser_phase=$2,browser_started_at=now(),revision=revision+1 where id=$1',[id,session.id]);
    if (phase === 'submit') {
      const approval = await tx.query(`insert into public.approvals(application_id,approval_type,status,approved_at)
        select $1,'FINAL_SUBMISSION','APPROVED',now() where not exists (
          select 1 from public.approvals where application_id=$1 and approval_type='FINAL_SUBMISSION' and status='APPROVED'
        ) returning id`,[id]);
      await record(tx,id,approval.rows.length ? 'CHECKPOINT_2_APPROVED' : 'SUBMISSION_RETRY_AUTHORIZED','approveSubmission');
    }
    await record(tx,id,'BROWSER_STARTED',phase,'IN_PROGRESS');
    return { data, sessionId:session.id };
  });
  if (!reservation) return owned(id,user.id);
  const { data,sessionId } = reservation;
  const key = `${user.id}/${id}/${sessionId}.png`;
  try {
    const outcome = await BrowserAutomationService.execute(id,data,phase);
    let screenshot: string | null = null;
    if (outcome.screenshot) {
      try {
        await putPrivate(key,outcome.screenshot,'image/png');
        screenshot = key;
      } catch (error) {
        if (phase === 'fill') throw error;
      }
    }
    await db.transaction(async tx => {
      const app = await owned(id,user.id,tx,true);
      if (app.browser_phase !== sessionId) throw AppError.conflict('Browser session was replaced');
      if (phase === 'fill') {
        await step(tx,app,'FORM_FILLED');
        await step(tx,app,'FINAL_APPROVAL_PENDING');
      } else {
        await step(tx,app,'SUBMISSION_COMPLETED');
        await tx.query('update public.applications set submitted_at=now(),reference_number=$2 where id=$1',[id,outcome.reference]);
      }
      await tx.query('update public.applications set browser_phase=null,browser_started_at=null where id=$1',[id]);
      await tx.query('update public.browser_sessions set session_status=$2,current_step=$3,screenshot_path=$4,completed_at=now() where id=$1',[
        sessionId,phase === 'fill' ? 'PAUSED_FOR_APPROVAL' : 'COMPLETED',
        phase === 'fill' ? 'Mock form validated. Waiting for final approval.' : 'Mock portal receipt received.',screenshot]);
      await record(tx,id,phase === 'fill' ? 'BROWSER_FORM_FILLED' : 'DEMO_SUBMITTED',phase,
        phase === 'fill' ? 'PENDING_APPROVAL' : 'SUCCESS');
    });
  } catch {
    await db.transaction(async tx => {
      const app = await owned(id,user.id,tx,true);
      if (app.browser_phase === sessionId) {
        await tx.query('update public.applications set browser_phase=null,browser_started_at=null where id=$1',[id]);
        await tx.query("update public.browser_sessions set session_status='FAILED',current_step='Browser operation failed. You can retry.',completed_at=now() where id=$1",[sessionId]);
        await record(tx,id,'BROWSER_FAILED',phase,'FAILED');
      }
    });
    throw new AppError('The mock portal operation could not be confirmed. Reload the review and retry.',502,'BROWSER_FAILED');
  }
  return owned(id,user.id);
}

export async function startBrowserExecution(req:Request,res:Response) {
  successResponse(res,await executePhase(String(req.params.applicationId),req.user!,'fill'));
}
export async function getBrowserStatus(req:Request,res:Response) {
  const { id } = await owned(String(req.params.applicationId),req.user!.id);
  const { rows:[session] } = await (await database()).query(
    'select id,session_status,current_step,(select p.screenshot_path from public.browser_sessions p where p.application_id=$1 and p.screenshot_path is not null order by p.started_at desc limit 1) as screenshot_path,started_at,completed_at from public.browser_sessions where application_id=$1 order by started_at desc limit 1',[id]);
  successResponse(res,session ? { ...session,screenshot_path:session.screenshot_path ? `/browser/${id}/screenshot` : null } : null);
}
export async function getBrowserScreenshot(req:Request,res:Response) {
  const { id } = await owned(String(req.params.applicationId),req.user!.id);
  const { rows:[session] } = await (await database()).query<{ screenshot_path:string }>(
    'select screenshot_path from public.browser_sessions where application_id=$1 and screenshot_path is not null order by started_at desc limit 1',[id]);
  if (!session) throw AppError.notFound('Screenshot not available');
  res.set('Cache-Control','private, no-store').type('png').send(await readPrivate(session.screenshot_path));
}
