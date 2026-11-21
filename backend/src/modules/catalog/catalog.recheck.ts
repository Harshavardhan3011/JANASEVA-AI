import { database } from '../../config/db';
import { createOfficialReader, readDocument } from './catalog.fetch';
import { captureDocument, generateVersion, publishVersion } from './catalog.repo';
import { metadataSchema } from './catalog.types';
import { env } from '../../config/env';
import { enqueueBackfill,runEnrichmentTasks } from './catalog.backfill';

export async function runRechecks() {
 const db=await database();
 for (let count=0;count<4;count++) {
   const {rows:[request]}=await db.query<{scheme_id:string}>(`update public.scheme_recheck_requests set
     status='running',lease_until=now()+interval '5 minutes' where scheme_id=(
       select scheme_id from public.scheme_recheck_requests where status='pending' or
       (status='running' and lease_until<now()) order by requested_at for update skip locked limit 1)
     returning scheme_id`);
   if (!request) return;
   try {
     if(env.SCHEME_ENRICHMENT_ENABLED){
       await enqueueBackfill(request.scheme_id,true);await runEnrichmentTasks(1,request.scheme_id);
       const {rows:[task]}=await db.query('select status,error from public.scheme_enrichment_tasks where scheme_id=$1',[request.scheme_id]);
       if(task?.status!=='completed')throw new Error(task?.error || 'Official field enrichment needs review; previous details are retained.');
       await db.query("update public.scheme_recheck_requests set status='completed',checked_at=now(),lease_until=null,error=null where scheme_id=$1",[request.scheme_id]);continue;
     }
     const {rows:[source]}=await db.query(`select v.metadata,v.source_url from public.scheme_catalog_imports i
       join public.scheme_catalog_versions v on v.id=i.published_version where i.scheme_id=$1`,[request.scheme_id]);
     if (!source) throw new Error('This catalog entry needs an approved official-source import before rechecking.');
     const document=await readDocument(createOfficialReader(),source.source_url,source.metadata.title);
     const captured=await captureDocument(metadataSchema.parse(source.metadata),document);
     if (captured.kind==='skipped' && captured.version.status==='published') {
       await db.query('update public.scheme_catalog_versions set verified_at=now() where id=$1',[captured.version.id]);
     }
     if (captured.kind!=='skipped') {
       const generated=await generateVersion(captured.version.id);
       if (generated.status==='generation_failed') throw new Error(generated.error || 'Generation failed.');
       if (!await publishVersion(generated.id,null)) throw new Error('Automatic publication needs clearer official evidence; the previous record is retained.');
     }
     await db.query("update public.scheme_recheck_requests set status='completed',checked_at=now(),lease_until=null,error=null where scheme_id=$1",[request.scheme_id]);
   } catch(error) {
     await db.query("update public.scheme_recheck_requests set status='failed',checked_at=now(),lease_until=null,error=$2 where scheme_id=$1",
       [request.scheme_id,error instanceof Error ? error.message.slice(0,300):'Recheck failed.']);
   }
 }
}
