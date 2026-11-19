import test from 'node:test';
import assert from 'node:assert/strict';

test('Brevo HTTPS sends all auth templates without SMTP and redacts provider failures',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',BREVO_API_KEY:'fixture-api-key',SMTP_FROM:'JANASEVA AI <sender@example.test>',
    APP_PUBLIC_URL:'https://janaseva.example.test',DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''});
  const {env}=await import('../config/env');
  const {sendAuthMail,checkAuthMail,safeMailFailure}=await import('../modules/auth/auth.mail');
  const mailer=require('nodemailer'),originalTransport=mailer.createTransport,originalFetch=globalThis.fetch;
  const calls:Array<{path:string;body:any}>=[];
  let status=201,connectionFails=false;
  mailer.createTransport=()=>{throw new Error('SMTP must not be attempted when the API key is configured.');};
  globalThis.fetch=async(input,init)=>{
    if (connectionFails) throw new Error('Secret-bearing provider exception must never escape.');
    const url=new URL(input instanceof Request?input.url:input.toString());
    assert.equal(url.origin,'https://api.brevo.com');
    assert.equal(new Headers(init?.headers).get('api-key'),'fixture-api-key');
    assert.equal(init?.redirect,'error');
    calls.push({path:url.pathname,body:init?.body?JSON.parse(String(init.body)):null});
    return Response.json(status>=400?{message:'Do not expose provider response contents.'}:{messageId:'fixture'},
      {status:url.pathname==='/v3/account' && status<400?200:status});
  };
  try {
    assert.equal((await checkAuthMail()).code,'BREVO_API_READY');
    for (const purpose of ['verify','reset','invite'] as const) await sendAuthMail('owner@example.test',purpose,'fixture-verification-token');
    assert.equal(calls.filter(call=>call.path==='/v3/smtp/email').length,3);
    for (const [index,path] of ['/verify-email','/reset-password','/accept-invitation'].entries()) {
      const body=calls[index+1].body;
      assert.deepEqual(body.sender,{email:'sender@example.test',name:'JANASEVA AI'});
      assert.deepEqual(body.to,[{email:'owner@example.test'}]);
      assert.ok(body.htmlContent.includes(path));
      const url=new URL(body.textContent.match(/https:\/\/[^\s]+/)[0]);
      assert.equal(url.pathname,path);assert.equal(url.search,'');
      assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'),'fixture-verification-token');
      assert.ok(!body.textContent.includes(env.BREVO_API_KEY));
    }
    for (const [http,code] of [[401,'BREVO_AUTH_FAILED'],[403,'BREVO_PERMISSION_DENIED'],[429,'BREVO_RATE_LIMITED'],[500,'BREVO_UNAVAILABLE']] as const) {
      status=http;
      assert.equal((await checkAuthMail()).code,code);
      await assert.rejects(()=>sendAuthMail('owner@example.test','verify','fixture-verification-token'),error=>{
        assert.deepEqual(safeMailFailure(error),{code,responseCode:http});
        assert.ok(!(error as Error).message.includes('provider response contents'));return true;
      });
    }
    connectionFails=true;
    assert.equal((await checkAuthMail()).code,'BREVO_CONNECTION_FAILED');
    connectionFails=false;status=201;env.SMTP_FROM='first@example.test,second@example.test';
    assert.equal((await checkAuthMail()).code,'MAIL_SENDER_INVALID');
  } finally {globalThis.fetch=originalFetch;mailer.createTransport=originalTransport;}
});
