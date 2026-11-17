import { createHash,timingSafeEqual } from 'node:crypto';
import { Request,Response } from 'express';
import { z } from 'zod';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { database } from '../../config/db';
import { env } from '../../config/env';
import { putPrivate,deletePrivate } from '../../config/files';
import { successResponse } from '../../shared/response';
import { AppError } from '../../shared/errors';
import { FAQ_URL,GUIDELINES_URL,SCHEME_ID } from './policy.controller';

const official = { guidelines:GUIDELINES_URL, faq:FAQ_URL };
const limit = 8 * 1024 * 1024;

export async function ingestPolicyDocument(req:Request,res:Response) {
  const key = env.POLICY_INGEST_KEY;
  if (!key) throw AppError.notFound('Policy intake is unavailable.');
  const expected = Buffer.from('Bearer '+key);
  const provided = Buffer.from(req.get('authorization') || '');
  if (expected.length !== provided.length || !timingSafeEqual(expected,provided)) throw AppError.unauthorized();
  const { source } = z.object({ source:z.enum(['guidelines','faq']) }).parse(req.body);
  const url = official[source];
  const response = await fetch(url,{ redirect:'error',signal:AbortSignal.timeout(14000) });
  if (!response.ok || !response.body) throw new AppError('The official source could not be downloaded.', 502, 'SOURCE_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks:Buffer[] = [];
  let length = 0;
  for (;;) {
    const { value,done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length>limit) {
      await reader.cancel();
      throw AppError.badRequest('The official PDF exceeds the intake size limit.');
    }
    chunks.push(Buffer.from(value));
  }
  const bytes=Buffer.concat(chunks);
  if (bytes.subarray(0,5).toString() !== '%PDF-') throw AppError.badRequest('The source did not return a PDF.');
  const parsed=await pdf(bytes);
  if (!/central sector scheme of scholarship/i.test(parsed.text.replace(/\s+/g,' '))) {
    throw AppError.badRequest('The downloaded edition could not be matched to PM-USP CSSS.');
  }
  const digest=createHash('sha256').update(bytes).digest('hex');
  const objectKey=`policy/${SCHEME_ID}/${digest}.pdf`;
  await putPrivate(objectKey,bytes,'application/pdf');
  try {
    const { rows:[doc] } = await (await database()).query(
      'update public.policy_documents set storage_path=$1 where scheme_id=$2 and source_url=$3 returning id,title,source_url,document_version,last_verified_at',
      [objectKey,SCHEME_ID,url]);
    if (!doc) throw AppError.notFound('The source has no curated edition in this repository.');
    successResponse(res,{ ...doc, sha256:digest, pages:parsed.numpages, publication_status:'CURATION_REQUIRED' },201);
  } catch(error) {
    await deletePrivate(objectKey).catch(()=>{});
    throw error;
  }
}
