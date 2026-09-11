-- Qattan AI — user profiles and the atomic credit engine.
-- Fully idempotent: safe to re-run at any time.
-- Run in the Supabase SQL editor.

-- ── Core table ─────────────────────────────────────────────────────────
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

-- Idempotent upgrades for databases created by earlier revisions.
alter table public.profiles add column if not exists generations_used integer not null default 0;
alter table public.profiles add column if not exists credits integer not null default 10;
alter table public.profiles add column if not exists last_credit_reset timestamptz not null default now();

-- ── New-user provisioning (10 credits) ────────────────────────────────
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
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    10,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Atomic deduction: EXACTLY -1 credit, +1 generation per call ────────
-- The parameter is named `user_id` to match what the Supabase JS client
-- sends. `drop function` must come first: Postgres rejects renaming an input
-- parameter through CREATE OR REPLACE ("cannot change name of input
-- parameter"), so re-running this migration over a database created with the
-- older `p_user_id` name would fail silently and leave the deployed signature
-- out of sync with the app.
drop function if exists public.deduct_credit(uuid, integer);
create function public.deduct_credit(user_id uuid, p_amount integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  previous integer;
  remaining integer;
begin
  -- Only single-credit deductions are permitted from any caller.
  if p_amount is null or p_amount <> 1 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select credits into previous from public.profiles where id = user_id;

  update public.profiles
  set credits = credits - 1,
      generations_used = generations_used + 1
  where id = user_id
    and credits >= 1
  returning credits into remaining;

  if remaining is null then
    if previous is null then
      insert into public.profiles (id, credits, last_credit_reset, generations_used)
      values (user_id, 0, now(), 0)
      on conflict (id) do nothing;
    end if;
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  -- Server-side audit trail (visible in the Supabase log explorer).
  raise notice 'CREDIT_DEDUCTION user=% old=% new=%', user_id, previous, remaining;
  return remaining;
end;
$$;

-- ── Compensating refund: +1 credit, -1 generation ─────────────────────
-- Used only when a pre-charged generation fails upstream, so failed renders
-- never consume credits. Bounds credits at the daily allowance.
drop function if exists public.refund_credit(uuid);
create function public.refund_credit(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.profiles
  set credits = least(credits + 1, 10),
      generations_used = greatest(generations_used - 1, 0)
  where id = user_id
  returning credits into updated;

  if updated is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  raise notice 'CREDIT_REFUND user=% new=%', user_id, updated;
  return updated;
end;
$$;

-- ── Daily refresh helper: resets ONLY after a true 24h elapsed ────────
drop function if exists public.refresh_daily_credit(uuid);
create function public.refresh_daily_credit(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.profiles;
  remaining integer;
  stamped integer;
begin
  select * into current_row from public.profiles where id = user_id;

  if not found then
    insert into public.profiles (id, credits, last_credit_reset)
    values (user_id, 10, now())
    on conflict (id) do nothing;
    return 10;
  end if;

  -- Legacy row without a timestamp: stamp it, PRESERVE the balance.
  if current_row.last_credit_reset is null then
    update public.profiles
    set last_credit_reset = now()
    where id = user_id
    returning credits into stamped;
    return coalesce(stamped, current_row.credits);
  end if;

  -- Reset ONLY when 24 hours have truly elapsed since the last reset.
  if current_row.last_credit_reset < now() - interval '24 hours' then
    update public.profiles
    set credits = 10, last_credit_reset = now()
    where id = user_id
    returning credits into remaining;
    return coalesce(remaining, 10);
  end if;

  return current_row.credits;
end;
$$;

-- Flush PostgREST's schema cache so the recreated functions are immediately
-- callable through the Supabase JS client (no more PGRST202 "Could not find
-- the function" after a migration).
notify pgrst, 'reload schema';

-- Lock the credit engine down to the server. CREATE FUNCTION grants EXECUTE
-- to PUBLIC by default, which would let anyone holding the anon key call
-- deduct_credit(other_user, 1) through PostgREST and burn credits that are
-- not theirs. Balances are modified exclusively by the service-role client.
revoke execute on function public.deduct_credit(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_credit(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_daily_credit(uuid) from public, anon, authenticated;
grant execute on function public.deduct_credit(uuid, integer) to service_role;
grant execute on function public.refund_credit(uuid) to service_role;
grant execute on function public.refresh_daily_credit(uuid) to service_role;
