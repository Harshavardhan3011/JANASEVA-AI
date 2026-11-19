import { Router } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { authMiddleware } from '../../middleware/auth';
import { requireSchemeReviewer } from '../../middleware/schemeReviewer';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { audit } from './catalog.audit';
import { publishVersion } from './catalog.repo';
import { enqueueDiscovery, processDiscoveryQueue } from './catalog.queue';

const router=Router();
router.use(authMiddleware,requireSchemeReviewer);
const reasonInput=z.object({reason:z.string().trim().min(5).max(1000)});
const searchInput=z.object({q:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)});
router.get('/overview',async(_req,res)=>{
  const db=await database();
  const {rows:[summary]}=await db.query(`select
    (select count(*) from public.schemes where status='ACTIVE')::int as published,
    (select count(*) from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.current_version
      where v.status<>'published' and v.review_disposition<>'rejected')::int as review,
    (select count(*) from public.scheme_monitor_items where status='pending')::int as notices,
    (select count(*) from public.scheme_source_registry where not approved)::int as source_review,
    (select count(*) from public.scheme_catalog_sources where last_error is not null)::int as failing,
    (select count(*) from public.users where email_verified_at is not null)::int as verified_users`);
  const {rows:[latest]}=await db.query('select id,trigger_kind,status,attempts,created_at,started_at,finished_at,error from public.discovery_requests order by created_at desc limit 1');
  successResponse(res,{...summary,latest:latest || null});
});
router.get('/schemes',async(req,res)=>{
  const input=searchInput.extend({status:z.enum(['','ACTIVE','ARCHIVED','INACTIVE']).default(''),category:z.string().max(100).default('')}).parse(req.query);
  const {rows}=await (await database()).query(`select s.id,coalesce(v.metadata->>'title',s.scheme_name) as scheme_name,
    s.status,coalesce(v.metadata->>'category',s.category) as category,coalesce(v.metadata->>'state',s.coverage_state) as state,
    coalesce(v.description->>'status','unknown') as application_status,coalesce(v.source_url,s.official_url) as official_url,
    i.current_version,i.published_version,v.verified_at,count(*) over()::int as total
    from public.schemes s left join public.scheme_catalog_imports i on i.scheme_id=s.id
    left join public.scheme_catalog_versions v on v.id=i.published_version
    where ($1='' or coalesce(v.metadata->>'title',s.scheme_name) ilike $1 or s.department ilike $1)
      and ($2='' or s.status=$2) and ($3='' or coalesce(v.metadata->>'category',s.category)=$3)
    order by scheme_name,s.id limit 40 offset $4`,[input.q?'%'+input.q+'%':'',input.status,input.category,(input.page-1)*40]);
  successResponse(res,{items:rows,total:rows[0]?.total || 0,page:input.page});
});
router.get('/schemes/:id/history',async(req,res)=>{
  const {rows}=await (await database()).query(`select v.id,v.original_title,v.status,v.review_disposition,v.fetched_at,v.verified_at,
    v.reviewed_by,v.source_url,v.metadata->>'applicationPortalSource' as application_portal_source
    from public.scheme_catalog_versions v join public.scheme_catalog_imports i on i.id=v.import_id
    where i.scheme_id=$1 order by v.fetched_at desc`,[z.uuid().parse(req.params.id)]);
  successResponse(res,rows);
});
router.post('/schemes/:id/draft',async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const version=await (await database()).transaction(async db=>{
    const {rows:[entry]}=await db.query('select * from public.scheme_catalog_imports where scheme_id=$1 for update',[id]);
    if (!entry?.published_version) throw AppError.conflict('Import official evidence for this scheme before editing a description.');
    if (entry.current_version!==entry.published_version) return entry.current_version;
    const {rows:[copy]}=await db.query(`insert into public.scheme_catalog_versions(import_id,original_title,source_url,source_text,fingerprint,metadata,description,requires_admin_review)
      select import_id,original_title,source_url,source_text,fingerprint,metadata,description,true from public.scheme_catalog_versions
      where id=$1 returning id`,[entry.published_version]);
    await db.query('update public.scheme_catalog_imports set current_version=$2 where id=$1',[entry.id,copy.id]);
    await audit(db,req.user!.id,'scheme.draft.created','version',copy.id,'Created an editable revision; published version preserved.');
    return copy.id;
  });
  successResponse(res,{version_id:version});
});
router.post('/schemes/:id/archive',async(req,res)=>{
  const {reason}=reasonInput.parse(req.body), id=z.uuid().parse(req.params.id);
  await (await database()).transaction(async db=>{
    const {rows}=await db.query("update public.schemes set status='ARCHIVED' where id=$1 returning id",[id]);
    if (!rows.length) throw AppError.notFound('Scheme not found.');
    await audit(db,req.user!.id,'scheme.archived','scheme',id,reason);
  });
  successResponse(res,{archived:true});
});
router.get('/review',async(_req,res)=>{
  const {rows}=await (await database()).query(`select v.id,v.original_title,v.metadata,v.status,v.error,v.review_disposition,v.fetched_at,i.scheme_id,
    exists(select 1 from public.schemes s where lower(s.scheme_name)=lower(v.metadata->>'title') and s.id is distinct from i.scheme_id
      and coalesce(lower(s.coverage_state),'')=coalesce(lower(v.metadata->>'state'),'')) as possible_duplicate
    from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.current_version
    where v.status<>'published' order by v.fetched_at desc limit 100`);
  successResponse(res,rows);
});
router.post('/review/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id), input=reasonInput.extend({action:z.enum(['approve','reject'])}).parse(req.body);
  if (input.action==='approve') {
    successResponse(res,{scheme_id:await publishVersion(id,req.user!.id,input.reason)});return;
  }
  await (await database()).transaction(async db=>{
    const {rows:[version]}=await db.query(`select i.id from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.current_version
      where v.id=$1 and v.status<>'published' for update of i,v`,[id]);
    if (!version) throw AppError.conflict('Only the current unpublished draft can be rejected.');
    await db.query("update public.scheme_catalog_versions set review_disposition='rejected' where id=$1",[id]);
    await audit(db,req.user!.id,'scheme.rejected','version',id,input.reason);
  });
  successResponse(res,{rejected:true});
});
router.get('/discovery',async(_req,res)=>{
  const db=await database();
  const [requests,runs]=await Promise.all([
    db.query(`select r.id,r.trigger_kind,r.status,r.attempts,r.created_at,r.started_at,r.finished_at,r.error,
      coalesce(sum(s.added),0)::int as added,coalesce(sum(s.changed),0)::int as changed,
      coalesce(sum(s.failed),0)::int as failed,coalesce(sum(s.skipped),0)::int as skipped
      from public.discovery_requests r left join public.scheme_catalog_runs s on s.request_id=r.id
      group by r.id order by r.created_at desc limit 30`),
    db.query('select * from public.scheme_catalog_runs order by started_at desc limit 100'),
  ]);
  successResponse(res,{requests:requests.rows,runs:runs.rows});
});
router.post('/discovery/sync',async(req,res)=>{
  const request=await enqueueDiscovery('admin',req.user!.id,true);
  // The persisted request is consumed by this process or by the next scheduled worker after a restart.
  if (process.env.NODE_ENV!=='test') void processDiscoveryQueue().catch(()=>{});
  successResponse(res,{request},202);
});
router.get('/users',async(req,res)=>{
  const {q,page}=searchInput.parse(req.query);
  const {rows}=await (await database()).query(`select id,name,email,created_at,email_verified_at,role,admin_source,registration_pending,
    count(*) over()::int as total from public.users where $1='' or email ilike $1 or name ilike $1
    order by created_at desc,id limit 40 offset $2`,[q?'%'+q+'%':'',(page-1)*40]);
  successResponse(res,{items:rows,total:rows[0]?.total || 0,page});
});
router.get('/audit',async(req,res)=>{
  const {page}=searchInput.parse(req.query);
  const {rows}=await (await database()).query(`select * from (
    select a.id,a.actor_id,a.actor_kind,a.action,a.entity_type,a.entity_id,a.reason,a.created_at from public.admin_audit a
    union all select id,actor_id,'administrator','access.role.changed','user',user_id::text,reason,created_at from public.auth_role_audit
    ) entries order by created_at desc,id limit 50 offset $1`,[(page-1)*50]);
  successResponse(res,rows);
});
export default router;
