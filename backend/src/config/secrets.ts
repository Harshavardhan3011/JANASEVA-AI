import { randomBytes } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env';

async function localSecret(name:string) {
  await mkdir(env.DATA_DIR,{ recursive:true });
  const file=join(env.DATA_DIR,name);
  const value=randomBytes(48).toString('hex');
  try {
    await writeFile(file,value,{flag:'wx',mode:0o600});
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return readFile(file,'utf8');
}

let jwt:Promise<string>|undefined;
let portal:Promise<string>|undefined;
let monitor:Promise<string>|undefined;
export const jwtSecret = () => jwt ??= env.JWT_SECRET ? Promise.resolve(env.JWT_SECRET) : localSecret('jwt-secret');
export const portalSecret = () => portal ??= env.PORTAL_SECRET ? Promise.resolve(env.PORTAL_SECRET) : localSecret('portal-secret');
export const monitorSecret = () => monitor ??= env.SCHEME_MONITOR_KEY || env.NODE_ENV === 'production'
  ? Promise.resolve(env.SCHEME_MONITOR_KEY) : localSecret('scheme-monitor-key');
