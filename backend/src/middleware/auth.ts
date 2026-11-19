import { Request, Response, NextFunction } from 'express';
import { adminFingerprint } from '../modules/auth/admin.credentials';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { database } from '../config/db';
import { jwtSecret } from '../config/secrets';
import { AppError } from '../shared/errors';

const payload = z.object({ id: z.uuid(), email: z.email(), sid: z.uuid() });
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  res.set('Cache-Control','no-store');
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('Authentication token required');
  let session;
  try { session = payload.parse(jwt.verify(header.slice(7), await jwtSecret(), { algorithms: ['HS256'] })); }
  catch { throw AppError.unauthorized('Invalid or expired session'); }
  const { rows } = await (await database()).query(
    'select s.id,s.admin_fingerprint,u.email,u.email_verified_at,u.role,u.admin_source from public.citizen_sessions s join public.users u on u.id=s.user_id where s.id=$1 and s.user_id=$2 and s.expires_at>now()', [session.sid,session.id]);
  if (!rows.length) throw AppError.unauthorized('Session has ended');
  const bootstrap=Boolean(rows[0].role==='admin' && rows[0].admin_source==='bootstrap' &&
    rows[0].admin_fingerprint && rows[0].admin_fingerprint===adminFingerprint() && rows[0].email.trim().toLowerCase()===env.Adminmail.toLowerCase());
  if (rows[0].admin_fingerprint && !bootstrap) throw AppError.unauthorized('Administrator credentials changed. Sign in again.');
  if (!rows[0].email_verified_at && !bootstrap) throw new AppError('Verify your email before signing in.',403,'EMAIL_VERIFICATION_REQUIRED');
  res.locals.isAdmin=bootstrap || Boolean(rows[0].role==='admin' && rows[0].admin_source==='invitation');
  req.user = { id: session.id, email: session.email };
  res.locals.sessionId = session.sid;
  next();
}
