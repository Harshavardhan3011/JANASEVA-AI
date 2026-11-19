import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

test('verified account isolation, admin endpoints, durable discovery and audited revisions',{timeout:120000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'janaseva-roles-'));
  Object.assign(process.env,{BREVO_API_KEY:'',NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',
    SMTP_HOST:'smtp.fixture.test',SMTP_FROM:'sender@example.test',APP_PUBLIC_URL:'https://janaseva.example.test',
    LLM_PROVIDER:'openai',LLM_API_KEY:'fixture-only',TAVILY_API_KEY:'',SCHEME_SEARCH_API_KEY:'',
    Adminmail:'admin@example.test',AdminPass:'AdminFixturePassword123!'});
  const mailer=require('nodemailer'),originalMailer=mailer.createTransport,outbox:Array<{to:string;text:string}>=[];
  mailer.createTransport=()=>({sendMail:async(mail:{to:string;text:string})=>{outbox.push(mail);}});
  const {database,closeDatabase}=await import('../config/db');
  const {processDiscoveryQueue,enqueueDiscovery}=await import('../modules/catalog/catalog.queue');
  const {default:app}=await import('../app');
  const server=app.listen(0,'127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
  const db=await database(),actual=globalThis.fetch,dns=require('node:dns/promises'),lookup=dns.lookup;
  const official='https://www.pib.gov.in/PressReleasePage.aspx?PRID=fixture';
  const quote='The scheme provides assistance to eligible households.';
  let outage=false;
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input.toString());
    if (url.hostname==='www.pib.gov.in') {
      if (url.pathname==='/robots.txt') return new Response('User-agent: *\nAllow: /');
      return outage?new Response('Unavailable',{status:503}):new Response('<main><h1>Isolated test support scheme</h1><p>'+quote+'</p><p>Applicants should contact the issuing department for the eligibility conditions and supporting documents. This is a controlled integration fixture and never goes to production.</p></main>',{headers:{'Content-Type':'text/html'}});
    }
    if (url.hostname==='api.openai.com') return Response.json({choices:[{message:{content:JSON.stringify({
      overview:[{text:quote,quote}],whoCanApply:[],benefits:[],eligibility:[],exclusions:[],documents:[{text:'Contact the issuing department.',quote:'Applicants should contact the issuing department'}],
      applicationSteps:[],dates:[],contacts:[],status:'unknown',statusEvidence:null,reviewIssues:[],
    })}}]});
    return actual(input,init);
  };
  async function request(path:string,token?:string,method='GET',body?:unknown,status=200) {
    const response=await actual(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const json=await response.json() as any;
    assert.equal(response.status,status,path+': '+JSON.stringify(json));return json.data;
  }
  async function verify(email:string) {
    const mail=[...outbox].reverse().find(item=>item.to===email)!;
    const token=new URLSearchParams(new URL(mail.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1)).get('token');
    await request('/auth/verify-email',undefined,'POST',{token});
  }
  try {
    const catalog=await request('/schemes');assert.ok(catalog.length>=2);
    const sessions=[];
    for (const email of ['first@example.test','second@example.test']) {
      await request('/auth/register',undefined,'POST',{name:email.split('@')[0],email,password:'CitizenFixturePassword123!'},201);
      const pending=await request('/auth/login',undefined,'POST',{email,password:'CitizenFixturePassword123!'});
      assert.equal(pending.verification_required,true);assert.equal(pending.token,undefined);
      await verify(email);
      sessions.push(await request('/auth/login',undefined,'POST',{email,password:'CitizenFixturePassword123!'}));
    }
    const [a,b]=sessions;
    await request('/citizen-schemes/watches/'+catalog[0].id,a.token,'PUT');
    await request('/citizen-schemes/watches/'+catalog[0].id,a.token,'PUT');
    await request('/citizen-schemes/watches/'+catalog[1].id,b.token,'PUT');
    await request('/citizen-schemes/profile',a.token,'PUT',{state:'Andhra Pradesh',education:'Engineering',occupation:'student'});
    await request('/citizen-schemes/profile',a.token,'PUT',{state:'Andhra Pradesh'});
    const da=await request('/citizen-schemes',a.token),dbb=await request('/citizen-schemes',b.token);
    assert.deepEqual(da.watches.map((w:any)=>w.scheme_id),[catalog[0].id]);
    assert.deepEqual(dbb.watches.map((w:any)=>w.scheme_id),[catalog[1].id]);
    assert.equal(da.profile.education,'Engineering');assert.equal(dbb.state,'');
    await request('/citizen-schemes/watches/'+catalog[0].id,b.token,'GET',undefined,404);
    await request('/citizen-schemes/progress/'+catalog[0].id+'?userId='+a.user.id,b.token,'GET',undefined,403);
    await request('/citizen-schemes/profile',b.token,'PUT',{state:'Wrong account',user_id:a.user.id},400);
    await request('/citizen-schemes/progress/'+catalog[0].id,a.token,'PUT',{'Prepare document':true});
    await request('/citizen-schemes/progress/'+catalog[0].id,b.token,'PUT',{'Prepare document':false});
    assert.deepEqual(await request('/citizen-schemes/progress/'+catalog[0].id,a.token),{'Prepare document':true});
    for (const path of ['/admin/overview','/admin/schemes','/admin/review','/admin/discovery','/admin/users','/admin/audit','/scheme-catalog-admin']) await request(path,b.token,'GET',undefined,403);
    await request('/admin/discovery/sync',b.token,'POST',{},403);
    const admin=await request('/auth/login',undefined,'POST',{email:process.env.Adminmail,password:process.env.AdminPass});
    assert.equal(admin.user.is_admin,true);assert.equal(admin.user.email_verified_at,null);
    assert.equal(admin.verification_required,undefined);
    assert.equal(outbox.filter(mail=>mail.to===process.env.Adminmail).length,0,'Default admin does not require an inbox.');
    await request('/auth/resend-verification',undefined,'POST',{email:process.env.Adminmail});
    assert.equal(outbox.filter(mail=>mail.to===process.env.Adminmail).length,0);
    const restored=await request('/auth/me',admin.token);assert.equal(restored.user.is_admin,true);
    const users=await request('/admin/users',admin.token);assert.equal(users.items.length,3);
    assert.ok(users.items.every((user:any)=>!('password_hash' in user)));
    assert.equal((await request('/admin/overview',admin.token)).verified_users,2);
    await db.query('update public.scheme_catalog_sources set enabled=false');
    await db.query(`insert into public.scheme_catalog_sources(id,label,url,kind,settings) values('fixture','Controlled integration fixture',$1,'document',$2)`,
      [official,JSON.stringify({title:'Isolated test support scheme',issuer:'Test fixture',category:'Other'})]);
    const queued=await request('/admin/discovery/sync',admin.token,'POST',{},202);
    const duplicate=await request('/admin/discovery/sync',admin.token,'POST',{},202);
    assert.equal(queued.request.id,duplicate.request.id);
    await Promise.all([processDiscoveryQueue(),processDiscoveryQueue()]);
    const results=await request('/admin/discovery',admin.token);
    assert.equal(results.requests[0].status,'completed');assert.equal(results.requests[0].added,1);
    assert.equal(results.runs.filter((run:any)=>run.request_id===queued.request.id).length,1);
    const published=(await request('/schemes')).find((scheme:any)=>scheme.scheme_name==='Isolated test support scheme');assert.ok(published);
    await request('/admin/discovery/sync',admin.token,'POST',{},202);await processDiscoveryQueue();
    assert.equal((await request('/schemes')).filter((scheme:any)=>scheme.id===published.id).length,1);
    const revision=await request('/admin/schemes/'+published.id+'/draft',admin.token,'POST');
    const {publishVersion}=await import('../modules/catalog/catalog.repo');
    assert.equal(await publishVersion(revision.version_id,null),null,'A manual revision cannot be automatically published.');
    await request('/admin/review/'+revision.version_id,admin.token,'POST',{action:'reject',reason:'Details need clarification from issuing authority.'});
    assert.equal((await request('/schemes/'+published.id)).id,published.id);
    assert.equal((await request('/admin/schemes/'+published.id+'/history',admin.token)).length,2);
    outage=true;
    await request('/admin/discovery/sync',admin.token,'POST',{},202);await processDiscoveryQueue();
    const failed=await request('/admin/discovery',admin.token);assert.ok(failed.requests[0].failed>0);
    assert.equal((await request('/schemes/'+published.id)).id,published.id);
    // A stale queue lease is recovered by the worker without opening any website.
    const resumed=await enqueueDiscovery('restart-test');
    await db.query("update public.discovery_requests set status='running',lease_until=now()-interval '1 minute' where id=$1",[resumed.id]);
    await processDiscoveryQueue();
    assert.equal((await db.query('select status from public.discovery_requests where id=$1',[resumed.id])).rows[0].status,'completed');
    await request('/citizen-schemes/watches/'+published.id,a.token,'PUT');
    await request('/admin/schemes/'+published.id+'/archive',admin.token,'POST',{reason:'Retired controlled test fixture.'});
    await request('/schemes/'+published.id,undefined,'GET',undefined,404);
    const archivedWatch=(await request('/citizen-schemes',a.token)).watches.find((watch:any)=>watch.scheme_id===published.id);
    assert.equal(archivedWatch.scheme.catalog_status,'ARCHIVED');
    const editable=await request('/scheme-catalog-admin/versions/'+revision.version_id,admin.token);
    await request('/scheme-catalog-admin/versions/'+revision.version_id,admin.token,'PUT',editable.description);
    await request('/admin/review/'+revision.version_id,admin.token,'POST',{action:'approve',reason:'Rechecked official evidence and restored this scheme.'});
    assert.equal((await request('/schemes/'+published.id)).id,published.id);
    const audit=await request('/admin/audit',admin.token);
    assert.ok(audit.some((entry:any)=>entry.action==='scheme.rejected' && entry.actor_id===admin.user.id));
    assert.ok(audit.some((entry:any)=>entry.action==='scheme.published' && entry.actor_kind==='automation'));
  } finally {
    globalThis.fetch=actual;dns.lookup=lookup;mailer.createTransport=originalMailer;
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
    await closeDatabase();await rm(directory,{recursive:true,force:true});
  }
});
