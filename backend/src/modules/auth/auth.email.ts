import { createHash,randomBytes } from 'node:crypto';
import { database,Database } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';
import { sendAuthMail, safeMailFailure } from './auth.mail';

export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function emailLimit(email:string,kind:string) {
 const key=tokenHash(kind+':'+normalizeEmail(email));
 const {rows:[limit]}=await (await database()).query<{attempts:number}>(`insert into public.auth_email_limits(key) values($1)
 on conflict(key) do update set attempts=case when auth_email_limits.window_start<now()-interval '1 hour' then 1 else auth_email_limits.attempts+1 end,
 window_start=case when auth_email_limits.window_start<now()-interval '1 hour' then now() else auth_email_limits.window_start end returning attempts`,[key]);
 if (limit.attempts>5) throw new AppError('Too many requests. Try again later.',429,'RATE_LIMITED');
}
export async function issueEmail(user:{id:string;email:string},purpose:'verify'|'reset'|'invite',issuedBy:string|null=null) {
 const token=randomBytes(32).toString('base64url');
 const minutes=purpose==='reset'?env.PASSWORD_RESET_TTL_MINUTES:env.EMAIL_VERIFY_TTL_MINUTES;
 const issued=await (await database()).transaction(async db=>{
   await db.query('select id from public.users where id=$1 for update',[user.id]);
   const {rows:[recent]}=await db.query(`select id from public.auth_email_tokens where user_id=$1 and purpose=$2
     and created_at>now()-interval '1 second'*$3::int order by created_at desc limit 1`,[user.id,purpose,env.AUTH_EMAIL_COOLDOWN_SECONDS]);
   if (recent) return false;
   await db.query('delete from public.auth_email_tokens where user_id=$1 and purpose=$2',[user.id,purpose]);
   await db.query(`insert into public.auth_email_tokens(user_id,purpose,token_hash,expires_at,issued_by)
     values($1,$2,$3,now()+interval '1 minute'*$4::int,$5)`,[user.id,purpose,tokenHash(token),minutes,issuedBy]);
   return true;
 });
 if (!issued) return {sent:false,cooldown:env.AUTH_EMAIL_COOLDOWN_SECONDS};
 try {await sendAuthMail(user.email,purpose,token);return {sent:true,cooldown:env.AUTH_EMAIL_COOLDOWN_SECONDS};}
 catch(error) {
   // Only allowlisted codes, never addresses, credentials, message bodies or raw SMTP responses.
   console.warn('Auth email delivery failed',safeMailFailure(error));
   return {sent:false,cooldown:env.AUTH_EMAIL_COOLDOWN_SECONDS};
 }
}
export async function consumeEmail(db:Database,token:string,purpose:string) {
 // Lock the account before the token, matching issuance and reset lock order.
 const hash=tokenHash(token);
 const {rows:[target]}=await db.query<{user_id:string}>('select user_id from public.auth_email_tokens where token_hash=$1 and purpose=$2',[hash,purpose]);
 if (!target) throw AppError.badRequest('This link is invalid or has already been used. Request a new link.');
 await db.query('select id from public.users where id=$1 for update',[target.user_id]);
 const {rows:[record]}=await db.query<{id:string;user_id:string;issued_by:string|null}>(`update public.auth_email_tokens set consumed_at=now()
   where token_hash=$1 and purpose=$2 and consumed_at is null and expires_at>now() returning id,user_id,issued_by`,[hash,purpose]);
 if (!record) throw AppError.badRequest('This link expired or was already used. Request a new link.');
 return record;
}
export async function cleanupPendingRegistrations() {
 await (await database()).query(`delete from public.users u where registration_pending and email_verified_at is null and role='regular'
   and created_at<now()-interval '1 day'*$1::int
   and not exists(select 1 from public.citizen_scheme_watches where user_id=u.id)
   and not exists(select 1 from public.applications where user_id=u.id)
   and not exists(select 1 from public.uploaded_documents where user_id=u.id)`,[env.PENDING_REGISTRATION_DAYS]);
 await (await database()).query("delete from public.auth_email_limits where window_start<now()-interval '2 days'");
}
