import type { Database } from '../../config/db';

export async function audit(db:Database,actor:string|null,action:string,entityType:string,entityId:string,reason:string) {
  await db.query(`insert into public.admin_audit(actor_id,actor_kind,action,entity_type,entity_id,reason)
    values($1,$2,$3,$4,$5,$6)`,[actor,actor?'administrator':'automation',action,entityType,entityId,reason]);
}
