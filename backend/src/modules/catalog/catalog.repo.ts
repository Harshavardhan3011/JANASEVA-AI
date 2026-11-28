import { audit } from './catalog.audit';
import { createHash,randomUUID } from 'node:crypto';
import { database, Database } from '../../config/db';
import { AppError } from '../../shared/errors';
import { describeScheme } from './catalog.ai';
import { canonicalSource, compact, verifyDescription } from './catalog.types';
import type { ImportMetadata, SchemeDescription, SourceDocument } from './catalog.types';
import { sourcePreview } from './record.extract';
import { inferredType } from './record.schema';
import { env } from '../../config/env';
import { enrichDetails,evidenceDocument,extractDetails,preserveVerified,stamp } from './catalog.enrichment';
import type { EnrichmentReport,ExtractionOutcome } from './catalog.enrichment';
import type { EvidenceSource } from './catalog.types';
import { matchesSchemeName,ambiguousVariant } from './catalog.identity';

interface ImportRow {
  id:string; scheme_id:string|null; current_version:string|null; published_version:string|null;
  canonical_url:string; official_key:string|null;
}
export interface Version {
  id:string; import_id:string; source_text:string; source_url:string; original_title:string; fingerprint:string;
  metadata:ImportMetadata & { applyUrl:string|null; incomplete:boolean };
  description:SchemeDescription|null; status:'draft'|'generation_failed'|'published';
  requires_admin_review?:boolean;
  review_disposition?:'pending'|'approved'|'rejected';
  error:string|null; generation_attempts:number; retry_at:Date|string|null;
  reviewed_by?:string|null;human_edited?:boolean;
  evidence_sources?:EvidenceSource[];enrichment_report?:EnrichmentReport|null;
}
export const versionEvidence=(version:Version)=>[...(version.evidence_sources || []),{url:version.source_url,text:version.source_text}];

async function lockImport(db:Database,id:string) {
  const { rows:[row] }=await db.query<ImportRow>('select * from public.scheme_catalog_imports where id=$1 for update',[id]);
  if (!row) throw AppError.notFound('Scheme import not found.');
  return row;
}

export async function captureDocument(meta:ImportMetadata,document:SourceDocument,actor:string|null=null,forceRevision=false) {
  let canonical=canonicalSource(document.identityUrl || document.url);
  if(meta.schemeId){const {rows:[existing]}=await (await database()).query<ImportRow>('select * from public.scheme_catalog_imports where scheme_id=$1',[meta.schemeId]);canonical=existing?.canonical_url || canonical+'#record-'+meta.schemeId;}
  const authority=new URL(canonical).hostname.replace(/^www\./,'');
  const legacyKey=meta.officialId ? authority+':'+meta.officialId.toUpperCase() : null;
  const key=meta.officialId && meta.state ? authority+':'+meta.state.toUpperCase()+':'+meta.officialId.toUpperCase() : legacyKey;
  const metadata={ ...meta,publicationDate:document.publicationDate ?? meta.publicationDate,
    sourceId:document.sourceId || meta.sourceId,originalLanguage:document.originalLanguage || meta.originalLanguage,
    extraction:document.extraction,sourceLinks:document.links,applyUrl:document.applyUrl,incomplete:document.incomplete };
  const hash=createHash('sha256').update(JSON.stringify([
    compact(document.text),document.originalTitle,document.applyUrl,document.incomplete,
  ])).digest('hex');
  return (await database()).transaction(async db=>{
    await db.query(`insert into public.scheme_catalog_imports(canonical_url,official_key,scheme_id)
      values($1,$2,$3) on conflict do nothing`,[canonical,key,meta.schemeId || null]);
    const { rows }=await db.query<ImportRow>(`select * from public.scheme_catalog_imports
      where canonical_url=$1 or official_key=$2 for update`,[canonical,key]);
    if (rows.length!==1 || (key && rows[0].official_key && key!==rows[0].official_key && !(rows[0].canonical_url===canonical && rows[0].official_key===legacyKey))) {
      throw AppError.conflict('This official ID and source URL refer to different imports. Resolve the conflict before updating.');
    }
    const entry=rows[0];
    await db.query('update public.scheme_catalog_imports set last_fetched_at=now(), official_key=coalesce(official_key,$2) where id=$1',[entry.id,key]);
    const { rows:[previous] }=entry.current_version ? await db.query<Version>(
      'select * from public.scheme_catalog_versions where id=$1',[entry.current_version]) : {rows:[]};
    const needsClassification=previous?.status==='published' && !previous.description?.record && inferredType(previous.original_title)!=='scheme';
    if(!metadata.applyUrl && previous?.metadata.applyUrl)metadata.applyUrl=previous.metadata.applyUrl;
    if (previous?.fingerprint===hash && !needsClassification && !forceRevision) return { kind:'skipped' as const, version:previous };
    const { rows:[version] }=await db.query<Version>(`
      insert into public.scheme_catalog_versions(import_id,original_title,source_url,source_text,fingerprint,metadata,requires_admin_review)
      values($1,$2,$3,$4,$5,$6,$7) returning *
    `,[entry.id,document.originalTitle,document.url,document.text,hash,JSON.stringify(metadata),Boolean(actor) || Boolean(previous?.requires_admin_review && previous.review_disposition==='pending')]);
    await db.query('update public.scheme_catalog_imports set current_version=$2 where id=$1',[entry.id,version.id]);
    await audit(db,actor,previous?'scheme.source.changed':'scheme.source.added','version',version.id,'Captured official source evidence.');
    return { kind:previous ? 'changed' as const : 'added' as const,version };
  });
}

