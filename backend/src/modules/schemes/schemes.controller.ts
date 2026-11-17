import { Request, Response } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import type { Scheme } from '../../shared/types';
import { AppError } from '../../shared/errors';
import { SCHEME_ID } from '../policy/policy.controller';
import type { SchemeDescription } from '../catalog/catalog.types';

interface CatalogScheme extends Scheme {
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
  scheme_status: 'unknown'|'open'|'closed';
  original_title: string|null;
  source_fetched_at: string|null;
  detail?: Omit<SchemeDescription,'reviewIssues'>;
}

export async function schemes(id?: string): Promise<CatalogScheme[]> {
  const db = await database();
  const { rows } = await db.query<CatalogScheme>(`
    select s.id, coalesce(v.metadata->>'title',s.scheme_name) as scheme_name,
           coalesce(v.description->'overview'->0->>'text',s.description) as description,
           coalesce(v.metadata->>'issuer',s.department) as department,
           coalesce(v.source_url,s.official_url) as official_url, s.eligibility_rules_json,s.status,
           coalesce(v.verified_at,s.last_verified_at) as last_verified_at, s.created_at,
           coalesce(v.source_url,s.catalog_source_url) as catalog_source_url, s.catalog_checked_on::text,
           s.academic_year,s.application_deadline::text,s.application_cycle,s.id=$1 as guided_application,
           coalesce(v.metadata->>'category',s.category,case when s.catalog_source_url='https://scholarships.gov.in/All-Scholarships' then 'Education' end) as category,
           s.coverage_level,coalesce(nullif(v.metadata->>'state',''),s.coverage_state) as coverage_state,
           s.coverage_district,s.coverage_village,
           case when v.id is not null then v.metadata->>'applyUrl' else s.application_url end as application_url,
           s.benefits_summary,s.eligibility_summary,coalesce(v.description->>'status','unknown') as scheme_status,
           v.original_title,v.fetched_at as source_fetched_at,
           case when $2::uuid is not null then v.description-'reviewIssues' end as detail
    from public.schemes s
    left join public.scheme_catalog_imports i on i.scheme_id=s.id
    left join public.scheme_catalog_versions v on v.id=i.published_version
    where s.status='ACTIVE' and ($2::uuid is null or s.id=$2)
    order by guided_application desc,scheme_name
  `, [SCHEME_ID,id ?? null]);
  return rows;
}
export async function getSchemes(_req: Request,res: Response) { res.set('Cache-Control','no-store'); successResponse(res, await schemes()); }
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
  const words = query.toLowerCase().split(/\s+/);
  const results = (await schemes()).filter(scheme => {
    const searchable = [scheme.scheme_name, scheme.description, scheme.department, scheme.academic_year,
      scheme.category,scheme.coverage_state,scheme.coverage_district,scheme.coverage_village].join(' ').toLowerCase();
    return words.every(word => searchable.includes(word));
  });
  successResponse(res, results);
}
