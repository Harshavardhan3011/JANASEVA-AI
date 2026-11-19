import { env } from '../../config/env';
import { adminFingerprint, matchesAdminPassword } from './admin.credentials';
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

async function signIn(user: User,admin=false) {
  const sid = randomUUID();
  await (await database()).query("insert into public.citizen_sessions(id,user_id,expires_at,admin_fingerprint) values ($1,$2,now()+interval '12 hours',$3)", [sid, user.id,admin?adminFingerprint():null]);
  return { user:{...user,is_admin:admin}, token: jwt.sign({ id: user.id, email: user.email, sid }, await jwtSecret(), { algorithm: 'HS256', expiresIn: '12h' }) };
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  if (env.Adminmail && input.email.toLowerCase()===env.Adminmail.toLowerCase()) throw AppError.forbidden('This email is reserved for administrator sign-in.');
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
  if (adminFingerprint() && input.email.toLowerCase()===env.Adminmail.toLowerCase()) {
    if (!matchesAdminPassword(input.password)) throw AppError.unauthorized('Invalid email or password');
    const {rows:[admin]}=await (await database()).query<User>(`insert into public.users(name,email,password_hash)
      values('Administrator',$1,$2) on conflict(email) do update set email=excluded.email returning ${fields}`,
      [env.Adminmail.toLowerCase(),await bcrypt.hash(randomUUID(),12)]);
    successResponse(res,await signIn(admin,true));return;
  }
  const { rows: [user] } = await (await database()).query<User>(
    `select ${fields}, password_hash from public.users where email=$1`, [input.email.toLowerCase()]);
  if (!user?.password_hash || !(await bcrypt.compare(input.password, user.password_hash))) throw AppError.unauthorized('Invalid email or password');
  const { password_hash: _password, ...profile } = user;
  successResponse(res, await signIn(profile));
}

export async function getMe(req: Request, res: Response) {
  const { rows: [user] } = await (await database()).query(`select ${fields} from public.users where id=$1`, [req.user!.id]);
  successResponse(res, { user:{...user,is_admin:Boolean(res.locals.isAdmin)} });
}

export async function logout(req: Request, res: Response) {
  await (await database()).query('delete from public.citizen_sessions where id=$1 and user_id=$2', [res.locals.sessionId, req.user!.id]);
  successResponse(res, { message: 'Signed out' });
}
