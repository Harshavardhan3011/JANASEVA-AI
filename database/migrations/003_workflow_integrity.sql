begin;
alter table public.applications add column if not exists revision integer not null default 0;
alter table public.applications add column if not exists browser_phase text;
alter table public.applications add column if not exists policy_citations jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists browser_started_at timestamptz;

create table if not exists public.citizen_sessions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists citizen_sessions_user_id_idx on public.citizen_sessions(user_id);

create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  turns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
alter table public.citizen_sessions enable row level security;
alter table public.conversations enable row level security;

-- This application uses server-issued JWTs. Server-side ownership checks gate
-- all reads and mutations. Remove browser roles' direct access on Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.users, public.schemes, public.policy_documents, public.document_chunks,
      public.applications, public.uploaded_documents, public.eligibility_checks, public.approvals,
      public.agent_events, public.browser_sessions, public.citizen_sessions, public.conversations
      from anon, authenticated;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 10485760, array['application/pdf','image/png','image/jpeg'])
    on conflict (id) do update set public = false;
  end if;
end $$;
commit;
