// Isolated database + real API and browser. --live opens the official sources; no real accounts are used.
const assert=require('node:assert/strict');
const {mkdtemp,rm,mkdir,readFile,writeFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');const {spawn}=require('node:child_process');
const {chromium}=require('../backend/node_modules/playwright');
async function main(){
 const directory=await mkdtemp(join(tmpdir(),'janaseva-enrichment-ui-')),frontend='http://127.0.0.1:5177',live=process.argv.includes('--live');
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',INGESTION_DATABASE_URL:'',SCHEME_SYNC_WORKER:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SCHEME_ENRICHMENT_ENABLED:'true',LLM_API_KEY:'',TAVILY_API_KEY:'',SCHEME_SEARCH_API_KEY:'',SMTP_HOST:'',BREVO_API_KEY:'',FRONTEND_URL:frontend});
 const {database,closeDatabase}=require('../backend/dist/config/db');const {default:app}=require('../backend/dist/app');
 const {enqueueBackfill,runEnrichmentTasks}=require('../backend/dist/modules/catalog/catalog.backfill');const {browserOptions}=require('../backend/dist/config/browser');
 const fixture=JSON.parse(await readFile(resolve(__dirname,'../backend/src/tests/fixtures/csss-enrichment.json'),'utf8'));
 const originalFetch=globalThis.fetch,dns=require('node:dns/promises'),lookup=dns.lookup;
 if(!live){dns.lookup=async(host,...args)=>host==='scholarships.gov.in'?[{address:'8.8.8.8',family:4}]:lookup(host,...args);globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:input.toString());if(url.hostname!=='scholarships.gov.in')return originalFetch(input,init);
  if(url.pathname==='/robots.txt')return new Response('',{status:404});const text=url.pathname==='/All-Scholarships'?fixture.secondary.text:fixture.primary.text;
  return new Response('<main>'+text.split('\n').filter(Boolean).map(line=>'<p>'+line+'</p>').join('')+'</main>',{headers:{'content-type':'text/html'}});
 };}
 const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));const api='http://127.0.0.1:'+server.address().port+'/api/v1';
 let browser,vite;
 try{
  const db=await database();await db.query('update public.scheme_catalog_sources set enabled=false');const seed=(await db.query("select * from public.schemes where scheme_name='PM-USP CSSS'")).rows[0],id=seed.id;
  const get=async()=>{const res=await originalFetch(api+'/schemes/'+id);assert.equal(res.status,200);return (await res.json()).data;};
  const before=await get();assert.equal(before.detail,null);const count=(await db.query('select count(*)::int count from public.schemes')).rows[0].count;
  await enqueueBackfill(id,true);const first=await runEnrichmentTasks(1,id);assert.equal(first.published,1,JSON.stringify((await db.query('select * from public.scheme_enrichment_tasks')).rows));
  const after=await get();assert.ok(after.detail.eligibility.length);assert.ok(after.detail.documents.length);assert.ok(after.detail.applicationSteps.length);assert.ok(after.detail.benefits.length);
  assert.equal(after.record.dates.find(date=>date.kind==='application_deadline').value,'2026-11-30');assert.equal(after.detail.dates[0].sourceUrl,'https://scholarships.gov.in/All-Scholarships');assert.equal(after.enrichment.fields.fees.status,'unverified');assert.equal(after.source_text,undefined);
  const published=(await db.query('select published_version from public.scheme_catalog_imports where scheme_id=$1',[id])).rows[0].published_version;
  await enqueueBackfill(id,true);const rerun=await runEnrichmentTasks(1,id);assert.equal(rerun.skipped,1);assert.equal((await db.query('select published_version from public.scheme_catalog_imports where scheme_id=$1',[id])).rows[0].published_version,published);assert.equal((await db.query('select count(*)::int count from public.schemes')).rows[0].count,count);
  const output=resolve(__dirname,'../.data/enrichment-ui');await mkdir(output,{recursive:true});
  await writeFile(join(output,'comparison.json'),JSON.stringify({live,id,before:{detail:before.detail},after:{detail:after.detail,enrichment:after.enrichment},first,rerun},null,2));
  // A source-only publication artifact can be reviewed/applied via a database connector when
  // runtime credentials are unavailable. It contains no accounts, sessions or secret values.
  if(live){const entry=(await db.query('select * from public.scheme_catalog_imports where scheme_id=$1',[id])).rows[0],version=(await db.query('select * from public.scheme_catalog_versions where id=$1',[entry.published_version])).rows[0],source=(await db.query('select * from public.scheme_catalog_sources where id=$1',['tracked-'+entry.id])).rows[0];await writeFile(join(output,'validated-publication.json'),JSON.stringify({scheme:{id,name:seed.scheme_name,url:seed.official_url},entry,version,source},null,2));}
  vite=spawn(process.execPath,[resolve(__dirname,'../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5177','--strictPort'],{cwd:resolve(__dirname,'../frontend'),env:{...process.env,VITE_API_URL:api},stdio:'ignore',windowsHide:true});
  for(let attempt=0;attempt<80;attempt++){try{if((await originalFetch(frontend)).ok)break;}catch{}if(attempt===79)throw Error('Vite did not start');await new Promise(done=>setTimeout(done,250));}
  browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(frontend+'/schemes/'+id);await page.getByText('2026-11-30',{exact:true}).waitFor();await page.getByRole('heading',{name:'Eligibility',exact:true}).waitFor();const dateLink=page.getByRole('link',{name:'Official source for Important Dates item 1',exact:true});assert.equal(await dateLink.getAttribute('href'),'https://scholarships.gov.in/All-Scholarships');await page.getByText(/Income certificate will be required only/).first().waitFor();assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth),width);await page.screenshot({path:join(output,'csss-'+width+'.png'),fullPage:true});await page.reload();await page.getByText('2026-11-30',{exact:true}).waitFor();}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({mode:live?'live official fetch':'official fixture replay',backfilled:first.published,rerun,id,schemeCount:count,deadline:'2026-11-30',gaps:['fees'],browser:'desktop/mobile reload passed',output},null,2));
 }finally{if(browser)await browser.close();vite?.kill();await new Promise(done=>{server.close(done);server.closeAllConnections();});globalThis.fetch=originalFetch;dns.lookup=lookup;await closeDatabase();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
