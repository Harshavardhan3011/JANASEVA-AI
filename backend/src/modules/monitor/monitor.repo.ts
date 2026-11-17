import { createHash } from 'node:crypto';
import { database, Database } from '../../config/db';
import { AppError } from '../../shared/errors';
import { publishSchema } from './monitor.types';
import type { Draft, Observation, Source } from './monitor.types';

interface Item {
  id: string;
  source_ref: string;
  status: string;
  draft: Draft;
  evidence: string;
  attachment_key: string | null;
  attachment_mime: string | null;
  fingerprint: string;
  scheme_id: string | null;
}

export async function latestFingerprint(source: Source, reference: string) {
  const db=await database();
  const { rows:[latest] }=await db.query<Pick<Item,'fingerprint'|'status'>>(
    'select fingerprint,status from public.scheme_monitor_items where source_ref=$1 order by created_at desc limit 1',
    [source.id+':'+reference]);
  return latest;
}
export async function markRechecked(source: Source, reference: string) {
  await (await database()).query(`
    update public.schemes set catalog_checked_on=(now() at time zone 'Asia/Kolkata')::date
    where monitor_ref=$1 and catalog_checked_on<(now() at time zone 'Asia/Kolkata')::date
  `,[source.id+':'+reference]);
}
export function fingerprint(observation: Observation) {
  return createHash('sha256').update(JSON.stringify([observation.draft,observation.evidence])).digest('hex');
}

async function publish(db: Database, item: Item, reviewedDraft: Draft, actor: string | null) {
  const draft = publishSchema.parse(reviewedDraft);
  const { rows:[scheme] }=await db.query<{ id:string }>(`
    insert into public.schemes(
      monitor_ref,scheme_name,description,department,official_url,catalog_source_url,
      catalog_checked_on,last_verified_at,application_deadline,application_cycle,category,
      coverage_level,coverage_state,coverage_district,coverage_village,application_url,eligibility_summary,benefits_summary
    ) values($1,$2,$3,$4,$5,$5,(now() at time zone 'Asia/Kolkata')::date,now(),$6,'student',$7,$8,$9,$10,$11,$12,$13,$14)
    on conflict(monitor_ref) do update set
      scheme_name=excluded.scheme_name,description=excluded.description,department=excluded.department,
      official_url=excluded.official_url,catalog_source_url=excluded.catalog_source_url,catalog_checked_on=excluded.catalog_checked_on,
      last_verified_at=excluded.last_verified_at,application_deadline=excluded.application_deadline,category=excluded.category,
      coverage_level=excluded.coverage_level,coverage_state=excluded.coverage_state,coverage_district=excluded.coverage_district,
      coverage_village=excluded.coverage_village,application_url=excluded.application_url,
      eligibility_summary=excluded.eligibility_summary,benefits_summary=excluded.benefits_summary
    returning id
  `,[item.source_ref,draft.title,draft.description,draft.issuer,draft.sourceUrl,draft.deadline,draft.category,draft.level,
    draft.state||null,draft.district||null,draft.village||null,draft.applyUrl,draft.eligibility||null,draft.benefits||null]);
  await db.query(`update public.scheme_monitor_items set
    status='published', draft=$2, reviewed_by=$3, scheme_id=$4, resolved_at=now()
    where id=$1`,[item.id,JSON.stringify(draft),actor,scheme.id]);
  return scheme.id;
}

export async function saveObservation(source: Source, observation: Observation, hash: string) {
  const reference=source.id+':'+observation.reference;
  return (await database()).transaction(async db=>{
    // Serialize revisions and operator publication for this source.
    await db.query('select id from public.scheme_monitor_sources where id=$1 for update',[source.id]);
    const { rows:[previous] }=await db.query<Item>(
      'select * from public.scheme_monitor_items where source_ref=$1 order by created_at desc limit 1',[reference]);
    if (previous?.fingerprint===hash) return 'unchanged';
    await db.query(`update public.scheme_monitor_items set status='superseded',resolved_at=now()
      where source_ref=$1 and status='pending'`,[reference]);
    const { rows:[item] }=await db.query<Item>(`
      insert into public.scheme_monitor_items(source_id,source_ref,fingerprint,draft,evidence,status)
      values($1,$2,$3,$4,$5,'pending') returning *
    `,[source.id,reference,hash,JSON.stringify(observation.draft),observation.evidence]);

    const { rows:[duplicate] }=await db.query<{id:string}>(`
      select id from public.schemes where status='ACTIVE' and monitor_ref is distinct from $1
        and lower(scheme_name)=lower($2)
        and (coverage_state is null or lower(coverage_state)=lower($3))
      limit 1
    `,[reference,observation.draft.title,observation.draft.state]);
    const { rows:[published] }=await db.query<Pick<Item,'draft'>>(
      "select draft from public.scheme_monitor_items where source_ref=$1 and status='published' order by resolved_at desc limit 1",
      [reference]);
    const losesVerifiedDetails=published && (
      (published.draft.deadline && !observation.draft.deadline) || published.draft.eligibility ||
      published.draft.benefits || published.draft.applyUrl
    );
    if (observation.autoPublish && !duplicate && !losesVerifiedDetails) {
      await publish(db,item,observation.draft,null);
      return 'published';
    }
    return 'queued';
  });
}

export async function reviewItem(id: string, actor: string, reviewedDraft?: Draft) {
  return (await database()).transaction(async db=>{
    await db.query(`select s.id from public.scheme_monitor_sources s join public.scheme_monitor_items i
      on i.source_id=s.id where i.id=$1 for update of s`,[id]);
    const { rows:[item] }=await db.query<Item>('select * from public.scheme_monitor_items where id=$1 for update',[id]);
    if (!item) throw AppError.notFound('Notice not found.');
    if (item.status!=='pending') throw AppError.conflict('This notice is no longer awaiting review.');
    if (reviewedDraft) {
      const { rows:[existing] }=await db.query<{id:string}>(`
        select id from public.schemes where status='ACTIVE' and monitor_ref is distinct from $1
          and lower(scheme_name)=lower($2)
          and (coverage_state is null or lower(coverage_state)=lower($3))
        limit 1`,[item.source_ref,reviewedDraft.title,reviewedDraft.state]);
      if (existing) throw AppError.conflict('A similar scheme is already listed. Check the catalog before publishing this notice.');
      return { status:'published', scheme_id:await publish(db,item,reviewedDraft,actor) };
    }
    await db.query("update public.scheme_monitor_items set status='rejected',reviewed_by=$2,resolved_at=now() where id=$1",[id,actor]);
    return { status:'rejected' };
  });
}
