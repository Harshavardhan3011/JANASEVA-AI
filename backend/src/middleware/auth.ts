import { Request, Response, NextFunction } from 'express';
import { adminFingerprint } from '../modules/auth/admin.credentials';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { database } from '../config/db';
import { jwtSecret } from '../config/secrets';
import { AppError } from '../shared/errors';

const payload = z.object({ id: z.uuid(), email: z.email(), sid: z.uuid() });
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('Authentication token required');
  let session;
  try { session = payload.parse(jwt.verify(header.slice(7), await jwtSecret(), { algorithms: ['HS256'] })); }
  catch { throw AppError.unauthorized('Invalid or expired session'); }
  const { rows } = await (await database()).query(
    'select id,admin_fingerprint from public.citizen_sessions where id=$1 and user_id=$2 and expires_at>now()', [session.sid,session.id]);
  if (!rows.length) throw AppError.unauthorized('Session has ended');
  res.locals.isAdmin=Boolean(rows[0].admin_fingerprint && rows[0].admin_fingerprint===adminFingerprint());
  req.user = { id: session.id, email: session.email };
  res.locals.sessionId = session.sid;
  next();
}
