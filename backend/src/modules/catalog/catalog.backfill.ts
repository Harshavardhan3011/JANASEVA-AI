import { randomUUID } from 'node:crypto';
import { database } from '../../config/db';
import { createOfficialReader,readDocument } from './catalog.fetch';
import { captureDocument,generateVersion,publishVersion } from './catalog.repo';
import { metadataSchema,officialSourceUrl } from './catalog.types';
import { loadApprovedHosts } from './catalog.registry';
import { audit } from './catalog.audit';
import type { Version } from './catalog.repo';

export async function enqueueBackfill(schemeId?:string,retry=false,actor:string|null=null) {
 const db=await database();
 const {rows}=await db.query(`insert into public.scheme_enrichment_tasks(scheme_id)
   select s.id from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id
   left join public.scheme_catalog_versions v on v.id=i.published_version
   where s.status='ACTIVE' and ($1::uuid is null or s.id=$1) and ($1::uuid is not null or v.id is null or
     coalesce(jsonb_array_length(v.description->'benefits'),0)=0 or coalesce(jsonb_array_length(v.description->'eligibility'),0)=0 or
     coalesce(jsonb_array_length(v.description->'documents'),0)=0 or coalesce(jsonb_array_length(v.description->'applicationSteps'),0)=0 or
     exists(select 1 from jsonb_each(coalesce(v.enrichment_report->'fields','{}')) field where field.value->>'status'='unverified'))
   on conflict(scheme_id) do update set status='queued',requested_at=now(),next_attempt_at=now(),attempts=0,error=null
   where scheme_enrichment_tasks.status<>'running' and ($2::boolean or scheme_enrichment_tasks.next_attempt_at<=now())
   returning scheme_id`,[schemeId || null,retry]);
 if(actor)await audit(db,actor,'scheme.enrichment.queued','scheme',schemeId || 'all','Queued official field enrichment for '+rows.length+' records.');
 return rows.length;
}

export async function runEnrichmentTasks(limit=3,schemeId?:string) {
 const db=await database();await loadApprovedHosts();
 const counts={published:0,skipped:0,review:0,failed:0};
 for(let index=0;index<limit;index++) {
  const token=randomUUID();
  const {rows:[task]}=await db.query<{scheme_id:string;attempts:number}>(`update public.scheme_enrichment_tasks set
   status='running',worker_token=$1,lease_until=now()+interval '12 minutes',attempts=attempts+1,error=null
   where scheme_id=(select scheme_id from public.scheme_enrichment_tasks where
     ((status in ('queued','failed') and attempts<5 and next_attempt_at<=now()) or (status='running' and lease_until<now())) and ($2::uuid is null or scheme_id=$2)
     order by requested_at for update skip locked limit 1) returning scheme_id,attempts`,[token,schemeId || null]);
  if(!task)break;
  try {
   const {rows:[entry]}=await db.query(`select s.*,i.current_version,i.published_version,v.metadata,v.source_url,v.source_text,v.original_title,
    v.description as published_description,v.evidence_sources,v.enrichment_report,d.human_edited as pending_edits
    from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id
    left join public.scheme_catalog_versions v on v.id=i.published_version
    left join public.scheme_catalog_versions d on d.id=i.current_version and d.id is distinct from i.published_version where s.id=$1`,[task.scheme_id]);
   if(!entry || entry.status!=='ACTIVE')throw new Error('The scheme is no longer active.');
   if(entry.pending_edits)throw new Error('A manually edited draft is awaiting review; it was preserved.');
   const meta=metadataSchema.parse(entry.metadata?{...entry.metadata,schemeId:entry.id}:{schemeId:entry.id,title:entry.scheme_name,issuer:entry.department,
    state:entry.coverage_state || '',category:entry.category || (/scholarship|education/i.test(entry.scheme_name+' '+entry.department)?'Education':'Other'),aliases:[...(entry.aliases || []),entry.description].filter((value:string)=>value?.length>=2 && value.length<=255)});
   const url=officialSourceUrl.parse(entry.source_url || entry.official_url);
   const document=await readDocument(createOfficialReader(),url,meta.title);
   if(!document.text.trim() || document.incomplete)throw new Error(document.extraction?.error || 'The official source extraction is incomplete; existing details were retained.');
   const captured=await captureDocument(meta,document,null,Boolean(entry.published_version));
   const draft=await generateVersion(captured.version.id,true);
   if(draft.status==='generation_failed')throw new Error(draft.error || 'Extraction failed.');
   if(entry.published_version && draft.enrichment_report?.attempts.some(attempt=>attempt.status==='unverified' && (entry.evidence_sources || []).some((source:{url:string})=>source.url===attempt.url)))throw new Error('A previously verified supporting source is unavailable or needs review. The published version is retained.');
   if(entry.published_description && JSON.stringify(entry.published_description)===JSON.stringify(draft.description)) {
    await db.query('update public.scheme_catalog_imports set current_version=published_version where id=$1 and current_version=$2',[draft.import_id,draft.id]);
    await finish('completed',{...draft,id:entry.published_version},'skipped');counts.skipped++;continue;
   }
   const published=await publishVersion(draft.id,null,'Automatically enriched missing fields using captured official evidence.');
   if(published){await finish('completed',draft,'published');counts.published++;}
   else {await finish('review',draft,'review');counts.review++;}
  }catch(error) {
   counts.failed++;await db.query(`update public.scheme_enrichment_tasks set status=case when attempts>=5 then 'review' else 'failed' end,
    worker_token=null,lease_until=null,next_attempt_at=now()+interval '1 hour'*least(24,power(2,attempts)::integer),error=$3
    where scheme_id=$1 and worker_token=$2`,[task.scheme_id,token,error instanceof Error?error.message.slice(0,400):'Official enrichment failed.']);
  }
  async function finish(status:string,version:Version,outcome:string) {
   await db.query(`update public.scheme_enrichment_tasks set status=$3,worker_token=null,lease_until=null,
    completed_at=now(),next_attempt_at=now()+interval '7 days',version_id=$4,result=$5,error=null
    where scheme_id=$1 and worker_token=$2`,[task.scheme_id,token,status,version.id,JSON.stringify({outcome,fields:version.enrichment_report?.fields || {},attempts:version.enrichment_report?.attempts || [],conflicts:version.enrichment_report?.conflicts || []})]);
   await audit(db,null,'scheme.enrichment.'+outcome,'scheme',task.scheme_id,'Official field enrichment '+outcome+'.');
  }
 }
 return counts;
}
