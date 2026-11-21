const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('../backend/node_modules/dotenv');
const { Pool } = require('../backend/node_modules/pg');
dotenv.config({ path:path.join(__dirname,'../.env'),quiet:true });

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for hosted migrations. The embedded development database initializes on startup.');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,options:'-c search_path=public,extensions'});
  try {
    await pool.query('create table if not exists public.janaseva_migrations (filename text primary key, applied_at timestamptz not null default now())');
    await pool.query('alter table public.janaseva_migrations enable row level security');
    for (const filename of [
      'migrations/001_initial_schema.sql','migrations/002_rls_policies.sql',
      'migrations/003_workflow_integrity.sql','migrations/004_scheme_catalog.sql','migrations/005_scheme_monitor.sql',
      'migrations/006_scheme_publications.sql','migrations/007_scheme_search.sql',
      'migrations/008_citizen_scheme_alerts.sql', 'migrations/009_scheme_finder.sql', 'migrations/010_admin_sessions.sql', 'migrations/011_email_auth.sql', 'migrations/012_role_dashboards.sql',
      'migrations/20261120134249_government_records.sql',
      'migrations/20261120142343_ingestion_maintenance.sql',
      'migrations/20261120150056_scheme_field_enrichment.sql',
      'seed/001_seed_schemes.sql',
    ]) {
      const { rowCount }=await pool.query('select 1 from public.janaseva_migrations where filename=$1',[filename]);
      if (rowCount) continue;
      const client=await pool.connect();
      try {
        const source=fs.readFileSync(path.join(__dirname,filename),'utf8').replace(/^begin;\s*|\s*commit;\s*$/gi,'');
        await client.query('begin');
        await client.query(source);
        await client.query('insert into public.janaseva_migrations(filename) values($1)',[filename]);
        await client.query('commit');
        console.log('Applied '+filename);
      } catch(error) {
        await client.query('rollback');
        throw error;
      } finally { client.release(); }
    }
    await pool.query(fs.readFileSync(path.join(__dirname,'seed/002_seed_nsp_catalog.sql'),'utf8'));
    console.log('Refreshed the NSP catalog from the reviewed seed.');
  } finally { await pool.end(); }
}
run().catch(error=>{ console.error(error.message);process.exitCode=1; });
