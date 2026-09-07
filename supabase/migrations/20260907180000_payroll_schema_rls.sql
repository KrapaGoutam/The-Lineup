-- Feature 020 Phase 1: payroll schema + RLS only. No application code reads
-- or writes any of this yet -- see docs/features/020-payroll.md.
--
-- Payroll and Tip Split are fully independent systems (confirmed in the
-- spec's "Tips and payroll are fully independent systems" section): no
-- table or policy below references tip_pools, tip_intervals,
-- tip_interval_participants, tip_allocations, or recalculate_tip_pool, and
-- none ever will -- different money, different timelines, different math.
--
-- Every actor column is a composite foreign key against
-- memberships (organization_id, profile_id), not a bare profiles (id)
-- reference -- a bare profiles FK only proves the id exists somewhere, not
-- that it belongs to this organization. This is Feature 019's hardening
-- lesson (supabase/migrations/20260907143637_harden_attendance_identity_links.sql)
-- applied from the start here, not as a follow-up migration.

create table public.payroll_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_rate_cents integer not null check (default_rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

comment on table public.payroll_settings is
  'Feature 020. One row per organization: the default hourly rate (cents) used when a person has no payroll_rates override.';

create table public.payroll_rates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  rate_cents integer not null check (rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id),
  unique (organization_id, neon_user_id)
);

comment on table public.payroll_rates is
  'Feature 020. Per-person hourly rate override (cents), keyed by Neon users.id -- current value only, never consulted for an already-generated payroll_periods row.';

-- Keyed by neon_user_id, not profile_id: payroll must be generatable for
-- every active Neon user a manager wants to pay, whether or not that
-- person has (or ever gets) a linked Lineup account. attendance_identity_links
-- (Feature 019) is consulted only to resolve a regular signed-in member's
-- own scope below -- never a requirement for a row to exist here.
create table public.payroll_periods (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  period_month date not null,                    -- always the 1st of the month
  hours_snapshot numeric not null check (hours_snapshot >= 0),
  rate_cents_snapshot integer not null check (rate_cents_snapshot >= 0),
  gross_cents integer not null check (gross_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  generated_at timestamptz not null default now(),
  generated_by uuid not null,
  regenerated_at timestamptz,
  regenerated_by uuid,
  locked_at timestamptz,
  locked_by uuid,
  foreign key (organization_id, generated_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, regenerated_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, locked_by) references public.memberships (organization_id, profile_id),
  unique (organization_id, neon_user_id, period_month)
);

comment on table public.payroll_periods is
  'Feature 020. One frozen monthly payroll snapshot per (organization, Neon person, month) -- hours/rate/gross are written once at generation and never recomputed automatically.';

-- Backs the RLS self-select policy's "neon_user_id in (...)" lookup and
-- every privileged "this person's periods" read. The unique constraint
-- above already provides an index with organization_id as its leading
-- column, but a dedicated (organization_id, neon_user_id) index matches
-- the self-select policy's actual predicate shape without period_month.
create index payroll_periods_org_neon_user_idx
  on public.payroll_periods (organization_id, neon_user_id);

create table public.payroll_payments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payroll_period_id bigint not null references public.payroll_periods (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  comment text check (comment is null or char_length(comment) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  reverses_payment_id bigint,  -- set only on a correction row (Phase 3)
  foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, confirmed_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, reverses_payment_id) references public.payroll_payments (organization_id, id),
  unique (organization_id, id)  -- lets the self-referencing FK above target this table's (organization_id, id)
);

comment on table public.payroll_payments is
  'Feature 020. Payments recorded against a payroll_periods row. Draft counts toward balance; confirmed is additionally immutable (amount/date/comment) and self-visible. Never deleted -- a correction is a new row via reverses_payment_id.';

-- Postgres never indexes a foreign key column automatically.
-- payroll_period_id backs the RLS self-select policy's join and every
-- "this period's payments" read; organization_id backs the privileged
-- policy's direct filter.
create index payroll_payments_organization_id_idx
  on public.payroll_payments (organization_id);
create index payroll_payments_period_id_idx
  on public.payroll_payments (payroll_period_id);

-- Confirmed-payment immutability: once status = 'confirmed', amount_cents,
-- payment_date, and comment can never change again, at the database level
-- -- not just a disabled button in the UI. A correction is always a new
-- row (reverses_payment_id), matching the append-only discipline
-- audit_events already establishes elsewhere in this schema. status,
-- confirmed_at, confirmed_by, and updated_at are deliberately NOT covered
-- by this check -- confirming a draft payment, or moving updated_at along
-- with any allowed change, is exactly the write this trigger exists to let
-- through; only the three fields that define the money already recorded
-- are frozen once confirmed.
create or replace function private.forbid_confirmed_payment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed'
     and (new.amount_cents is distinct from old.amount_cents
          or new.payment_date is distinct from old.payment_date
          or new.comment is distinct from old.comment) then
    raise exception 'Cannot edit a confirmed payment; record a correction instead.';
  end if;
  return new;
end;
$$;

create trigger forbid_confirmed_payment_edit
  before update on public.payroll_payments
  for each row execute function private.forbid_confirmed_payment_edit();

-- Grants: least privilege, verb-by-verb. RLS still governs which rows;
-- this only governs which operations exist at all. payroll_rates is the
-- only table with delete (see its RLS policies below for why).
revoke all on table
  public.payroll_settings,
  public.payroll_rates,
  public.payroll_periods,
  public.payroll_payments
from anon, authenticated;
grant select, insert, update on public.payroll_settings to authenticated;
grant select, insert, update, delete on public.payroll_rates to authenticated;
grant select, insert, update on public.payroll_periods to authenticated;
grant select, insert, update on public.payroll_payments to authenticated;

-- nextval() only needs usage, not the ability to read the sequence's
-- current state -- the same fix Feature 019's hardening pass made.
revoke all on sequence
  public.payroll_rates_id_seq,
  public.payroll_periods_id_seq,
  public.payroll_payments_id_seq
from anon, authenticated;
grant usage on sequence
  public.payroll_rates_id_seq,
  public.payroll_periods_id_seq,
  public.payroll_payments_id_seq
to authenticated;

alter table public.payroll_settings enable row level security;
alter table public.payroll_rates enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_payments enable row level security;

-- settings and rates: privileged-only, full stop -- nothing here is ever
-- self-visible. Split by operation, not a combined `for all`, matching
-- Feature 019's hardening lesson: easier to audit, and update needs both
-- using/with check so a row can't be read under one condition and
-- rewritten to no longer match it.
create policy "payroll_settings_select_privileged" on public.payroll_settings
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_settings_insert_privileged" on public.payroll_settings
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_settings_update_privileged" on public.payroll_settings
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_select_privileged" on public.payroll_rates
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_insert_privileged" on public.payroll_rates
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_update_privileged" on public.payroll_rates
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- The one table in this feature where delete is allowed: a row here is
-- current configuration (an override), not financial history -- removing
-- it just means "fall back to payroll_settings.default_rate_cents" for the
-- next generation. Nothing financial is lost: any month already generated
-- has its own frozen rate_cents_snapshot regardless of what payroll_rates
-- says today.
create policy "payroll_rates_delete_privileged" on public.payroll_rates
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- periods: privileged read/write everyone; a regular member reads only
-- their own linked period, any status (draft or locked -- the generated
-- total itself isn't a "draft entry" in the payments sense, only draft
-- PAYMENTS are hidden from a regular member, per payroll_payments below).
create policy "payroll_periods_select_privileged" on public.payroll_periods
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- No active-membership re-check here: attendance_identity_links' OWN RLS
-- (Feature 019) already requires the reader to pass has_org_role for the
-- self-branch to see their own row at all -- so if this member's
-- membership goes inactive, the subquery below returns zero rows on its
-- own, and this policy inherits that protection transitively rather than
-- duplicating the check. Verified directly in
-- supabase/tests/database/0010_payroll_schema_rls.test.sql.
create policy "payroll_periods_select_self" on public.payroll_periods
  for select to authenticated
  using (
    neon_user_id in (
      select l.neon_user_id from public.attendance_identity_links l
      where l.organization_id = payroll_periods.organization_id
        and l.profile_id = (select auth.uid())
    )
  );

create policy "payroll_periods_insert_privileged" on public.payroll_periods
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_periods_update_privileged" on public.payroll_periods
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- payments: privileged read/write everyone; a regular member reads only
-- their own CONFIRMED payments -- a draft is invisible to them even
-- though it already counts toward the privileged balance (see the spec's
-- confirm/draft semantics section for why).
create policy "payroll_payments_select_privileged" on public.payroll_payments
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_payments_select_self" on public.payroll_payments
  for select to authenticated
  using (
    status = 'confirmed'
    and payroll_period_id in (
      select p.id from public.payroll_periods p
      join public.attendance_identity_links l
        on l.organization_id = p.organization_id and l.neon_user_id = p.neon_user_id
      where l.profile_id = (select auth.uid())
    )
  );

create policy "payroll_payments_insert_privileged" on public.payroll_payments
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_payments_update_privileged" on public.payroll_payments
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
