import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('official field enrichment backfills legacy CSSS in place, cites second source and preserves reviewed data',{timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'janaseva-enrichment-'));
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',INGESTION_DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SCHEME_ENRICHMENT_ENABLED:'true',LLM_API_KEY:'',TAVILY_API_KEY:'',SCHEME_SEARCH_API_KEY:'',SMTP_HOST:'',BREVO_API_KEY:''});
 const fixture=JSON.parse(await readFile(join(__dirname,'../../src/tests/fixtures/csss-enrichment.json'),'utf8'));
 const {database,closeDatabase}=await import('../config/db');
 const {enqueueBackfill,runEnrichmentTasks}=await import('../modules/catalog/catalog.backfill');
 const {metadataSchema,verifyDescription}=await import('../modules/catalog/catalog.types');
 const {createOfficialReader,readDocument}=await import('../modules/catalog/catalog.fetch');
 const {enrichDetails,extractDetails,stamp,evidenceDocument}=await import('../modules/catalog/catalog.enrichment');
 const {editDraft,publishVersion,captureDocument}=await import('../modules/catalog/catalog.repo');
 const {schemes}=await import('../modules/schemes/schemes.controller');
 const {matchesSchemeName,compatibleScope,ambiguousVariant}=await import('../modules/catalog/catalog.identity');
 const actualFetch=globalThis.fetch,dns=require('node:dns/promises'),lookup=dns.lookup;let outage=false;
 const secondaryHtml='<main><h5>Schemes On NSP</h5></main><div><h6>'+fixture.secondary.text.split('\n')[0]+'</h6>'+fixture.secondary.text.split('\n').slice(1).map((line:string)=>'<span>'+line+'</span>').join('')+'</div><div><h6>Another scholarship</h6><span>Student Application Open till : 01-01-2027</span></div>';
 globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:input.toString());if(url.pathname==='/robots.txt')return new Response('',{status:404});if(outage)return new Response('Unavailable',{status:503});if(url.pathname==='/All-Scholarships')return new Response(secondaryHtml,{headers:{'content-type':'text/html'}});return actualFetch(input,init);};
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 try{
  const db=await database();const {rows:[seed]}=await db.query('select * from public.schemes where scheme_name=$1',['PM-USP CSSS']);const id=seed.id;
  const before=(await schemes(id))[0];assert.equal(before.detail,null);
  const meta=metadataSchema.parse({schemeId:id,title:seed.scheme_name,issuer:seed.department,category:'Education',state:'',aliases:[]});
  assert.equal(matchesSchemeName('An unrelated Merit-based scheme',{title:'Unrelated specific scholarship',aliases:['Merit-based scheme']}),false);
  assert.equal(compatibleScope('2026-27','2025-26'),false);assert.equal(ambiguousVariant('AICTE Pragati Technical Degree','AICTE Pragati scholarships for degree and diploma'),true);
  // The captured primary guideline is replayed through the reader as HTML with identical text,
  // while a live-fetch smoke check separately verifies actual PDF bytes/parser.
  const primaryText=fixture.primary.text;
  globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:input.toString());if(url.pathname==='/robots.txt')return new Response('',{status:404});if(outage)return new Response('Unavailable',{status:503});if(url.pathname==='/All-Scholarships')return new Response(secondaryHtml,{headers:{'content-type':'text/html'}});if(url.href===fixture.primary.url)return new Response('<main>'+primaryText.split('\n').filter(Boolean).map((line:string)=>'<p>'+line+'</p>').join('')+'</main>',{headers:{'content-type':'text/html'}});return actualFetch(input,init);};
  const scoped=await readDocument(createOfficialReader(),'https://scholarships.gov.in/All-Scholarships',meta.title);assert.match(scoped.text,/30-11-2026/);assert.doesNotMatch(scoped.text,/01-01-2027/);assert.equal(scoped.incomplete,false);
  // Keep paragraph boundaries from the PDF fixture for exact labelled extraction.
  const captured=await captureDocument(meta,fixture.primary);const generated=await import('../modules/catalog/catalog.repo').then(module=>module.generateVersion(captured.version.id));
  assert.equal(generated.status,'draft',generated.error || 'Generated');assert.equal(generated.enrichment_report?.fields.dates.status,'verified');
  assert.equal(generated.description!.record!.dates.find(date=>date.kind==='application_deadline')!.value,'2026-11-30');
  assert.deepEqual(verifyDescription(generated.description!,generated.source_text,generated.evidence_sources).problems,[]);
  assert.equal(await publishVersion(generated.id,null),id);
  const after=(await schemes(id))[0];assert.ok(after.detail?.eligibility.length);assert.ok(after.detail?.documents.length);assert.ok(after.detail?.benefits.length);assert.ok(after.detail?.applicationSteps.length);assert.ok(after.detail?.contacts.length);
  assert.equal(after.detail!.dates[0].sourceUrl,'https://scholarships.gov.in/All-Scholarships');assert.equal(after.enrichment?.fields.fees.status,'unverified');assert.equal((after as any).evidence_sources,undefined);
  const tampered=structuredClone(generated.description!);tampered.dates[0].sourceUrl='https://pmkisan.gov.in/fake';assert.ok(verifyDescription(tampered,generated.source_text,generated.evidence_sources).problems.length);
  // An admin-reviewed wording change survives the next enrichment pass.
  const copy=await captureDocument(meta,fixture.primary,null,true);await db.query('update public.scheme_catalog_versions set evidence_sources=$2 where id=$1',[copy.version.id,JSON.stringify(generated.evidence_sources)]);
  const reviewed=structuredClone(generated.description!);reviewed.documents[0].text='Income certificate is required only for fresh applicants.';
  await editDraft(copy.version.id,reviewed);const actor=(await db.query("insert into public.users(email,password_hash,role,name) values('reviewer-enrichment@example.test','unused','admin','Reviewer') returning id")).rows[0].id;
  await publishVersion(copy.version.id,actor);
  const preserved=(await schemes(id))[0].detail!.documents[0].text;
  const proposed=await enrichDetails(meta,fixture.primary,reviewed,generated.evidence_sources);
  assert.equal(proposed.description.documents[0].text,preserved);
  await enqueueBackfill(id,true);const rerun=await runEnrichmentTasks(1,id);assert.equal(rerun.skipped,1);assert.equal((await schemes(id))[0].detail!.documents[0].text,preserved);
  await db.query("update public.scheme_enrichment_tasks set status='running',lease_until=now()-interval '1 minute' where scheme_id=$1",[id]);const resumed=await runEnrichmentTasks(1,id);assert.equal(resumed.skipped,1);
  const outdated={...fixture.primary,url:'https://scholarships.gov.in/old.pdf',text:fixture.primary.text.replace('2022-23 onwards','2020-21 onwards').replace('4.5','8.5')};
  const oldExtract=await extractDetails(meta,outdated);const {preserveVerified}=await import('../modules/catalog/catalog.enrichment');const conflicting=preserveVerified(reviewed,stamp(oldExtract,outdated.url,null,evidenceDocument(outdated).fingerprint));assert.ok(conflicting.reviewIssues.some(issue=>issue.includes('eligibility')));assert.equal(conflicting.documents[0].text,preserved);
  const count=(await db.query('select count(*)::int count from public.schemes')).rows[0].count;
  assert.equal(await enqueueBackfill(id,true),1);outage=true;const failed=await runEnrichmentTasks(1,id);assert.equal(failed.failed,1);assert.equal((await schemes(id))[0].detail!.documents[0].text,preserved);assert.equal((await db.query('select count(*)::int count from public.schemes')).rows[0].count,count);
  await db.query('set role janaseva_ingestor');await db.query('select * from public.scheme_enrichment_tasks limit 1');await assert.rejects(db.query('select * from public.users limit 1'));await db.query('reset role');
 }catch(error){console.error(error);throw error;}finally{globalThis.fetch=actualFetch;dns.lookup=lookup;await closeDatabase();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
