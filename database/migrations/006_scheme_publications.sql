create table if not exists public.scheme_catalog_sources (
  id text primary key,
  label text not null,
  url text not null,
  kind text not null check(kind in ('pib_rss','document')),
  settings jsonb not null default '{}',
  enabled boolean not null default true,
  interval_minutes integer not null default 15 check(interval_minutes between 15 and 10080),
  next_check_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  last_success_at timestamptz,
  last_checked_at timestamptz,
  last_error text
);
create table if not exists public.scheme_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  official_key text unique,
  canonical_url text not null unique,
  scheme_id uuid unique references public.schemes(id),
  current_version uuid,
  published_version uuid,
  last_fetched_at timestamptz not null default now()
);
create table if not exists public.scheme_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.scheme_catalog_imports(id),
  original_title text not null,
  source_url text not null,
  source_text text not null,
  fingerprint text not null,
  metadata jsonb not null,
  description jsonb,
  status text not null default 'draft' check(status in ('draft','generation_failed','published')),
  error text,
  generation_attempts integer not null default 0,
  retry_at timestamptz,
  generation_lease_until timestamptz,
  generation_token uuid,
  fetched_at timestamptz not null default now(),
  verified_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null
);
create index if not exists scheme_catalog_versions_import on public.scheme_catalog_versions(import_id, fetched_at desc);
create table if not exists public.scheme_catalog_runs (
  id uuid primary key,
  source_id text not null references public.scheme_catalog_sources(id),
  trigger_kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  added integer not null default 0,
  changed integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  published integer not null default 0,
  error text,
  outcomes jsonb not null default '[]'
);
create index if not exists scheme_catalog_runs_recent on public.scheme_catalog_runs(started_at desc);
alter table public.scheme_catalog_sources enable row level security;
alter table public.scheme_catalog_imports enable row level security;
alter table public.scheme_catalog_versions enable row level security;
alter table public.scheme_catalog_runs enable row level security;
do $$
begin
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on public.scheme_catalog_sources,public.scheme_catalog_imports,public.scheme_catalog_versions,public.scheme_catalog_runs from anon,authenticated;
  end if;
end $$;
insert into public.scheme_catalog_sources(id,label,url,kind,settings) values
('central-pib','Central government · PIB press releases','https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3','pib_rss',
 '{"issuer":"Press Information Bureau","category":"Other"}'),
('ap-pensions','Andhra Pradesh · NTR Bharosa pension order','https://sspensions.ap.gov.in/SSP/Documents/GO%20MS%2043%2013.06.2024.pdf','document',
 '{"title":"NTR Bharosa Pension Scheme","officialId":"NTR-BHAROSA-PENSION","issuer":"Andhra Pradesh Panchayat Raj and Rural Development Department","state":"Andhra Pradesh","category":"Social welfare","reviewNote":"The publisher’s About page lists older amounts. Reconcile it with G.O.Ms.No.43 and any later official orders before publishing."}')
on conflict(id) do nothing;
