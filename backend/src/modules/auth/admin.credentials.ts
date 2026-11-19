import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
export function adminFingerprint() {
 return env.Adminmail && env.AdminPass
   ? createHash('sha256').update(env.Adminmail.toLowerCase()).update('\0').update(env.AdminPass).digest('hex')
   : null;
}
export function matchesAdminPassword(password:string) {
 const expected=createHash('sha256').update(env.AdminPass).digest();
 const supplied=createHash('sha256').update(password).digest();
 return Boolean(adminFingerprint()) && timingSafeEqual(expected,supplied);
}
