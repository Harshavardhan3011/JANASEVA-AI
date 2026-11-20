import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

test('official multi-type records, exact dates, publication, translations, drafts and scoped worker',{timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'janaseva-records-'));
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',INGESTION_DATABASE_URL:'',SCHEME_SYNC_WORKER:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',
  SMTP_HOST:'smtp.fixture.test',SMTP_FROM:'sender@example.test',BREVO_API_KEY:'',APP_PUBLIC_URL:'https://janaseva.example.test',
  LLM_PROVIDER:'openai',LLM_API_KEY:'controlled-fixture',TAVILY_API_KEY:'',SCHEME_SEARCH_API_KEY:'',Adminmail:'admin@example.test',AdminPass:'AdminFixturePassword123!'});
 const mailer=require('nodemailer'),originalMailer=mailer.createTransport,outbox:Array<{text:string}>=[];
 mailer.createTransport=()=>({sendMail:async(mail:{text:string})=>{outbox.push(mail);}});
 const {database,closeDatabase}=await import('../config/db');
 const {default:app}=await import('../app');
 const {captureDocument,generateVersion,publishVersion,editDraft}=await import('../modules/catalog/catalog.repo');
 const {recordFixture,officialFixtures}=await import('./record.fixtures');
 const {officialDate}=await import('../modules/catalog/record.schema');
 const {verifyDescription,canonicalSource}=await import('../modules/catalog/catalog.types');
 const {parseExtractedDescription}=await import('../modules/catalog/record.extract');
 const db=await database();
 const server=app.listen(0,'127.0.0.1');if (!server.listening) await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
 const actual=globalThis.fetch,dns=require('node:dns/promises'),lookup=dns.lookup;
 let generationCalls=0;
 const ids=['svamitva','pension-en','rules','faq','ap-service'];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:input.toString());
  if(url.hostname==='api.openai.com') {
   generationCalls++;const body=JSON.parse(String(init?.body));const data=JSON.parse(body.messages.at(-1).content);
   const fixture=ids.map(id=>recordFixture(id)).find(row=>row.metadata.title===data.title);
   if (!fixture) throw new Error('Unexpected AI fixture request.');
   return Response.json({choices:[{message:{content:JSON.stringify(fixture.description)}}]});
  }
  if(/\.(gov|nic)\.in$/.test(url.hostname)) return new Response('Source temporarily unavailable',{status:503});
  return actual(input,init);
 };
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 async function request(path:string,token?:string,method='GET',body?:unknown,status=200) {
  const response=await actual(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json() as any;assert.equal(response.status,status,path+': '+JSON.stringify(result));return result.data;
 }
 async function citizen(email:string) {
  const credentials={email,password:'CitizenFixturePassword123!',name:email.split('@')[0]};
  await request('/auth/register',undefined,'POST',credentials,201);
  const token=new URLSearchParams(new URL(outbox.at(-1)!.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1)).get('token');
  await request('/auth/verify-email',undefined,'POST',{token});return request('/auth/login',undefined,'POST',credentials);
 }
 try {
  const a=await citizen('owner@example.test'),b=await citizen('other@example.test');
  const admin=await request('/auth/login',undefined,'POST',{email:process.env.Adminmail,password:process.env.AdminPass});
  const records=new Map<string,string>(),versions=new Map<string,string>();
  for(const id of ids) {
   const fixture=recordFixture(id);
   const capture=await captureDocument(fixture.metadata,fixture.document);versions.set(id,capture.version.id);
   const generated=await generateVersion(capture.version.id);
   assert.equal(generated.status,'draft',generated.error || id);
   assert.deepEqual(verifyDescription(generated.description!,generated.source_text).problems,[]);
   await request('/scheme-catalog-admin/versions/'+generated.id,undefined,'GET',undefined,401);
   const before=await request('/schemes');assert.ok(!before.some((row:any)=>row.official_url===fixture.document.url));
   let scheme=await publishVersion(generated.id,null);
   if(['svamitva','pension-en'].includes(id)) assert.ok(scheme,'A complete event/notice can auto-publish without an application URL.');
   else {assert.equal(scheme,null);scheme=(await request('/admin/review/'+generated.id,admin.token,'POST',{action:'approve',reason:'Reviewed the official source, dates and excerpt boundaries.'})).scheme_id;}
   assert.ok(scheme);records.set(id,scheme!);
   const publicRow=await request('/schemes/'+scheme);
   assert.equal(publicRow.record_type,fixture.description.record!.type);
   assert.equal(publicRow.source_text,undefined);assert.equal(publicRow.metadata,undefined);assert.equal(publicRow.error,undefined);assert.equal(publicRow.detail.reviewIssues,undefined);
   if(id!=='ap-service') assert.equal(publicRow.application_url,null);
   const calls=generationCalls;const again=await captureDocument(fixture.metadata,fixture.document);
   assert.equal(again.kind,'skipped');assert.equal(again.version.id,generated.id);await generateVersion(again.version.id);assert.equal(generationCalls,calls);
   const search=await request('/schemes?q='+encodeURIComponent(id==='ap-service'?'income certificate':id==='pension-en'?'Pension Adalat':id==='rules'?'Social Security':'SVAMITVA'));
   if(id!=='faq')assert.ok(search.some((row:any)=>row.id===scheme));
  }
  const pension=await request('/schemes/'+records.get('pension-en'));
  const faq=await request('/schemes/'+records.get('faq'));assert.equal(faq.record.related[0].recordId,records.get('rules'),'A related FAQ resolves only to an unambiguous published regulatory record.');
  assert.equal(pension.record.dates.find((date:any)=>date.kind==='registration_deadline').value,'2026-11-27');
  assert.equal(pension.record.dates.find((date:any)=>date.kind==='hearing').value,'2026-12-04');
  assert.equal(pension.record.dates.find((date:any)=>date.kind==='hearing').time,null);
  const event=await request('/schemes/'+records.get('svamitva'));assert.equal(event.record.dates.find((date:any)=>date.kind==='event').value,'2026-11-20');
  assert.equal(event.record.related[0].title,'SVAMITVA');
  const translated=officialFixtures.find(row=>row.id==='pension')!.document;
  const translatedCapture=await captureDocument(recordFixture('pension-en').metadata,translated);
  assert.equal(translatedCapture.version.import_id,(await db.query('select import_id from public.scheme_catalog_versions where id=$1',[versions.get('pension-en')])).rows[0].import_id,'Linked English/Hindi PIB releases share one identity.');
  assert.equal((await request('/schemes')).filter((row:any)=>row.id===records.get('pension-en')).length,1);
  const answer=await request('/assistant/answer',undefined,'POST',{message:'Delhi Pension Adalat registration deadline and hearing date'});
  assert.match(answer.reply,/2026-11-27/);assert.match(answer.reply,/2026-12-04/);assert.match(answer.reply,/Hearing time unspecified/);
  assert.ok(answer.matches.some((row:any)=>row.official_url.includes('2338511')));
  await request('/citizen-schemes/profile',a.token,'PUT',{state:'Andhra Pradesh',district:'Nandyal',occupation:'Student',incomeRange:'1-3lakh'});
  const draft=await request('/citizen-schemes/drafts',a.token,'POST',{schemeId:records.get('ap-service')},201);
  const own=await request('/citizen-schemes/drafts/'+draft.id,a.token);assert.equal(own.fields.state,'Andhra Pradesh');assert.equal(own.fields.district,'Nandyal');assert.equal(own.fields.email,'owner@example.test');assert.equal(own.fields.annualIncome,undefined);
  await request('/citizen-schemes/drafts/'+draft.id,b.token,'GET',undefined,404);
  await request('/citizen-schemes/drafts/'+draft.id,b.token,'PUT',{fields:{fullName:'Other'},reviewed:false},404);
  await request('/citizen-schemes/drafts/'+draft.id,b.token,'DELETE',undefined,404);
  assert.equal((await request('/citizen-schemes/drafts',b.token)).length,0);
  await request('/citizen-schemes/drafts/'+draft.id,a.token,'PUT',{fields:own.fields,reviewed:true},400);
  await request('/citizen-schemes/drafts/'+draft.id,a.token,'PUT',{fields:{...own.fields,purpose:'Income certificate for my application'},reviewed:true});
  assert.ok((await request('/citizen-schemes/drafts/'+draft.id,a.token)).reviewed_at);
  await request('/scheme-catalog-admin/categories',a.token,'POST',{name:'Citizen assistance'},403);
  await request('/scheme-catalog-admin/categories',admin.token,'POST',{name:'Citizen assistance'});
  const editable=await request('/admin/schemes/'+records.get('svamitva')+'/draft',admin.token,'POST');
  const current=await request('/scheme-catalog-admin/versions/'+editable.version_id,admin.token);
  await editDraft(editable.version_id,current.description,admin.user.id);
  await request('/scheme-catalog-admin/versions/'+editable.version_id+'/retry',admin.token,'POST',{},409);
  assert.equal((await request('/scheme-catalog-admin/versions/'+editable.version_id,admin.token)).human_edited,true);
  await request('/schemes/'+records.get('svamitva')+'/refresh',undefined,'POST',{},202);
  await require('../modules/catalog/catalog.recheck').runRechecks();
  assert.equal((await request('/schemes/'+records.get('svamitva'))).record.dates[0].value,'2026-11-20');
  assert.equal((await db.query('select status from public.scheme_recheck_requests where scheme_id=$1',[records.get('svamitva')])).rows[0].status,'failed');
  assert.equal(officialDate('tomorrow','2026-11-19'),'2026-11-20');assert.equal(officialDate('tomorrow'),null);assert.equal(officialDate('31 February 2026'),null);
  const fixture=recordFixture('pension-en');const conflict=structuredClone(fixture.description);conflict.record!.dates[0].value='2026-12-05';
  assert.ok(verifyDescription(conflict,fixture.document.text).problems.some(problem=>problem.includes('date')));
  const partial=parseExtractedDescription({...fixture.description,documents:[{text:'x',quote:''}]},fixture.metadata,fixture.document.text);assert.equal(partial.documents.length,0);assert.ok(partial.reviewIssues.length);
  assert.equal(canonicalSource('https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2338511&lang=2'),'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2338511');
  await db.query('set role janaseva_ingestor');
  try {
   await db.query('select id from public.scheme_catalog_sources limit 1');
   assert.equal((await db.query('select janaseva_private.cleanup_abandoned_registrations(30) as removed')).rows[0].removed,0);
   await assert.rejects(db.query('select janaseva_private.cleanup_abandoned_registrations(0)'),/Invalid registration retention/);
   const pensionFixture=recordFixture('pension-en');
   const serviceCapture=await captureDocument(pensionFixture.metadata,pensionFixture.document);
   await generateVersion(serviceCapture.version.id);
   assert.ok(await publishVersion(serviceCapture.version.id,null),'The scoped worker can publish and trigger follower alerts without reading citizen tables.');
   await assert.rejects(db.query('select email from public.users'),/permission denied/);
   await assert.rejects(db.query('select fields from public.citizen_form_drafts'),/permission denied/);
   await assert.rejects(db.query('select * from public.citizen_scheme_profiles'),/permission denied/);
   await assert.rejects(db.query("update public.users set role='admin'"),/permission denied/);
  } finally {await db.query('reset role');}
 } finally {
  globalThis.fetch=actual;dns.lookup=lookup;mailer.createTransport=originalMailer;
  await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});await closeDatabase();await rm(directory,{recursive:true,force:true});
 }
});
