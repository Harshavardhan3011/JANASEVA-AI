import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { chromium } from 'playwright';

const details = {
  name:'Asha Student',institution_name:'Example College',course_name:'B.Sc.',
  annual_family_income:180000,board_percentile:92,regular_degree:true,
  recognized_institution:true,other_scholarship:false,gap_after_class_xii:false,fresh_first_year:true,board_listed:true,
};
function listen(app:any):Promise<Server> { return new Promise(resolve => { const server=app.listen(0,'127.0.0.1',()=>resolve(server)); }); }
const origin = (server:Server) => 'http://127.0.0.1:'+(server.address() as {port:number}).port;
const close = async (server:Server) => new Promise<void>(resolve=>{ server.close(()=>resolve());server.closeAllConnections(); });

test('authenticated scholarship journey with real OCR, Playwright and two approvals', { timeout:150000 }, async () => {
  const directory=await mkdtemp(join(tmpdir(),'janaseva-test-'));
  await mkdir(directory,{recursive:true});
  process.env.BREVO_API_KEY='';
  process.env.DATA_DIR=directory;
  process.env.DATABASE_URL='';
  process.env.LLM_API_KEY='';
  process.env.EMBEDDING_API_KEY='';
  process.env.SUPABASE_URL='';
  process.env.SUPABASE_SERVICE_ROLE_KEY='';
  const portal=await listen(require('../../../mock-portal/server.js'));
  process.env.MOCK_PORTAL_URL=origin(portal);
  const server=await listen((await import('../app')).default);
  const base=origin(server)+'/api/v1';
  async function request(method:string,path:string,body?:any,token?:string,expect=200) {
    const form = body instanceof FormData;
    const headers: Record<string,string> = form ? {} : {'Content-Type':'application/json'};
    if (token) headers.Authorization='Bearer '+token;
    const response=await fetch(base+path,{method,headers,body:form ? body : body===undefined ? undefined : JSON.stringify(body)});
    const json=await response.json() as { data:any };
    assert.equal(response.status,expect,JSON.stringify(json));
    return json.data;
  }
  try {
    assert.equal((await fetch(base+'/ready')).status,200);
    const catalog = await request('GET','/schemes');
    const matches = await request('POST','/schemes/search',{ query:'pragati diploma' });
    assert.equal(matches.length,1);
    const external = matches[0];
    assert.equal(external.guided_application,false);
    assert.equal(external.catalog_source_url,'https://scholarships.gov.in/All-Scholarships');
    assert.equal(catalog.filter((scheme:any)=>scheme.guided_application).length,1);
    const { database, closeDatabase } = await import('../config/db');
    const db = await database();
    const manualSchemeId = '4bc88c80-c67d-4704-971d-9703b7cc3bc0';
    await db.query(`insert into public.schemes(id,scheme_name,description,department,official_url)
      values($1,'Test catalog record','Local test','Test','https://example.test')`,[manualSchemeId]);
    const register = async (name:string,email:string) => {
      await request('POST','/auth/register',{name,email,password:'ExamplePassword123!',preferred_language:'en'},undefined,201);
      await db.query('update public.users set email_verified_at=now(),registration_pending=false where email=$1',[email]);
      return request('POST','/auth/login',{email,password:'ExamplePassword123!'});
    };
    const {token}=await register('Asha Student','asha@example.test');
    await request('POST','/applications',{scheme_id:external.id},token,400);
    const other=(await register('Ravi Student','ravi@example.test')).token;
    const chat=await request('POST','/assistant/chat',{message:'Help me apply for a college scholarship'},token);
    assert.ok(chat.citations.some((c:any)=>c.official_url.startsWith('https://scholarships.gov.in/')));
    await request('GET','/assistant/conversations/'+chat.conversation_id,undefined,other,404);
    const entry=await request('POST','/applications',{scheme_id:chat.scheme_id},token,201);
    const app='/applications/'+entry.id;
    const browser='/browser/'+entry.id;
    await request('GET',app,undefined,other,404);
    await request('GET','/tracking/'+entry.id+'/history',undefined,other,404);
    await request('POST',browser+'/start',{},token,409);
    await request('POST',app+'/approve-submission',{authorized:true,revision:entry.revision},token,409);
    assert.equal((await fetch(origin(portal)+'/demo/submit/'+entry.id,{method:'POST'})).status,403);
    const pending=await request('POST',app+'/prepare',{applicant_data:details,revision:entry.revision},token);
    assert.equal(pending.workflow_state,'DOCUMENTS_PENDING');
    assert.equal(pending.missing_documents.length,2);

    const fixtureBrowser=await chromium.launch((await import('../config/browser')).browserOptions());
    try {
      const page=await fixtureBrowser.newPage();
      for (const [kind,text,method,key,value] of [
        ['INCOME_CERTIFICATE','Annual Family Income: 180,000','Image OCR','annual_family_income',180000],
        ['MARKSHEET','Board percentile: 92','PDF text','board_percentile',92],
      ] as const) {
        await page.setContent('<main style="font:42px Arial;padding:70px;background:white;color:black"><h1>DEMO DOCUMENT</h1><p>'+text+'</p></main>');
        const bytes = method==='Image OCR' ? await page.locator('main').screenshot() : await page.pdf();
        const form=new FormData();
        form.set('application_id',entry.id);form.set('document_type',kind);
        form.set('document',new Blob([new Uint8Array(bytes)],{type:method==='Image OCR'?'image/png':'application/pdf'}),method==='Image OCR'?'demo.png':'demo.pdf');
        const doc=await request('POST','/documents/upload',form,token,201);
        assert.equal(doc.extracted_data_json.method,method);
        assert.equal(doc.extracted_data_json[key],value);
        assert.equal(doc.validation_status,'NEEDS_REVIEW');
        await request('GET','/documents/'+doc.id,undefined,other,404);
        await request('POST','/documents/'+doc.id+'/review',{reviewed:true},token);
      }
    } finally { await fixtureBrowser.close(); }
    const prepared=await request('POST',app+'/prepare',{applicant_data:details,revision:pending.revision},token);
    assert.equal(prepared.workflow_state,'APPROVAL_PENDING');
    await request('POST',app+'/approve-preparation',{authorized:false,revision:prepared.revision},token,400);
    await request('POST',app+'/approve-preparation',{authorized:true,revision:prepared.revision},token);
    const preview=await request('POST',browser+'/start',{},token);
    assert.equal(preview.workflow_state,'FINAL_APPROVAL_PENDING');
    assert.equal(preview.reference_number,null);
    assert.equal((await fetch(base+browser+'/screenshot',{headers:{Authorization:'Bearer '+other}})).status,404);
    const screenshot=await fetch(base+browser+'/screenshot',{headers:{Authorization:'Bearer '+token}});
    assert.equal(screenshot.headers.get('content-type'),'image/png');
    const { env } = await import('../config/env');
    const validPortal = env.MOCK_PORTAL_URL;
    env.MOCK_PORTAL_URL = 'http://127.0.0.1:1';
    try {
      await request('POST',app+'/approve-submission',{authorized:true,revision:preview.revision},token,502);
    } finally { env.MOCK_PORTAL_URL = validPortal; }
    const retry = await request('GET',app,undefined,token);
    assert.equal(retry.workflow_state,'FINAL_APPROVAL_PENDING');
    assert.equal(retry.reference_number,null);
    await request('POST',app+'/cancel',{},token,409);
    const receipt=await request('POST',app+'/approve-submission',{authorized:true,revision:retry.revision},token);
    await closeDatabase();
    const reloadedCatalog = await request('GET','/schemes');
    assert.equal(reloadedCatalog.length,catalog.length+1);
    assert.ok(reloadedCatalog.some((scheme:any)=>scheme.id===manualSchemeId));
    assert.match(receipt.reference_number,/^DEMO-[A-F0-9]{16}$/);
    const refreshed=await request('GET',app,undefined,token);
    assert.equal(refreshed.reference_number,receipt.reference_number);
    const replay=await request('POST',app+'/approve-submission',{authorized:true,revision:preview.revision},token);
    assert.equal(replay.reference_number,receipt.reference_number);
    const events=await request('GET','/tracking/'+entry.id+'/history',undefined,token);
    for (const name of ['CHECKPOINT_1_APPROVED','CHECKPOINT_2_APPROVED','DEMO_SUBMITTED']) {
      assert.equal(events.filter((event:any)=>event.event_type===name).length,1,name);
    }
    await request('POST','/auth/logout',{},token);
    await request('GET',app,undefined,token,401);
  } finally {
    await close(server);
    await close(portal);
    await (await import('../config/db')).closeDatabase();
    await rm(directory,{ recursive:true,force:true }).catch(()=>{});
  }
});
