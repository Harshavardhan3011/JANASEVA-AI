import rateLimit from 'express-rate-limit';
import { database } from '../../config/db';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { z } from 'zod';
import { Router } from 'express';
import { getSchemes, getSchemeById, searchSchemes } from './schemes.controller';

const router = Router();

router.get('/', getSchemes);
router.get('/:id', getSchemeById);
router.post('/:id/refresh',rateLimit({windowMs:3600000,limit:10}),async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const db=await database();
  const {rows}=await db.query("select id from public.schemes where id=$1 and status='ACTIVE'",[id]);
  if (!rows.length) throw AppError.notFound('Scheme not found.');
  await db.query(`insert into public.scheme_recheck_requests(scheme_id) values($1)
    on conflict(scheme_id) do update set requested_at=now(),status='pending',error=null
    where scheme_recheck_requests.requested_at<now()-interval '1 hour'
      and (scheme_recheck_requests.lease_until is null or scheme_recheck_requests.lease_until<now())`,[id]);
  successResponse(res,{queued:true},202);
});
router.post('/search', searchSchemes);

export default router;
