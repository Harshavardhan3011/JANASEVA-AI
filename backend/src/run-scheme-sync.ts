import { runCatalogSync } from './modules/catalog/catalog.job';
import { closeDatabase } from './config/db';
import { env } from './config/env';

async function main() {
  if (!env.DATABASE_URL) throw new Error('Set DATABASE_URL to use the standalone scheduler. The local embedded database uses the running server or Sync now.');
  await runCatalogSync('external-scheduler');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closeDatabase);
