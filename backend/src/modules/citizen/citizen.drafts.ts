import { Router } from 'express';
import { z } from 'zod';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { schemes } from '../schemes/schemes.controller';

export const formFields=['fullName','email','state','district','occupation','education','phone','address','purpose','age','annualIncome'] as const;
const fields=z.object(Object.fromEntries(formFields.map(key=>[key,z.string().trim().max(key==='purpose'||key==='address'?1500:200).optional()])) as Record<typeof formFields[number],z.ZodOptional<z.ZodString>>).strict();
const router=Router();
router.get('/',async(req,res)=>{
  const {rows}=await (await database()).query(`select d.id,d.scheme_id,d.reviewed_at,d.updated_at,coalesce(v.metadata->>'title',s.scheme_name) as title
    from public.citizen_form_drafts d join public.schemes s on s.id=d.scheme_id
    left join public.scheme_catalog_imports i on i.scheme_id=s.id left join public.scheme_catalog_versions v on v.id=i.published_version
    where d.user_id=$1 order by d.updated_at desc`,[req.user!.id]);
  successResponse(res,rows);
});
router.post('/',async(req,res)=>{
  const {schemeId}=z.object({schemeId:z.uuid()}).strict().parse(req.body);
  const [scheme]=await schemes(schemeId);
  if (!scheme) throw AppError.notFound('Published record not found.');
  const db=await database();
  const {rows:[owner]}=await db.query(`select u.name,u.email,p.state,p.details from public.users u
    left join public.citizen_scheme_profiles p on p.user_id=u.id where u.id=$1`,[req.user!.id]);
  const explicit={fullName:owner.name,email:owner.email,state:owner.state || '',district:owner.details?.district || '',
    occupation:owner.details?.occupation || '',education:owner.details?.education || ''};
  // No age/income inference from bands, eligibility, or another account's information.
  const {rows:[draft]}=await db.query(`insert into public.citizen_form_drafts(user_id,scheme_id,fields) values($1,$2,$3)
    on conflict(user_id,scheme_id) do update set updated_at=citizen_form_drafts.updated_at returning id`,[req.user!.id,schemeId,JSON.stringify(explicit)]);
  successResponse(res,{id:draft.id},201);
});
router.get('/:id',async(req,res)=>{
  const {rows:[draft]}=await (await database()).query('select * from public.citizen_form_drafts where id=$1 and user_id=$2',[z.uuid().parse(req.params.id),req.user!.id]);
  if (!draft) throw AppError.notFound('Draft not found for this account.');
  const [record]=await schemes(draft.scheme_id);
  successResponse(res,{...draft,record:record || null,requiredFields:['fullName','state','purpose'],
    note:'This is a preparation draft, not the official form. Check additional requirements on the official portal. Nothing is submitted externally.'});
});
router.put('/:id',async(req,res)=>{
  const body=z.object({fields,reviewed:z.boolean().default(false)}).strict().parse(req.body);
  if (body.reviewed && ['fullName','state','purpose'].some(key=>!body.fields[key as keyof typeof body.fields]?.trim())) throw AppError.badRequest('Complete your name, state and purpose before confirming this preparation draft.');
  const {rows}=await (await database()).query(`update public.citizen_form_drafts set fields=$3,reviewed_at=case when $4 then now() else null end,updated_at=now()
    where id=$1 and user_id=$2 returning id`,[z.uuid().parse(req.params.id),req.user!.id,JSON.stringify(body.fields),body.reviewed]);
  if (!rows.length) throw AppError.notFound('Draft not found for this account.');
  successResponse(res,{saved:true});
});
router.delete('/:id',async(req,res)=>{
  const {rows}=await (await database()).query('delete from public.citizen_form_drafts where id=$1 and user_id=$2 returning id',[z.uuid().parse(req.params.id),req.user!.id]);
  if (!rows.length) throw AppError.notFound('Draft not found for this account.');successResponse(res,{removed:true});
});
export default router;
