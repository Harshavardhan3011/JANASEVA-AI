import { randomUUID } from 'node:crypto';
import { database } from '../../config/db';
import { env } from '../../config/env';
import { createOfficialReader, discoverPib, readDocument } from './catalog.fetch';
import { captureDocument, generateVersion, publishVersion } from './catalog.repo';
import { hasSearchKey, searchMetadata, searchOfficialSchemes } from './catalog.search';
import { loadApprovedHosts, discoverListing } from './catalog.registry';
import { runRechecks } from './catalog.recheck';
import { metadataSchema } from './catalog.types';

interface CatalogSource {
  id:string; url:string; kind:'pib_rss'|'document'|'official_search'|'listing'; settings:unknown;
  lease_id:string; interval_minutes:number;
}
interface Counts { added:number; changed:number; skipped:number; failed:number; published:number }
interface Outcome { url:string; result:string; published?:boolean; error?:string }
const safeError=(error:unknown)=>{
  if (!(error instanceof Error)) return 'Unknown job failure.';
  const code=(error.cause as { code?:string }|undefined)?.code;
  return (code ? error.message+' ('+code+')' : error.message).slice(0,420);
};

async function claim() {
  const lease=randomUUID();
  const { rows:[source] }=await (await database()).query<CatalogSource>(`
    update public.scheme_catalog_sources set lease_id=$1,lease_until=now()+interval '12 minutes'
    where id=(select id from public.scheme_catalog_sources
      where enabled and (kind<>'official_search' or $2::boolean) and next_check_at<=now() and (lease_until is null or lease_until<now())
      order by next_check_at,id for update skip locked limit 1)
    returning id,url,kind,settings,lease_id,interval_minutes
  `,[lease,hasSearchKey()]);
  return source;
}

export async function runCatalogSync(trigger='scheduled',autoPublish=true) {
  const db=await database();
  await loadApprovedHosts();
  await runRechecks();
  await db.query(`update public.scheme_catalog_runs
    set finished_at=now(),failed=greatest(failed,1),error='The worker stopped before recording a result.'
    where finished_at is null and started_at<now()-interval '13 minutes'`);
  for (;;) {
    const source=await claim();
    if (!source) return;
    const counters:Counts={ added:0,changed:0,skipped:0,failed:0,published:0 };
    const outcomes:Outcome[]=[];
    let sourceError:string|null=null;
    let nextSearchCursor:number|null=null;
    await db.query(`insert into public.scheme_catalog_runs(id,source_id,trigger_kind) values($1,$2,$3)`,
      [source.lease_id,source.id,trigger]);
    try {
      const read=createOfficialReader();
      const defaults=source.settings as Record<string,unknown>;
      const search=source.kind==='official_search' ? await searchOfficialSchemes(defaults) : null;
      nextSearchCursor=search?.nextCursor ?? null;
      const listing=source.kind==='listing' ? await discoverListing(read,source.url) : null;
      const candidates=listing ?? search?.candidates ?? (source.kind==='pib_rss'
        ? await discoverPib(read,source.url)
        : [{ url:source.url,title:String(defaults.title || '') }]);
      for (const candidate of candidates) {
        try {
          const announceOnly=source.kind==='pib_rss' && !/^(?:launch(?: of|es|ed)?|new scheme|scheme guidelines)|(?:नई योजना का शुभारंभ|योजना के दिशा-निर्देश)/iu.test(candidate.title);
          const document=await readDocument(read,candidate.url,candidate.title);
          const metadata=search ? searchMetadata(document,candidate.url) : metadataSchema.parse({
            ...defaults,title:candidate.title,
            reviewNote:announceOnly ? 'This press release may report activity about a scheme rather than define a new scheme.' : defaults.reviewNote,
          });
          if (!metadata) {
            counters.skipped++;
            outcomes.push({url:candidate.url,result:'no-scheme-title'});
            continue;
          }
          const capture=await captureDocument(metadata,{
            ...document,originalTitle:document.originalTitle || metadata.title,
          });
          counters[capture.kind]++;
          const draft=await generateVersion(capture.version.id);
          let published=false;
          if (draft.status==='generation_failed') {
            counters.failed++;
          } else if (autoPublish && env.SCHEME_CATALOG_AUTO_PUBLISH && draft.status==='draft' && draft.description?.overview.length) {
            published=Boolean(await publishVersion(draft.id,null));
            if (published) counters.published++;
            else {
              draft.error='Automatic verification needs clearer, consistent official evidence. A later sync will retry.';
              await db.query(`update public.scheme_catalog_versions set status='generation_failed',
                error='Automatic verification needs clearer, consistent official evidence. A later sync will retry.',
                retry_at=now()+interval '1 hour' where id=$1 and status<>'published'`,[draft.id]);
              counters.failed++;
            }
          }
          outcomes.push({ url:candidate.url,result:capture.kind,published,error:draft.error || undefined });
        } catch(error) {
          counters.failed++;
          outcomes.push({url:candidate.url,result:'failed',error:safeError(error)});
        }
      }
    } catch(error) {
      counters.failed++;
      sourceError=safeError(error);
    }
    const error=sourceError ?? outcomes.find(result=>result.error)?.error ?? null;
    await db.transaction(async tx=>{
      await tx.query(`update public.scheme_catalog_runs set finished_at=now(),added=$2,changed=$3,skipped=$4,
        failed=$5,published=$6,error=$7,outcomes=$8 where id=$1`,
        [source.lease_id,counters.added,counters.changed,counters.skipped,counters.failed,counters.published,error,JSON.stringify(outcomes)]);
      await tx.query(`update public.scheme_catalog_sources set lease_id=null,lease_until=null,last_checked_at=now(),
        last_success_at=case when $3::text is null then now() else last_success_at end,
        next_check_at=case when $3::text is null then
          greatest(now()+interval '1 minute',date_trunc('minute',(select started_at from public.scheme_catalog_runs where id=$2))+
            interval '1 minute'*interval_minutes)
          else now()+interval '1 minute'*interval_minutes end,
        last_error=$3,settings=case when $4::bigint is null then settings
          else jsonb_set(settings,'{cursor}',to_jsonb($4::bigint)) end
        where id=$1 and lease_id=$2`,[source.id,source.lease_id,error,nextSearchCursor]);
    });
    if (source.id.startsWith('registry-')) await db.query(`update public.scheme_source_registry
      set checked_at=now(),last_error=$2,last_success_at=case when $2::text is null then now() else last_success_at end where id=$1`,
      [source.id.slice(9),error]);
  }
}

let job:Promise<void>|undefined;
export function wakeCatalog(trigger:string,autoPublish=true) {
  return job ??= runCatalogSync(trigger,autoPublish).finally(()=>{job=undefined;});
}
export function scheduleCatalog() {
  if (!env.SCHEME_CATALOG_ENABLED || env.NODE_ENV==='test') return async ()=>{};
  const wake=()=>void wakeCatalog('scheduled').catch(error=>console.error('Scheme catalog sync:',safeError(error)));
  const initial=setTimeout(wake,5000);
  const tick=setInterval(wake,60000);
  initial.unref();tick.unref();
  return async ()=>{ clearTimeout(initial);clearInterval(tick);await job?.catch(()=>{}); };
}
