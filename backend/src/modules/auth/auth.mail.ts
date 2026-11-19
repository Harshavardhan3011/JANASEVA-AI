import nodemailer from 'nodemailer';
import { env } from '../../config/env';
export async function sendAuthMail(email:string,purpose:'verify'|'reset'|'invite',token:string) {
 if (!env.SMTP_HOST || !env.SMTP_FROM || !env.APP_PUBLIC_URL) throw new Error('Email delivery is not configured.');
 const base=new URL(env.APP_PUBLIC_URL);
 if (env.NODE_ENV==='production' && base.protocol!=='https:') throw new Error('The public application URL must use HTTPS.');
 const path=purpose==='reset'?'/reset-password':purpose==='invite'?'/accept-invitation':'/verify-email';
 const url=new URL(path,base);url.hash=new URLSearchParams({token}).toString();
 const title=purpose==='reset'?'Reset your JANASEVA AI password':purpose==='invite'?'Your JANASEVA AI administrator invitation':'Verify your JANASEVA AI email';
 const minutes=purpose==='reset'?env.PASSWORD_RESET_TTL_MINUTES:env.EMAIL_VERIFY_TTL_MINUTES;
 const text=title+'\n\nOpen this link and confirm on the page. Opening the link alone does not complete this action.\n'+url.href+
   '\n\nThis link expires in '+minutes+' minutes and can be used once. If you did not request it, you can ignore this email.';
 const transport=nodemailer.createTransport({
   host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_SECURE || env.SMTP_PORT===465,
   requireTLS:!(env.SMTP_SECURE || env.SMTP_PORT===465),auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined,
   connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
   logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
 });
 await transport.sendMail({from:env.SMTP_FROM,to:email,subject:title,text,
   html:'<main style="font-family:Arial;max-width:560px;margin:auto;color:#173b55"><h1>JANASEVA AI</h1><h2>'+title+
     '</h2><p>Confirm this action on the page below.</p><p><a href="'+url.href.replace(/&/g,'&amp;')+'">Continue securely</a></p><p>Expires in '+minutes+
     ' minutes. This link can be used once.</p><p>If you did not request this email, you can ignore it.</p></main>'});
}
