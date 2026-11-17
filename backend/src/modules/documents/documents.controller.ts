import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { database,Database } from '../../config/db';
import { deletePrivate,putPrivate,readPrivate } from '../../config/files';
import { successResponse } from '../../shared/response';
import { documentContentType, extractDocumentText } from '../../shared/document-text';
import { AppError } from '../../shared/errors';
import { editable, owned, record } from '../applications/workflow.repo';

const documentType = z.enum(['INCOME_CERTIFICATE','STUDENT_ID','MARKSHEET','BONAFIDE_CERTIFICATE','CASTE_CERTIFICATE']);
const fields = 'id,application_id,document_type,extracted_data_json,validation_status,created_at';
interface DocumentRow {
  id:string; user_id:string; application_id:string; document_type:z.infer<typeof documentType>; storage_path:string; validation_status:string;
}

export const uploadMiddleware = multer({
  storage:multer.memoryStorage(),limits:{ fileSize:10*1024*1024, files:1, fields:2,parts:4 },
});

async function extract(bytes:Buffer,type:string,kind:DocumentRow['document_type']) {
    const text=await extractDocumentText(bytes,type);
    if (!text.trim()) return { method:type === 'application/pdf' ? 'PDF text' : 'Image OCR', warning:'No readable text. For scans, upload a PNG or JPEG.' };
    const income = text.match(/(?:annual(?: family)? income|income)[^\d\r\n]{0,35}([\d,]{3,12})/i)?.[1];
    const cert = text.match(/(?:certificate|reference)\s*(?:number|no\.?|id)\s*[:#-]?\s*([a-z0-9/-]{3,32})/i)?.[1];
    const percentile = text.match(/(?:board )?percentile\s*[:=]?\s*(\d{1,3}(?:\.\d{1,3})?)/i)?.[1];
    return z.object({
      method:z.string(), annual_family_income:z.number().optional(), certificate_number:z.string().optional(),
      board_percentile:z.number().min(0).max(100).optional(), readable:z.boolean().optional(),
    }).parse({
      method:type === 'application/pdf' ? 'PDF text' : 'Image OCR',
      annual_family_income:kind === 'INCOME_CERTIFICATE' && income ? Number(income.replace(/,/g,'')) : undefined,
      certificate_number:kind === 'INCOME_CERTIFICATE' ? cert : undefined,
      board_percentile:kind === 'MARKSHEET' && percentile && Number(percentile) <= 100 ? Number(percentile) : undefined,
      readable:true,
    });

}

async function ownedDocument(db:Database,id:string,userId:string) {
  const { rows:[doc] } = await db.query<DocumentRow>(
    'select * from public.uploaded_documents where id=$1 and user_id=$2',[z.uuid().parse(id),userId]);
  if (!doc) throw AppError.notFound('Document not found');
  return doc;
}
function editableOrThrow(state:string) {
  if (!editable.includes(state)) throw AppError.conflict('Documents are locked for this application.');
}

export async function uploadDocument(req:Request,res:Response) {
  const input = z.object({ application_id:z.uuid(),document_type:documentType }).parse(req.body);
  if (!req.file) throw AppError.badRequest('Choose a file to upload.');
  const userId = req.user!.id;
  const app = await owned(input.application_id,userId);
  editableOrThrow(app.workflow_state);
  const mime = documentContentType(req.file.buffer);
  const data = await extract(req.file.buffer,mime,input.document_type);
  const id = randomUUID();
  const path = `${userId}/${app.id}/${id}`;
  await putPrivate(path,req.file.buffer,mime);
  try {
    const row = await (await database()).transaction(async tx => {
      editableOrThrow((await owned(app.id,userId,tx,true)).workflow_state);
      const { rows:[doc] } = await tx.query(
        `insert into public.uploaded_documents(id,user_id,application_id,document_type,storage_path,extracted_data_json,validation_status)
         values($1,$2,$3,$4,$5,$6,'NEEDS_REVIEW') returning ${fields}`,
        [id,userId,app.id,input.document_type,path,JSON.stringify(data)]);
      await record(tx,app.id,'DOCUMENT_PROCESSED','processDocuments');
      return doc;
    });
    successResponse(res,row,201);
  } catch (error) {
    await deletePrivate(path).catch(() => {});
    throw error;
  }
}

export async function getDocuments(req:Request,res:Response) {
  const appId = z.uuid().optional().parse(req.query.application_id);
  const { rows } = await (await database()).query(
    `select ${fields} from public.uploaded_documents where user_id=$1 and ($2::uuid is null or application_id=$2) order by created_at desc`,
    [req.user!.id,appId ?? null]);
  successResponse(res,rows);
}
export async function getDocument(req:Request,res:Response) {
  const doc = await ownedDocument(await database(),String(req.params.id),req.user!.id);
  const { storage_path: _path,user_id:_owner,...metadata } = doc;
  successResponse(res,metadata);
}
export async function reviewDocument(req:Request,res:Response) {
  z.object({ reviewed:z.literal(true) }).parse(req.body);
  const user = req.user!;
  const db = await database();
  await db.transaction(async tx => {
    const doc = await ownedDocument(tx,String(req.params.id),user.id);
    editableOrThrow((await owned(doc.application_id,user.id,tx,true)).workflow_state);
    const result = await tx.query("update public.uploaded_documents set validation_status='VALID' where id=$1 and user_id=$2 returning id",[doc.id,user.id]);
    if (!result.rows.length) throw AppError.notFound('Document not found');
    await record(tx,doc.application_id,'DOCUMENT_REVIEWED','reviewDocument');
  });
  await getDocument(req,res);
}
export async function reprocessDocument(req:Request,res:Response) {
  const user = req.user!;
  const db = await database();
  const doc = await ownedDocument(db,String(req.params.id),user.id);
  editableOrThrow((await owned(doc.application_id,user.id)).workflow_state);
  const bytes = await readPrivate(doc.storage_path);
  const data = await extract(bytes,documentContentType(bytes),doc.document_type);
  await db.transaction(async tx => {
    editableOrThrow((await owned(doc.application_id,user.id,tx,true)).workflow_state);
    const result = await tx.query(`update public.uploaded_documents set extracted_data_json=$2,validation_status='NEEDS_REVIEW'
      where id=$1 and user_id=$3 returning id`,[doc.id,JSON.stringify(data),user.id]);
    if (!result.rows.length) throw AppError.notFound('Document not found');
    await record(tx,doc.application_id,'DOCUMENT_PROCESSED','processDocuments');
  });
  await getDocument(req,res);
}
export async function deleteDocument(req:Request,res:Response) {
  const user = req.user!;
  const db = await database();
  await db.transaction(async tx => {
    const doc = await ownedDocument(tx,String(req.params.id),user.id);
    editableOrThrow((await owned(doc.application_id,user.id,tx,true)).workflow_state);
    await deletePrivate(doc.storage_path);
    await tx.query('delete from public.uploaded_documents where id=$1 and user_id=$2',[doc.id,user.id]);
    await record(tx,doc.application_id,'DOCUMENT_REMOVED','deleteDocument');
  });
  successResponse(res,{ message:'Document removed' });
}
