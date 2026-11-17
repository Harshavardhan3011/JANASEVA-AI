alter table public.schemes
  add column if not exists catalog_source_url text,
  add column if not exists academic_year text,
  add column if not exists application_deadline date,
  add column if not exists application_cycle text check (application_cycle in ('student', 'renewal')),
  add column if not exists catalog_checked_on date;
