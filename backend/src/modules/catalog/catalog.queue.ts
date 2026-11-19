import { randomUUID } from 'node:crypto';
import { database } from '../../config/db';
import { runCatalogSync } from './catalog.job';
import { audit } from './catalog.audit';

interface Request {id:string;trigger_kind:string;refresh_sources:boolean;auto_publish:boolean;attempts:number;status:string}
export async function enqueueDiscovery(trigger:string,actor:string|null=null,refresh=false,autoPublish=true):Promise<Request> {
  const db=await database();
  const request=await db.transaction(async tx=>{
    const {rows:[created]}=await tx.query<Request>(`insert into public.discovery_requests(trigger_kind,requested_by,refresh_sources,auto_publish)
      values($1,$2,$3,$4) on conflict do nothing returning *`,[trigger,actor,refresh,autoPublish]);
    if (created) {
      await audit(tx,actor,'sync.queued','discovery',created.id,'Official source checks queued: '+trigger);
      return created;
    }
    const {rows:[active]}=await tx.query<Request>("select * from public.discovery_requests where status in ('queued','running') limit 1");
    return active;
  });
  // The active worker may finish between a conflicting insert and the subsequent read.
  return request || enqueueDiscovery(trigger,actor,refresh,autoPublish);
}

export async function processDiscoveryQueue() {
  const db=await database(), token=randomUUID();
  // Fourteen minutes also allows interrupted per-source leases (12 minutes) to expire.
  const {rows:[request]}=await db.query<Request>(`update public.discovery_requests set status='running',worker_token=$1,
    started_at=coalesce(started_at,now()),attempts=attempts+1,lease_until=now()+interval '14 minutes',error=null
    where id=(select id from public.discovery_requests where status='queued' or
      (status='running' and lease_until<now()) order by created_at for update skip locked limit 1) returning *`,[token]);
  if (!request) return;
  const heartbeat=setInterval(()=>void db.query(`update public.discovery_requests set lease_until=now()+interval '14 minutes'
    where id=$1 and worker_token=$2 and status='running'`,[request.id,token]).catch(()=>{}),30000);
  heartbeat.unref();
  try {
    if (request.refresh_sources && request.attempts===1) await db.query(`update public.scheme_catalog_sources set next_check_at=now()
      where enabled and (lease_until is null or lease_until<now())`);
    await runCatalogSync(request.trigger_kind,request.auto_publish,request.id);
    await db.query(`update public.discovery_requests set status='completed',finished_at=now(),lease_until=null,worker_token=null
      where id=$1 and worker_token=$2`,[request.id,token]);
  } catch {
    // Only a safe message is persisted. Source errors are recorded by the catalog pipeline itself.
    await db.query(`update public.discovery_requests set status=case when attempts<3 then 'queued' else 'failed' end,
      finished_at=case when attempts>=3 then now() end,error='Worker interrupted or unavailable. Retrying up to three attempts.',
      lease_until=null,worker_token=null where id=$1 and worker_token=$2`,[request.id,token]);
  } finally {clearInterval(heartbeat);}
}