export async function generateVersion(id:string,force=false) {
  const db=await database();
  const { rows:[original] }=await db.query<Version>('select * from public.scheme_catalog_versions where id=$1',[id]);
  if (!original) throw AppError.notFound('Draft not found.');
  if (original.human_edited) {
    if (force) throw AppError.conflict('Manual edits are preserved. Refresh the official source to create a separate proposed revision instead of replacing this draft.');
    return original;
  }
  if (original.review_disposition==='rejected' || original.status==='published' || (!force && original.description && original.status==='draft')) return original;
  const token=randomUUID();
  const { rows:[current] }=await db.query<Version>(`
    update public.scheme_catalog_versions v set generation_attempts=generation_attempts+1,
      generation_lease_until=now()+interval '6 minutes',generation_token=$2
    from public.scheme_catalog_imports i where v.id=$1 and i.current_version=v.id and v.status<>'published'
      and (v.generation_lease_until is null or v.generation_lease_until<now())
      and ($3::boolean or ((v.description is null or v.status='generation_failed') and (v.retry_at is null or v.retry_at<=now())))
    returning v.*
  `,[id,token,force]);
  if (!current) return original;
  let proposal:SchemeDescription|undefined;
  let evidence=current.evidence_sources || [],report:EnrichmentReport|null=null;
  try {
    if (!current.source_text.trim()) throw new Error(current.metadata.extraction?.error || 'The document has no readable source text. Upload a text-based official PDF.');
    const document:SourceDocument={url:current.source_url,originalTitle:current.original_title,text:current.source_text,applyUrl:current.metadata.applyUrl,incomplete:current.metadata.incomplete,links:current.metadata.sourceLinks};
    if(env.SCHEME_ENRICHMENT_ENABLED && !matchesSchemeName(current.source_text,current.metadata))throw new Error('The primary source does not clearly identify this scheme; existing published details were retained.');
    const outcome:ExtractionOutcome={mode:''};
    let description=env.SCHEME_ENRICHMENT_ENABLED?await extractDetails(current.metadata,document,undefined,outcome):await describeScheme(current.metadata,current.source_text);
    if(env.SCHEME_ENRICHMENT_ENABLED && ambiguousVariant(current.metadata.title,current.source_text))description.reviewIssues.push('The guideline covers multiple study-level variants. Review each quoted condition before publishing this variant.');
    if(env.SCHEME_ENRICHMENT_ENABLED) {
      const {rows:[prior]}=await db.query<Version>(`select v.* from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.published_version where i.id=$1 and v.id<>$2`,[current.import_id,current.id]);
      if(prior?.description){const old=evidenceDocument({url:prior.source_url,originalTitle:prior.original_title,text:prior.source_text,applyUrl:prior.metadata.applyUrl,incomplete:prior.metadata.incomplete});evidence=[old,...(prior.evidence_sources || [])];description=preserveVerified(stamp(prior.description,old.url,old.scope,old.fingerprint),stamp(description,document.url,null,evidenceDocument(document).fingerprint));}
      const enriched=await enrichDetails(current.metadata,document,description,evidence,[],outcome);description=enriched.description;evidence=enriched.sources;report=enriched.report;
    }
    proposal=description;
    const errors=verifyDescription(description,current.source_text,[...evidence,{url:current.source_url,text:current.source_text}]).problems;
    if (errors.length) throw new Error(errors.join(' '));
    const { rows:[saved] }=await db.query<Version>(`
      update public.scheme_catalog_versions set description=$3,status='draft',error=null,
        generation_lease_until=null,generation_token=null,retry_at=null,evidence_sources=$4,enrichment_report=$5
      where id=$1 and generation_token=$2 returning *
    `,[id,token,JSON.stringify(description),JSON.stringify(evidence),report?JSON.stringify(report):null]);
    return saved || original;
  } catch(error) {
    const message=error instanceof Error ? error.message.slice(0,420) : 'AI description generation failed.';
    const minutes=Math.min(360,15*2**Math.min(current.generation_attempts-1,5));
    const { rows:[failed] }=await db.query<Version>(`
      update public.scheme_catalog_versions set status='generation_failed',error=$3,description=coalesce(description,$5::jsonb),
        generation_lease_until=null,generation_token=null,retry_at=now()+interval '1 minute' * $4::integer,evidence_sources=$6,enrichment_report=$7
      where id=$1 and generation_token=$2 returning *
    `,[id,token,message,minutes,current.source_text.trim()?JSON.stringify(proposal || sourcePreview(current.metadata,current.source_text)):null,JSON.stringify(evidence),report?JSON.stringify(report):null]);
    return failed || original;
  }
}

