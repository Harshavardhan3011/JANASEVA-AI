import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env';
import { database } from '../../config/db';
import { authMiddleware } from '../../middleware/auth';
import { requireSchemeReviewer } from '../../middleware/schemeReviewer';
import { AppError } from '../../shared/errors';
import { successResponse } from '../../shared/response';
import { createOfficialReader, extractPdf, readDocument } from './catalog.fetch';
import { captureDocument, editDraft, generateVersion, publishVersion } from './catalog.repo';
import { descriptionSchema, metadataSchema, officialSourceUrl } from './catalog.types';
import { wakeCatalog } from './catalog.job';
import { loadApprovedHosts, registryInput } from './catalog.registry';
import { searchPublishers } from './catalog.publishers';
import { hasSearchKey } from './catalog.search';

const router=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:8*1024*1024,fields:16}});
router.use(authMiddleware,requireSchemeReviewer);
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});

router.get('/',async (_req,res)=>{
  const db=await database();
  const [sources,runs,imports,registry]=await Promise.all([
    db.query(`select id,label,
      case when kind='official_search' then 'https://www.india.gov.in/directory/web-directory/state-uts' else url end as url,
      kind,enabled,interval_minutes,next_check_at,last_checked_at,last_success_at,
      case when kind='official_search' and not $1::boolean and $2::boolean then
        'Set TAVILY_API_KEY or SCHEME_SEARCH_API_KEY on the server or scheduled worker to enable discovery.' else last_error end as last_error
      from public.scheme_catalog_sources order by id`,[hasSearchKey(),env.SCHEME_CATALOG_ENABLED]),
    db.query(`select * from public.scheme_catalog_runs order by started_at desc limit 30`),
    db.query(`select i.id,i.scheme_id,i.last_fetched_at,i.published_version,v.id as version_id,v.original_title,v.metadata,v.status,v.error,v.fetched_at
      from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.current_version
      order by v.fetched_at desc limit 100`),
    db.query('select * from public.scheme_source_registry order by jurisdiction,department,label'),
  ]);
  const jurisdictions=[...new Set(['India',...searchPublishers.map(item=>item.state).filter(Boolean)])];
  const departments=['Education','Agriculture','Health','Employment','Housing','Social welfare','Industry'];
  const coverage=jurisdictions.flatMap(jurisdiction=>departments.map(department=>({
    jurisdiction,department,
    sources:registry.rows.filter(row=>row.jurisdiction===jurisdiction && row.department===department).length,
    approved:registry.rows.filter(row=>row.jurisdiction===jurisdiction && row.department===department && row.approved).length,
  })));
  successResponse(res,{sources:sources.rows,runs:runs.rows,imports:imports.rows,registry:registry.rows,coverage});

});
router.put('/registry/:id',async(req,res)=>{
  const item=registryInput.parse({...req.body,id:req.params.id});
  if (item.approved && (item.access_method==='manual_review' || ['myscheme.gov.in','www.myscheme.gov.in'].includes(new URL(item.url).hostname))) {
    throw AppError.badRequest('This source requires an authorized API integration before automated fetching can be enabled.');
  }
  await (await database()).transaction(async db=>{
    await db.query(`insert into public.scheme_source_registry(id,label,url,purpose,jurisdiction,department,access_method,access_note,approved,checked_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict(id) do update set
      label=excluded.label,url=excluded.url,purpose=excluded.purpose,jurisdiction=excluded.jurisdiction,
      department=excluded.department,access_method=excluded.access_method,access_note=excluded.access_note,
      approved=excluded.approved,checked_at=now()`,
      [item.id,item.label,item.url,item.purpose,item.jurisdiction,item.department,item.access_method,item.access_note,item.approved]);
    // Feed and arbitrary API contracts need a dedicated parser.
    if (item.approved && ['listing','document'].includes(item.access_method)) {
      await db.query(`insert into public.scheme_catalog_sources(id,label,url,kind,settings,interval_minutes)
        values($1,$2,$3,$4,$5,1440) on conflict(id) do update set
        label=excluded.label,url=excluded.url,kind=excluded.kind,settings=excluded.settings,enabled=true`,
        ['registry-'+item.id,item.label,item.url,item.access_method,JSON.stringify({title:item.label,issuer:item.label,
          state:item.jurisdiction==='India'?'':item.jurisdiction,category:'Other',reviewNote:'Check discovered listings against implementing department guidelines.'})]);
    } else {
      await db.query('update public.scheme_catalog_sources set enabled=false where id=$1',['registry-'+item.id]);
    }
  });
  successResponse(res,{saved:true});
});
router.post('/import',upload.single('officialPdf'),async(req,res)=>{
  await loadApprovedHosts();
  const {url,...metadata}=metadataSchema.extend({url:officialSourceUrl}).parse(req.body);
  let document;
  try {
    document=req.file ? await extractPdf(req.file.buffer,url,metadata.title)
      : await readDocument(createOfficialReader(),url,metadata.title);
  } catch(error) {
    throw AppError.badRequest(error instanceof Error ? error.message : 'Official source is unavailable.');
  }
  // Uploaded files require the reviewer to compare the captured text with the official copy.
  const sourceMeta=req.file ? {...metadata,reviewNote:'Compare the uploaded PDF with its official source before publishing.'} : metadata;
  const captured=await captureDocument(sourceMeta,document);
  const version=captured.kind==='skipped' ? captured.version : await generateVersion(captured.version.id);
  successResponse(res,{result:captured.kind,version});
});
router.get('/versions/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const { rows:[row] }=await (await database()).query(`
    select v.*, i.scheme_id, i.published_version, prior.description as published_description
    from public.scheme_catalog_versions v join public.scheme_catalog_imports i on i.id=v.import_id
    left join public.scheme_catalog_versions prior on prior.id=i.published_version
    where v.id=$1
  `,[id]);
  if (!row) throw AppError.notFound('Draft not found.');
  successResponse(res,row);
});
router.put('/versions/:id',async(req,res)=>{
  await editDraft(z.uuid().parse(req.params.id),descriptionSchema.parse(req.body));
  successResponse(res,{saved:true});
});
router.post('/versions/:id/retry',async(req,res)=>{
  successResponse(res,await generateVersion(z.uuid().parse(req.params.id),true));
});
router.post('/versions/:id/publish',async(req,res)=>{
  z.object({verified:z.literal(true)}).parse(req.body);
  successResponse(res,{scheme_id:await publishVersion(z.uuid().parse(req.params.id),req.user!.id)});
});
router.post('/sync',async(_req,res)=>{
  await (await database()).query(`update public.scheme_catalog_sources set next_check_at=now()
    where enabled and (lease_until is null or lease_until<now())`);
  void wakeCatalog('admin').catch(error=>console.error('Scheme catalog sync:',error.message));
  successResponse(res,{queued:true},202);
});
router.patch('/sources/:id',async(req,res)=>{
  const id=z.string().max(100).parse(req.params.id);
  const { minutes,enabled }=z.object({minutes:z.number().int().min(15).max(10080),enabled:z.boolean()}).parse(req.body);
  if (enabled && id.startsWith('registry-')) {
    const {rows}=await (await database()).query('select id from public.scheme_source_registry where id=$1 and approved',[id.slice(9)]);
    if (!rows.length) throw AppError.badRequest('Approve the source access method first.');
  }
  const { rows }=await (await database()).query(`
    update public.scheme_catalog_sources set interval_minutes=$2,enabled=$3,
      next_check_at=coalesce(last_checked_at+interval '1 minute' * $2::int,now())
    where id=$1 returning id`,[id,minutes,enabled]);
  if (!rows.length) throw AppError.notFound('Source not found.');
  successResponse(res,{saved:true});
});
export default router;
