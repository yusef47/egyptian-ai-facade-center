-- Qattan AI — top-up payments (Egypt), promo codes, and admin approval.
-- Fully idempotent: safe to re-run at any time.
-- Complements 20260910_qattan_profiles.sql and 20260910_qattan_admin.sql.

-- ── Top-up requests ─────────────────────────────────────────────────────
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  credits integer not null check (credits >= 1),
  amount_egp numeric(12, 2) not null check (amount_egp >= 0),
  payment_method text not null check (payment_method in ('instapay', 'vodafone_cash', 'other')),
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ref_code text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create index if not exists topup_requests_status_created
  on public.topup_requests (status, created_at desc);
create index if not exists topup_requests_user
  on public.topup_requests (user_id, created_at desc);
-- An operator double-clicking Approve (or two admins racing) must never
-- double-credit: at most one pending row per reference code.
create unique index if not exists topup_requests_one_pending_per_ref
  on public.topup_requests (ref_code) where status = 'pending';

-- ── Promo codes ─────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  code text primary key,
  credits integer not null check (credits >= 1),
  used_count integer not null default 0,
  max_uses integer not null default 1 check (max_uses >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Atomic approval: credits move EXACTLY once per request ─────────────
drop function if exists public.approve_topup(uuid);
create function public.approve_topup(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.topup_requests%rowtype;
  remaining integer;
begin
  -- Claim the request atomically: only the first caller flips a pending row
  -- to approved; every later caller updates zero rows and must not pay out.
  update public.topup_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_request_id
    and status = 'pending'
  returning * into req;

  if req is null then
    raise exception 'TOPUP_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits = credits + req.credits
  where id = req.user_id
  returning credits into remaining;

  if remaining is null then
    -- Request references a deleted profile (cascade would have removed the
    -- request too, but stay safe): re-open it for review instead of lying.
    update public.topup_requests
    set status = 'pending', reviewed_at = null, reviewed_by = null
    where id = p_request_id;
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  raise notice 'TOPUP_APPROVED user=% credits=% new_balance=%', req.user_id, req.credits, remaining;
  return remaining;
end;
$$;

-- ── Atomic promo redemption ─────────────────────────────────────────────
drop function if exists public.redeem_promo_code(text, uuid);
create function public.redeem_promo_code(p_code text, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  granted integer;
  remaining integer;
begin
  -- Reserve the redemption atomically: the guarded update wins exactly once
  -- per code across concurrent callers, so max_uses can never be exceeded.
  update public.promo_codes
  set used_count = used_count + 1
  where code = upper(trim(p_code))
    and active
    and used_count < max_uses
  returning credits into granted;

  if granted is null then
    raise exception 'PROMO_INVALID' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits = credits + granted
  where id = p_user_id
  returning credits into remaining;

  if remaining is null then
    -- Never consume a use when the beneficiary row does not exist.
    update public.promo_codes
    set used_count = greatest(used_count - 1, 0)
    where code = upper(trim(p_code));
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  raise notice 'PROMO_REDEEMED user=% code=% granted=% new_balance=%', p_user_id, p_code, granted, remaining;
  return remaining;
end;
$$;

-- Flush PostgREST's schema cache so the new tables/RPCs are immediately
-- callable through the Supabase JS client.
notify pgrst, 'reload schema';

-- ── Row-level security ──────────────────────────────────────────────────
alter table public.topup_requests enable row level security;
alter table public.promo_codes enable row level security;

-- Users see only their own requests (status display / history).
drop policy if exists "topup_requests_select_own" on public.topup_requests;
create policy "topup_requests_select_own"
  on public.topup_requests for select
  using (auth.uid() = user_id);

-- Submissions happen exclusively through /api/topup/request with the
-- service-role client (receipt URL validation, ref-code generation, abuse
-- guards) — so no public insert/update policies exist. Promo codes are
-- server-only: the redeem path is the redeem_promo_code RPC, called with the
-- service-role client after verifying the caller's session, and the table
-- itself is never readable or writable through anon/authenticated keys.
revoke all on public.promo_codes from anon, authenticated;

-- Approval mutates balances, so only the server may call these RPCs — the
-- same lockdown the credit engine uses.
revoke execute on function public.approve_topup(uuid) from public, anon, authenticated;
revoke execute on function public.redeem_promo_code(text, uuid) from public, anon, authenticated;
grant execute on function public.approve_topup(uuid) to service_role;
grant execute on function public.redeem_promo_code(text, uuid) to service_role;
