-- Migration: 20261110145124_attendance_native_payroll_identity.sql
-- Feature V2-006 R2: native Payroll identity, atomic attendance consumption ledger,
-- correction-after-confirmation review boundary, and attendance-source transition safety.
--
-- Owner approvals (2026-11-10, issue #254 / R2 approval): Q1, Q4, Q6, Q9 (Option A), Q9b.
-- NOT authorized by those approvals: real payroll payments, activation of native financial
-- processing, hosted DEV/Production migration, backend-enforcement activation. This migration
-- therefore ships every financial entry point behind a DEFAULT-OFF database switch
-- (public.attendance_financial_activation.enabled = false).
--
-- Additive and forward-only on top of 20261110010000. Nothing historical is rewritten:
--   * every existing payroll_periods / payroll_rates row keeps its data and satisfies the
--     'external_neon' branch of the new identity check through the column default;
--   * no existing constraint, policy or trigger is dropped except two policies/helpers that
--     are REPLACED to add the native self-read branch (their Neon branch is byte-for-byte
--     unchanged);
--   * the attendance tables themselves are untouched, and no attendance trigger or function
--     reads payroll tables (R1 isolation guarantee, pgTAP 0075, still holds).
--
-- Rollback is forward-fix only: once a native period exists, the new columns and ledger hold
-- financial history and must not be dropped.

begin;

-- =============================================================================
-- 0. Staged activation switch (DEFAULT OFF; clients cannot read or write it)
-- =============================================================================
create table if not exists public.attendance_financial_activation (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  evidence text,
  updated_at timestamptz not null default now(),
  constraint attendance_financial_activation_has_evidence
    check (not enabled or (evidence is not null and length(trim(evidence)) >= 10))
);

insert into public.attendance_financial_activation (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

comment on table public.attendance_financial_activation is
  'V2-006 R2. Single-row switch. While enabled = false no native attendance can be consumed by Payroll and attendance-source transitions are not payroll-gated. Flipping it is an owner-authorized, evidence-recorded operation done with elevated database access only; there is no client grant.';

alter table public.attendance_financial_activation enable row level security;
revoke all on table public.attendance_financial_activation from public, anon, authenticated;

create or replace function private.attendance_financial_activated()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.enabled from public.attendance_financial_activation a where a.singleton),
    false
  );
$$;
revoke all on function private.attendance_financial_activated() from public, anon, authenticated;

-- =============================================================================
-- 1. Source-discriminated Payroll employee identity (Option A)
-- =============================================================================
alter table public.payroll_periods
  add column if not exists attendance_source text not null default 'external_neon',
  add column if not exists profile_id uuid;

alter table public.payroll_periods
  alter column neon_user_id drop not null;

alter table public.payroll_periods
  drop constraint if exists payroll_periods_attendance_source_check,
  drop constraint if exists payroll_periods_identity_exactly_one,
  drop constraint if exists payroll_periods_profile_membership_fk,
  drop constraint if exists payroll_periods_consumption_key;

alter table public.payroll_periods
  add constraint payroll_periods_attendance_source_check
    check (attendance_source in ('external_neon', 'internal_the_lineup')),
  add constraint payroll_periods_identity_exactly_one
    check (
      (attendance_source = 'external_neon' and neon_user_id is not null and profile_id is null)
      or (attendance_source = 'internal_the_lineup' and profile_id is not null and neon_user_id is null)
    ),
  add constraint payroll_periods_profile_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id)
    on delete restrict,
  -- Lets the consumption ledger bind a row to the exact employee AND month of its period.
  add constraint payroll_periods_consumption_key
    unique (id, organization_id, profile_id, period_month);

create unique index if not exists payroll_periods_native_unique
  on public.payroll_periods (organization_id, profile_id, period_month)
  where profile_id is not null;

create index if not exists payroll_periods_org_profile_idx
  on public.payroll_periods (organization_id, profile_id)
  where profile_id is not null;

comment on column public.payroll_periods.attendance_source is
  'V2-006 R2. external_neon = keyed by neon_user_id (all historical rows); internal_the_lineup = keyed by profile_id. Immutable after insert.';
comment on column public.payroll_periods.profile_id is
  'V2-006 R2. Native employee identity. NULL for every Neon-keyed period. Never a stand-in for a Neon id.';

alter table public.payroll_rates
  add column if not exists attendance_source text not null default 'external_neon',
  add column if not exists profile_id uuid;

alter table public.payroll_rates
  alter column neon_user_id drop not null;

alter table public.payroll_rates
  drop constraint if exists payroll_rates_attendance_source_check,
  drop constraint if exists payroll_rates_identity_exactly_one,
  drop constraint if exists payroll_rates_profile_membership_fk;

alter table public.payroll_rates
  add constraint payroll_rates_attendance_source_check
    check (attendance_source in ('external_neon', 'internal_the_lineup')),
  add constraint payroll_rates_identity_exactly_one
    check (
      (attendance_source = 'external_neon' and neon_user_id is not null and profile_id is null)
      or (attendance_source = 'internal_the_lineup' and profile_id is not null and neon_user_id is null)
    ),
  add constraint payroll_rates_profile_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id)
    on delete restrict;

create unique index if not exists payroll_rates_native_unique
  on public.payroll_rates (organization_id, profile_id)
  where profile_id is not null;

-- 1.1 The employee identity of a period / rate can never change, for ANY role (the older
--     actor guard only fires when a JWT subject is present).
create or replace function private.payroll_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attendance_source is distinct from old.attendance_source
     or new.profile_id is distinct from old.profile_id
     or new.neon_user_id is distinct from old.neon_user_id then
    raise exception 'The employee identity of a payroll record cannot change.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_identity_immutable() from public, anon, authenticated;

drop trigger if exists payroll_periods_identity_immutable on public.payroll_periods;
create trigger payroll_periods_identity_immutable
  before update on public.payroll_periods
  for each row execute function private.payroll_identity_immutable();

drop trigger if exists payroll_rates_identity_immutable on public.payroll_rates;
create trigger payroll_rates_identity_immutable
  before update on public.payroll_rates
  for each row execute function private.payroll_identity_immutable();

