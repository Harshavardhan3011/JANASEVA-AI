alter table public.schemes
  add column if not exists monitor_ref text unique,
  add column if not exists category text,
  add column if not exists coverage_level text,
  add column if not exists coverage_state text,
  add column if not exists coverage_district text,
  add column if not exists coverage_village text,
  add column if not exists application_url text,
  add column if not exists eligibility_summary text,
  add column if not exists benefits_summary text;

create table if not exists public.scheme_monitor_sources (
  id text primary key,
  label text not null,
  url text not null,
  feed_type text not null check (feed_type in ('pib_rss','state_profile','district_catalog')),
  enabled boolean not null default true,
  interval_minutes integer not null default 360 check (interval_minutes between 30 and 10080),
  next_check_at timestamptz not null default now(),
  claimed_until timestamptz,
  checked_at timestamptz,
  last_status text not null default 'scheduled',
  last_message text
);
alter table public.scheme_monitor_sources add column if not exists source_config jsonb not null default '{}'::jsonb;

create table if not exists public.scheme_monitor_items (
  id uuid primary key default gen_random_uuid(),
  source_id text references public.scheme_monitor_sources(id),
  source_ref text not null,
  fingerprint text not null,
  draft jsonb not null,
  evidence text not null,
  attachment_key text,
  attachment_mime text,
  submitted_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  scheme_id uuid references public.schemes(id),
  status text not null check (status in ('pending','published','rejected','superseded')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz
);
create index if not exists scheme_monitor_item_versions on public.scheme_monitor_items(source_ref, created_at desc);
create index if not exists scheme_monitor_item_review on public.scheme_monitor_items(status, created_at desc);

alter table public.scheme_monitor_sources enable row level security;
alter table public.scheme_monitor_items enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.scheme_monitor_sources, public.scheme_monitor_items from anon, authenticated;
  end if;
end $$;

insert into public.scheme_monitor_sources(id,label,url,feed_type) values
  ('pib','Press Information Bureau','https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3','pib_rss'),
  ('telangana-agriculture','Telangana Department of Agriculture','https://rythubharosa.telangana.gov.in/','state_profile'),
  ('rangareddy','Ranga Reddy District','https://rangareddy.telangana.gov.in/schemes/','district_catalog')
on conflict (id) do nothing;

update public.scheme_monitor_sources
set url='https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3', next_check_at=now()
where id='pib' and url='https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1';

update public.scheme_monitor_sources
set source_config='{"state":"Telangana","title":"Rythu Bharosa","category":"Agriculture","description":"Agricultural investment support in Telangana."}'
where id='telangana-agriculture' and source_config='{}'::jsonb;
update public.scheme_monitor_sources
set source_config='{"state":"Telangana","district":"Ranga Reddy"}'
where id='rangareddy' and source_config='{}'::jsonb;
