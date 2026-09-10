-- Qattan AI — admin statistics RPCs and row-level security.
-- Fully idempotent: safe to re-run at any time.
-- Complements 20260910_qattan_profiles.sql.

-- ── Admin statistics RPCs (SECURITY DEFINER over the whole table) ─────
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
  limit least(greatest(p_limit, 1), 200);
$$;

-- ── Row-level security ─────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Credit updates happen exclusively server-side via the service-role client
-- and the deduct_credit / refresh_daily_credit RPCs, which bypass RLS by
-- design. No public update/insert policies exist for the balances.
