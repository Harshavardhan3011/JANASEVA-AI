alter table public.scheme_catalog_versions add column if not exists evidence_sources jsonb not null default '[]';
alter table public.scheme_catalog_versions add column if not exists enrichment_report jsonb;
create table if not exists public.scheme_enrichment_tasks (
 scheme_id uuid primary key references public.schemes(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','completed','review','failed')),
 attempts integer not null default 0, worker_token uuid,lease_until timestamptz,
 requested_at timestamptz not null default now(),next_attempt_at timestamptz not null default now(),
 completed_at timestamptz,version_id uuid references public.scheme_catalog_versions(id),
 result jsonb,error text
);
create index if not exists enrichment_due on public.scheme_enrichment_tasks(status,next_attempt_at);
alter table public.scheme_enrichment_tasks enable row level security;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on public.scheme_enrichment_tasks from anon;end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on public.scheme_enrichment_tasks from authenticated;end if;
end $$;
grant select,insert,update on public.scheme_enrichment_tasks to janaseva_ingestor;
drop policy if exists ingestion_service on public.scheme_enrichment_tasks;
create policy ingestion_service on public.scheme_enrichment_tasks for all to janaseva_ingestor using(true) with check(true);
