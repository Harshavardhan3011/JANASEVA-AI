import { randomUUID } from 'node:crypto';
import { database } from '../../config/db';
import { createOfficialReader,readDocument } from './catalog.fetch';
import { captureDocument,generateVersion,publishVersion } from './catalog.repo';
import { metadataSchema,officialSourceUrl } from './catalog.types';
import { loadApprovedHosts } from './catalog.registry';
import { audit } from './catalog.audit';
import { enrichmentFields } from './catalog.enrichment';
import type { Version } from './catalog.repo';
import type { SourceDocument } from './catalog.types';
import { searchSchemeFields } from './catalog.search';
import { searchPublishers } from './catalog.publishers';
import { matchesSchemeName } from './catalog.identity';

export async function enqueueBackfill(schemeId?:string,retry=false,actor:string|null=null) {
 const db=await database();
 const {rows}=await db.query(`insert into public.scheme_enrichment_tasks(scheme_id)
   select s.id from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id
   left join public.scheme_catalog_versions v on v.id=i.published_version
   where s.status='ACTIVE' and ($1::uuid is null or s.id=$1)
   on conflict(scheme_id) do update set status='queued',requested_at=now(),next_attempt_at=now(),
    attempts=case when $2::boolean or scheme_enrichment_tasks.status='completed' then 0 else scheme_enrichment_tasks.attempts end,error=null
   where scheme_enrichment_tasks.status<>'running' and ($2::boolean or
    (scheme_enrichment_tasks.status in ('completed','failed') and scheme_enrichment_tasks.next_attempt_at<=now() and
     (scheme_enrichment_tasks.status='completed' or scheme_enrichment_tasks.attempts<5)))
   returning scheme_id`,[schemeId || null,retry]);
 if(actor)await audit(db,actor,'scheme.enrichment.queued','scheme',schemeId || 'all','Queued official field enrichment for '+rows.length+' records.');
 return rows.length;
}

