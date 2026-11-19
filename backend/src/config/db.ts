import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import pg from 'pg';
import { env, root } from './env';

export interface Database {
  query<T extends pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
type Storage = Database & { close():Promise<void>; transaction<T>(work: (tx: Database) => Promise<T>): Promise<T> };

async function connect(): Promise<Storage> {
  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5, options: '-c search_path=public,extensions', connectionTimeoutMillis: 10000 });
    await pool.query('select 1 from public.citizen_sessions limit 1');
    return {
      query: (sql, params) => pool.query(sql, params),
      close: () => pool.end(),
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const result = await work(client);
          await client.query('commit');
          return result;
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
      },
    };
  }
  await mkdir(env.DATA_DIR, { recursive: true });
  const local = new PGlite(join(env.DATA_DIR, 'postgres'), { extensions: { vector } });
  for (const file of [
    'migrations/001_initial_schema.sql', 'migrations/003_workflow_integrity.sql', 'migrations/004_scheme_catalog.sql',
    'migrations/005_scheme_monitor.sql', 'migrations/006_scheme_publications.sql',
    'migrations/007_scheme_search.sql', 'migrations/008_citizen_scheme_alerts.sql', 'migrations/009_scheme_finder.sql', 'migrations/010_admin_sessions.sql', 'migrations/011_email_auth.sql', 'migrations/012_role_dashboards.sql',
    'seed/001_seed_schemes.sql', 'seed/002_seed_nsp_catalog.sql',
  ]) {
    await local.exec(await readFile(join(root, 'database', file), 'utf8'));
  }
  return local;
}

let connection: Promise<Storage> | undefined;
export function database() {
  connection ??= connect().catch(error => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function closeDatabase() {
  const current = await connection;
  connection = undefined;
  await current?.close();
}
