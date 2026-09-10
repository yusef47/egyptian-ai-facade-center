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
create or replace function public.deduct_credit(p_user_id uuid, p_amount integer default 1)
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

  select credits into previous from public.profiles where id = p_user_id;

  update public.profiles
  set credits = credits - 1,
      generations_used = generations_used + 1
  where id = p_user_id
    and credits >= 1
  returning credits into remaining;

  if remaining is null then
    if previous is null then
      insert into public.profiles (id, credits, last_credit_reset, generations_used)
      values (p_user_id, 0, now(), 0)
      on conflict (id) do nothing;
    end if;
    raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
  end if;

  -- Server-side audit trail (visible in the Supabase log explorer).
  raise notice 'CREDIT_DEDUCTION user=% old=% new=%', p_user_id, previous, remaining;
  return remaining;
end;
$$;

-- ── Daily refresh helper: resets ONLY after a true 24h elapsed ────────
create or replace function public.refresh_daily_credit(p_user_id uuid)
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
  select * into current_row from public.profiles where id = p_user_id;

  if not found then
    insert into public.profiles (id, credits, last_credit_reset)
    values (p_user_id, 10, now())
    on conflict (id) do nothing;
    return 10;
  end if;

  -- Legacy row without a timestamp: stamp it, PRESERVE the balance.
  if current_row.last_credit_reset is null then
    update public.profiles
    set last_credit_reset = now()
    where id = p_user_id
    returning credits into stamped;
    return coalesce(stamped, current_row.credits);
  end if;

  -- Reset ONLY when 24 hours have truly elapsed since the last reset.
  if current_row.last_credit_reset < now() - interval '24 hours' then
    update public.profiles
    set credits = 10, last_credit_reset = now()
    where id = p_user_id
    returning credits into remaining;
    return coalesce(remaining, 10);
  end if;

  return current_row.credits;
end;
$$;
