import { Request,Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../../shared/response';
import { applicantSchema,evaluateEligibility } from './eligibility.engine';
import { owned } from '../applications/workflow.repo';

export async function evaluate(req: Request,res: Response) {
  const { applicant_data } = z.object({ applicant_data:applicantSchema.partial() }).parse(req.body);
  successResponse(res,evaluateEligibility(applicant_data));
}
export async function getApplicationEligibility(req: Request,res: Response) {
  const app = await owned(String(req.params.applicationId),req.user!.id);
  successResponse(res,app.eligibility_result);
}
