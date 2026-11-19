import { createHash,randomUUID } from 'node:crypto';
import { database, Database } from '../../config/db';
import { AppError } from '../../shared/errors';
import { describeScheme } from './catalog.ai';
import { canonicalSource, compact, verifyDescription } from './catalog.types';
import type { ImportMetadata, SchemeDescription, SourceDocument } from './catalog.types';

interface ImportRow {
  id:string; scheme_id:string|null; current_version:string|null; published_version:string|null;
  canonical_url:string; official_key:string|null;
}
export interface Version {
  id:string; import_id:string; source_text:string; source_url:string; original_title:string; fingerprint:string;
  metadata:ImportMetadata & { applyUrl:string|null; incomplete:boolean };
  description:SchemeDescription|null; status:'draft'|'generation_failed'|'published';
  error:string|null; generation_attempts:number; retry_at:Date|string|null;
}

async function lockImport(db:Database,id:string) {
  const { rows:[row] }=await db.query<ImportRow>('select * from public.scheme_catalog_imports where id=$1 for update',[id]);
  if (!row) throw AppError.notFound('Scheme import not found.');
  return row;
}

export async function captureDocument(meta:ImportMetadata,document:SourceDocument) {
  const canonical=canonicalSource(document.url);
  const authority=new URL(canonical).hostname.replace(/^www\./,'');
  const legacyKey=meta.officialId ? authority+':'+meta.officialId.toUpperCase() : null;
  const key=meta.officialId && meta.state ? authority+':'+meta.state.toUpperCase()+':'+meta.officialId.toUpperCase() : legacyKey;
  const metadata={ ...meta,applyUrl:document.applyUrl,incomplete:document.incomplete };
  const hash=createHash('sha256').update(JSON.stringify([
    compact(document.text),document.originalTitle,document.applyUrl,document.incomplete,
  ])).digest('hex');
  return (await database()).transaction(async db=>{
    await db.query(`insert into public.scheme_catalog_imports(canonical_url,official_key)
      values($1,$2) on conflict do nothing`,[canonical,key]);
    const { rows }=await db.query<ImportRow>(`select * from public.scheme_catalog_imports
      where canonical_url=$1 or official_key=$2 for update`,[canonical,key]);
    if (rows.length!==1 || (key && rows[0].official_key && key!==rows[0].official_key && !(rows[0].canonical_url===canonical && rows[0].official_key===legacyKey))) {
      throw AppError.conflict('This official ID and source URL refer to different imports. Resolve the conflict before updating.');
    }
    const entry=rows[0];
    await db.query('update public.scheme_catalog_imports set last_fetched_at=now(), official_key=coalesce(official_key,$2) where id=$1',[entry.id,key]);
    const { rows:[previous] }=entry.current_version ? await db.query<Version>(
      'select * from public.scheme_catalog_versions where id=$1',[entry.current_version]) : {rows:[]};
    if (previous?.fingerprint===hash) return { kind:'skipped' as const, version:previous };
    const { rows:[version] }=await db.query<Version>(`
      insert into public.scheme_catalog_versions(import_id,original_title,source_url,source_text,fingerprint,metadata)
      values($1,$2,$3,$4,$5,$6) returning *
    `,[entry.id,document.originalTitle,document.url,document.text,hash,JSON.stringify(metadata)]);
    await db.query('update public.scheme_catalog_imports set current_version=$2 where id=$1',[entry.id,version.id]);
    return { kind:previous ? 'changed' as const : 'added' as const,version };
  });
}

export async function generateVersion(id:string,force=false) {
  const db=await database();
  const { rows:[original] }=await db.query<Version>('select * from public.scheme_catalog_versions where id=$1',[id]);
  if (!original) throw AppError.notFound('Draft not found.');
  if (original.status==='published' || (!force && original.description)) return original;
  const token=randomUUID();
  const { rows:[current] }=await db.query<Version>(`
    update public.scheme_catalog_versions v set generation_attempts=generation_attempts+1,
      generation_lease_until=now()+interval '2 minutes',generation_token=$2
    from public.scheme_catalog_imports i where v.id=$1 and i.current_version=v.id and v.status<>'published'
      and (v.generation_lease_until is null or v.generation_lease_until<now())
      and ($3::boolean or (v.description is null and (v.retry_at is null or v.retry_at<=now())))
    returning v.*
  `,[id,token,force]);
  if (!current) return original;
  try {
    if (!current.source_text.trim()) throw new Error('The document has no readable source text. Upload a text-based official PDF.');
    const description=await describeScheme(current.metadata,current.source_text);
    const errors=verifyDescription(description,current.source_text).problems;
    if (errors.length) throw new Error(errors.join(' '));
    const { rows:[saved] }=await db.query<Version>(`
      update public.scheme_catalog_versions set description=$3,status='draft',error=null,
        generation_lease_until=null,generation_token=null,retry_at=null
      where id=$1 and generation_token=$2 returning *
    `,[id,token,JSON.stringify(description)]);
    return saved || original;
  } catch(error) {
    const message=error instanceof Error ? error.message.slice(0,420) : 'AI description generation failed.';
    const minutes=Math.min(360,15*2**Math.min(current.generation_attempts-1,5));
    const { rows:[failed] }=await db.query<Version>(`
      update public.scheme_catalog_versions set status='generation_failed',error=$3,
        generation_lease_until=null,generation_token=null,retry_at=now()+interval '1 minute' * $4::integer
      where id=$1 and generation_token=$2 returning *
    `,[id,token,message,minutes]);
    return failed || original;
  }
}

