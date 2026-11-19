import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

test('email verification, recovery, admin invitations and account preservation',{timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'janaseva-auth-'));
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',
   SMTP_HOST:'smtp.fixture.test',SMTP_FROM:'JANASEVA AI <sender@example.test>',APP_PUBLIC_URL:'https://janaseva.example.test',
   LLM_API_KEY:'',Adminmail:'',AdminPass:''});
 const mailer=require('nodemailer');
 const original=mailer.createTransport;
 const outbox:Array<{to:string;text:string}>=[];
 let failMail=false;
 mailer.createTransport=()=>({sendMail:async(mail:{to:string;text:string})=>{
   if (failMail) throw new Error('Controlled delivery failure');
   outbox.push(mail);return {accepted:[mail.to]};
 }});
 const {database,closeDatabase}=await import('../config/db');
 const {env}=await import('../config/env');
 const {tokenHash,cleanupPendingRegistrations}=await import('../modules/auth/auth.email');
 const {default:app}=await import('../app');
 const server=app.listen(0,'127.0.0.1');
 if (!server.listening) await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
 const db=await database();
 const email='owner@example.test',password='OriginalPassword123!';
 const payload={name:'Email owner',email:' OWNER@example.test ',password};
 async function request(path:string,body?:unknown,status=200,token?:string,method='POST') {
   const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
     body:body===undefined?undefined:JSON.stringify(body)});
   const result=await response.json() as {data:any;error?:{code:string}};
   assert.equal(response.status,status,path+' returned '+response.status);
   return result;
 }
 function deliveredToken() {
   const url=outbox[outbox.length-1].text.match(/https:\/\/[^\s]+/)![0];
   return new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
 }
 async function ageTokens() {
   await db.query("update public.auth_email_tokens set created_at=now()-interval '2 minutes'");
   await db.query('delete from public.auth_email_limits');
 }
 try {
   await request('/auth/register',{...payload,role:'admin'},400);
   const pending=await request('/auth/register',payload,201);
   assert.equal(pending.data.verification_required,true);assert.equal(pending.data.token,undefined);
   assert.equal(outbox.length,1);
   const verify=deliveredToken();
   const {rows:[stored]}=await db.query('select token_hash from public.auth_email_tokens');
   assert.equal(stored.token_hash,tokenHash(verify));assert.notEqual(stored.token_hash,verify);
   const {rows:[user]}=await db.query('select * from public.users where email=$1',[email]);
   assert.equal(user.email_verified_at,null);assert.equal(user.role,'regular');
   const fakeSession='00000000-0000-4000-8000-000000000001';
   await db.query("insert into public.citizen_sessions(id,user_id,expires_at) values($1,$2,now()+interval '1 hour')",[fakeSession,user.id]);
   const jwt=require('jsonwebtoken');
   const {jwtSecret}=await import('../config/secrets');
   const unverifiedToken=jwt.sign({id:user.id,email,sid:fakeSession},await jwtSecret(),{algorithm:'HS256'});
   await request('/citizen-schemes',undefined,403,unverifiedToken,'GET');
   const loginPending=await request('/auth/login',{email,password});
   assert.equal(loginPending.data.verification_required,true);assert.equal(outbox.length,1);
   await request('/auth/resend-verification',{email});
   assert.equal(outbox.length,1,'cooldown prevents duplicate delivery');
   await request('/auth/verify-email',undefined,404,undefined,'GET');
   assert.equal((await db.query('select email_verified_at from public.users where id=$1',[user.id])).rows[0].email_verified_at,null);
   await ageTokens();await request('/auth/resend-verification',{email});
   const replacement=deliveredToken();
   await request('/auth/verify-email',{token:verify},400);
   await db.query("update public.auth_email_tokens set expires_at=now()-interval '1 minute'");
   await request('/auth/verify-email',{token:replacement},400);
   await ageTokens();await request('/auth/resend-verification',{email});
   const valid=deliveredToken();
   await request('/auth/verify-email',{token:valid});
   await request('/auth/verify-email',{token:valid},400);
   const login=await request('/auth/login',{email,password});
   const session=login.data.token;
   await request('/citizen-schemes',undefined,200,session,'GET');
   await request('/scheme-catalog-admin',undefined,403,session,'GET');
   const forgot=await request('/auth/forgot-password',{email});
   const reset=deliveredToken();
   const unknown=await request('/auth/forgot-password',{email:'unknown@example.test'});
   assert.deepEqual(forgot.data,unknown.data);
   const newPassword='ReplacementPassword123!';
   const attempts=await Promise.all([
     fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:reset,password:newPassword,confirmation:newPassword})}),
     fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:reset,password:newPassword,confirmation:newPassword})}),
   ]);
   assert.deepEqual(attempts.map(response=>response.status).sort(),[200,400]);
   await request('/auth/login',{email,password},401);
   await request('/citizen-schemes',undefined,401,session,'GET');
   await request('/auth/reset-password',{token:reset,password:newPassword,confirmation:newPassword},400);
   const current=await request('/auth/login',{email,password:newPassword});
   await request('/auth/admin-invitations',{email:'intruder@example.test'},403,current.data.token);
   // Seed a protected, previously verified invitation administrator for invitation integration.
   await db.query("update public.users set role='admin',admin_source='invitation' where id=$1",[user.id]);
   await request('/auth/admin-invitations',{email:'invited@example.test'},200,current.data.token);
   const invitation=deliveredToken();
   const {rows:[invited]}=await db.query("select * from public.users where email='invited@example.test'");
   assert.equal(invited.role,'regular');assert.equal(invited.email_verified_at,null);
   await request('/auth/accept-invitation',{token:invitation,password:'InvitedPassword123!',confirmation:'InvitedPassword123!'});
   await request('/auth/accept-invitation',{token:invitation,password:'InvitedPassword123!',confirmation:'InvitedPassword123!'},400);
   const invitedLogin=await request('/auth/login',{email:'invited@example.test',password:'InvitedPassword123!'});
   assert.equal(invitedLogin.data.user.is_admin,true);
   await request('/scheme-catalog-admin',undefined,200,invitedLogin.data.token,'GET');
   assert.ok((await db.query('select id from public.auth_role_audit where user_id=$1 and actor_id=$2',[invited.id,user.id])).rows.length);
   failMail=true;
   const failed=await request('/auth/register',{name:'Retry owner',email:'retry@example.test',password},201);
   assert.equal(failed.data.sent,false);
   assert.equal((await db.query("select email_verified_at from public.users where email='retry@example.test'")).rows[0].email_verified_at,null);
   await ageTokens();failMail=false;
   await request('/auth/resend-verification',{email:'retry@example.test'});
   assert.equal(outbox[outbox.length-1].to,'retry@example.test');
   await db.query("update public.users set created_at=now()-interval '90 days' where email='retry@example.test'");
   await db.query("insert into public.users(name,email,password_hash,created_at) values('Legacy owner','legacy@example.test','fixture',now()-interval '90 days')");
   await cleanupPendingRegistrations();
   assert.equal((await db.query("select id from public.users where email='retry@example.test'")).rows.length,0);
   assert.equal((await db.query("select id from public.users where email='legacy@example.test'")).rows.length,1);
   await ageTokens();
   for (let count=0;count<5;count++) await request('/auth/forgot-password',{email:'rate@example.test'});
   await request('/auth/forgot-password',{email:'rate@example.test'},429);
   assert.ok(env.AUTH_EMAIL_COOLDOWN_SECONDS>=30);
 } finally {
   mailer.createTransport=original;
   await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
   await closeDatabase();await rm(directory,{recursive:true,force:true});
 }
});
