import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { database } from '../../config/db';
import { jwtSecret } from '../../config/secrets';
import { registerSchema, loginSchema } from './auth.schemas';
import { AppError } from '../../shared/errors';
import { successResponse } from '../../shared/response';

const fields = 'id, name, email, preferred_language, created_at';
interface User { id: string; email: string; name: string; password_hash?: string }

async function signIn(user: User) {
  const sid = randomUUID();
  await (await database()).query("insert into public.citizen_sessions(id,user_id,expires_at) values ($1,$2,now()+interval '12 hours')", [sid, user.id]);
  return { user, token: jwt.sign({ id: user.id, email: user.email, sid }, await jwtSecret(), { algorithm: 'HS256', expiresIn: '12h' }) };
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const db = await database();
  const { rows: [user] } = await db.query<User>(
    `insert into public.users (id,name,email,password_hash,preferred_language)
     values ($1,$2,$3,$4,$5) on conflict (email) do nothing returning ${fields}`,
    [randomUUID(), input.name, input.email.toLowerCase(), await bcrypt.hash(input.password,12), input.preferred_language ?? 'en']);
  if (!user) throw AppError.conflict('An account already exists for this email.');
  successResponse(res, await signIn(user), 201);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { rows: [user] } = await (await database()).query<User>(
    `select ${fields}, password_hash from public.users where email=$1`, [input.email.toLowerCase()]);
  if (!user?.password_hash || !(await bcrypt.compare(input.password, user.password_hash))) throw AppError.unauthorized('Invalid email or password');
  const { password_hash: _password, ...profile } = user;
  successResponse(res, await signIn(profile));
}

export async function getMe(req: Request, res: Response) {
  const { rows: [user] } = await (await database()).query(`select ${fields} from public.users where id=$1`, [req.user!.id]);
  successResponse(res, { user });
}

export async function logout(req: Request, res: Response) {
  await (await database()).query('delete from public.citizen_sessions where id=$1 and user_id=$2', [res.locals.sessionId, req.user!.id]);
  successResponse(res, { message: 'Signed out' });
}
