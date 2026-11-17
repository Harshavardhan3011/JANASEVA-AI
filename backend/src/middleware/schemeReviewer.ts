import { timingSafeEqual } from 'node:crypto';
import { Request,Response,NextFunction } from 'express';
import { monitorSecret } from '../config/secrets';
import { AppError } from '../shared/errors';

export async function requireSchemeReviewer(req:Request,_res:Response,next:NextFunction) {
  const expected=Buffer.from(await monitorSecret());
  const supplied=Buffer.from(req.get('x-scheme-monitor-key') || '');
  if (!expected.length || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {
    throw AppError.forbidden('Enter the scheme monitor review key.');
  }
  next();
}
