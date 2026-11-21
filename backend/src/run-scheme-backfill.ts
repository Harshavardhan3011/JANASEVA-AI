// CLI workers always use the restricted ingestion identity, including when launched manually.
process.env.SCHEME_SYNC_WORKER='true';

async function main() {
 const {env}=await import('./config/env');
 const {closeDatabase,database}=await import('./config/db');
 const {enqueueBackfill,runEnrichmentTasks}=await import('./modules/catalog/catalog.backfill');
 try {
 if(!env.SCHEME_ENRICHMENT_ENABLED)throw new Error('Set SCHEME_ENRICHMENT_ENABLED=true for backfill.');
 const schemeId=process.argv.find(value=>value.startsWith('--scheme='))?.slice(9);
 const limit=Number(process.argv.find(value=>value.startsWith('--limit='))?.slice(8) || 3);
 if(!Number.isInteger(limit) || limit<1 || limit>100)throw new Error('Use --limit=1 through --limit=100.');
 const serviceRole=(await (await database()).query('select current_user as role')).rows[0].role;
 const queued=await enqueueBackfill(schemeId,process.argv.includes('--retry')),counts=await runEnrichmentTasks(limit);
 console.log(JSON.stringify({serviceRole,queued,counts}));
 if(counts.failed)process.exitCode=1;
 }finally {await closeDatabase();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Backfill failed.');process.exitCode=1;});
