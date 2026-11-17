import { dirname,join } from 'node:path';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { createWorker } from 'tesseract.js';
import { env } from '../config/env';
import { AppError } from './errors';

export function documentContentType(bytes:Buffer) {
  if (bytes.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a') {
    if (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 20000000) throw AppError.badRequest('Image is too large.');
    return 'image/png';
  }
  if (bytes.subarray(0,3).toString('hex') === 'ffd8ff' && bytes.subarray(-2).toString('hex') === 'ffd9') return 'image/jpeg';
  throw AppError.badRequest('Choose a valid PDF, PNG or JPEG file.');
}

let processing = false;
export async function extractDocumentText(bytes:Buffer,type:string) {
  if (processing) throw new AppError('Document processing is busy. Try again shortly.',503,'OCR_BUSY');
  processing=true;
  try {
    if (type==='application/pdf') return (await pdf(bytes,{ max:5 })).text;
    const langPath=env.OCR_LANG_PATH || join(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0_best_int');
    const worker=await createWorker('eng',1,{ cacheMethod:'none',langPath });
    let timeout:NodeJS.Timeout|undefined;
    try {
      const result=await Promise.race([worker.recognize(bytes),new Promise<never>((_,reject)=>{
        timeout=setTimeout(()=>reject(new Error('OCR timeout')),45000);
      })]);
      return result.data.text;
    } finally {
      clearTimeout(timeout);
      await worker.terminate();
    }
  } catch {
    throw AppError.badRequest('The file could not be processed. Check that it opens and try a clear PNG, JPEG or PDF.');
  } finally {
    processing=false;
  }
}
