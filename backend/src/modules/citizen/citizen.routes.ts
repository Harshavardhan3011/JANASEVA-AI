import { Router } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { authMiddleware } from '../../middleware/auth';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { schemes } from '../schemes/schemes.controller';
import type { SchemeDescription } from '../catalog/catalog.types';

const router=Router();
router.use(authMiddleware);
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const answer=z.enum(['met','unmet','unknown']);
const assessment=z.object({versionId:z.uuid(),answers:z.record(z.string(),answer)}).strict();

router.get('/',async(req,res)=>{
  const db=await database();
  const user=req.user!.id;
  const [profile,watches,alerts,catalog]=await Promise.all([
    db.query('select state from public.citizen_scheme_profiles where user_id=$1',[user]),
    db.query(`select w.scheme_id,i.published_version as version_id,v.description,v.source_url,
      a.version_id as assessed_version,a.answers from public.citizen_scheme_watches w
      left join public.scheme_catalog_imports i on i.scheme_id=w.scheme_id
      left join public.scheme_catalog_versions v on v.id=i.published_version
      left join public.citizen_scheme_assessments a on a.scheme_id=w.scheme_id and a.user_id=w.user_id
      where w.user_id=$1 order by w.created_at desc`,[user]),
    db.query(`select a.*,s.scheme_name,v.source_url from public.citizen_scheme_alerts a
      join public.schemes s on s.id=a.scheme_id join public.scheme_catalog_versions v on v.id=a.version_id
      where a.user_id=$1 order by a.created_at desc limit 50`,[user]),
    schemes(),
  ]);
  successResponse(res,{
    state:profile.rows[0]?.state || '',alerts:alerts.rows,
    watches:watches.rows.map(watch=>({
      ...watch,description:watch.description ? {...watch.description,reviewIssues:undefined}:null,
      scheme:catalog.find(scheme=>scheme.id===watch.scheme_id),
      stale:Boolean(watch.assessed_version && watch.assessed_version!==watch.version_id),
      answers:watch.assessed_version===watch.version_id ? watch.answers : {},
    })),
  });
});
router.put('/profile',async(req,res)=>{
  const {state}=z.object({state:z.string().trim().max(120)}).strict().parse(req.body);
  await (await database()).query(`insert into public.citizen_scheme_profiles(user_id,state) values($1,$2)
    on conflict(user_id) do update set state=excluded.state,updated_at=now()`,[req.user!.id,state]);
  successResponse(res,{saved:true});
});
router.put('/watches/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  await (await database()).transaction(async db=>{
    // Serialize following against publication so a concurrent change cannot lose its alert.
    await db.query('select id from public.scheme_catalog_imports where scheme_id=$1 for update',[id]);
    const {rows}=await db.query("select id from public.schemes where id=$1 and status='ACTIVE'",[id]);
    if (!rows.length) throw AppError.notFound('Scheme not found.');
    await db.query('insert into public.citizen_scheme_watches(user_id,scheme_id) values($1,$2) on conflict do nothing',[req.user!.id,id]);
  });
  successResponse(res,{saved:true});
});
router.delete('/watches/:id',async(req,res)=>{
  await (await database()).query('delete from public.citizen_scheme_watches where user_id=$1 and scheme_id=$2',[req.user!.id,z.uuid().parse(req.params.id)]);
  successResponse(res,{saved:true});
});
router.put('/assessments/:id',async(req,res)=>{
  const scheme=z.uuid().parse(req.params.id);
  const body=assessment.parse(req.body);
  await (await database()).transaction(async db=>{
    const {rows:[version]}=await db.query<{description:SchemeDescription|null}>(`select v.description
      from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.published_version
      join public.citizen_scheme_watches w on w.scheme_id=i.scheme_id and w.user_id=$3
      where i.scheme_id=$1 and v.id=$2 for update of i`,[scheme,body.versionId,req.user!.id]);
    if (!version?.description) throw AppError.conflict('Follow this scheme and reload its latest published conditions.');
    const keys=new Set(['whoCanApply','eligibility'].flatMap(section=>
      version.description![section as 'eligibility'|'whoCanApply'].map((_,index)=>section+'.'+index)));
    if (Object.keys(body.answers).some(key=>!keys.has(key))) throw AppError.badRequest('An answer refers to an unknown condition.');
    await db.query(`insert into public.citizen_scheme_assessments(user_id,scheme_id,version_id,answers) values($1,$2,$3,$4)
      on conflict(user_id,scheme_id) do update set version_id=excluded.version_id,answers=excluded.answers,updated_at=now()`,
      [req.user!.id,scheme,body.versionId,JSON.stringify(body.answers)]);
  });
  successResponse(res,{saved:true});
});
router.post('/alerts/:id/read',async(req,res)=>{
  await (await database()).query('update public.citizen_scheme_alerts set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2',
    [z.uuid().parse(req.params.id),req.user!.id]);
  successResponse(res,{saved:true});
});
export default router;