export async function editDraft(id:string,description:SchemeDescription) {
  return (await database()).transaction(async db=>{
    const version=await currentDraft(db,id);
    const validation=verifyDescription(description,version.source_text);
    if (validation.problems.length) throw AppError.badRequest(validation.problems.join(' '));
    await db.query(`update public.scheme_catalog_versions set description=$2,status='draft',error=null
      where id=$1`,[id,JSON.stringify(description)]);
  });
}

async function currentDraft(db:Database,id:string) {
  const { rows:[link] }=await db.query<{import_id:string}>('select import_id from public.scheme_catalog_versions where id=$1',[id]);
  if (!link) throw AppError.notFound('Draft not found.');
  const entry=await lockImport(db,link.import_id);
  if (entry.current_version!==id || entry.published_version===id) throw AppError.conflict('Reload the current unpublished draft.');
  const { rows:[version] }=await db.query<Version & {generation_lease_until:Date|string|null}>(
    'select * from public.scheme_catalog_versions where id=$1 for update',[id]);
  if (version.generation_lease_until && new Date(version.generation_lease_until).getTime()>Date.now()) {
    throw AppError.conflict('A description is being generated. Refresh the draft after it finishes.');
  }
  return version;
}

export async function publishVersion(id:string,actor:string|null) {
  return (await database()).transaction(async db=>{
    const version=await currentDraft(db,id);
    const entry=await lockImport(db,version.import_id);
    const draft=version.description;
    if (!draft?.overview.length) throw AppError.badRequest('Add an overview supported by the official material before publishing.');
    const validation=verifyDescription(draft,version.source_text);
    if (validation.problems.length) throw AppError.badRequest(validation.problems.join(' '));
    if (!actor && (!validation.extractive || draft.reviewIssues.length || version.metadata.incomplete || version.metadata.reviewNote ||
      (!draft.eligibility.length && !draft.whoCanApply.length) || !draft.benefits.length)) return null;

    let schemeId=entry.scheme_id;
    if (!schemeId) {
      const { rows }=await db.query<{id:string}>(`select s.id from public.schemes s
        where s.official_url in ($1,$2)
          and not exists(select 1 from public.scheme_catalog_imports i where i.scheme_id=s.id)
        limit 2`,[entry.canonical_url,version.source_url]);
      if (rows.length===1) schemeId=rows[0].id;
    }
    if (!actor && !schemeId) {
      const { rows }=await db.query(`select id from public.schemes where lower(scheme_name)=lower($1)
        and (coverage_state is null or lower(coverage_state)=lower($2))`,[version.metadata.title,version.metadata.state]);
      if (rows.length) return null;
    }
    if (!actor && entry.published_version) {
      const { rows:[prior] }=await db.query<Pick<Version,'description'>>('select description from public.scheme_catalog_versions where id=$1',[entry.published_version]);
      if (prior?.description && (
        (prior.description.documents.length && !draft.documents.length) ||
        (prior.description.dates.length && !draft.dates.length) ||
        (prior.description.status==='closed' && draft.status!=='closed')
      )) return null;
    }
    const meta=version.metadata;
    if (!schemeId) {
      const { rows:[created] }=await db.query<{id:string}>(`
        insert into public.schemes(scheme_name,description,department,official_url,catalog_source_url,coverage_state,category,
          application_url,last_verified_at,catalog_checked_on)
        values($1,$2,$3,$4,$4,$5,$6,$7,now(),(now() at time zone 'Asia/Kolkata')::date)
        returning id
      `,[meta.title,draft.overview[0].text,meta.issuer,version.source_url,meta.state||null,meta.category,meta.applyUrl]);
      schemeId=created.id;
    }
    await db.query(`update public.scheme_catalog_imports set scheme_id=$2,published_version=$3 where id=$1`,
      [entry.id,schemeId,id]);
    await db.query(`update public.scheme_catalog_versions set status='published',verified_at=now(),reviewed_by=$2,error=null
      where id=$1`,[id,actor]);
    await db.query(`insert into public.scheme_catalog_sources(id,label,url,kind,settings,interval_minutes,next_check_at)
      values($1,$2,$3,'document',$4,1440,now()+interval '1 day') on conflict(id) do update set
      label=excluded.label,url=excluded.url,settings=excluded.settings`,
      ['tracked-'+entry.id,meta.title,version.source_url,JSON.stringify({
        title:meta.title,issuer:meta.issuer,state:meta.state,category:meta.category,
        officialId:meta.officialId,aliases:meta.aliases,district:meta.district,coverageLevel:meta.coverageLevel,
        applicationPortalSource:meta.applicationPortalSource,reviewNote:meta.reviewNote,
      })]);
    return schemeId;
  });
}
