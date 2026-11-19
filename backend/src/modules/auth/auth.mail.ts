import nodemailer from 'nodemailer';
import addressparser from 'nodemailer/lib/addressparser';
import { z } from 'zod';
import { env } from '../../config/env';

export function safeMailFailure(error:unknown) {
 const code=(error as {code?:unknown}|null)?.code;
 const known=['EAUTH','ETIMEDOUT','ECONNECTION','ECONNREFUSED','ENOTFOUND','EDNS','ESOCKET','ETLS','EENVELOPE','EMESSAGE',
   'BREVO_AUTH_FAILED','BREVO_PERMISSION_DENIED','BREVO_RATE_LIMITED','BREVO_REQUEST_REJECTED','BREVO_UNAVAILABLE','BREVO_CONNECTION_FAILED','MAIL_SENDER_INVALID'];
 const response=(error as {responseCode?:unknown}|null)?.responseCode;
 return {code:typeof code==='string' && known.includes(code)?code:'SMTP_FAILURE',
   responseCode:typeof response==='number' && response>=400 && response<=599?response:undefined};
}
function missingMailSettings() {
 const keys=env.BREVO_API_KEY?['SMTP_FROM','APP_PUBLIC_URL']:['SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM','APP_PUBLIC_URL'];
 return keys.filter(key=>!env[key as keyof typeof env]);
}
function sender() {
 const addresses=addressparser(env.SMTP_FROM,{flatten:true});
 if (addresses.length!==1 || !z.email().safeParse(addresses[0].address).success)
   throw Object.assign(new Error('Configure one verified sender.'),{code:'MAIL_SENDER_INVALID'});
 return {email:addresses[0].address,name:addresses[0].name || 'JANASEVA AI'};
}
async function brevo(path:'/account'|'/smtp/email',body?:unknown) {
 let response:Response;
 try {
   response=await fetch('https://api.brevo.com/v3'+path,{method:body?'POST':'GET',redirect:'error',
     headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',Accept:'application/json'},
     body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 } catch {throw Object.assign(new Error('Brevo HTTPS connection failed.'),{code:'BREVO_CONNECTION_FAILED'});}
 if (!response.ok) {
   await response.body?.cancel();
   const code=response.status===401?'BREVO_AUTH_FAILED':response.status===403?'BREVO_PERMISSION_DENIED':
     response.status===429?'BREVO_RATE_LIMITED':response.status>=500?'BREVO_UNAVAILABLE':'BREVO_REQUEST_REJECTED';
   throw Object.assign(new Error('Brevo email request was rejected.'),{code,responseCode:response.status});
 }
 await response.body?.cancel();
}
function transport() {
 return nodemailer.createTransport({
   host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_SECURE || env.SMTP_PORT===465,
   requireTLS:!(env.SMTP_SECURE || env.SMTP_PORT===465),auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined,
   connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
   logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
 });
}
// This connects and authenticates only; it never sends an email or logs transport exceptions.
export async function checkAuthMail() {
 const missing=missingMailSettings();
 if (missing.length) return {ready:false,code:env.BREVO_API_KEY?'BREVO_NOT_CONFIGURED':'SMTP_NOT_CONFIGURED',missing};
 if (env.NODE_ENV==='production' && new URL(env.APP_PUBLIC_URL!).protocol!=='https:') return {ready:false,code:'SMTP_PUBLIC_URL_REQUIRES_HTTPS'};
 if (env.BREVO_API_KEY) {
   try {sender();await brevo('/account');return {ready:true,code:'BREVO_API_READY',provider:'brevo-https'};}
   catch(error) {return {ready:false,...safeMailFailure(error),provider:'brevo-https'};}
 }
 const smtp=transport();
 try {await smtp.verify();return {ready:true,code:'SMTP_CONNECTION_READY',port:env.SMTP_PORT};}
 catch(error) {return {ready:false,...safeMailFailure(error),port:env.SMTP_PORT};}
 finally {smtp.close();}
}

export async function sendAuthMail(email:string,purpose:'verify'|'reset'|'invite',token:string) {
 if ((!env.BREVO_API_KEY && !env.SMTP_HOST) || !env.SMTP_FROM || !env.APP_PUBLIC_URL) throw new Error('Email delivery is not configured.');
 const base=new URL(env.APP_PUBLIC_URL);
 if (env.NODE_ENV==='production' && base.protocol!=='https:') throw new Error('The public application URL must use HTTPS.');
 const path=purpose==='reset'?'/reset-password':purpose==='invite'?'/accept-invitation':'/verify-email';
 const url=new URL(path,base);url.hash=new URLSearchParams({token}).toString();
 const title=purpose==='reset'?'Reset your JANASEVA AI password':purpose==='invite'?'Your JANASEVA AI administrator invitation':'Verify your JANASEVA AI email';
 const minutes=purpose==='reset'?env.PASSWORD_RESET_TTL_MINUTES:env.EMAIL_VERIFY_TTL_MINUTES;
 const text=title+'\n\nOpen this link and confirm on the page. Opening the link alone does not complete this action.\n'+url.href+
   '\n\nThis link expires in '+minutes+' minutes and can be used once. If you did not request it, you can ignore this email.';
 const html='<main style="font-family:Arial;max-width:560px;margin:auto;color:#173b55"><h1>JANASEVA AI</h1><h2>'+title+
     '</h2><p>Confirm this action on the page below.</p><p><a href="'+url.href.replace(/&/g,'&amp;')+'">Continue securely</a></p><p>Expires in '+minutes+
     ' minutes. This link can be used once.</p><p>If you did not request this email, you can ignore it.</p></main>';
 if (env.BREVO_API_KEY) {
   await brevo('/smtp/email',{sender:sender(),to:[{email}],subject:title,textContent:text,htmlContent:html});
   return; // Do not retry through SMTP after an ambiguous API timeout; it could duplicate a message.
 }
 const smtp=transport();
 await smtp.sendMail({from:env.SMTP_FROM,to:email,subject:title,text,html});
}
