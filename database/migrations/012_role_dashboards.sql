create table if not exists public.admin_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.users(id) on delete set null,
 actor_kind text not null check(actor_kind in ('administrator','automation')),
 action text not null, entity_type text not null, entity_id text not null,
 reason text not null, created_at timestamptz not null default now()
);
create index if not exists admin_audit_recent on public.admin_audit(created_at desc);
alter table public.scheme_catalog_versions add column if not exists review_disposition text not null default 'pending'
 check(review_disposition in ('pending','approved','rejected'));
alter table public.scheme_catalog_versions add column if not exists requires_admin_review boolean not null default false;
create table if not exists public.discovery_requests (
 id uuid primary key default gen_random_uuid(), requested_by uuid references public.users(id) on delete set null,
 trigger_kind text not null, status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 refresh_sources boolean not null default false, auto_publish boolean not null default true,
 attempts integer not null default 0, worker_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz, error text
);
create unique index if not exists discovery_one_active on public.discovery_requests((true)) where status in ('queued','running');
alter table public.scheme_catalog_runs add column if not exists request_id uuid references public.discovery_requests(id);
create index if not exists scheme_catalog_runs_request on public.scheme_catalog_runs(request_id);
alter table public.admin_audit enable row level security;
alter table public.discovery_requests enable row level security;
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticated') then
 revoke all on public.admin_audit,public.discovery_requests from anon,authenticated;
 end if;
end $$;
