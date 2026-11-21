import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { SchemeDescription } from '../modules/catalog/catalog.types';

const ap='https://sspensions.ap.gov.in/SSP/Documents/GO%20MS%2043%2013.06.2024.pdf';
const head='Launch of the Sunrise Household Scheme';
const discoveryTitle='Smallholder Support Scheme';
const discoveryUrl='https://pmkisan.gov.in/schemes/smallholder-support';
const secondUrl='https://socialjustice.gov.in/schemes/household-grant';
const stateUrl='https://karnataka.gov.in/schemes/farm-assistance';
const listUrl='https://pmkisan.gov.in/schemes/all';
const untrustedUrl='https://pmkisan.gov.in.example.com/scheme';
const blockedUrl='https://pmkisan.gov.in/private/scheme';
const chair='https://pib.gov.in/PressReleaseIframePage.aspx?PRID=9899990';

test('background import, validated publication, AP review, deduplication and failed-sync protection', {timeout:180000}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),'janaseva-catalog-'));
  const pdf=process.env.CATALOG_TEST_PDF ? await readFile(process.env.CATALOG_TEST_PDF) : null;
  process.env.NODE_ENV='development';
  process.env.BREVO_API_KEY='';
  process.env.DATA_DIR=directory;
  process.env.DATABASE_URL='';
  process.env.SUPABASE_URL='';
  process.env.SUPABASE_SERVICE_ROLE_KEY='';
  process.env.SCHEME_CATALOG_ENABLED='true';
  // This fixture isolates discovery/scheduling; enrichment has its own official-source suite.
  process.env.SCHEME_ENRICHMENT_ENABLED='false';
  process.env.SCHEME_SEARCH_API_KEY='';
  process.env.TAVILY_API_KEY='';
  process.env.SCHEME_CATALOG_AUTO_PUBLISH='true';
  process.env.LLM_PROVIDER='openai';
  process.env.LLM_API_KEY='controlled-test-fixture';
  process.env.SCHEME_MONITOR_KEY='controlled-scheme-catalog-reviewer-key-123';
  const {env}=await import('../config/env');
  const { database,closeDatabase }=await import('../config/db');
  const { scheduleCatalog,runCatalogSync }=await import('../modules/catalog/catalog.job');
  const { searchPublishers }=await import('../modules/catalog/catalog.publishers');
  const { compact }=await import('../modules/catalog/catalog.types');
  const actual=globalThis.fetch;
  const dns=require('node:dns/promises');
  const actualLookup=dns.lookup;
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  let fail=false, invalidModel=false, amount='2,000', generations=0;
  const searchQueries:string[]=[];

  const makeClaim=(quote:string)=>({text:quote,quote});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname==='api.tavily.com') {
      assert.equal(url.pathname,'/search');
      assert.equal(init?.method,'POST');
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer fixture-tavily-key');
      const query=JSON.parse(String(init?.body));
      assert.equal(query.search_depth,'basic');
      assert.equal(query.auto_parameters,false);
      assert.deepEqual(query.include_domains,['karnataka.gov.in','www.karnataka.gov.in']);
      return Response.json({results:[{url:untrustedUrl},{url:stateUrl}]});
    }
    if (url.hostname==='api.search.brave.com') {
      assert.equal(new Headers(init?.headers).get('X-Subscription-Token'),'fixture-search-key');
      const query=url.searchParams.get('q') || '';
      searchQueries.push(query);
      const links=query.startsWith('site:pmkisan.gov.in ')
        ? [discoveryUrl,discoveryUrl+'?utm_source=search',listUrl,untrustedUrl,blockedUrl,secondUrl]
        : query.startsWith('site:karnataka.gov.in ') ? [stateUrl] : [secondUrl];
      return Response.json({web:{results:links.map(url=>({url,title:'Untrusted search title'}))}});
    }
    if (['pmkisan.gov.in','socialjustice.gov.in','karnataka.gov.in'].includes(url.hostname)) {
      if (url.pathname==='/robots.txt') return new Response('User-agent: *\nDisallow: /private/');
      assert.notEqual(url.href,blockedUrl,'robots-blocked result is never fetched');
      const titles:Record<string,string>={
        [discoveryUrl]:discoveryTitle,[listUrl]:'All schemes',[secondUrl]:'Household Grant Scheme',[stateUrl]:'Farm Assistance Scheme',
      };
      const title=titles[url.href];
      return new Response(`<main><h1>${title}</h1><p>This scheme provides financial assistance to eligible households.</p>
        <p>The grant is ₹2,000 per household.</p><p>Farmers with up to two hectares can apply.</p>
        <p>Application instructions and supporting documents are available from the issuing department.</p></main>`,
        {headers:{'Content-Type':'text/html'}});
    }
    assert.notEqual(url.href,untrustedUrl,'unapproved result is never fetched');
    if (url.hostname==='api.openai.com') {
      generations++;
      const messages=JSON.parse(String(init?.body)).messages;
      const input=JSON.parse(messages[messages.length-1].content) as {title:string;source:string};
      const isCentral=input.title===head;
      const isDiscovered=[discoveryTitle,'Household Grant Scheme','All schemes','Farm Assistance Scheme'].includes(input.title);
      if (isCentral && invalidModel) return Response.json({choices:[{message:{content:'invalid JSON'}}]});
      const text=compact(input.source);
      const evidence=text.match(/[^.]{5,180}NTR Bharosa Pension Scheme[^.]{0,80}/i)?.[0]?.trim() ||
        input.source.split('\n').map(compact).find(line=>line.length>45 && line.length<1000) || text.slice(0,100);
      const filled:SchemeDescription={
        overview:isCentral?[{text:'The scheme offers household support.',quote:'The Sunrise Household Scheme provides household support.'}]:[makeClaim(evidence)],
        benefits:isDiscovered?[makeClaim('The grant is ₹2,000 per household.')]:isCentral?[makeClaim('The grant is ₹'+amount+' per household.')]:[],
        whoCanApply:[],eligibility:isDiscovered?[makeClaim('Farmers with up to two hectares can apply.')]:isCentral?[makeClaim('Households residing in the district can apply.')]:[],
        documents:[],applicationSteps:[],dates:[],contacts:[],status:'unknown',statusEvidence:null,reviewIssues:[],
      };
      return Response.json({choices:[{message:{content:JSON.stringify(filled)}}]});
    }
    if (url.hostname==='pib.gov.in') return new Response(null,{
      status:301,headers:{Location:'https://www.pib.gov.in'+url.pathname+url.search},
    });
    if (['www.pib.gov.in','sspensions.ap.gov.in'].includes(url.hostname)) {
      if (url.pathname==='/robots.txt') return new Response('User-agent: *\nDisallow: /Private/',{status:200});
      if (fail) return new Response('Temporary upstream error',{status:503});
      if (url.pathname==='/RssMain.aspx') return new Response(`<rss><channel><item><title>${head}</title><link>${chair}</link></item></channel></rss>`);
      if (url.hostname==='www.pib.gov.in') return new Response(`<article><h1>${head}</h1><p>The Sunrise Household Scheme provides household support.</p><p>Households residing in the district can apply.</p><p>The grant is ₹${amount} per household.</p><p>See the issuing office for details about accessing the scheme.</p><a href="/Apply.aspx">Apply online</a></article>`,
        {headers:{'Content-Type':'text/html'}});
      if (pdf) return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf'}});
      return new Response('<main><h1>NTR Bharosa Pension Scheme</h1><p>The official pension order covers social security pensions and records pension enhancements by category. It gives the issuing office details and explains the effective date for the order.</p></main>',
        {headers:{'Content-Type':'text/html'}});
    }
    return actual(input,init);
  };

  let server:import('node:http').Server|undefined;
  const stop=scheduleCatalog();
  try {
    const db=await database();
    // The scheduled job runs before an HTTP server exists.
    let completed=false;
    for (let attempt=0;attempt<80;attempt++) {
      const { rows }=await db.query("select id from public.scheme_catalog_runs where trigger_kind='scheduled' and finished_at is not null");
      if (rows.length===2) {completed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(completed,'scheduled sync completed with zero requests');
    const { rows }=await db.query<{published:number}>(
      "select published from public.scheme_catalog_runs where source_id='central-pib'");
    assert.equal(rows[0].published,1,JSON.stringify((await db.query('select error,outcomes from public.scheme_catalog_runs')).rows));

    const {default:app}=await import('../app');
    server=app.listen(0,'127.0.0.1');
    if (!server.listening) await new Promise<void>(resolve=>server!.once('listening',resolve));
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
    async function request(path:string,options?:RequestInit,status=200) {
      const response=await actual(base+path,options);
      const json=await response.json() as {data:any};
      assert.equal(response.status,status,JSON.stringify(json).slice(0,900));
      if (path==='/auth/register' && status===201) {
        const input=JSON.parse(String(options?.body));
        await db.query(`update public.users set email_verified_at=now(),registration_pending=false,
          role=$2,admin_source=case when $2='admin' then 'invitation' else null end where email=$1`,
          [input.email,input.email==='catalog@example.test'?'admin':'regular']);
        const login=await actual(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email,password:input.password})});
        json.data=(await login.json() as {data:any}).data;
      }
      return {data:json.data,headers:response.headers};
    }
    const {data:session}=await request('/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Catalog reviewer',email:'catalog@example.test',password:'ExamplePassword123!'}),
    },201);
    const admin='/scheme-catalog-admin';
    const headers={Authorization:'Bearer '+session.token,'x-scheme-monitor-key':process.env.SCHEME_MONITOR_KEY!,'Content-Type':'application/json'};
    await request(admin,undefined,401);
    const {data:summary}=await request(admin,{headers});
    const apImport=summary.imports.find((item:any)=>item.metadata.title==='NTR Bharosa Pension Scheme');
    assert.equal(apImport.status,'generation_failed');
    assert.equal(apImport.scheme_id,null,'conflicting official source waited for review');
    const {data:details}=await request(admin+'/versions/'+apImport.version_id,{headers});
    assert.match(details.source_text,/Pension Scheme/i);
    assert.ok(details.description.overview.length);
    assert.equal(details.description.eligibility.length,0);
    assert.match(details.metadata.reviewNote,/older amounts/);
    const {data:published}=await request(admin+'/versions/'+apImport.version_id+'/publish',{
      method:'POST',headers,body:'{"verified":true}',
    });
    const {data:detail,headers:publicHeaders}=await request('/schemes/'+published.scheme_id);
    assert.equal(publicHeaders.get('cache-control'),'no-store');
    assert.equal(detail.coverage_state,'Andhra Pradesh');
    assert.equal(detail.detail.eligibility.length,0);
    assert.equal(detail.application_url,null);
    assert.ok(!('source_text' in detail));
    assert.ok(!('reviewIssues' in detail.detail));
    if (process.env.CATALOG_UI_URL) {
      const {chromium}=await import('playwright');
      const {browserOptions}=await import('../config/browser');
      const browser=await chromium.launch(browserOptions());
      try {
        const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        await page.route('**/api/v1/schemes/**',async route=>{
          const path=new URL(route.request().url()).pathname.replace('/api/v1','');
          const response=await actual(base+path);
          await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
        });
        await page.goto(process.env.CATALOG_UI_URL+'/schemes/'+published.scheme_id);
        await page.getByRole('heading',{name:'NTR Bharosa Pension Scheme',exact:true}).waitFor();
        await page.getByRole('heading',{name:'Important Dates',exact:true}).waitFor();
        assert.ok(await page.getByText('Not specified in the official source.',{exact:true}).count()>0);
        assert.equal(await page.getByRole('link',{name:'Apply on official portal'}).count(),0);
        assert.equal(await page.locator('html').evaluate(element=>(element as unknown as {scrollWidth:number}).scrollWidth),390);
      } finally { await browser.close(); }
    }
    const importBody={url:ap,title:'NTR Bharosa Pension Scheme',issuer:'Andhra Pradesh Panchayat Raj and Rural Development Department',state:'Andhra Pradesh',category:'Social welfare'};
    const invalidSave=await actual(base+admin+'/versions/'+apImport.version_id,{method:'PUT',headers,
      body:JSON.stringify({...details.description,overview:[{text:'',quote:''}]})});
    assert.equal(invalidSave.status,400);
    const invalidReply=await invalidSave.json() as {error:{issues:Array<{path:Array<string|number>}>}};
    assert.deepEqual(invalidReply.error.issues.map(issue=>issue.path),[['overview',0,'text'],['overview',0,'quote']]);
    const {data:repeat}=await request(admin+'/import',{method:'POST',headers,body:JSON.stringify(importBody)});
    assert.equal(repeat.result,'skipped');
    assert.equal(repeat.version.id,apImport.version_id);
    await request(admin+'/import',{method:'POST',headers,body:JSON.stringify({...importBody,url:'https://www.myscheme.gov.in/schemes'})},400);
    await request(admin+'/import',{method:'POST',headers,body:JSON.stringify({...importBody,url:'https://www.pib.gov.in/Private/example'})},400);

    let {data:list}=await request('/schemes');
    const central=list.find((item:any)=>item.scheme_name===head);
    assert.ok(central);
    await request('/citizen-schemes',undefined,401);
    await request('/citizen-schemes/profile',{method:'PUT',headers,body:JSON.stringify({state:'Karnataka'})});
    await request('/citizen-schemes/watches/'+central.id,{method:'PUT',headers});
    await request('/citizen-schemes/watches/'+central.id,{method:'PUT',headers});
    const {data:followed}=await request('/citizen-schemes',{headers});
    assert.equal(followed.state,'Karnataka');
    assert.equal(followed.watches.length,1,'following twice is idempotent');
    assert.deepEqual(followed.watches[0].answers,{});
    const initialVersion=followed.watches[0].version_id;
    const answerBody={versionId:initialVersion,answers:{'eligibility.0':'met'}};
    await request('/citizen-schemes/assessments/'+central.id,{method:'PUT',headers,body:JSON.stringify(answerBody)});
    await request('/citizen-schemes/assessments/'+central.id,{method:'PUT',headers,
      body:JSON.stringify({...answerBody,answers:{'invented.0':'met'}})},400);
    const {data:other}=await request('/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Other citizen',email:'other-citizen@example.test',password:'ExamplePassword123!'}),
    },201);
    const otherHeaders={Authorization:'Bearer '+other.token};
    const {data:isolated}=await request('/citizen-schemes',{headers:otherHeaders});
    assert.equal(isolated.watches.length,0);
    assert.equal(isolated.state,'');
    const markDue=()=>db.query('update public.scheme_catalog_sources set next_check_at=now()');
    const calls=generations;
    await markDue();await runCatalogSync('test-unchanged');
    assert.equal(generations,calls);
    amount='3,000';
    await markDue();await runCatalogSync('test-updated');
    const {data:updated}=await request('/schemes/'+central.id);
    assert.equal(updated.detail.benefits[0].text,'The grant is ₹3,000 per household.');
    assert.equal(updated.application_url,'https://www.pib.gov.in/Apply.aspx');
    const {data:changed}=await request('/citizen-schemes',{headers});
    assert.equal(changed.alerts.length,1);
    assert.equal(changed.alerts[0].changes.benefits.before[0].text,'The grant is ₹2,000 per household.');
    assert.equal(changed.alerts[0].changes.benefits.after[0].text,'The grant is ₹3,000 per household.');
    assert.equal(changed.watches[0].stale,true);
    assert.deepEqual(changed.watches[0].answers,{});
    await request('/citizen-schemes/assessments/'+central.id,{method:'PUT',headers,body:JSON.stringify(answerBody)},409);
    await request('/citizen-schemes/alerts/'+changed.alerts[0].id+'/read',{method:'POST',headers:otherHeaders});
    const {data:unread}=await request('/citizen-schemes',{headers});
    assert.equal(unread.alerts[0].read_at,null,'another citizen cannot mark this alert read');
    await request('/citizen-schemes/alerts/'+changed.alerts[0].id+'/read',{method:'POST',headers});
    const {data:read}=await request('/citizen-schemes',{headers});
    assert.ok(read.alerts[0].read_at);
    await request('/citizen-schemes/assessments/'+central.id,{method:'PUT',headers,
      body:JSON.stringify({...answerBody,versionId:changed.watches[0].version_id,answers:{'eligibility.0':'unknown'}})});
    const {data:reassessed}=await request('/citizen-schemes',{headers});
    assert.equal(reassessed.watches[0].stale,false);
    assert.equal(reassessed.watches[0].answers['eligibility.0'],'unknown');
    if (process.env.CATALOG_UI_URL) {
      const {chromium}=await import('playwright');
      const {browserOptions}=await import('../config/browser');
      const browser=await chromium.launch(browserOptions());
      try {
        const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        await page.route('**/api/v1/**',async route=>{
          const incoming=route.request();
          const path=new URL(incoming.url()).pathname.replace('/api/v1','');
          const response=await actual(base+path,{
            method:incoming.method(),headers:{Authorization:headers.Authorization,'Content-Type':'application/json'},
            body:incoming.postData() || undefined,
          });
          await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
        });
        await page.goto(process.env.CATALOG_UI_URL+'/');
        await page.evaluate(session=>{
          localStorage.setItem('janaseva_token',session.token);
          localStorage.setItem('janaseva_user',JSON.stringify(session.user));
        },session);
        await page.goto(process.env.CATALOG_UI_URL+'/my-schemes');
        await page.getByRole('heading',{name:'My schemes',exact:true}).waitFor();
        await page.getByText('Benefits changed',{exact:true}).click();
        await page.getByText('The grant is ₹2,000 per household.',{exact:true}).waitFor();
        await page.getByText('The grant is ₹3,000 per household.',{exact:true}).waitFor();
        await page.getByRole('combobox',{name:'Your answer for Households residing in the district can apply.'}).selectOption('met');
        await page.getByRole('button',{name:'Save assessment',exact:true}).click();
        await page.getByText('Saved.',{exact:true}).waitFor();
        assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth),390);
      } finally {await browser.close();}
    }

    invalidModel=true;
    amount='4,000';
    await markDue();await runCatalogSync('test-model-failure');
    const {data:failedDrafts}=await request(admin,{headers});
    const broken=failedDrafts.imports.find((item:any)=>item.metadata.title===head);
    assert.equal(broken.status,'generation_failed');
    assert.equal(broken.scheme_id,central.id);
    const {data:afterFailedGeneration}=await request('/citizen-schemes',{headers});
    assert.equal(afterFailedGeneration.alerts.length,1,'failed generation creates no publication alert');
    invalidModel=false;
    const {data:recovered}=await request(admin+'/versions/'+broken.version_id+'/retry',{method:'POST',headers});
    assert.equal(recovered.status,'draft');
    assert.equal(recovered.description.benefits[0].text,'The grant is ₹4,000 per household.');
    fail=true;
    await markDue();await runCatalogSync('test-failure');
    const {data:retained}=await request('/schemes/'+central.id);
    assert.deepEqual(retained.detail,updated.detail);
    const {data:afterFailedSync}=await request('/citizen-schemes',{headers});
    assert.equal(afterFailedSync.alerts.length,1,'unchanged and failed syncs create no duplicate alerts');
    const {data:otherInbox}=await request('/citizen-schemes',{headers:otherHeaders});
    assert.equal(otherInbox.alerts.length,0);
    ({data:list}=await request('/schemes'));
    assert.equal(list.filter((entry:any)=>entry.scheme_name===head).length,1);
    const {data:after}=await request(admin,{headers});
    const traditional=after.sources.filter((source:any)=>source.kind!=='official_search');
    assert.ok(traditional.every((source:any)=>source.last_success_at && source.last_error.includes('503')));
    assert.equal(searchQueries.length,0,'without a key, the existing source checks still run');
    await db.query("update public.scheme_catalog_sources set enabled=false where kind<>'official_search'");
    env.SCHEME_SEARCH_API_KEY='fixture-search-key';
    await markDue();await runCatalogSync('test-discover');
    assert.match(searchQueries[0],/^site:pmkisan\.gov\.in /);
    const {data:discovered}=await request('/schemes');
    assert.equal(discovered.filter((entry:any)=>entry.scheme_name===discoveryTitle).length,1);
    assert.ok(!discovered.some((entry:any)=>entry.scheme_name==='All schemes'));
    const {data:discoverySummary}=await request(admin,{headers});
    const discoveryRun=discoverySummary.runs.find((run:any)=>run.trigger_kind==='test-discover');
    assert.equal(discoveryRun.added,2);
    assert.equal(discoveryRun.published,1);
    assert.equal(discoveryRun.failed,2);
    assert.ok(discoveryRun.outcomes.some((outcome:any)=>outcome.error?.includes('disallows automated access')));
    assert.equal(discoverySummary.imports.find((item:any)=>item.metadata.title==='All schemes').scheme_id,null);

    await markDue();await runCatalogSync('test-next-publisher');
    assert.match(searchQueries[1],/^site:socialjustice\.gov\.in /);
    await db.query("update public.scheme_catalog_sources set settings='{}' where kind='official_search'");
    const beforeRepeat=generations;
    await markDue();await runCatalogSync('test-repeat-search');
    assert.equal(generations,beforeRepeat,'rediscovered official documents skip AI when unchanged');
    env.TAVILY_API_KEY='fixture-tavily-key';
    const stateCursor=searchPublishers.findIndex(publisher=>publisher.host==='karnataka.gov.in');
    await db.query("update public.scheme_catalog_sources set settings=$1 where kind='official_search'",[JSON.stringify({cursor:stateCursor})]);
    await markDue();await runCatalogSync('test-state-discovery');
    const {data:withState}=await request('/schemes');
    assert.ok(withState.some((entry:any)=>entry.scheme_name==='Farm Assistance Scheme' && entry.coverage_state==='Karnataka'));
    assert.equal(searchQueries.length,3,'Tavily is used without also calling Brave');
    env.TAVILY_API_KEY='';env.SCHEME_SEARCH_API_KEY='';env.LLM_API_KEY='';
    const {data:scholarshipAnswer}=await request('/assistant/answer',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:'Find scholarships for a third-year mechanical engineering student in Andhra Pradesh.'}),
    });
    assert.ok(scholarshipAnswer.matches.length>0);
    assert.ok(scholarshipAnswer.matches.every((scheme:any)=>scheme.official_url.startsWith('https://')));
    assert.ok(scholarshipAnswer.matches.some((scheme:any)=>scheme.category==='Education'));
    assert.equal(scholarshipAnswer.ai_used,false,'search survives model unavailability');
    const {data:deadlineAnswer}=await request('/assistant/answer',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:'Is PM-USP CSSS open and what is the deadline?'}),
    });
    assert.match(deadlineAnswer.reply,/could not be verified/);
    await request(admin+'/registry/example-source',{method:'PUT',headers:{Authorization:otherHeaders.Authorization,'Content-Type':'application/json'},
      body:JSON.stringify({})},403);
    await request('/citizen-schemes/progress/'+central.id,{method:'PUT',headers,
      body:JSON.stringify({'Income certificate':true})});
    const {data:otherProgress}=await request('/citizen-schemes/progress/'+central.id,{headers:otherHeaders});
    assert.deepEqual(otherProgress,{});
    const {data:ownProgress}=await request('/citizen-schemes/progress/'+central.id,{headers});
    assert.equal(ownProgress['Income certificate'],true);
    await request('/schemes/'+central.id+'/refresh',{method:'POST'},202);
    await request('/schemes/'+central.id+'/refresh',{method:'POST'},202);
    const {rows:rechecks}=await db.query('select scheme_id from public.scheme_recheck_requests where scheme_id=$1',[central.id]);
    assert.equal(rechecks.length,1);
    const {captureDocument}=await import('../modules/catalog/catalog.repo');
    const variantDocument={url:'https://www.pib.gov.in/variant-one',originalTitle:'Variant scheme',text:'Official fixture evidence for distinct state variants.',applyUrl:null,incomplete:false};
    const firstVariant=await captureDocument({title:'Variant scheme',issuer:'Fixture department',officialId:'SAME-ID',state:'Karnataka',category:'Other'},variantDocument);
    const secondVariant=await captureDocument({title:'Variant scheme',issuer:'Fixture department',officialId:'SAME-ID',state:'Andhra Pradesh',category:'Other'},
      {...variantDocument,url:'https://www.pib.gov.in/variant-two'});
    assert.notEqual(firstVariant.version.import_id,secondVariant.version.import_id);
    const {assertPublicHost}=await import('../modules/catalog/catalog.network');
    dns.lookup=async()=>[{address:'127.0.0.1',family:4}];
    await assert.rejects(assertPublicHost('www.pib.gov.in'),/non-public/);
    dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
    await assertPublicHost('www.pib.gov.in');
    const {data:locations}=await request('/schemes/locations');
    assert.equal(locations.length,36);
    assert.ok(locations.includes('Andhra Pradesh') && locations.includes('Tamil Nadu'));
    env.Adminmail='configured-admin@example.test';env.AdminPass='ConfiguredAdminPassword123!';
    await request('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'Impersonator',email:env.Adminmail,password:'FakePassword123!'})},403);
    await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:env.Adminmail,password:'WrongPassword'})},401);
    await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:env.Adminmail,password:env.AdminPass})});
    assert.equal((await db.query('select email_verified_at from public.users where email=$1',[env.Adminmail])).rows[0].email_verified_at,null);
    const {data:adminSession}=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:env.Adminmail,password:env.AdminPass})});
    assert.equal(adminSession.user.is_admin,true);
    const adminSessionHeaders={Authorization:'Bearer '+adminSession.token};
    await request(admin,{headers:adminSessionHeaders});
    const {data:adminMe}=await request('/auth/me',{headers:adminSessionHeaders});
    assert.equal(adminMe.user.is_admin,true);
    env.AdminPass='RotatedAdminPassword123!';
    await request(admin,{headers:adminSessionHeaders},401);


    assert.ok(after.runs.some((run:any)=>run.trigger_kind==='test-updated' && run.changed===1 && run.published===1));
  } finally {
    await stop();
    if (server) await new Promise<void>(resolve=>{server!.close(()=>resolve());server!.closeAllConnections();});
    dns.lookup=actualLookup;
    globalThis.fetch=actual;
    await closeDatabase();
    await rm(directory,{recursive:true,force:true}).catch(()=>{});
  }
});

