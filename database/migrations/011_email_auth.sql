
alter table public.users add column if not exists email_verified_at timestamptz;
alter table public.users add column if not exists registration_pending boolean not null default false;
alter table public.users add column if not exists role text not null default 'regular' check(role in ('regular','admin'));
alter table public.users add column if not exists admin_source text check(admin_source in ('bootstrap','invitation'));
create unique index if not exists users_normalized_email on public.users(lower(trim(email)));
create table if not exists public.auth_email_tokens(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 issued_by uuid references public.users(id) on delete set null,
 purpose text not null check(purpose in ('verify','reset','invite')),token_hash text not null unique,
 expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists auth_email_tokens_user on public.auth_email_tokens(user_id,purpose,created_at desc);
create table if not exists public.auth_email_limits(
 key text primary key,window_start timestamptz not null default now(),attempts integer not null default 1
);
create table if not exists public.auth_role_audit(
 id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,
 actor_id uuid references public.users(id) on delete set null,old_role text,new_role text not null,
 reason text not null,created_at timestamptz not null default now()
);
alter table public.auth_email_tokens enable row level security;
alter table public.auth_email_limits enable row level security;
alter table public.auth_role_audit enable row level security;
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticated') then
 revoke all on public.auth_email_tokens,public.auth_email_limits,public.auth_role_audit from anon,authenticated;
 end if;
end $$;
