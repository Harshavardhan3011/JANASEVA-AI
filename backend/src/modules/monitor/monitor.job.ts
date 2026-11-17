import { database } from '../../config/db';
import { env } from '../../config/env';
import { fetchObservations, enrichDraft } from './monitor.sources';
import { fingerprint, latestFingerprint, markRechecked, saveObservation } from './monitor.repo';
import type { Source } from './monitor.types';

async function claimSource() {
  const { rows:[source] }=await (await database()).query<Source>(`
    update public.scheme_monitor_sources set claimed_until=now()+interval '10 minutes',last_status='checking'
    where id=(
      select id from public.scheme_monitor_sources where enabled and next_check_at<=now()
        and (claimed_until is null or claimed_until<now())
      order by next_check_at,id for update skip locked limit 1
    ) returning id,label,url,feed_type,interval_minutes,source_config
  `);
  return source;
}

export async function runDueSources() {
  for (;;) {
    const source=await claimSource();
    if (!source) return;
    let status='ok';
    let message='';
    try {
      let published=0, queued=0, enriched=0;
      const observations=await fetchObservations(source);
      for (const observation of observations) {
        const hash=fingerprint(observation);
        const latest=await latestFingerprint(source,observation.reference);
        if (latest?.fingerprint===hash) {
          if (latest.status==='published') await markRechecked(source,observation.reference);
          continue;
        }
        if (!observation.autoPublish && enriched<5 && env.LLM_API_KEY) {
          observation.draft=await enrichDraft(observation.draft,observation.evidence);
          enriched++;
        }
        const outcome=await saveObservation(source,observation,hash);
        if (outcome==='published') published++;
        if (outcome==='queued') queued++;
      }
      message=observations.length
        ? `${observations.length} matching records. ${published} published, ${queued} queued.`
        : 'The feed returned no matching scheme announcements.';
    } catch (error) {
      status='error';
      const reason=error instanceof Error ? error : new Error('Source check failed.');
      const code=(reason.cause as {code?:string}|undefined)?.code;
      message=(code ? `${reason.message} (${code})` : reason.message).slice(0,240);
    }
    await (await database()).query(`
      update public.scheme_monitor_sources set claimed_until=null,checked_at=now(),
        next_check_at=now()+interval '1 minute'*interval_minutes,last_status=$2,last_message=$3 where id=$1
    `,[source.id,status,message]);
  }
}

let active:Promise<void>|undefined;
export function runMonitor() {
  return active ??= runDueSources().catch(error=>console.error('Scheme monitor:',error.message)).finally(()=>{ active=undefined; });
}

export function scheduleMonitor() {
  if (!env.SCHEME_MONITOR_ENABLED || env.NODE_ENV==='test') return () => Promise.resolve();
  const initial=setTimeout(()=>{void runMonitor();},3000);
  const timer=setInterval(()=>{void runMonitor();},60000);
  initial.unref();
  timer.unref();
  return async () => {
    clearTimeout(initial);
    clearInterval(timer);
    await active;
  };
}
