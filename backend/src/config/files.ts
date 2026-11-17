import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const bucket = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{ auth:{ persistSession:false,autoRefreshToken:false } }).storage.from(env.STORAGE_BUCKET)
  : null;
const localPath = (key: string) => join(env.DATA_DIR, 'private', key);

export async function putPrivate(key: string, bytes: Buffer, contentType: string) {
  if (bucket) {
    const { error } = await bucket.upload(key,bytes,{ contentType,upsert:true });
    if (error) throw error;
    return;
  }
  const file = localPath(key);
  await mkdir(dirname(file), { recursive:true });
  await writeFile(file,bytes,{ mode:0o600 });
}

export async function readPrivate(key: string) {
  if (!bucket) return readFile(localPath(key));
  const { data,error } = await bucket.download(key);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePrivate(key: string) {
  if (!bucket) return rm(localPath(key),{ force:true });
  const { error } = await bucket.remove([key]);
  if (error) throw error;
}
