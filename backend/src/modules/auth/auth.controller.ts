import { issueEmail, normalizeEmail, emailLimit, consumeEmail } from './auth.email';
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

const fields = 'id, name, email, preferred_language, created_at, email_verified_at, role, admin_source';
interface User { id: string; email: string; name: string; password_hash?: string; email_verified_at?:string|null; role?:string;admin_source?:string|null }

async function signIn(user: User,admin=false,expectedPassword?:string) {
  const sid=randomUUID();
  await (await database()).transaction(async db=>{
    const {rows:[current]}=await db.query('select password_hash,email_verified_at,email,role,admin_source from public.users where id=$1 for update',[user.id]);
    const bootstrap=Boolean(admin && current?.role==='admin' && current.admin_source==='bootstrap' &&
      adminFingerprint() && normalizeEmail(current.email)===normalizeEmail(env.Adminmail));
    if ((!current?.email_verified_at && !bootstrap) || (expectedPassword && expectedPassword!==current.password_hash)) throw AppError.unauthorized('Sign in again with your current credentials.');
    await db.query("insert into public.citizen_sessions(id,user_id,expires_at,admin_fingerprint) values ($1,$2,now()+interval '12 hours',$3)",[sid,user.id,admin && user.admin_source!=='invitation'?adminFingerprint():null]);
  });
  return {user:{...user,is_admin:admin},token:jwt.sign({id:user.id,email:user.email,sid},await jwtSecret(),{algorithm:'HS256',expiresIn:'12h'})};
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  await emailLimit(input.email,'register');
  if (env.Adminmail && input.email.toLowerCase()===env.Adminmail.toLowerCase()) throw AppError.forbidden('This email is reserved for administrator sign-in.');
  const db = await database();
  const { rows: [user] } = await db.query<User>(
    `insert into public.users (id,name,email,password_hash,preferred_language,registration_pending)
     values ($1,$2,$3,$4,$5,true) on conflict do nothing returning ${fields}`,
    [randomUUID(), input.name, input.email.toLowerCase(), await bcrypt.hash(input.password,12), input.preferred_language ?? 'en']);
  if (!user) throw AppError.conflict('An account already exists for this email.');
  const delivery=await issueEmail(user,'verify');
  successResponse(res,{verification_required:true,email:user.email,...delivery},201);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  if (adminFingerprint() && input.email.toLowerCase()===env.Adminmail.toLowerCase()) {
    if (!matchesAdminPassword(input.password)) throw AppError.unauthorized('Invalid email or password');
    const {rows:[admin]}=await (await database()).query<User>(`insert into public.users(name,email,password_hash)
      values('Administrator',$1,$2) on conflict(email) do update set email=excluded.email returning ${fields}`,
      [env.Adminmail.toLowerCase(),await bcrypt.hash(randomUUID(),12)]);
    await (await database()).transaction(async db=>{
      const {rows:[current]}=await db.query('select role,admin_source from public.users where id=$1 for update',[admin.id]);
      if (current.role!=='admin' || current.admin_source!=='bootstrap') {
        await db.query("update public.users set role='admin',admin_source='bootstrap',registration_pending=false where id=$1",[admin.id]);
        await db.query("insert into public.auth_role_audit(user_id,actor_id,old_role,new_role,reason) values($1,$1,$2,'admin','Protected environment bootstrap; mailbox verification not required')",[admin.id,current.role]);
      }
      // Server provisioning authorizes this account without inventing email-verification evidence.
      await db.query("delete from public.auth_email_tokens where user_id=$1 and purpose='verify'",[admin.id]);
    });
    successResponse(res,await signIn({...admin,role:'admin',admin_source:'bootstrap'},true));return;
  }
  const { rows: [user] } = await (await database()).query<User>(
    `select ${fields}, password_hash from public.users where lower(trim(email))=$1`, [input.email.toLowerCase()]);
  if (!user?.password_hash || !(await bcrypt.compare(input.password, user.password_hash))) throw AppError.unauthorized('Invalid email or password');
  if (!user.email_verified_at) {
    await emailLimit(user.email,'verify');
    const delivery=await issueEmail(user,'verify');
    successResponse(res,{verification_required:true,email:user.email,...delivery});return;
  }
  const { password_hash: _password, ...profile } = user;
  successResponse(res, await signIn(profile,profile.role==='admin' && profile.admin_source==='invitation',user.password_hash));
}

export async function getMe(req: Request, res: Response) {
  const { rows: [user] } = await (await database()).query(`select ${fields} from public.users where id=$1`, [req.user!.id]);
  successResponse(res, { user:{...user,is_admin:Boolean(res.locals.isAdmin)} });
}

