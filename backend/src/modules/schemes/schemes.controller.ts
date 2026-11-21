import { findSchemes } from './scheme.finder';
import { Request, Response } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import type { Scheme } from '../../shared/types';
import { AppError } from '../../shared/errors';
import { SCHEME_ID } from '../policy/policy.controller';
import type { SchemeDescription } from '../catalog/catalog.types';
import { recordTypes,inferredType } from '../catalog/record.schema';
import type { GovernmentRecord,RecordType } from '../catalog/record.schema';

export interface CatalogScheme extends Scheme {
  enrichment?:{status:string|null;checkedAt:string|null;mode:string|null;fields:Record<string,{status:string;sources:string[];note:string}>}|null;
  record_type:RecordType;record:GovernmentRecord|null;
  aliases:string[];
  recheck_status:string|null;
  recheck_error:string|null;
  guided_application: boolean;
  catalog_source_url: string | null;
  catalog_checked_on: string | null;
  academic_year: string | null;
  application_deadline: string | null;
  application_cycle: 'student' | 'renewal' | null;
  category: string | null;
  coverage_level: string | null;
  coverage_state: string | null;
  coverage_district: string | null;
  coverage_village: string | null;
  application_url: string | null;
  benefits_summary: string | null;
  eligibility_summary: string | null;
  scheme_status: 'unknown'|'announced'|'open'|'closed'|'rolling';
  original_title: string|null;
  source_fetched_at: string|null;
  detail?: Omit<SchemeDescription,'reviewIssues'>;
}

export async function schemes(id?: string, includeDetails=false): Promise<CatalogScheme[]> {
  const db = await database();
  const { rows } = await db.query<CatalogScheme>(`
    select s.id, coalesce(v.metadata->'aliases',s.aliases) as aliases,r.status as recheck_status,r.error as recheck_error, coalesce(v.description->'record'->'title'->>'text',v.metadata->>'title',s.scheme_name) as scheme_name,
           coalesce(v.description->'overview'->0->>'text',s.description) as description,
           coalesce(v.description->'record'->'authority'->>'text',v.metadata->>'issuer',s.department) as department,
           coalesce(v.source_url,s.official_url) as official_url, s.eligibility_rules_json,s.status,
           coalesce(v.verified_at,s.last_verified_at) as last_verified_at, s.created_at,
           coalesce(v.source_url,s.catalog_source_url) as catalog_source_url, s.catalog_checked_on::text,
           s.academic_year,s.application_deadline::text,s.application_cycle,s.id=$1 as guided_application,
           coalesce(v.metadata->>'category',s.category,case when s.catalog_source_url='https://scholarships.gov.in/All-Scholarships' then 'Education' end) as category,
           coalesce(v.description->'record'->'jurisdiction'->>'level',v.metadata->>'coverageLevel',s.coverage_level) as coverage_level,coalesce(v.description->'record'->'jurisdiction'->>'state',nullif(v.metadata->>'state',''),s.coverage_state) as coverage_state,
           coalesce(v.description->'record'->'jurisdiction'->>'district',v.metadata->>'district',s.coverage_district) as coverage_district,s.coverage_village,
           case when v.id is not null then v.metadata->>'applyUrl' else s.application_url end as application_url,
           coalesce(v.description->'benefits'->0->>'text',s.benefits_summary) as benefits_summary,coalesce(v.description->'eligibility'->0->>'text',s.eligibility_summary) as eligibility_summary,coalesce(v.description->>'status','unknown') as scheme_status,
           coalesce(v.description->'record'->>'type','scheme') as record_type,v.description->'record' as record,
           v.original_title,v.fetched_at as source_fetched_at,v.enrichment_report as enrichment,t.status as enrichment_status,
           case when ($2::uuid is not null or $3::boolean) then v.description-'reviewIssues' end as detail
    from public.schemes s
    left join public.scheme_recheck_requests r on r.scheme_id=s.id
    left join public.scheme_catalog_imports i on i.scheme_id=s.id
    left join public.scheme_catalog_versions v on v.id=i.published_version
    left join public.scheme_enrichment_tasks t on t.scheme_id=s.id
    where s.status='ACTIVE' and ($2::uuid is null or s.id=$2)
    order by guided_application desc,scheme_name
  `, [SCHEME_ID,id ?? null,includeDetails]);
  const relatedTitles=rows.some(row=>row.record?.related.length)?(await db.query<{id:string;title:string}>(`select s.id,
    coalesce(v.description->'record'->'title'->>'text',v.metadata->>'title',s.scheme_name) as title
    from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id left join public.scheme_catalog_versions v on v.id=i.published_version
    where s.status='ACTIVE'`)).rows:[];
  return rows.map(row=>{
    const type=row.record?.type || inferredType(row.scheme_name);
    const record=row.record?{...row.record,related:row.record.related.map(relation=>{
      const words=relation.title.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word=>word.length>2) || [];
      const matches=relatedTitles.filter(item=>item.id!==row.id && words.length && words.every(word=>item.title.toLowerCase().includes(word)));
      return {...relation,recordId:matches.length===1?matches[0].id:null};
    })}:null;
    const report=row.enrichment as {checkedAt?:string;mode?:string;fields?:Record<string,{status:string;sources:string[];note:string}>}|null;
    const {enrichment_status,...publicRow}=row as CatalogScheme & {enrichment_status:string|null};
    return {...publicRow,enrichment:{status:enrichment_status,checkedAt:report?.checkedAt || null,mode:report?.mode || null,fields:report?.fields || {}},record,record_type:type,recheck_error:row.recheck_error?'The source recheck needs attention; the last verified record is shown.':null,
      application_url:['scheme','citizen_service','recruitment','exam'].includes(type)?row.application_url:null};
  });
}
export async function getSchemes(req: Request,res: Response) {
 res.set('Cache-Control','no-store');
 const query=z.string().trim().max(1500).parse(req.query.q || '');
 const filters=z.object({state:z.string().max(120).optional(),category:z.string().max(100).optional(),department:z.string().max(255).optional(),audience:z.string().max(150).optional(),type:z.enum(recordTypes).optional(),status:z.string().max(40).optional()}).parse(req.query);
 const catalog=(await schemes()).filter(row=>(!filters.state || !row.coverage_state || row.coverage_state===filters.state) &&
  (!filters.category || row.category===filters.category) && (!filters.type || row.record_type===filters.type) &&
  (!filters.department || row.department===filters.department) && (!filters.status || row.scheme_status===filters.status || row.record?.facts.legalStatus.some(claim=>claim.text.toLowerCase().includes(filters.status!.toLowerCase()))) &&
  (!filters.audience || (row.record?.facts.audience || []).some(claim=>claim.text.toLowerCase().includes(filters.audience!.toLowerCase()))));
 successResponse(res,query?findSchemes(catalog,query,'',100):catalog);
}
export async function getSchemeById(req: Request,res: Response) {
  res.set('Cache-Control','no-store');
  const {success,data}=z.uuid().safeParse(req.params.id);
  const [scheme]=success ? await schemes(data) : [];
  if (!scheme) throw AppError.notFound('Scheme not found');
  successResponse(res, scheme);
}
export async function searchSchemes(req: Request,res: Response) {
  res.set('Cache-Control','no-store');
  const { query } = z.object({ query:z.string().trim().min(1).max(1000) }).parse(req.body);
  const words=query.toLowerCase().split(/\s+/);
  const results=(await schemes()).filter(scheme=>{
    const text=[scheme.scheme_name,scheme.description,scheme.department,...scheme.aliases].join(' ').toLowerCase();
    return words.every(word=>text.includes(word));
  });
  successResponse(res,results);
}
