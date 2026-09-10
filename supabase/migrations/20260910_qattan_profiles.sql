-- Qattan AI — user profiles with 10 daily recurring credits.
-- Run in the Supabase SQL editor (or as a migration). Idempotent: safe to re-run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  credits integer not null default 10,
  last_credit_reset timestamptz not null default now(),
  created_at timestamptz not null default now(),
  generations_used integer not null default 0
);

-- Provision a profile with 10 credits for every new Google sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, credits, last_credit_reset)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Atomic credit deduction: decrements only when the balance stays >= 0 and
-- returns the authoritative remaining balance. Called by lib/credits.ts
-- (service-role) after every successful generation.
create or replace function public.deduct_credit(p_user_id uuid, p_amount integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
  set credits = credits - p_amount,
      generations_used = generations_used + p_amount
  where id = p_user_id
    and credits >= p_amount
  returning credits into remaining;

  if remaining is null then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  return remaining;
end;
$$;

-- Daily refresh helper: resets the balance to the daily allowance when the
-- last reset is older than 24 hours. Used by lib/credits.ts on each request.
create or replace function public.refresh_daily_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.profiles;
  remaining integer;
begin
  select * into current_row from public.profiles where id = p_user_id;

  if not found then
    insert into public.profiles (id, credits, last_credit_reset)
    values (p_user_id, 10, now())
    on conflict (id) do nothing;
    return 10;
  end if;

  if current_row.last_credit_reset is null
     or current_row.last_credit_reset < now() - interval '24 hours' then
    update public.profiles
    set credits = 10, last_credit_reset = now()
    where id = p_user_id
    returning credits into remaining;
    return coalesce(remaining, 10);
  end if;

  return current_row.credits;
end;
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Credit updates happen exclusively server-side through the service-role
-- client and the deduct_credit / refresh_daily_credit RPCs, which bypass
-- RLS by design.

-- Platform statistics for the /admin dashboard. SECURITY DEFINER so the
-- aggregates run over profiles regardless of RLS; authorization is enforced
-- in application code (lib/admin.ts) before this RPC is ever invoked.
create or replace function public.admin_platform_stats()
returns table (
  total_users bigint,
  total_generations bigint,
  total_credits_remaining bigint,
  active_users bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles),
    (select coalesce(sum(generations_used), 0) from public.profiles),
    (select coalesce(sum(credits), 0) from public.profiles),
    (select count(*) from public.profiles where last_credit_reset >= now() - interval '24 hours');
$$;

-- Per-user credit ledger used by the /admin dashboard table.
create or replace function public.admin_recent_profiles(p_limit integer default 20)
returns table (
  id uuid,
  email text,
  full_name text,
  credits integer,
  generations_used integer,
  last_credit_reset timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, email, full_name, credits, generations_used, last_credit_reset, created_at
  from public.profiles
  order by created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
