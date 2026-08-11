-- ============================================================================
-- FamilyWealth — Supabase schema (v1: whole-state sync)
-- Run this in the Supabase SQL editor once, after creating your project.
-- ----------------------------------------------------------------------------
-- v1 stores each user's entire app state as one JSONB row. This maps 1:1 to the
-- app's save(AppData)/load() contract, gives instant multi-device sync, and is
-- the fastest correct starting point. See the NORMALIZED TARGET at the bottom
-- for the relational schema you migrate to later (also the SwiftUI-era backend).
-- ============================================================================

create table if not exists public.wealth_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wealth_state enable row level security;

-- A user can only read/write their own row.
drop policy if exists "wealth_state_select_own" on public.wealth_state;
create policy "wealth_state_select_own"
  on public.wealth_state for select
  using (auth.uid() = user_id);

drop policy if exists "wealth_state_insert_own" on public.wealth_state;
create policy "wealth_state_insert_own"
  on public.wealth_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "wealth_state_update_own" on public.wealth_state;
create policy "wealth_state_update_own"
  on public.wealth_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists wealth_state_touch on public.wealth_state;
create trigger wealth_state_touch
  before update on public.wealth_state
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- NORMALIZED TARGET (later phase — do NOT run yet).
-- When you need server-side queries (e.g. spending analytics), partial sync, or
-- per-person logins, migrate the JSONB into these tables. This is also the shape
-- to mirror as Swift structs / SwiftData models. Sketch only:
--
-- households(id, owner uuid, name)
-- people(id, household_id, name, relation)
-- tax_identities(id, person_id, pan, label)
-- accounts(id, household_id, person_id, pan_id, institution, kind, balance, currency, pw_format)
-- assets(id, household_id, person_id, kind, symbol, platform, qty, buy_price, current_price, buy_value, current_value, currency, note)
-- statements(id, account_id, scope, period, total, file_name, pw_format, parsed, uploaded_at)
-- transactions(id, statement_id, date, description, amount, direction, category, month)
-- settings(household_id, gold, silver, fx jsonb, pw_formats jsonb)
-- Each table: RLS scoped to household membership (owner = auth.uid(), or a
-- household_members join for multi-login families).
-- ============================================================================
