import { randomUUID, createHash } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { database } from '../../config/db';
import { deletePrivate, putPrivate, readPrivate } from '../../config/files';
import { authMiddleware } from '../../middleware/auth';
import { requireSchemeReviewer } from '../../middleware/schemeReviewer';
import { documentContentType, extractDocumentText } from '../../shared/document-text';
import { AppError } from '../../shared/errors';
import { successResponse } from '../../shared/response';
import { draftSchema, officialUrl, publishSchema } from './monitor.types';
import { reviewItem } from './monitor.repo';
import { runMonitor } from './monitor.job';

const router = Router();
const upload=multer({ storage:multer.memoryStorage(), limits:{ fileSize:6*1024*1024, files:1, fields:7, parts:9 } });
const submissionSchema=draftSchema.pick({ title:true,issuer:true }).extend({
  state:z.string().trim().min(2).max(120),
  district:z.string().trim().min(2).max(120),
  village:z.string().trim().min(2).max(120),
  sourceUrl:z.union([officialUrl,z.literal('')]).optional(),
});

router.get('/sources',async (_req,res)=>{
  const { rows }=await (await database()).query(`
    select id,label,url,enabled,checked_at,next_check_at,last_status,last_message from public.scheme_monitor_sources order by label
  `);
  successResponse(res,rows);
});

router.post('/notices',authMiddleware,rateLimit({ windowMs:60000,limit:5 }),upload.single('notice'),async (req,res)=>{
  const input=submissionSchema.parse(req.body);
  if (!req.file) throw AppError.badRequest('Attach the government notice.');
  const data=req.file.buffer;
  const type=documentContentType(data);
  const evidence=(await extractDocumentText(data,type)).trim().slice(0,12000);
  const draft=draftSchema.parse({ ...input,level:'Village',sourceUrl:input.sourceUrl || null });
  const author=req.user!.id;
  const hash=createHash('sha256').update(data).update(JSON.stringify(draft)).digest('hex');
  const id=randomUUID();
  const path=`notices/${author}/${id}`;
  await putPrivate(path,data,type);
  try {
    await (await database()).query(`
      insert into public.scheme_monitor_items(id,source_ref,fingerprint,draft,evidence,attachment_key,attachment_mime,submitted_by,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,'pending')
    `,[id,'village-notice:'+id,hash,JSON.stringify(draft),evidence,path,type,author]);
  } catch(error) {
    await deletePrivate(path).catch(()=>{});
    throw error;
  }
  successResponse(res,{ id,status:'pending' },201);
});

router.use('/review',authMiddleware,requireSchemeReviewer);
router.get('/review',async (_req,res)=>{
  const { rows }=await (await database()).query(`
    select i.id,i.draft,i.evidence,i.created_at,i.attachment_key is not null as has_attachment,s.label as source_label
    from public.scheme_monitor_items i left join public.scheme_monitor_sources s on s.id=i.source_id
    where i.status='pending' order by i.created_at desc limit 100
  `);
  successResponse(res,rows);
});
router.get('/review/:id/attachment',async (req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const { rows:[item] }=await (await database()).query<{attachment_key:string;attachment_mime:string}>(
    'select attachment_key,attachment_mime from public.scheme_monitor_items where id=$1',[id]);
  if (!item?.attachment_key) throw AppError.notFound('Notice attachment not found.');
  res.set('Cache-Control','private, no-store').type(item.attachment_mime).send(await readPrivate(item.attachment_key));
});
router.post('/review/run',async (_req,res)=>{
  await (await database()).query(`
    update public.scheme_monitor_sources set next_check_at=now()
    where enabled and (claimed_until is null or claimed_until<now())
  `);
  void runMonitor();
  successResponse(res,{ status:'scheduled' },202);
});
router.post('/review/:id',async (req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const action=z.discriminatedUnion('action',[
    z.object({action:z.literal('publish'),draft:publishSchema}),
    z.object({action:z.literal('reject')}),
  ]).parse(req.body);
  successResponse(res,await reviewItem(id,req.user!.id,action.action==='publish' ? action.draft : undefined));
});
export default router;
