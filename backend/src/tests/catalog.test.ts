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

test('background import, validated publication, AP review, deduplication and failed-sync protection', {timeout:65000}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),'janaseva-catalog-'));
  const pdf=process.env.CATALOG_TEST_PDF ? await readFile(process.env.CATALOG_TEST_PDF) : null;
  process.env.NODE_ENV='development';
  process.env.DATA_DIR=directory;
  process.env.DATABASE_URL='';
  process.env.SUPABASE_URL='';
  process.env.SUPABASE_SERVICE_ROLE_KEY='';
  process.env.SCHEME_CATALOG_ENABLED='true';
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
        overview:[makeClaim(isCentral?'The Sunrise Household Scheme provides household support.':evidence)],
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
    assert.equal(rows[0].published,1);

    const {default:app}=await import('../app');
    server=app.listen(0,'127.0.0.1');
    if (!server.listening) await new Promise<void>(resolve=>server!.once('listening',resolve));
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
    async function request(path:string,options?:RequestInit,status=200) {
      const response=await actual(base+path,options);
      const json=await response.json() as {data:any};
      assert.equal(response.status,status,JSON.stringify(json).slice(0,900));
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
    assert.equal(apImport.status,'draft');
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
    const {data:repeat}=await request(admin+'/import',{method:'POST',headers,body:JSON.stringify(importBody)});
    assert.equal(repeat.result,'skipped');
    assert.equal(repeat.version.id,apImport.version_id);
    await request(admin+'/import',{method:'POST',headers,body:JSON.stringify({...importBody,url:'https://www.myscheme.gov.in/schemes'})},400);
    await request(admin+'/import',{method:'POST',headers,body:JSON.stringify({...importBody,url:'https://www.pib.gov.in/Private/example'})},400);

    let {data:list}=await request('/schemes');
    const central=list.find((item:any)=>item.scheme_name===head);
    assert.ok(central);
    const markDue=()=>db.query('update public.scheme_catalog_sources set next_check_at=now()');
    const calls=generations;
    await markDue();await runCatalogSync('test-unchanged');
    assert.equal(generations,calls);
    amount='3,000';
    await markDue();await runCatalogSync('test-updated');
    const {data:updated}=await request('/schemes/'+central.id);
    assert.equal(updated.detail.benefits[0].text,'The grant is ₹3,000 per household.');
    assert.equal(updated.application_url,'https://www.pib.gov.in/Apply.aspx');
    invalidModel=true;
    amount='4,000';
    await markDue();await runCatalogSync('test-model-failure');
    const {data:failedDrafts}=await request(admin,{headers});
    const broken=failedDrafts.imports.find((item:any)=>item.metadata.title===head);
    assert.equal(broken.status,'generation_failed');
    assert.equal(broken.scheme_id,central.id);
    invalidModel=false;
    const {data:recovered}=await request(admin+'/versions/'+broken.version_id+'/retry',{method:'POST',headers});
    assert.equal(recovered.status,'draft');
    assert.equal(recovered.description.benefits[0].text,'The grant is ₹4,000 per household.');
    fail=true;
    await markDue();await runCatalogSync('test-failure');
    const {data:retained}=await request('/schemes/'+central.id);
    assert.deepEqual(retained.detail,updated.detail);
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
    assert.equal(discoveryRun.failed,1);
    assert.ok(discoveryRun.error.includes('disallows automated access'));
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
    assert.ok(after.runs.some((run:any)=>run.trigger_kind==='test-updated' && run.changed===1 && run.published===1));
  } finally {
    await stop();
    if (server) await new Promise<void>(resolve=>{server!.close(()=>resolve());server!.closeAllConnections();});
    globalThis.fetch=actual;
    await closeDatabase();
    await rm(directory,{recursive:true,force:true}).catch(()=>{});
  }
});
