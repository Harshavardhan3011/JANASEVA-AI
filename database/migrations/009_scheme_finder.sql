
alter table public.citizen_scheme_profiles add column if not exists details jsonb not null default '{}';
alter table public.schemes add column if not exists aliases jsonb not null default '[]';
create table if not exists public.citizen_scheme_progress (
 user_id uuid not null references public.users(id) on delete cascade,
 scheme_id uuid not null references public.schemes(id) on delete cascade,
 progress jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(user_id,scheme_id)
);
create table if not exists public.scheme_source_registry (
 id text primary key, label text not null, url text not null unique, purpose text not null,
 jurisdiction text not null default 'India', department text not null default 'Directory',
 access_method text not null default 'manual_review' check(access_method in ('manual_review','api','feed','listing','document')),
 access_note text not null, approved boolean not null default false, checked_at timestamptz,
 last_error text, last_success_at timestamptz
);
create table if not exists public.scheme_recheck_requests (
 scheme_id uuid primary key references public.schemes(id) on delete cascade,
 requested_at timestamptz not null default now(), checked_at timestamptz,
 status text not null default 'pending' check(status in ('pending','running','completed','failed')),
 lease_until timestamptz, error text
);
alter table public.citizen_scheme_progress enable row level security;
alter table public.scheme_source_registry enable row level security;
alter table public.scheme_recheck_requests enable row level security;
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticated') then
 revoke all on public.citizen_scheme_progress,public.scheme_source_registry,public.scheme_recheck_requests from anon,authenticated;
 end if;
end $$;
insert into public.scheme_source_registry(id,label,url,purpose,access_note) values
('myscheme','myScheme','https://www.myscheme.gov.in/','Primary central and state scheme discovery','Written authorization and API Setu integration required by published terms.'),
('myscheme-states','myScheme State/UT directory','https://www.myscheme.gov.in/search/state/all-states','State and UT discovery','Written authorization required; dynamic directory.'),
('india','National Portal of India','https://www.india.gov.in/','Additional schemes and department links','Public listing located; automated access policy requires verification.'),
('igod','Integrated Government Online Directory','https://igod.gov.in/index.php/about_us','Discover official ministry, state, district and municipal hosts','Directory located; automated access requires verification before enabling.'),
('dbt','DBT Bharat','https://dbtbharat.gov.in/central-scheme/list','Central DBT schemes by ministry','Public listing candidate; automated access and current feed require verification.'),
('nsp','National Scholarship Portal','https://scholarships.gov.in/All-Scholarships','Scholarship listings','Dynamic portal. Reviewed seed retained. Automatic listing access requires verification.'),
('nsp-students','NSP student announcements','https://scholarships.gov.in/Students','Scholarship announcements and application cycles','Current application windows require portal verification.'),
('jansamarth','JanSamarth','https://www.financialservices.gov.in/jansamarth','Credit schemes and official application portals','Public department page candidate; automated access requires verification.'),
('pib','Press Information Bureau','https://www.pib.gov.in/allRelease.aspx?lang=1&reg=3','New, revised and extended scheme announcements','Discovery through the existing RSS connector; announcements require guideline verification.')
on conflict(id) do nothing;

alter table public.scheme_catalog_sources drop constraint if exists scheme_catalog_sources_kind_check;
alter table public.scheme_catalog_sources add constraint scheme_catalog_sources_kind_check check(kind in ('pib_rss','document','official_search','listing'));

-- A daily sweep revisits each captured source even when it falls out of search results.
insert into public.scheme_catalog_sources(id,label,url,kind,settings,interval_minutes)
select 'tracked-'||i.id::text,v.metadata->>'title',v.source_url,'document',
 v.metadata-'applyUrl'-'incomplete',1440
from public.scheme_catalog_imports i join public.scheme_catalog_versions v on v.id=i.published_version
on conflict(id) do nothing;

create or replace function public.notify_scheme_watchers() returns trigger
language plpgsql set search_path=public as $$
declare
 old_description jsonb;
 new_description jsonb;
 changed jsonb;
begin
 if new.published_version is null or new.published_version is not distinct from old.published_version then
  return new;
 end if;
 select description into old_description from public.scheme_catalog_versions where id=old.published_version;
 select description into new_description from public.scheme_catalog_versions where id=new.published_version;
 select jsonb_object_agg(section,jsonb_build_object(
   'before',coalesce(old_description->section,'null'::jsonb),
   'after',coalesce(new_description->section,'null'::jsonb)))
 into changed from unnest(array['overview','whoCanApply','benefits','eligibility','exclusions','documents','applicationSteps','dates','contacts','status']) section
 where old_description->section is distinct from new_description->section;
 if changed is not null then
  insert into public.citizen_scheme_alerts(user_id,scheme_id,version_id,previous_version,changes)
  select user_id,new.scheme_id,new.published_version,old.published_version,changed
  from public.citizen_scheme_watches where scheme_id=new.scheme_id on conflict do nothing;
 end if;
 return new;
end $$;

insert into public.scheme_source_registry(id,label,url,purpose,jurisdiction,department,access_note) values
('education-ministry','Ministry of Education','https://www.education.gov.in/','Education schemes and implementing guidelines','India','Education','Official department candidate; verify automated access before enabling.'),
('agriculture-ministry','PM-KISAN','https://pmkisan.gov.in/','Agriculture scheme guidelines','India','Agriculture','Existing approved host; certificate availability and current guidelines require source checks.'),
('health-ministry','National Health Mission','https://nhm.gov.in/','Health support and guidelines','India','Health','Official department candidate; verify automated access before enabling.'),
('labour-ministry','Ministry of Labour and Employment','https://labour.gov.in/','Labour and employment schemes','India','Employment','Official department candidate; verify automated access before enabling.'),
('housing-ministry','PMAY Urban','https://pmay-urban.gov.in/','Housing support guidelines','India','Housing','Official department candidate; verify automated access before enabling.'),
('social-ministry','Social Justice and Empowerment','https://socialjustice.gov.in/','Social welfare schemes','India','Social welfare','Official department candidate; verify automated access before enabling.'),
('industry-ministry','Ministry of MSME','https://msme.gov.in/','Industry and enterprise support','India','Industry','Official department candidate; verify automated access before enabling.')
on conflict(id) do nothing;
