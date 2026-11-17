import { Request,Response } from 'express';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import { owned } from '../applications/workflow.repo';

export async function getTracking(req: Request,res: Response) {
  successResponse(res,await owned(String(req.params.applicationId),req.user!.id));
}
export async function getHistory(req: Request,res: Response) {
  const { id } = await owned(String(req.params.applicationId),req.user!.id);
  const db = await database();
  const { rows } = await db.query('select * from public.agent_events where application_id=$1 order by created_at desc, event_type',[id]);
  successResponse(res,rows);
}