export async function runEnrichmentTasks(limit=3,schemeId?:string) {
 const db=await database();await loadApprovedHosts();
 const counts={scanned:0,published:0,skipped:0,review:0,failed:0};
 for(let index=0;index<limit;index++) {
  const token=randomUUID();
  const {rows:[task]}=await db.query<{scheme_id:string;attempts:number}>(`update public.scheme_enrichment_tasks set
   status='running',worker_token=$1,lease_until=now()+interval '12 minutes',attempts=attempts+1,error=null
   where scheme_id=(select scheme_id from public.scheme_enrichment_tasks where
     ((status in ('queued','failed') and attempts<5 and next_attempt_at<=now()) or (status='running' and lease_until<now())) and ($2::uuid is null or scheme_id=$2)
     order by requested_at for update skip locked limit 1) returning scheme_id,attempts`,[token,schemeId || null]);
  if(!task)break;counts.scanned++;
  const failures:Array<{url:string;status:string;reason:string}>=[];
  try {
   const {rows:[entry]}=await db.query(`select s.*,i.current_version,i.published_version,v.metadata,v.source_url,v.source_text,v.original_title,
    v.description as published_description,v.evidence_sources,v.enrichment_report,d.human_edited as pending_edits
    from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id
    left join public.scheme_catalog_versions v on v.id=i.published_version
    left join public.scheme_catalog_versions d on d.id=i.current_version and d.id is distinct from i.published_version where s.id=$1`,[task.scheme_id]);
   if(!entry || entry.status!=='ACTIVE')throw new Error('The scheme is no longer active.');
   if(entry.pending_edits){
    await db.query(`update public.scheme_enrichment_tasks set status='review',worker_token=null,lease_until=null,
     error='A manually edited draft is awaiting review; it was preserved.',result=$3
     where scheme_id=$1 and worker_token=$2`,[task.scheme_id,token,JSON.stringify({outcome:'manual_review',checkedAt:new Date().toISOString()})]);
    counts.review++;continue;
   }
   const meta=metadataSchema.parse(entry.metadata?{...entry.metadata,schemeId:entry.id}:{schemeId:entry.id,title:entry.scheme_name,issuer:entry.department,
    state:entry.coverage_state || '',category:entry.category || (/scholarship|education/i.test(entry.scheme_name+' '+entry.department)?'Education':'Other'),aliases:[...(entry.aliases || [])].filter((value:string)=>value?.length>=2 && value.length<=120).slice(0,12)});
   const candidates=[entry.source_url || entry.official_url,...(entry.evidence_sources || []).map((source:{url:string})=>source.url),...(meta.sourceLinks || []).map(link=>link.url)];
   let draft:Version|undefined,partial:SourceDocument|undefined;
   let searched=false;
   for(let position=0;position<Math.min(candidates.length,6);position++) {
    const candidate=candidates[position];if(candidates.indexOf(candidate)!==position)continue;
    try {
     const url=officialSourceUrl.parse(candidate);
     const document=await readDocument(createOfficialReader(),url,meta.title);
     if(!document.text.trim())throw new Error(document.extraction?.error || 'No readable official source text.');
     if(!matchesSchemeName(document.text,meta))throw new Error('Scheme identity not confirmed in the opened source.');
     if(document.incomplete){partial ??= document;throw new Error(document.extraction?.error || 'Partial source retained for review; checking alternatives.');}
     const captured=await captureDocument(meta,document,null,Boolean(entry.published_version));
     const generated=await generateVersion(captured.version.id,true);
     if(generated.status==='generation_failed')throw new Error(generated.error || 'Extraction failed.');
     draft=generated;break;
    }catch(error){failures.push({url:candidate,status:'unverified',reason:error instanceof Error?(error.message+((error.cause as {code?:string}|undefined)?.code?' ('+(error.cause as {code:string}).code+')':'')).slice(0,300):'Source failed.'});}
    if(!searched){
     searched=true;
     const {rows:registry}=await db.query<{url:string;department:string}>("select url,department from public.scheme_source_registry where approved and (jurisdiction=$1 or jurisdiction='India') order by case when lower(department) in (lower($2),lower($3)) then 0 else 1 end limit 12",[meta.state || 'India',meta.issuer,meta.category]);
     const departmentHosts=registry.filter(row=>[meta.issuer.toLowerCase(),meta.category.toLowerCase()].includes(row.department.toLowerCase())).map(row=>new URL(row.url).hostname.replace(/^www\./,''));
     const hosts=[...new Set([...departmentHosts,new URL(entry.official_url).hostname.replace(/^www\./,''),...searchPublishers.filter(row=>row.state===meta.state).map(row=>row.host),...registry.map(row=>new URL(row.url).hostname.replace(/^www\./,''))])];
     try{candidates.push(...await searchSchemeFields(meta.title,meta.state,['eligibility','documents','benefits','applicationSteps','contacts'],hosts,{aliases:meta.aliases,issuer:meta.issuer}));}
     catch{failures.push({url:entry.official_url,status:'search-unavailable',reason:'Official search unavailable; known source alternatives were still attempted.'});}
    }
   }
   if(!draft && partial){const captured=await captureDocument(meta,partial,null,Boolean(entry.published_version));const generated=await generateVersion(captured.version.id,true);if(generated.status!=='generation_failed')draft=generated;}
   if(!draft)throw new Error('All available official sources failed. '+failures.map(failure=>failure.reason).join(' ').slice(0,280));
   if(draft.enrichment_report){
    draft.enrichment_report.attempts.unshift(...failures);
    const unavailable=new Set(draft.enrichment_report.attempts.filter(attempt=>attempt.status==='unverified').map(attempt=>attempt.url));
    for(const field of Object.values(draft.enrichment_report.fields))if(field.sources.some(url=>unavailable.has(url))){field.status='unverified';field.note='Could not verify from official sources on this check; prior verified values were retained.';}
    draft.enrichment_report.changedFields=enrichmentFields.filter(field=>JSON.stringify(field==='fees'?draft!.description?.record?.facts.fees:draft!.description?.[field])!==JSON.stringify(field==='fees'?entry.published_description?.record?.facts.fees:entry.published_description?.[field]));
    await db.query('update public.scheme_catalog_versions set enrichment_report=$2 where id=$1',[draft.id,JSON.stringify(draft.enrichment_report)]);
   }
   if(entry.published_description && JSON.stringify(entry.published_description)===JSON.stringify(draft.description)) {
    await db.query('update public.scheme_catalog_versions set enrichment_report=$2 where id=$1',[entry.published_version,JSON.stringify(draft.enrichment_report)]);
    await db.query('update public.scheme_catalog_imports set current_version=published_version where id=$1 and current_version=$2',[draft.import_id,draft.id]);
    await finish('completed',{...draft,id:entry.published_version},'skipped');counts.skipped++;continue;
   }
   if(!draft.description?.overview.length){await finish('review',draft,'review');counts.review++;continue;}
   const published=await publishVersion(draft.id,null,'Automatically enriched missing fields using captured official evidence.');
   if(published){await finish('completed',draft,'published');counts.published++;}
   else {await finish('review',draft,'review');counts.review++;}
  }catch(error) {
   const code=error instanceof Error?(error.cause as {code?:string}|undefined)?.code:undefined;
   counts.failed++;await db.query(`update public.scheme_enrichment_tasks set status=case when attempts>=5 then 'review' else 'failed' end,
    worker_token=null,lease_until=null,next_attempt_at=now()+interval '1 hour'*least(24,power(2,attempts)::integer),error=$3,result=$4
    where scheme_id=$1 and worker_token=$2`,[task.scheme_id,token,error instanceof Error?(error.message+(code?' ('+code+')':'')).slice(0,400):'Official enrichment failed.',JSON.stringify({outcome:'failed',checkedAt:new Date().toISOString(),attempts:failures,fields:Object.fromEntries(enrichmentFields.map(field=>[field,{status:'unverified',sources:[],note:'Could not verify from official sources'}])),note:'Could not verify from official sources; previous published values retained.'})]);
  }
  async function finish(status:string,version:Version,outcome:string) {
   await db.query(`update public.scheme_enrichment_tasks set status=$3,worker_token=null,lease_until=null,
    completed_at=now(),next_attempt_at=now()+interval '7 days',version_id=$4,result=$5,error=null
    where scheme_id=$1 and worker_token=$2`,[task.scheme_id,token,status,version.id,JSON.stringify({outcome,changedFields:version.enrichment_report?.changedFields || [],fields:version.enrichment_report?.fields || {},attempts:version.enrichment_report?.attempts || [],conflicts:version.enrichment_report?.conflicts || []})]);
   await audit(db,null,'scheme.enrichment.'+outcome,'scheme',task.scheme_id,'Official field enrichment '+outcome+'.');
  }
 }
 return counts;
}
