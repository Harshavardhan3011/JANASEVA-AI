import { cleanupPendingRegistrations } from './modules/auth/auth.email';
import { wakeCatalog } from './modules/catalog/catalog.job';
import { closeDatabase,database } from './config/db';
import { env } from './config/env';

async function main() {
  if (!env.DATABASE_URL && !env.INGESTION_DATABASE_URL) throw new Error('Set DATABASE_URL or INGESTION_DATABASE_URL to use the standalone scheduler. The local embedded database uses the running server or Sync now.');
  if (env.SCHEME_SYNC_WORKER) await (await database()).query('select janaseva_private.cleanup_abandoned_registrations($1)',[env.PENDING_REGISTRATION_DAYS]);
  else await cleanupPendingRegistrations();
  await wakeCatalog('external-scheduler');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closeDatabase);