-- 1.2 Identity bridge helpers (read the manager-set link; never infer by name).
create or replace function private.payroll_linked_neon_user(p_org uuid, p_profile uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.neon_user_id
  from public.attendance_identity_links l
  where l.organization_id = p_org and l.profile_id = p_profile;
$$;
revoke all on function private.payroll_linked_neon_user(uuid, uuid) from public, anon, authenticated;

create or replace function private.payroll_linked_profile(p_org uuid, p_neon integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.profile_id
  from public.attendance_identity_links l
  where l.organization_id = p_org and l.neon_user_id = p_neon;
$$;
revoke all on function private.payroll_linked_profile(uuid, integer) from public, anon, authenticated;

-- One lock per organization serialises every identity-sensitive payroll write (period or
-- rate insert, link change). Payroll writes are rare and manager-driven, so this trades a
-- negligible amount of concurrency for a deadlock-free cross-key guarantee.
create or replace function private.payroll_identity_lock(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('payroll-identity:' || p_org::text, 0));
$$;
revoke all on function private.payroll_identity_lock(uuid) from public, anon, authenticated;

-- 1.3 Cross-key guard: a person who holds BOTH identities can never be paid twice for a month.
create or replace function private.payroll_periods_cross_key_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_neon integer;
  v_other_profile uuid;
begin
  perform private.payroll_identity_lock(new.organization_id);

  if new.attendance_source = 'internal_the_lineup' then
    v_other_neon := private.payroll_linked_neon_user(new.organization_id, new.profile_id);
    if v_other_neon is not null and exists (
      select 1 from public.payroll_periods p
      where p.organization_id = new.organization_id
        and p.period_month = new.period_month
        and p.neon_user_id = v_other_neon
    ) then
      raise exception 'DUAL_IDENTITY_DUPLICATE: this employee already has a payroll period for that month under the linked Neon identity.'
        using errcode = '23505';
    end if;
  else
    v_other_profile := private.payroll_linked_profile(new.organization_id, new.neon_user_id);
    if v_other_profile is not null then
      if exists (
        select 1 from public.payroll_periods p
        where p.organization_id = new.organization_id
          and p.period_month = new.period_month
          and p.profile_id = v_other_profile
      ) then
        raise exception 'DUAL_IDENTITY_DUPLICATE: this employee already has a payroll period for that month under the linked native identity.'
          using errcode = '23505';
      end if;
      -- Once native financial processing is active, a month that holds native attendance for
      -- the same person must not also be paid from Neon hours (mixed-source month).
      if private.attendance_financial_activated() and exists (
        select 1 from public.attendance_sessions s
        where s.organization_id = new.organization_id
          and s.profile_id = v_other_profile
          and s.status <> 'voided'
          and s.service_date >= new.period_month
          and s.service_date < (new.period_month + interval '1 month')::date
      ) then
        raise exception 'MIXED_SOURCE_MONTH: native attendance exists for this employee in that month; resolve it before generating from the external source.'
          using errcode = '55000';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_periods_cross_key_guard() from public, anon, authenticated;

drop trigger if exists payroll_periods_cross_key_guard on public.payroll_periods;
create trigger payroll_periods_cross_key_guard
  before insert on public.payroll_periods
  for each row execute function private.payroll_periods_cross_key_guard();

create or replace function private.payroll_rates_cross_key_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_neon integer;
  v_other_profile uuid;
begin
  perform private.payroll_identity_lock(new.organization_id);
  if new.attendance_source = 'internal_the_lineup' then
    v_other_neon := private.payroll_linked_neon_user(new.organization_id, new.profile_id);
    if v_other_neon is not null and exists (
      select 1 from public.payroll_rates r
      where r.organization_id = new.organization_id and r.neon_user_id = v_other_neon
    ) then
      raise exception 'DUAL_IDENTITY_DUPLICATE: a pay-rate override already exists for this employee under the linked Neon identity.'
        using errcode = '23505';
    end if;
  else
    v_other_profile := private.payroll_linked_profile(new.organization_id, new.neon_user_id);
    if v_other_profile is not null and exists (
      select 1 from public.payroll_rates r
      where r.organization_id = new.organization_id and r.profile_id = v_other_profile
    ) then
      raise exception 'DUAL_IDENTITY_DUPLICATE: a pay-rate override already exists for this employee under the linked native identity.'
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_rates_cross_key_guard() from public, anon, authenticated;

drop trigger if exists payroll_rates_cross_key_guard on public.payroll_rates;
create trigger payroll_rates_cross_key_guard
  before insert on public.payroll_rates
  for each row execute function private.payroll_rates_cross_key_guard();

-- 1.4 The guard reads the manager-set link, so the link itself cannot be edited into a hole.
create or replace function private.payroll_identity_link_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.payroll_identity_lock(coalesce(new.organization_id, old.organization_id));

  -- Removing or changing a link: refuse while the person has dual-identity payroll history,
  -- because the cross-key guard would otherwise stop recognising them as one person.
  if tg_op in ('DELETE', 'UPDATE') then
    if tg_op = 'DELETE'
       or new.profile_id is distinct from old.profile_id
       or new.neon_user_id is distinct from old.neon_user_id then
      if exists (
           select 1 from public.payroll_periods p
           where p.organization_id = old.organization_id and p.profile_id = old.profile_id
         )
         or exists (
           select 1 from public.payroll_rates r
           where r.organization_id = old.organization_id and r.profile_id = old.profile_id
         )
         or (
           exists (
             select 1 from public.payroll_periods p
             where p.organization_id = old.organization_id and p.neon_user_id = old.neon_user_id
           )
           and exists (
             select 1 from public.attendance_sessions s
             where s.organization_id = old.organization_id
               and s.profile_id = old.profile_id
               and s.status <> 'voided'
           )
         ) then
        raise exception 'IDENTITY_LINK_IN_USE: this link protects an employee with native payroll history or native attendance; it cannot be removed or changed.'
          using errcode = '55000';
      end if;
    end if;
  end if;

  -- Creating or changing a link: refuse when it would join two identities that were already
  -- paid separately for the same month (a pre-existing double payment).
  if tg_op in ('INSERT', 'UPDATE') then
    if exists (
         select 1
         from public.payroll_periods a
         join public.payroll_periods b
           on b.organization_id = a.organization_id and b.period_month = a.period_month
         where a.organization_id = new.organization_id
           and a.profile_id = new.profile_id
           and b.neon_user_id = new.neon_user_id
       )
       or (
         exists (select 1 from public.payroll_rates r where r.organization_id = new.organization_id and r.profile_id = new.profile_id)
         and exists (select 1 from public.payroll_rates r where r.organization_id = new.organization_id and r.neon_user_id = new.neon_user_id)
       ) then
      raise exception 'DUAL_IDENTITY_DUPLICATE: linking these identities would join two payroll records for the same month or two rate overrides.'
        using errcode = '23505';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.payroll_identity_link_guard() from public, anon, authenticated;

drop trigger if exists payroll_identity_link_guard on public.attendance_identity_links;
create trigger payroll_identity_link_guard
  before insert or update or delete on public.attendance_identity_links
  for each row execute function private.payroll_identity_link_guard();

-- 1.5 Self-read. The Neon branch is unchanged; the native branch needs the caller's own
--     profile id and an ACTIVE membership, for LOCKED periods only.
drop policy if exists "payroll_periods_select_self" on public.payroll_periods;
create policy "payroll_periods_select_self" on public.payroll_periods
  for select to authenticated
  using (
    status = 'locked'
    and (
      (
        attendance_source = 'external_neon'
        and neon_user_id in (
          select l.neon_user_id
          from public.attendance_identity_links l
          join public.memberships m
            on m.organization_id = l.organization_id and m.profile_id = l.profile_id
          where l.organization_id = payroll_periods.organization_id
            and l.profile_id = (select auth.uid())
            and m.active
        )
      )
      or (
        attendance_source = 'internal_the_lineup'
        and profile_id = (select auth.uid())
        and exists (
          select 1 from public.memberships m
          where m.organization_id = payroll_periods.organization_id
            and m.profile_id = (select auth.uid())
            and m.active
        )
      )
    )
  );

create or replace function private.owns_payroll_period(target_payroll_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_periods p
    join public.attendance_identity_links l
      on l.organization_id = p.organization_id and l.neon_user_id = p.neon_user_id
    join public.memberships m
      on m.organization_id = p.organization_id and m.profile_id = l.profile_id
    where p.id = target_payroll_period_id
      and p.attendance_source = 'external_neon'
      and l.profile_id = (select auth.uid())
      and m.active
  )
  or exists (
    select 1
    from public.payroll_periods p
    join public.memberships m
      on m.organization_id = p.organization_id and m.profile_id = p.profile_id
    where p.id = target_payroll_period_id
      and p.attendance_source = 'internal_the_lineup'
      and p.profile_id = (select auth.uid())
      and m.active
  );
$$;

create or replace function private.payroll_can_read_period(p_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_periods p
    where p.id = p_period_id
      and (select auth.uid()) is not null
      and (
        private.payroll_can_manage_period(p.id)
        or (p.status = 'locked' and private.owns_payroll_period(p.id))
      )
  );
$$;
revoke all on function private.payroll_can_read_period(bigint) from public, anon;
grant execute on function private.payroll_can_read_period(bigint) to authenticated;

-- =============================================================================
-- 2. Payable-time proof (database-side; never trusted from TypeScript)
-- =============================================================================
create or replace function private.attendance_session_payable(p_session_id uuid)
returns table (
  organization_id uuid,
  location_id uuid,
  profile_id uuid,
  service_date date,
  status public.attendance_session_status,
  version integer,
  clock_out_at timestamptz,
  gross_elapsed_seconds integer,
  unpaid_break_seconds integer,
  net_payable_seconds integer,
  break_policy_resolved boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.organization_id, s.location_id, s.profile_id, s.service_date, s.status, s.version,
    s.clock_out_at,
    s.gross_elapsed_seconds,
    coalesce(b.unpaid_seconds, 0)::integer,
    case when s.status in ('completed', 'auto_clocked_out')
              and coalesce(b.open_breaks, 0) = 0 and coalesce(b.unclassified_breaks, 0) = 0
         then s.gross_elapsed_seconds - coalesce(b.unpaid_seconds, 0)::integer end,
    (s.status in ('completed', 'auto_clocked_out')
      and coalesce(b.open_breaks, 0) = 0 and coalesce(b.unclassified_breaks, 0) = 0)
  from public.attendance_sessions s
  left join lateral (
    select
      sum(br.duration_seconds) filter (where br.pay_classification = 'unpaid') as unpaid_seconds,
      count(*) filter (where br.end_time is null) as open_breaks,
      count(*) filter (where br.pay_classification = 'unclassified') as unclassified_breaks
    from public.attendance_breaks br
    where br.session_id = s.id
  ) b on true
  where s.id = p_session_id;
$$;
revoke all on function private.attendance_session_payable(uuid) from public, anon, authenticated;

-- A period is frozen once it is locked OR any payment exists against it (the existing
-- snapshot trigger already forbids snapshot edits after the first payment).
create or replace function private.payroll_period_frozen(p_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_periods p
    where p.id = p_period_id
      and (
        p.status = 'locked'
        or exists (select 1 from public.payroll_payments pay where pay.payroll_period_id = p.id)
      )
  );
$$;
revoke all on function private.payroll_period_frozen(bigint) from public, anon, authenticated;

-- =============================================================================
-- 3. Atomic, version-aware consumption ledger (payroll side)
-- =============================================================================
create table if not exists public.payroll_attendance_consumptions (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null,
  session_id uuid not null,
  consumer_type text not null check (consumer_type in ('payroll_period')),
  consumer_ref bigint not null,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  service_date date not null,
  source_version integer not null check (source_version >= 1),
  gross_elapsed_seconds integer not null check (gross_elapsed_seconds >= 0),
  unpaid_break_seconds integer not null check (unpaid_break_seconds >= 0),
  net_payable_seconds integer not null check (net_payable_seconds >= 0),
  status text not null default 'active' check (status in ('active', 'superseded')),
  consumed_at timestamptz not null default now(),
  consumed_by uuid not null references public.profiles (id) on delete restrict,
  superseded_at timestamptz,
  superseded_by uuid references public.profiles (id) on delete restrict,
  superseded_reason text,
  constraint payroll_attendance_consumptions_net_matches
    check (net_payable_seconds = gross_elapsed_seconds - unpaid_break_seconds),
  constraint payroll_attendance_consumptions_service_in_month
    check (service_date >= period_month and service_date < (period_month + interval '1 month')::date),
  constraint payroll_attendance_consumptions_supersede_attribution
    check (
      (status = 'active' and superseded_at is null and superseded_by is null and superseded_reason is null)
      or (status = 'superseded' and superseded_at is not null and superseded_by is not null
          and superseded_reason is not null and length(trim(superseded_reason)) >= 3)
    ),
  -- tenant, location and employee cannot drift from the attendance session
  constraint payroll_attendance_consumptions_session_fk
    foreign key (session_id, organization_id, location_id, profile_id)
    references public.attendance_sessions (id, organization_id, location_id, profile_id)
    on delete restrict,
  -- the row can only point at the period of THIS employee and THIS month
  constraint payroll_attendance_consumptions_period_fk
    foreign key (consumer_ref, organization_id, profile_id, period_month)
    references public.payroll_periods (id, organization_id, profile_id, period_month)
    on delete restrict
);

comment on table public.payroll_attendance_consumptions is
  'V2-006 R2. One row per (consumer, native attendance session) recording WHICH session, at WHICH version and with WHAT frozen payable seconds a payroll period consumed. A session can feed at most one live period. Written only by payroll_generate_native_period; clients are read-only.';

-- At most once: a session can feed exactly one live consumer.
create unique index if not exists payroll_attendance_consumptions_once
  on public.payroll_attendance_consumptions (consumer_type, session_id)
  where status = 'active';

create index if not exists payroll_attendance_consumptions_period_idx
  on public.payroll_attendance_consumptions (consumer_ref, status);
create index if not exists payroll_attendance_consumptions_location_idx
  on public.payroll_attendance_consumptions (location_id);
create index if not exists payroll_attendance_consumptions_session_idx
  on public.payroll_attendance_consumptions (session_id);
create index if not exists payroll_attendance_consumptions_org_profile_idx
  on public.payroll_attendance_consumptions (organization_id, profile_id, period_month);
create index if not exists payroll_attendance_consumptions_consumed_by_idx
  on public.payroll_attendance_consumptions (consumed_by);

-- Database-side eligibility proof on every insert (any writer, any role).
create or replace function private.payroll_consumption_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay record;
  v_tz text;
begin
  select * into v_pay from private.attendance_session_payable(new.session_id);
  if not found then
    raise exception 'The attendance session does not exist.' using errcode = '23503';
  end if;
  if v_pay.version <> new.source_version then
    raise exception 'STALE_SOURCE_VERSION: the attendance record changed after it was read (version % now, % supplied).',
      v_pay.version, new.source_version using errcode = 'P0004';
  end if;
  if v_pay.status <> 'completed' or not v_pay.break_policy_resolved or v_pay.net_payable_seconds is null then
    raise exception 'NOT_PAYABLE: only a completed session with every break classified can be consumed.' using errcode = '55000';
  end if;
  if v_pay.gross_elapsed_seconds <> new.gross_elapsed_seconds
     or v_pay.unpaid_break_seconds <> new.unpaid_break_seconds
     or v_pay.net_payable_seconds <> new.net_payable_seconds
     or v_pay.service_date <> new.service_date then
    raise exception 'The supplied payable seconds do not match the attendance record.' using errcode = '22023';
  end if;
  select l.time_zone into v_tz from public.locations l where l.id = v_pay.location_id;
  if (v_pay.clock_out_at at time zone v_tz)::date >= (new.period_month + interval '1 month')::date then
    raise exception 'PERIOD_BOUNDARY: the shift ends after the payroll month; it cannot be split automatically.' using errcode = '55000';
  end if;
  if private.payroll_period_frozen(new.consumer_ref) then
    raise exception 'PERIOD_FROZEN: a locked or paid payroll period cannot consume more attendance.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_consumption_insert_guard() from public, anon, authenticated;

drop trigger if exists payroll_consumption_insert_guard on public.payroll_attendance_consumptions;
create trigger payroll_consumption_insert_guard
  before insert on public.payroll_attendance_consumptions
  for each row execute function private.payroll_consumption_insert_guard();

-- History is permanent. The only legal change is active -> superseded of a still-draft period.
create or replace function private.payroll_consumption_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception 'payroll_attendance_consumptions is append-only and cannot be deleted or truncated' using errcode = '23514';
  end if;
  if old.status = 'superseded' then
    raise exception 'A superseded consumption row is immutable.' using errcode = '23514';
  end if;
  if new.status <> 'superseded'
     or (to_jsonb(new) - 'status' - 'superseded_at' - 'superseded_by' - 'superseded_reason')
        is distinct from
        (to_jsonb(old) - 'status' - 'superseded_at' - 'superseded_by' - 'superseded_reason') then
    raise exception 'A consumption row can only be superseded; no other field may change.' using errcode = '23514';
  end if;
  if private.payroll_period_frozen(old.consumer_ref) then
    raise exception 'PERIOD_FROZEN: consumption rows of a locked or paid payroll period cannot change.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_consumption_immutable() from public, anon, authenticated;

drop trigger if exists payroll_consumption_immutable on public.payroll_attendance_consumptions;
create trigger payroll_consumption_immutable
  before update or delete on public.payroll_attendance_consumptions
  for each row execute function private.payroll_consumption_immutable();

drop trigger if exists payroll_consumption_no_truncate on public.payroll_attendance_consumptions;
create trigger payroll_consumption_no_truncate
  before truncate on public.payroll_attendance_consumptions
  for each statement execute function private.payroll_consumption_immutable();

alter table public.payroll_attendance_consumptions enable row level security;
revoke all on table public.payroll_attendance_consumptions from public, anon, authenticated;
grant select on table public.payroll_attendance_consumptions to authenticated;
revoke all on sequence public.payroll_attendance_consumptions_id_seq from public, anon, authenticated;

drop policy if exists payroll_attendance_consumptions_select on public.payroll_attendance_consumptions;
create policy payroll_attendance_consumptions_select on public.payroll_attendance_consumptions
  for select to authenticated
  using (private.payroll_can_manage_location(organization_id, location_id));

drop policy if exists payroll_attendance_consumptions_module_enforcement on public.payroll_attendance_consumptions;
create policy payroll_attendance_consumptions_module_enforcement on public.payroll_attendance_consumptions
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'payroll'::public.location_module_key));

-- 3.1 Native periods are written ONLY by the generation RPC, and cannot be locked while any
--     of their attendance is stale, unconsumed or unresolved.
create or replace function private.payroll_native_period_state(p_period_id bigint)
returns table (
  stale_rows integer,
  unconsumed_eligible integer,
  unresolved_sessions integer,
  active_rows integer,
  ledger_seconds bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select * from public.payroll_periods where id = p_period_id and attendance_source = 'internal_the_lineup'
  ),
  act as (
    select c.* from public.payroll_attendance_consumptions c
    where c.consumer_ref = p_period_id and c.status = 'active'
  ),
  sess as (
    select s.id, pay.status, pay.break_policy_resolved, pay.version
    from p
    join public.attendance_sessions s
      on s.organization_id = p.organization_id and s.profile_id = p.profile_id
     and s.service_date >= p.period_month
     and s.service_date < (p.period_month + interval '1 month')::date
    cross join lateral private.attendance_session_payable(s.id) pay
    where s.status <> 'voided'
  )
  select
    (select count(*)::integer from act c join public.attendance_sessions s on s.id = c.session_id
       where s.version <> c.source_version or s.status = 'voided'),
    (select count(*)::integer from sess s
       where s.status = 'completed' and s.break_policy_resolved
         and not exists (select 1 from act c where c.session_id = s.id)),
    (select count(*)::integer from sess s
       where s.status in ('active', 'on_break', 'auto_clocked_out')
          or (s.status = 'completed' and not s.break_policy_resolved)),
    (select count(*)::integer from act),
    (select coalesce(sum(c.net_payable_seconds), 0)::bigint from act c);
$$;
revoke all on function private.payroll_native_period_state(bigint) from public, anon, authenticated;

-- SECURITY INVOKER on purpose: current_user must be the CALLER's role. Inside a SECURITY
-- DEFINER function it would always be the owner and the client check could never fire.
create or replace function private.payroll_periods_native_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attendance_source <> 'internal_the_lineup' then
    return new;
  end if;

  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      raise exception 'Native payroll periods are created only by payroll_generate_native_period.' using errcode = '42501';
    end if;
    if new.hours_snapshot is distinct from old.hours_snapshot
       or new.rate_cents_snapshot is distinct from old.rate_cents_snapshot
       or new.gross_cents is distinct from old.gross_cents
       or new.regenerated_at is distinct from old.regenerated_at
       or new.regenerated_by is distinct from old.regenerated_by
       or new.generated_at is distinct from old.generated_at
       or new.location_id is distinct from old.location_id then
      raise exception 'A native payroll snapshot is changed only by payroll_generate_native_period.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_periods_native_write_guard() from public, anon, authenticated;

drop trigger if exists payroll_periods_native_guard on public.payroll_periods;
drop trigger if exists payroll_periods_native_write_guard on public.payroll_periods;
create trigger payroll_periods_native_write_guard
  before insert or update on public.payroll_periods
  for each row execute function private.payroll_periods_native_write_guard();

-- Locking a native period re-proves, in the database, that nothing is stale or unresolved.
create or replace function private.payroll_periods_native_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state record;
begin
  if new.attendance_source = 'internal_the_lineup' and old.status = 'draft' and new.status = 'locked' then
    select * into v_state from private.payroll_native_period_state(new.id);
    if v_state.stale_rows > 0 or v_state.unconsumed_eligible > 0 or v_state.unresolved_sessions > 0 then
      raise exception 'PERIOD_NOT_FINAL: attendance changed or is unresolved (stale %, unconsumed %, unresolved %); regenerate the draft first.',
        v_state.stale_rows, v_state.unconsumed_eligible, v_state.unresolved_sessions using errcode = '55000';
    end if;
    if v_state.active_rows = 0
       or round(new.hours_snapshot * 3600) <> v_state.ledger_seconds then
      raise exception 'PERIOD_NOT_RECONCILED: the hours snapshot does not match the consumption ledger.' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_periods_native_lock_guard() from public, anon, authenticated;

drop trigger if exists payroll_periods_native_lock_guard on public.payroll_periods;
create trigger payroll_periods_native_lock_guard
  before update on public.payroll_periods
  for each row execute function private.payroll_periods_native_lock_guard();

-- =============================================================================
-- 4. Correction-after-confirmation: stale detection view + auditable review workflow (Q6)
-- =============================================================================
create or replace view public.payroll_attendance_consumption_staleness
with (security_invoker = true) as
select
  c.id as consumption_id,
  c.organization_id,
  c.location_id,
  c.profile_id,
  c.session_id,
  c.consumer_ref as period_id,
  c.period_month,
  c.source_version as consumed_version,
  s.version as current_version,
  c.net_payable_seconds as consumed_net_seconds,
  (s.status = 'voided') as session_voided,
  (p.status = 'locked' or exists (select 1 from public.payroll_payments pay where pay.payroll_period_id = p.id)) as period_frozen
from public.payroll_attendance_consumptions c
join public.attendance_sessions s on s.id = c.session_id
join public.payroll_periods p on p.id = c.consumer_ref
where c.status = 'active'
  and (s.version <> c.source_version or s.status = 'voided');

comment on view public.payroll_attendance_consumption_staleness is
  'V2-006 R2. Active consumption rows whose attendance record changed (or was voided) after Payroll consumed it. Read-only detection: it never changes a snapshot or creates a payment.';
revoke all on public.payroll_attendance_consumption_staleness from public, anon, authenticated;
grant select on public.payroll_attendance_consumption_staleness to authenticated;

create or replace view public.payroll_native_period_reconciliation
with (security_invoker = true) as
select
  p.id as period_id,
  p.organization_id,
  p.profile_id,
  p.period_month,
  p.status,
  p.hours_snapshot,
  coalesce(sum(c.net_payable_seconds) filter (where c.status = 'active'), 0)::bigint as ledger_seconds,
  count(c.id) filter (where c.status = 'active')::integer as active_rows,
  count(c.id) filter (where c.status = 'superseded')::integer as superseded_rows,
  (round(p.hours_snapshot * 3600) = coalesce(sum(c.net_payable_seconds) filter (where c.status = 'active'), 0)) as reconciles
from public.payroll_periods p
left join public.payroll_attendance_consumptions c on c.consumer_ref = p.id
where p.attendance_source = 'internal_the_lineup'
group by p.id;

revoke all on public.payroll_native_period_reconciliation from public, anon, authenticated;
grant select on public.payroll_native_period_reconciliation to authenticated;

create table if not exists public.payroll_attendance_consumption_reviews (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null,
  consumption_id bigint not null references public.payroll_attendance_consumptions (id) on delete restrict,
  period_id bigint not null,
  session_id uuid not null,
  consumed_version integer not null,
  observed_version integer not null,
  observed_voided boolean not null default false,
  state text not null default 'pending_review'
    check (state in ('pending_review', 'no_adjustment_needed', 'adjustment_recorded', 'superseded_by_newer_version')),
  baseline_net_seconds integer,
  observed_net_seconds integer,
  delta_net_seconds integer,
  decision_note text,
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  payroll_adjustment_id bigint references public.payroll_adjustments (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_attendance_consumption_reviews_versions check (observed_version > consumed_version),
  constraint payroll_attendance_consumption_reviews_period_fk
    foreign key (period_id, organization_id) references public.payroll_periods (id, organization_id) on delete restrict,
  constraint payroll_attendance_consumption_reviews_decision_shape check (
    (state in ('pending_review', 'superseded_by_newer_version')
       and decided_by is null and payroll_adjustment_id is null)
    or (state = 'no_adjustment_needed' and decided_by is not null and decided_at is not null
        and decision_note is not null and payroll_adjustment_id is null)
    or (state = 'adjustment_recorded' and decided_by is not null and decided_at is not null
        and decision_note is not null and payroll_adjustment_id is not null
        and delta_net_seconds is not null and delta_net_seconds <> 0)
  ),
  unique (consumption_id, observed_version)
);

comment on table public.payroll_attendance_consumption_reviews is
  'V2-006 R2 (Q6). One pending-review row per correction that reached attendance already consumed by a FROZEN payroll period. Resolving it records a decision and may LINK an adjustment created through the existing audited payroll_adjustments flow; it never pays, deducts, recalculates or rewrites a snapshot.';

create unique index if not exists payroll_attendance_consumption_reviews_one_adjustment
  on public.payroll_attendance_consumption_reviews (payroll_adjustment_id)
  where payroll_adjustment_id is not null;
create index if not exists payroll_attendance_consumption_reviews_period_idx
  on public.payroll_attendance_consumption_reviews (period_id, state);
create index if not exists payroll_attendance_consumption_reviews_location_idx
  on public.payroll_attendance_consumption_reviews (location_id, state);
create index if not exists payroll_attendance_consumption_reviews_decided_by_idx
  on public.payroll_attendance_consumption_reviews (decided_by) where decided_by is not null;

create or replace function private.payroll_review_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'payroll_attendance_consumption_reviews is append-only' using errcode = '23514';
  end if;
  if old.state <> 'pending_review' then
    raise exception 'A decided review is immutable.' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'state' - 'baseline_net_seconds' - 'observed_net_seconds' - 'delta_net_seconds'
        - 'decision_note' - 'decided_by' - 'decided_at' - 'payroll_adjustment_id')
     is distinct from
     (to_jsonb(old) - 'state' - 'baseline_net_seconds' - 'observed_net_seconds' - 'delta_net_seconds'
        - 'decision_note' - 'decided_by' - 'decided_at' - 'payroll_adjustment_id') then
    raise exception 'Only the decision fields of a pending review can change.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.payroll_review_immutable() from public, anon, authenticated;

drop trigger if exists payroll_review_immutable on public.payroll_attendance_consumption_reviews;
create trigger payroll_review_immutable
  before update or delete on public.payroll_attendance_consumption_reviews
  for each row execute function private.payroll_review_immutable();
drop trigger if exists payroll_review_no_truncate on public.payroll_attendance_consumption_reviews;
create trigger payroll_review_no_truncate
  before truncate on public.payroll_attendance_consumption_reviews
  for each statement execute function private.payroll_review_immutable();

alter table public.payroll_attendance_consumption_reviews enable row level security;
revoke all on table public.payroll_attendance_consumption_reviews from public, anon, authenticated;
grant select on table public.payroll_attendance_consumption_reviews to authenticated;
revoke all on sequence public.payroll_attendance_consumption_reviews_id_seq from public, anon, authenticated;

drop policy if exists payroll_attendance_consumption_reviews_select on public.payroll_attendance_consumption_reviews;
create policy payroll_attendance_consumption_reviews_select on public.payroll_attendance_consumption_reviews
  for select to authenticated
  using (private.payroll_can_manage_location(organization_id, location_id));

drop policy if exists payroll_attendance_consumption_reviews_module_enforcement on public.payroll_attendance_consumption_reviews;
create policy payroll_attendance_consumption_reviews_module_enforcement on public.payroll_attendance_consumption_reviews
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'payroll'::public.location_module_key));

