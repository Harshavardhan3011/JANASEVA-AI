-- Additive: existing scheme IDs, public URLs, accounts and saves remain intact.
alter table public.scheme_catalog_versions add column if not exists human_edited boolean not null default false;
create table if not exists public.citizen_form_drafts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 scheme_id uuid not null references public.schemes(id), fields jsonb not null default '{}',
 reviewed_at timestamptz, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,scheme_id)
);
alter table public.citizen_form_drafts enable row level security;
create index if not exists citizen_form_drafts_owner on public.citizen_form_drafts(user_id,updated_at desc);
create table if not exists public.catalog_categories (name text primary key check(length(name) between 2 and 100));
alter table public.catalog_categories enable row level security;
insert into public.catalog_categories(name) values ('Other'),('Agriculture'),('Education'),('Employment'),('Finance'),('Health'),('Housing'),('Infrastructure'),('Social welfare'),('Citizen services'),('Recruitment'),('Law and regulation'),('Public notices'),('Directories') on conflict do nothing;
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticated') then
  revoke all on public.citizen_form_drafts,public.catalog_categories from anon,authenticated;
 end if;
end $$;

-- Alert trigger can read followers without granting the ingestion identity citizen-data access.
create schema if not exists janaseva_private;
revoke all on schema janaseva_private from public;
create or replace function janaseva_private.notify_record_watchers() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_description jsonb;new_description jsonb;changed jsonb;
begin
 if new.published_version is null or new.published_version is not distinct from old.published_version then return new; end if;
 select description into old_description from public.scheme_catalog_versions where id=old.published_version;
 select description into new_description from public.scheme_catalog_versions where id=new.published_version;
 select jsonb_object_agg(section,jsonb_build_object('before',coalesce(old_description->section,'null'::jsonb),'after',coalesce(new_description->section,'null'::jsonb))) into changed
 from unnest(array['overview','whoCanApply','benefits','eligibility','exclusions','documents','applicationSteps','dates','contacts','status','record']) section
 where old_description->section is distinct from new_description->section;
 if changed is not null then
  insert into public.citizen_scheme_alerts(user_id,scheme_id,version_id,previous_version,changes)
  select user_id,new.scheme_id,new.published_version,old.published_version,changed from public.citizen_scheme_watches where scheme_id=new.scheme_id on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function janaseva_private.notify_record_watchers() from public;
drop trigger if exists scheme_publication_alerts on public.scheme_catalog_imports;
create trigger scheme_publication_alerts after update of published_version on public.scheme_catalog_imports for each row execute function janaseva_private.notify_record_watchers();

-- No login or citizen grants: a server-only worker connection SET ROLEs to this identity.
do $$ declare relation text;begin
 if not exists(select 1 from pg_roles where rolname='janaseva_ingestor') then create role janaseva_ingestor nologin;end if;
 execute format('grant janaseva_ingestor to %I',current_user);
 grant usage on schema public to janaseva_ingestor;
 foreach relation in array array['schemes','scheme_catalog_sources','scheme_catalog_imports','scheme_catalog_versions','scheme_catalog_runs','scheme_source_registry','scheme_recheck_requests','discovery_requests','admin_audit','catalog_categories'] loop
  execute format('grant select,insert,update on public.%I to janaseva_ingestor',relation);
  execute format('drop policy if exists ingestion_service on public.%I',relation);
  execute format('create policy ingestion_service on public.%I for all to janaseva_ingestor using (true) with check (true)',relation);
 end loop;
end $$;

-- Candidate configuration, not a claim that automated access is approved.
insert into public.scheme_source_registry(id,label,url,purpose,jurisdiction,department,access_method,access_note,approved) values
 ('ap-income-service','AP income certificate service manual','https://apseva.ap.gov.in/assets/User-Manuals/EoDB%20SOP%20final.pdf','Citizen service authority, documents and application channel','Andhra Pradesh','Revenue','document','Official service manual; verify freshness and permitted access before enabling.',false),
 ('social-security-rules','Social Security Central Rules 2026','https://www.labour.gov.in/static/uploads/2026/05/49aa9b62c2125499c37399b90e969d67.pdf','Gazette rules and linked explanatory material','India','Law and regulation','document','Official Gazette PDF; long bilingual document requires excerpt review.',false)
on conflict(id) do nothing;