export async function logout(req: Request, res: Response) {
  await (await database()).query('delete from public.citizen_sessions where id=$1 and user_id=$2', [res.locals.sessionId, req.user!.id]);
  successResponse(res, { message: 'Signed out' });
}

export async function resendVerification(req:Request,res:Response) {
 const {email}=loginSchema.pick({email:true}).parse(req.body);
 await emailLimit(email,'verify');
 const {rows:[user]}=await (await database()).query<User>('select id,email,email_verified_at from public.users where lower(trim(email))=$1',[normalizeEmail(email)]);
 const delivery=user && !user.email_verified_at && !(adminFingerprint() && normalizeEmail(user.email)===normalizeEmail(env.Adminmail))?await issueEmail(user,'verify'):{sent:false,cooldown:env.AUTH_EMAIL_COOLDOWN_SECONDS};
 successResponse(res,{message:'If this account needs verification, an email will be sent.',cooldown:delivery.cooldown});
}
export async function confirmVerification(req:Request,res:Response) {
 const {token}=tokenInput.parse(req.body);
 await (await database()).transaction(async db=>{
   const record=await consumeEmail(db,token,'verify');
   await db.query('update public.users set email_verified_at=coalesce(email_verified_at,now()),registration_pending=false where id=$1',[record.user_id]);
   await db.query('delete from public.auth_email_tokens where user_id=$1 and purpose=$2',[record.user_id,'verify']);
   await db.query('delete from public.citizen_sessions where user_id=$1',[record.user_id]);
 });
 successResponse(res,{verified:true});
}
export async function forgotPassword(req:Request,res:Response) {
 const {email}=loginSchema.pick({email:true}).parse(req.body);
 await emailLimit(email,'reset');
 const {rows:[user]}=await (await database()).query<User>('select id,email from public.users where lower(trim(email))=$1 and email_verified_at is not null',[normalizeEmail(email)]);
 if (user && normalizeEmail(email)!==env.Adminmail.toLowerCase()) await issueEmail(user,'reset');
 successResponse(res,{message:"If an eligible account exists, we’ll send a reset link.",cooldown:env.AUTH_EMAIL_COOLDOWN_SECONDS});
}
import { z } from 'zod';
const tokenInput=z.object({token:z.string().min(32).max(120)});
const newPasswordInput=tokenInput.extend({password:registerSchema.shape.password,confirmation:z.string()})
 .refine(input=>input.password===input.confirmation,'Passwords do not match.');
export async function resetPassword(req:Request,res:Response) {
 const input=newPasswordInput.parse(req.body);
 const password=await bcrypt.hash(input.password,12);
 await (await database()).transaction(async db=>{
   const record=await consumeEmail(db,input.token,'reset');
   await db.query('update public.users set password_hash=$2 where id=$1 and email_verified_at is not null',[record.user_id,password]);
   await db.query('delete from public.citizen_sessions where user_id=$1',[record.user_id]);
   await db.query("delete from public.auth_email_tokens where user_id=$1 and purpose='reset'",[record.user_id]);
 });
 successResponse(res,{reset:true});
}
export async function inviteAdmin(req:Request,res:Response) {
 if (!res.locals.isAdmin) throw AppError.forbidden('Administrator sign-in required.');
 const {email}=loginSchema.pick({email:true}).parse(req.body);
 await emailLimit(email,'invite');
 const {rows:[user]}=await (await database()).query<User>(`insert into public.users(name,email,password_hash,registration_pending)
   values('Invited administrator',$1,$2,true) on conflict(email) do update set email=excluded.email returning id,email`,
   [normalizeEmail(email),await bcrypt.hash(randomUUID(),12)]);
 const delivery=await issueEmail(user,'invite',req.user!.id);
 successResponse(res,{message:delivery.sent?'Invitation sent.':'Invitation could not be sent. Retry after the cooldown.',cooldown:delivery.cooldown});
}
export async function acceptAdminInvitation(req:Request,res:Response) {
 const input=newPasswordInput.parse(req.body);
 const password=await bcrypt.hash(input.password,12);
 await (await database()).transaction(async db=>{
   const record=await consumeEmail(db,input.token,'invite');
   const {rows:[user]}=await db.query('select role from public.users where id=$1',[record.user_id]);
   await db.query("update public.users set role='admin',admin_source='invitation',email_verified_at=coalesce(email_verified_at,now()),registration_pending=false,password_hash=$2 where id=$1",[record.user_id,password]);
   await db.query("insert into public.auth_role_audit(user_id,actor_id,old_role,new_role,reason) values($1,$2,$3,'admin','Verified single-use email invitation')",[record.user_id,record.issued_by,user.role]);
   await db.query('delete from public.citizen_sessions where user_id=$1',[record.user_id]);
   await db.query('delete from public.auth_email_tokens where user_id=$1',[record.user_id]);
 });
 successResponse(res,{accepted:true});
}
