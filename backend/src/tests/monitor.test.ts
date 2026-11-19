import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

test('scheme monitor publishes official changes, queues announcements and reviews an OCR village notice', { timeout:60000 }, async () => {
  const directory=await mkdtemp(join(tmpdir(),'janaseva-monitor-'));
  process.env.NODE_ENV='test';
  process.env.DATA_DIR=directory;
  process.env.DATABASE_URL='';
  process.env.SUPABASE_URL='';
  process.env.SUPABASE_SERVICE_ROLE_KEY='';
  process.env.LLM_API_KEY='';
  const key='test-only-scheme-monitor-key-123456789';
  process.env.SCHEME_MONITOR_KEY=key;
  const { database,closeDatabase }=await import('../config/db');
  const { runDueSources }=await import('../modules/monitor/monitor.job');
  const { root }=await import('../config/env');
  const { default:app }=await import('../app');
  const server=app.listen(0,'127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const actualFetch=globalThis.fetch;
  let deadline='2026-12-15';
  const draftName='District digital skills scheme';

  globalThis.fetch=async (input,init)=>{
    const url = new URL(input instanceof Request ? input.url : input.toString());
    switch (url.hostname) {
      case 'rangareddy.telangana.gov.in':
        return new Response(`<article class="schemeItem"><h2>${draftName}</h2><p>Free training. Application deadline: ${deadline}</p><a href="/scheme/digital-skills/">View details</a></article>`);
      case 'rythubharosa.telangana.gov.in':
        return new Response('<main><section><h3>Rythu Bharosa</h3><div><p>Agricultural investment support for farmers.</p></div></section></main>');
      case 'www.pib.gov.in':
        return new Response('<rss><channel><item><title>Ministry announces a new pension scheme</title><description>Details to follow.</description><link>https://www.pib.gov.in/PressReleasePage.aspx?PRID=100</link></item></channel></rss>');
      default:
        return actualFetch(input,init);
    }
  };
  async function request(path:string,options?:RequestInit,status=200) {
    const response=await actualFetch(base+path,options);
    const result=await response.json() as { data:any };
    assert.equal(response.status,status,JSON.stringify(result));
    if (path==='/auth/register' && status===201) {
      const input=JSON.parse(String(options?.body));
      await (await database()).query('update public.users set email_verified_at=now(),registration_pending=false where email=$1',[input.email]);
      const login=await actualFetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email,password:input.password})});
      return (await login.json() as {data:any}).data;
    }
    return result.data;
  }

  try {
    await runDueSources();
    let schemes=await request('/schemes');
    const district=schemes.find((entry:any)=>entry.scheme_name===draftName);
    assert.equal(district.application_deadline,deadline);
    assert.equal(district.coverage_level,'District');
    assert.ok(schemes.some((entry:any)=>entry.scheme_name==='Rythu Bharosa'));
    assert.ok(!schemes.some((entry:any)=>entry.scheme_name.includes('pension scheme')));
    const sources=await request('/scheme-monitor/sources');
    assert.equal(sources.length,3);
    assert.ok(sources.every((source:any)=>source.last_status==='ok'));

    const user=await request('/auth/register',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ name:'Test reviewer', email:'reviewer@example.test', password:'TestPassword123!' }),
    },201);
    const token={ Authorization:'Bearer '+user.token };
    const headers={...token,'x-scheme-monitor-key':key};
    await request('/scheme-monitor/review',{headers:token},403);
    await (await database()).query("update public.users set role='admin',admin_source='invitation' where email='reviewer@example.test'");
    const queue=await request('/scheme-monitor/review',{headers});
    assert.equal(queue.length,1);
    assert.equal(queue[0].draft.title,'Ministry announces a new pension scheme');

    deadline='2026-12-22';
    await request('/scheme-monitor/review/run',{method:'POST',headers},202);
    const db=await database();
    const { runMonitor }=await import('../modules/monitor/monitor.job');
    await runMonitor();
    schemes=await request('/schemes');
    const revised=schemes.filter((entry:any)=>entry.scheme_name===draftName);
    assert.equal(revised.length,1);
    assert.equal(revised[0].id,district.id);
    assert.equal(revised[0].application_deadline,deadline);
    const versions=await db.query("select id from public.scheme_monitor_items where scheme_id=$1 and status='published'",[district.id]);
    assert.equal(versions.rows.length,2);

    const form=new FormData();
    form.append('title','Sample village notice');
    form.append('issuer','Example Gram Panchayat');
    form.append('state','Telangana');
    form.append('district','Ranga Reddy');
    form.append('village','Example Village');
    const bytes=await readFile(join(root,'docs','demo','income-certificate.png'));
    form.append('notice',new Blob([new Uint8Array(bytes)],{type:'image/png'}),'sample-notice.png');
    const notice=await request('/scheme-monitor/notices',{method:'POST',headers:token,body:form},201);
    assert.equal(notice.status,'pending');
    const pending=(await request('/scheme-monitor/review',{headers})).find((item:any)=>item.id===notice.id);
    assert.equal(pending.draft.level,'Village');
    assert.match(pending.evidence,/annual family income/i);
    assert.equal(pending.has_attachment,true);
    schemes=await request('/schemes');
    assert.ok(!schemes.some((entry:any)=>entry.scheme_name==='Sample village notice'));
    const attachment=await actualFetch(base+'/scheme-monitor/review/'+notice.id+'/attachment',{headers});
    assert.equal(attachment.headers.get('content-type'),'image/png');
    const approval=await request('/scheme-monitor/review/'+notice.id,{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({action:'publish',reason:'Verified submitted notice evidence.',draft:{...pending.draft,sourceUrl:'https://rangareddy.telangana.gov.in/schemes/'}}),
    });
    assert.equal(approval.status,'published');
    const published=await request('/schemes/'+approval.scheme_id);
    assert.equal(published.coverage_village,'Example Village');
    assert.equal(published.guided_application,false);
    assert.equal((await request('/scheme-monitor/review',{headers})).length,1);

    await closeDatabase();
    const reopened=await request('/schemes/'+district.id);
    assert.equal(reopened.application_deadline,deadline);
  } finally {
    globalThis.fetch=actualFetch;
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
    await closeDatabase();
    await rm(directory,{recursive:true,force:true}).catch(()=>{});
  }
});