export async function editDraft(id:string,description:SchemeDescription,actor:string|null=null) {
  return (await database()).transaction(async db=>{
    const version=await currentDraft(db,id);
    const validation=verifyDescription(description,version.source_text,versionEvidence(version));
    if (validation.problems.length) throw AppError.badRequest(validation.problems.join(' '));
    await db.query(`update public.scheme_catalog_versions set description=$2,status='draft',error=null,review_disposition='pending',requires_admin_review=true,
      generation_token=null,generation_lease_until=null,human_edited=true
      where id=$1`,[id,JSON.stringify(description)]);
    await audit(db,actor,'scheme.draft.edited','version',id,'Edited draft against official evidence.');
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

export async function publishVersion(id:string,actor:string|null,reason='Verified description against official evidence.') {
  return (await database()).transaction(async db=>{
    const version=await currentDraft(db,id);
    const entry=await lockImport(db,version.import_id);
    if (version.review_disposition==='rejected') throw AppError.conflict('This draft was rejected. Edit it before requesting publication.');
    const draft=version.description;
    if (!draft?.overview.length) throw AppError.badRequest('Add an overview supported by the official material before publishing.');
    const validation=verifyDescription(draft,version.source_text,versionEvidence(version));
    if (validation.problems.length) throw AppError.badRequest(validation.problems.join(' '));
    if (!actor && (version.requires_admin_review || draft.reviewIssues.length || version.metadata.incomplete ||
      /list of schemes|older amounts|uploaded PDF/i.test(version.metadata.reviewNote || ''))) return null;
    if (!actor && draft.record) {
      const record=draft.record;
      if (!record.typeEvidence || !record.authority) return null;
      if (record.type==='scheme' && (!draft.benefits.length || !(draft.eligibility.length || draft.whoCanApply.length))) return null;
      if (record.type==='event' && !record.dates.some(date=>date.kind==='event' && date.value)) return null;
      if (record.type==='public_notice' && !record.dates.some(date=>['hearing','registration_deadline','event'].includes(date.kind) && date.value)) return null;
      if (record.type==='citizen_service' && (!draft.documents.length || !record.facts.applicationChannels.length)) return null;
      if (record.type==='recruitment' && (!record.facts.posts.length || !record.facts.qualifications.length)) return null;
      if (record.type==='regulatory_guide' && !record.facts.referenceNumber.length) return null;
    }

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
    const record=draft.record;
    const applicationAllowed=!record || ['scheme','citizen_service','recruitment','exam'].includes(record.type);
    const publicApplyUrl=applicationAllowed?meta.applyUrl:null;
    if (!schemeId) {
      const { rows:[created] }=await db.query<{id:string}>(`
        insert into public.schemes(scheme_name,description,department,official_url,catalog_source_url,coverage_state,category,
          application_url,last_verified_at,catalog_checked_on)
        values($1,$2,$3,$4,$4,$5,$6,$7,now(),(now() at time zone 'Asia/Kolkata')::date)
        returning id
      `,[record?.title?.text || meta.title,draft.overview[0].text,record?.authority?.text || meta.issuer,version.source_url,record?.jurisdiction.state || meta.state||null,meta.category,publicApplyUrl]);
      schemeId=created.id;
    }
    await db.query(`update public.scheme_catalog_imports set scheme_id=$2,published_version=$3 where id=$1`,
      [entry.id,schemeId,id]);
    await db.query(`update public.scheme_catalog_versions set status='published',verified_at=now(),reviewed_by=$2,error=null,review_disposition='approved'
      where id=$1`,[id,actor]);
    await db.query(`insert into public.scheme_catalog_sources(id,label,url,kind,settings,interval_minutes,next_check_at)
      values($1,$2,$3,'document',$4,1440,now()+interval '1 day') on conflict(id) do update set
      label=excluded.label,url=excluded.url,settings=excluded.settings`,
      ['tracked-'+entry.id,meta.title,version.source_url,JSON.stringify({
        title:meta.title,issuer:meta.issuer,state:meta.state,category:meta.category,
        schemeId:meta.schemeId,officialId:meta.officialId,aliases:meta.aliases,district:meta.district,coverageLevel:meta.coverageLevel,
        applicationPortalSource:meta.applicationPortalSource,reviewNote:meta.reviewNote,
      })]);
    if (actor) await db.query("update public.schemes set status='ACTIVE' where id=$1",[schemeId]);
    await audit(db,actor,'scheme.published','scheme',schemeId,reason);
    return schemeId;
  });
}