-- 4.1 Raise a pending review for every correction that reached a FROZEN period. Idempotent.
create or replace function public.payroll_raise_consumption_reviews(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null or not private.payroll_live_session()
     or not private.payroll_is_org_manager(p_organization_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  perform private.payroll_identity_lock(p_organization_id);

  -- an older pending review for the same consumption is replaced by the newer observation
  update public.payroll_attendance_consumption_reviews r
  set state = 'superseded_by_newer_version'
  from public.payroll_attendance_consumption_staleness st
  where r.organization_id = p_organization_id
    and r.consumption_id = st.consumption_id
    and r.state = 'pending_review'
    and r.observed_version < st.current_version
    and st.period_frozen;

  with ins as (
    insert into public.payroll_attendance_consumption_reviews (
      organization_id, location_id, profile_id, consumption_id, period_id, session_id,
      consumed_version, observed_version, observed_voided
    )
    select st.organization_id, st.location_id, st.profile_id, st.consumption_id, st.period_id,
           st.session_id, st.consumed_version, st.current_version, st.session_voided
    from public.payroll_attendance_consumption_staleness st
    where st.organization_id = p_organization_id
      and st.period_frozen
    on conflict (consumption_id, observed_version) do nothing
    returning 1
  )
  select count(*)::integer into v_count from ins;
  return v_count;
end;
$$;
revoke all on function public.payroll_raise_consumption_reviews(uuid) from public, anon;
grant execute on function public.payroll_raise_consumption_reviews(uuid) to authenticated;

-- 4.2 Decide a review. Creates no money: an adjustment is recorded through the existing
--     audited payroll_adjustments flow and is only LINKED here.
create or replace function public.payroll_resolve_consumption_review(
  p_review_id bigint,
  p_decision text,
  p_note text,
  p_payroll_adjustment_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(trim(p_note), '');
  v_probe public.payroll_attendance_consumption_reviews%rowtype;
  v_r public.payroll_attendance_consumption_reviews%rowtype;
  v_c public.payroll_attendance_consumptions%rowtype;
  v_pay record;
  v_baseline integer;
  v_observed integer;
  v_delta integer;
  v_adj public.payroll_adjustments%rowtype;
begin
  if v_uid is null or not private.payroll_live_session() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_decision not in ('no_adjustment_needed', 'adjustment_recorded') then
    raise exception 'Decision must be no_adjustment_needed or adjustment_recorded' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) not between 3 and 500 then
    raise exception 'A decision note of 3 to 500 characters is required' using errcode = '22023';
  end if;

  select * into v_probe from public.payroll_attendance_consumption_reviews where id = p_review_id;
  if not found or not private.payroll_can_manage_period(v_probe.period_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  perform private.payroll_identity_lock(v_probe.organization_id);
  select * into v_r from public.payroll_attendance_consumption_reviews where id = p_review_id for update;
  if v_r.state <> 'pending_review' then
    raise exception 'This review was already decided or replaced.' using errcode = '55000';
  end if;

  select * into v_c from public.payroll_attendance_consumptions where id = v_r.consumption_id;
  select * into v_pay from private.attendance_session_payable(v_r.session_id);
  if v_pay.version <> v_r.observed_version then
    raise exception 'The attendance record changed again; reload and review the newer version.' using errcode = 'P0004';
  end if;

  -- baseline = what Payroll consumed, plus what earlier reviews of this consumption adjusted
  select v_c.net_payable_seconds + coalesce(sum(x.delta_net_seconds), 0)::integer
    into v_baseline
  from public.payroll_attendance_consumption_reviews x
  where x.consumption_id = v_c.id and x.state = 'adjustment_recorded';

  v_observed := case when v_pay.status = 'voided' then 0 else v_pay.net_payable_seconds end;
  v_delta := case when v_observed is null then null else v_observed - v_baseline end;

  if p_decision = 'adjustment_recorded' then
    if v_delta is null or v_delta = 0 then
      raise exception 'There is no resolved payable-time difference to adjust (classify the breaks first).' using errcode = '55000';
    end if;
    select * into v_adj from public.payroll_adjustments where id = p_payroll_adjustment_id;
    if not found
       or v_adj.organization_id <> v_r.organization_id
       or v_adj.payroll_period_id <> v_r.period_id
       or v_adj.created_at < v_r.created_at then
      raise exception 'The adjustment must be an adjustment of this period recorded after the review was raised.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.payroll_attendance_consumption_reviews x where x.payroll_adjustment_id = p_payroll_adjustment_id
    ) then
      raise exception 'That adjustment is already linked to another review.' using errcode = '22023';
    end if;
  elsif p_payroll_adjustment_id is not null then
    raise exception 'An adjustment can only be linked when recording an adjustment.' using errcode = '22023';
  end if;

  update public.payroll_attendance_consumption_reviews
  set state = p_decision,
      baseline_net_seconds = v_baseline,
      observed_net_seconds = v_observed,
      delta_net_seconds = v_delta,
      decision_note = v_note,
      decided_by = v_uid,
      decided_at = now(),
      payroll_adjustment_id = case when p_decision = 'adjustment_recorded' then p_payroll_adjustment_id end
  where id = v_r.id;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id,
    before_state, after_state, reason
  ) values (
    v_r.organization_id, v_r.location_id, v_uid, 'payroll_consumption_review_decided',
    'payroll_attendance_consumption_review', v_r.id::text,
    jsonb_build_object('state', 'pending_review', 'consumed_version', v_r.consumed_version,
                       'observed_version', v_r.observed_version, 'baseline_net_seconds', v_baseline),
    jsonb_build_object('state', p_decision, 'observed_net_seconds', v_observed, 'delta_net_seconds', v_delta,
                       'payroll_adjustment_id', p_payroll_adjustment_id),
    v_note
  );

  return jsonb_build_object('reviewId', v_r.id, 'state', p_decision, 'deltaNetSeconds', v_delta);
end;
$$;
revoke all on function public.payroll_resolve_consumption_review(bigint, text, text, bigint) from public, anon;
grant execute on function public.payroll_resolve_consumption_review(bigint, text, text, bigint) to authenticated;

-- =============================================================================
-- 5. Atomic generation of a native payroll period
-- =============================================================================
create or replace function public.payroll_generate_native_period(
  p_organization_id uuid,
  p_profile_id uuid,
  p_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_next date;
  v_open integer;
  v_auto integer;
  v_unresolved integer;
  v_boundary integer;
  v_module integer;
  v_eligible integer;
  v_total_seconds bigint;
  v_rate integer;
  v_override integer;
  v_default integer;
  v_linked_neon integer;
  v_hours numeric;
  v_gross integer;
  v_period public.payroll_periods%rowtype;
  v_same_ledger boolean;
  v_inserted integer;
  v_ledger_seconds bigint;
  v_outcome text;
begin
  if v_uid is null or not private.payroll_live_session()
     or not private.payroll_is_org_manager(p_organization_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if not private.attendance_financial_activated() then
    raise exception 'NOT_ACTIVATED: native attendance financial processing has not been activated.' using errcode = '55000';
  end if;
  if p_period_month is null or p_period_month <> date_trunc('month', p_period_month)::date then
    raise exception 'The payroll month must be the first day of a month.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m where m.organization_id = p_organization_id and m.profile_id = p_profile_id
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  v_next := (p_period_month + interval '1 month')::date;

  -- Serialise: identity first, then this employee's clock/correction operations.
  perform private.payroll_identity_lock(p_organization_id);
  perform pg_advisory_xact_lock(
    hashtextextended('attendance:' || p_organization_id::text || ':' || p_profile_id::text, 0)
  );
  perform 1 from public.attendance_sessions s
  where s.organization_id = p_organization_id and s.profile_id = p_profile_id
    and s.service_date >= p_period_month and s.service_date < v_next
  for update;

  select * into v_period from public.payroll_periods
  where organization_id = p_organization_id and profile_id = p_profile_id and period_month = p_period_month
  for update;
  if found and private.payroll_period_frozen(v_period.id) then
    raise exception 'PERIOD_FROZEN: this payroll period is locked or paid. Corrections go through the adjustment review.' using errcode = '55000';
  end if;

  select
    count(*) filter (where pay.status in ('active', 'on_break')),
    count(*) filter (where pay.status = 'auto_clocked_out'),
    count(*) filter (where pay.status = 'completed' and not pay.break_policy_resolved),
    count(*) filter (where pay.status = 'completed'
                       and (pay.clock_out_at at time zone l.time_zone)::date >= v_next),
    count(*) filter (where pay.status = 'completed'
                       and not private.location_module_allows(s.location_id, 'attendance'::public.location_module_key)),
    count(*) filter (where pay.status = 'completed' and pay.break_policy_resolved)
  into v_open, v_auto, v_unresolved, v_boundary, v_module, v_eligible
  from public.attendance_sessions s
  join public.locations l on l.id = s.location_id
  cross join lateral private.attendance_session_payable(s.id) pay
  where s.organization_id = p_organization_id and s.profile_id = p_profile_id
    and s.service_date >= p_period_month and s.service_date < v_next
    and s.status <> 'voided';

  if v_open + v_auto + v_unresolved + v_boundary + v_module > 0 then
    raise exception 'ATTENDANCE_NOT_PAYABLE: open %, auto clock-out %, unclassified or open breaks %, crosses month end %, module disabled %.',
      v_open, v_auto, v_unresolved, v_boundary, v_module using errcode = '55000';
  end if;
  if v_eligible = 0 then
    raise exception 'NO_ATTENDANCE_HOURS: there is no payable native attendance for that month.' using errcode = '55000';
  end if;

  select coalesce(sum(pay.net_payable_seconds), 0)::bigint into v_total_seconds
  from public.attendance_sessions s
  cross join lateral private.attendance_session_payable(s.id) pay
  where s.organization_id = p_organization_id and s.profile_id = p_profile_id
    and s.service_date >= p_period_month and s.service_date < v_next
    and pay.status = 'completed' and pay.break_policy_resolved;

  -- Rate: the employee's own override, else the override held under the linked Neon identity
  -- (a dual-identity employee keeps one rate), else the organization default. Never $0 by silence.
  select r.rate_cents into v_override from public.payroll_rates r
  where r.organization_id = p_organization_id and r.profile_id = p_profile_id;
  if v_override is null then
    v_linked_neon := private.payroll_linked_neon_user(p_organization_id, p_profile_id);
    if v_linked_neon is not null then
      select r.rate_cents into v_override from public.payroll_rates r
      where r.organization_id = p_organization_id and r.neon_user_id = v_linked_neon;
    end if;
  end if;
  select ps.default_rate_cents into v_default from public.payroll_settings ps where ps.organization_id = p_organization_id;
  v_rate := coalesce(v_override, v_default);
  if v_rate is null then
    raise exception 'NO_RATE_CONFIGURED: no pay rate is configured for this employee and there is no organization default.' using errcode = '55000';
  end if;

  -- The existing payroll rule: one rounding to whole cents, computed once at generation.
  v_hours := v_total_seconds::numeric / 3600;
  v_gross := round(v_total_seconds::numeric * v_rate / 3600)::integer;

  if v_period.id is not null then
    select (
      (select count(*) from public.payroll_attendance_consumptions c where c.consumer_ref = v_period.id and c.status = 'active') = v_eligible
      and not exists (
        select 1
        from public.attendance_sessions s
        cross join lateral private.attendance_session_payable(s.id) pay
        where s.organization_id = p_organization_id and s.profile_id = p_profile_id
          and s.service_date >= p_period_month and s.service_date < v_next
          and pay.status = 'completed' and pay.break_policy_resolved
          and not exists (
            select 1 from public.payroll_attendance_consumptions c
            where c.consumer_ref = v_period.id and c.status = 'active'
              and c.session_id = s.id and c.source_version = pay.version
          )
      )
    ) into v_same_ledger;

    if v_same_ledger
       and v_period.hours_snapshot = v_hours
       and v_period.rate_cents_snapshot = v_rate
       and v_period.gross_cents = v_gross then
      return jsonb_build_object('periodId', v_period.id, 'outcome', 'unchanged', 'hours', v_hours,
                                'rateCents', v_rate, 'grossCents', v_gross, 'sessions', v_eligible);
    end if;

    if not v_same_ledger then
      update public.payroll_attendance_consumptions
      set status = 'superseded', superseded_at = now(), superseded_by = v_uid,
          superseded_reason = 'Draft regenerated from corrected or newly eligible attendance'
      where consumer_ref = v_period.id and status = 'active';
    end if;

    update public.payroll_periods
    set hours_snapshot = v_hours, rate_cents_snapshot = v_rate, gross_cents = v_gross,
        regenerated_at = now(), regenerated_by = v_uid
    where id = v_period.id;
    v_outcome := 'regenerated';
  else
    insert into public.payroll_periods (
      organization_id, attendance_source, profile_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by, location_id
    ) values (
      p_organization_id, 'internal_the_lineup', p_profile_id, null, p_period_month,
      v_hours, v_rate, v_gross, 'draft', v_uid, null
    ) returning * into v_period;
    v_same_ledger := false;
    v_outcome := 'created';
  end if;

  if not v_same_ledger then
    insert into public.payroll_attendance_consumptions (
      organization_id, location_id, profile_id, session_id, consumer_type, consumer_ref, period_month,
      service_date, source_version, gross_elapsed_seconds, unpaid_break_seconds, net_payable_seconds, consumed_by
    )
    select s.organization_id, s.location_id, s.profile_id, s.id, 'payroll_period', v_period.id, p_period_month,
           pay.service_date, pay.version, pay.gross_elapsed_seconds, pay.unpaid_break_seconds,
           pay.net_payable_seconds, v_uid
    from public.attendance_sessions s
    cross join lateral private.attendance_session_payable(s.id) pay
    where s.organization_id = p_organization_id and s.profile_id = p_profile_id
      and s.service_date >= p_period_month and s.service_date < v_next
      and pay.status = 'completed' and pay.break_policy_resolved;
    get diagnostics v_inserted = row_count;
    if v_inserted <> v_eligible then
      raise exception 'Ledger row count does not match the eligible sessions.' using errcode = 'XX000';
    end if;
  end if;

  select coalesce(sum(c.net_payable_seconds), 0)::bigint into v_ledger_seconds
  from public.payroll_attendance_consumptions c
  where c.consumer_ref = v_period.id and c.status = 'active';
  if v_ledger_seconds <> v_total_seconds then
    raise exception 'RECONCILIATION_FAILED: ledger seconds % differ from the snapshot %.', v_ledger_seconds, v_total_seconds using errcode = 'XX000';
  end if;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id, after_state
  ) values (
    p_organization_id, null, v_uid, 'payroll_period_' || v_outcome || '_native', 'payroll_period', v_period.id::text,
    jsonb_build_object('profile_id', p_profile_id, 'period_month', p_period_month,
                       'hours_snapshot', v_hours, 'rate_cents_snapshot', v_rate, 'gross_cents', v_gross,
                       'sessions', v_eligible, 'ledger_seconds', v_ledger_seconds)
  );

  return jsonb_build_object('periodId', v_period.id, 'outcome', v_outcome, 'hours', v_hours,
                            'rateCents', v_rate, 'grossCents', v_gross, 'sessions', v_eligible);
end;
$$;
revoke all on function public.payroll_generate_native_period(uuid, uuid, date) from public, anon;
grant execute on function public.payroll_generate_native_period(uuid, uuid, date) to authenticated;

-- =============================================================================
-- 6. Attendance-source transition safety (Q9b)
-- =============================================================================
create or replace function private.payroll_source_transition_blockers(
  p_location_id uuid,
  p_target public.attendance_mode
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc public.locations%rowtype;
  v_today date;
  v_month_start date;
  v_open integer;
  v_unresolved integer;
  v_pending integer;
  v_current_month integer;
  v_reviews integer;
  v_ambiguous integer;
  v_tips integer;
  v_blockers text[] := '{}';
begin
  select * into v_loc from public.locations where id = p_location_id;
  v_today := (now() at time zone v_loc.time_zone)::date;
  v_month_start := date_trunc('month', v_today)::date;

  select count(*) into v_open from public.attendance_sessions s
  where s.location_id = p_location_id and s.status in ('active', 'on_break');

  select count(*) into v_unresolved
  from public.attendance_sessions s
  cross join lateral private.attendance_session_payable(s.id) pay
  where s.location_id = p_location_id and s.status in ('completed', 'auto_clocked_out')
    and (s.status = 'auto_clocked_out' or not pay.break_policy_resolved);

  select count(*) into v_pending
  from public.attendance_sessions s
  cross join lateral private.attendance_session_payable(s.id) pay
  where s.location_id = p_location_id and s.status = 'completed' and pay.break_policy_resolved
    and s.service_date < v_month_start
    and not exists (
      select 1 from public.payroll_attendance_consumptions c where c.session_id = s.id and c.status = 'active'
    );

  select count(*) into v_current_month from public.attendance_sessions s
  where s.location_id = p_location_id and s.status <> 'voided' and s.service_date >= v_month_start;

  select count(*) into v_reviews
  from public.payroll_attendance_consumption_staleness st
  where st.location_id = p_location_id and st.period_frozen
    and not exists (
      select 1 from public.payroll_attendance_consumption_reviews r
      where r.consumption_id = st.consumption_id and r.observed_version = st.current_version
        and r.state in ('no_adjustment_needed', 'adjustment_recorded')
    );

  -- A person with BOTH identities whose native month is unconsumed while the linked Neon
  -- identity already holds a period for the same month: the source cannot be switched safely.
  select count(*) into v_ambiguous
  from (
    select distinct s.profile_id, date_trunc('month', s.service_date)::date as m
    from public.attendance_sessions s
    where s.location_id = p_location_id and s.status <> 'voided' and s.service_date < v_month_start
  ) x
  join public.attendance_identity_links l on l.organization_id = v_loc.organization_id and l.profile_id = x.profile_id
  join public.payroll_periods p
    on p.organization_id = v_loc.organization_id and p.neon_user_id = l.neon_user_id and p.period_month = x.m
  where not exists (
    select 1 from public.payroll_attendance_consumptions c
    where c.organization_id = v_loc.organization_id and c.profile_id = x.profile_id
      and c.period_month = x.m and c.status = 'active'
  );

  select count(*) into v_tips from public.tip_pools tp
  where tp.location_id = p_location_id and tp.status::text <> 'finalized';

  if extract(day from v_today) <> 1 then v_blockers := array_append(v_blockers, 'not_period_boundary'); end if;
  if v_open > 0 then v_blockers := array_append(v_blockers, 'open_sessions'); end if;
  if v_unresolved > 0 then v_blockers := array_append(v_blockers, 'unresolved_breaks'); end if;
  if v_pending > 0 then v_blockers := array_append(v_blockers, 'pending_consumption'); end if;
  if v_current_month > 0 then v_blockers := array_append(v_blockers, 'current_month_activity'); end if;
  if v_reviews > 0 then v_blockers := array_append(v_blockers, 'unresolved_adjustment_reviews'); end if;
  if v_ambiguous > 0 then v_blockers := array_append(v_blockers, 'ambiguous_identity'); end if;

  return jsonb_build_object(
    'blocked', cardinality(v_blockers) > 0,
    'blockers', to_jsonb(v_blockers),
    'location_local_date', v_today,
    'time_zone', v_loc.time_zone,
    'effective_period_month', v_month_start,
    'counts', jsonb_build_object(
      'open_sessions', v_open, 'unresolved_breaks', v_unresolved, 'pending_consumption', v_pending,
      'current_month_activity', v_current_month, 'unresolved_adjustment_reviews', v_reviews,
      'ambiguous_identity', v_ambiguous),
    'warnings', jsonb_build_object('tip_pools_not_finalized', v_tips)
  );
end;
$$;
revoke all on function private.payroll_source_transition_blockers(uuid, public.attendance_mode) from public, anon, authenticated;

create or replace function public.payroll_source_transition_readiness(
  p_location_id uuid,
  p_target_mode public.attendance_mode
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc public.locations%rowtype;
begin
  select * into v_loc from public.locations where id = p_location_id;
  if not found or not private.can_manage_location_lifecycle(v_loc.organization_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  return private.payroll_source_transition_blockers(p_location_id, p_target_mode)
    || jsonb_build_object('enforced', private.attendance_financial_activated()
         or exists (select 1 from public.payroll_attendance_consumptions c where c.location_id = p_location_id));
end;
$$;
revoke all on function public.payroll_source_transition_readiness(uuid, public.attendance_mode) from public, anon;
grant execute on function public.payroll_source_transition_readiness(uuid, public.attendance_mode) to authenticated;

-- Replaces the Batch A function (same signature). New: a payroll-boundary gate for any change
-- that crosses the native/external source line, enforced once native financial processing is
-- active or once any attendance of this location has been consumed by Payroll.
create or replace function public.set_location_attendance_mode(
  p_location_id uuid,
  p_mode public.attendance_mode,
  p_expected_updated_at timestamptz default null,
  p_reason text default null
)
returns public.locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc public.locations%rowtype;
  v_old_mode public.attendance_mode;
  v_actor_profile_id uuid;
  v_reason text;
  v_gate jsonb;
begin
  v_actor_profile_id := (select auth.uid());
  if v_actor_profile_id is null or not private.attendance_live_session() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  if not found or not private.can_manage_location_lifecycle(v_loc.organization_id) then
    raise exception 'Unauthorized to manage location attendance mode' using errcode = '42501';
  end if;

  v_reason := nullif(trim(p_reason), '');
  if v_reason is not null and length(v_reason) not between 3 and 500 then
    raise exception 'Reason must be between 3 and 500 characters' using errcode = '22023';
  end if;

  select * into v_loc
  from public.locations
  where id = p_location_id
  for update;

  if v_loc.archived_at is not null or not v_loc.active then
    raise exception 'Cannot configure attendance mode on archived or inactive location' using errcode = '55000';
  end if;

  if p_expected_updated_at is not null and v_loc.updated_at <> p_expected_updated_at then
    raise exception 'Location was modified by another operation' using errcode = 'P0004';
  end if;

  v_old_mode := v_loc.attendance_mode;

  if v_old_mode = 'internal_the_lineup' and p_mode is distinct from v_old_mode and exists (
    select 1 from public.attendance_sessions s
    where s.location_id = p_location_id
      and s.status in ('active', 'on_break')
  ) then
    raise exception 'Close all open attendance sessions before leaving internal attendance mode' using errcode = '55000';
  end if;

  if p_mode is distinct from v_old_mode
     and (p_mode = 'internal_the_lineup' or v_old_mode = 'internal_the_lineup')
     and (
       private.attendance_financial_activated()
       or exists (select 1 from public.payroll_attendance_consumptions c where c.location_id = p_location_id)
     ) then
    if v_reason is null then
      raise exception 'A reason is required to change the attendance source of a location.' using errcode = '22023';
    end if;
    v_gate := private.payroll_source_transition_blockers(p_location_id, p_mode);
    if (v_gate ->> 'blocked')::boolean then
      raise exception 'SOURCE_TRANSITION_BLOCKED: %', v_gate -> 'blockers'
        using errcode = '55000', detail = v_gate::text;
    end if;
  end if;

  update public.locations
  set attendance_mode = p_mode,
      updated_at = now()
  where id = p_location_id
  returning * into v_loc;

  insert into public.audit_events (
    organization_id, location_id, actor_profile_id, action, entity_type, entity_id,
    before_state, after_state, reason
  ) values (
    v_loc.organization_id,
    v_loc.id,
    v_actor_profile_id,
    'location_attendance_mode_updated',
    'location',
    v_loc.id::text,
    jsonb_build_object('attendance_mode', v_old_mode),
    jsonb_build_object('attendance_mode', p_mode)
      || case when v_gate is null then '{}'::jsonb else jsonb_build_object('source_transition', v_gate) end,
    v_reason
  );

  return v_loc;
end;
$$;

revoke all on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) from public, anon;
grant execute on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) to authenticated;

commit;