test('AI provider errors explain HTTP failures without retaining provider secrets',async()=>{
  const {env}=await import('../config/env');
  const {generateProviderJson}=await import('../ai/providers/llm.provider');
  const originalFetch=globalThis.fetch, previousKey=env.LLM_API_KEY;
  env.LLM_API_KEY='private-fixture-key';
  try {
    for (const [status,hint] of [[400,'provider and model'],[401,'LLM_API_KEY'],[403,'permissions'],[404,'LLM_MODEL'],[429,'quota'],[503,'temporarily unavailable']] as const) {
      globalThis.fetch=async()=>new Response('sensitive body private-fixture-key',{status});
      await assert.rejects(()=>generateProviderJson('system','evidence'),error=>{
        const message=(error as Error).message;
        assert.ok(message.includes('HTTP '+status));assert.ok(message.includes(hint));
        assert.ok(!message.includes('private-fixture-key') && !message.includes('sensitive body'));return true;
      });
    }
    globalThis.fetch=async()=>{throw new DOMException('sensitive timeout','TimeoutError');};
    await assert.rejects(()=>generateProviderJson('system','evidence'),/timed out/);
    globalThis.fetch=async()=>{throw new Error('sensitive request URL');};
    await assert.rejects(()=>generateProviderJson('system','evidence'),/could not be reached/);
  } finally {globalThis.fetch=originalFetch;env.LLM_API_KEY=previousKey;}
});
