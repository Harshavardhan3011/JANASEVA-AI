
create table if not exists public.citizen_scheme_profiles (
 user_id uuid primary key references public.users(id) on delete cascade,
 state text not null default '', updated_at timestamptz not null default now()
);
create table if not exists public.citizen_scheme_watches (
 user_id uuid not null references public.users(id) on delete cascade,
 scheme_id uuid not null references public.schemes(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,scheme_id)
);
create table if not exists public.citizen_scheme_assessments (
 user_id uuid not null references public.users(id) on delete cascade,
 scheme_id uuid not null references public.schemes(id) on delete cascade,
 version_id uuid not null references public.scheme_catalog_versions(id),
 answers jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(user_id,scheme_id)
);
create table if not exists public.citizen_scheme_alerts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 scheme_id uuid not null references public.schemes(id) on delete cascade,
 version_id uuid not null references public.scheme_catalog_versions(id),
 previous_version uuid references public.scheme_catalog_versions(id),
 changes jsonb not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,scheme_id,version_id)
);
create index if not exists citizen_scheme_watches_scheme on public.citizen_scheme_watches(scheme_id);
create index if not exists citizen_scheme_alerts_user on public.citizen_scheme_alerts(user_id,created_at desc);
alter table public.citizen_scheme_profiles enable row level security;
alter table public.citizen_scheme_watches enable row level security;
alter table public.citizen_scheme_assessments enable row level security;
alter table public.citizen_scheme_alerts enable row level security;
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticated') then
  revoke all on public.citizen_scheme_profiles,public.citizen_scheme_watches,
    public.citizen_scheme_assessments,public.citizen_scheme_alerts from anon,authenticated;
 end if;
end $$;

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
 into changed from unnest(array['overview','whoCanApply','benefits','eligibility','documents','applicationSteps','dates','contacts','status']) section
 where old_description->section is distinct from new_description->section;
 if changed is not null then
  insert into public.citizen_scheme_alerts(user_id,scheme_id,version_id,previous_version,changes)
  select user_id,new.scheme_id,new.published_version,old.published_version,changed
  from public.citizen_scheme_watches where scheme_id=new.scheme_id on conflict do nothing;
 end if;
 return new;
end $$;
drop trigger if exists scheme_publication_alerts on public.scheme_catalog_imports;
create trigger scheme_publication_alerts after update of published_version on public.scheme_catalog_imports
for each row execute function public.notify_scheme_watchers();
