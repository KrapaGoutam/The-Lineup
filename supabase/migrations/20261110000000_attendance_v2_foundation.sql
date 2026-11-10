-- Migration: 20261110000000_attendance_v2_foundation.sql
-- Feature V2-006: Attendance V2 - Batch A Foundation
-- Subfeatures:
--   V2-006.001: Per-Location Attendance Mode Configuration
--   V2-006.002: Native Internal Attendance Data Model
--   V2-006.003: Clock Integrity Rules
--
-- Revision note (independent Batch A review, 2026-11-09): this migration was only ever
-- applied to a disposable local database (never pushed, never applied to hosted DEV or
-- Production), so it was corrected in place instead of stacking a repair migration.
--
-- Invariants:
--   * Additive, forward-only schema.
--   * No silent backfill or default attendance_mode assigned to existing locations
--     (NULL = unconfigured, fails closed for native clocking).
--   * Composite tenant FKs enforce tenant isolation (session <-> breaks/events included).
--   * attendance_events is append-only: UPDATE, DELETE and TRUNCATE are all refused.
--   * Authenticated clients can only SELECT. Every mutation goes through RPCs.
--   * Break pay classification is policy-neutral: a break is 'unclassified' until a
--     manager explicitly records paid/unpaid. Net payable time is never derived from
--     an unclassified break.

-- -----------------------------------------------------------------------------
-- 1. Attendance Mode Configuration (V2-006.001)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_mode'
  ) then
    create type public.attendance_mode as enum (
      'external',
      'internal_the_lineup',
      'disabled'
    );
  end if;
end
$$;

grant usage on type public.attendance_mode to authenticated;

alter table public.locations
  add column if not exists attendance_mode public.attendance_mode;

comment on column public.locations.attendance_mode is
  'V2-006.001. Per-location attendance mode (external, internal_the_lineup, disabled). NULL means unconfigured / missing (fails closed for internal clocking; preserves legacy Neon reads where allowed).';

-- -----------------------------------------------------------------------------
-- 2. Authority helpers (aligned with the shipped V2 payroll authority contract)
-- -----------------------------------------------------------------------------

-- Live-session gate (same contract as private.payroll_live_session / schedule_live_session):
-- a banned user, or a JWT whose Supabase session was revoked/expired, loses attendance
-- authority immediately instead of when the access token expires.
create or replace function private.attendance_live_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and (u.banned_until is null or u.banned_until <= now())
      and (
        (select auth.jwt()) ->> 'session_id' is null
        or exists (
          select 1
          from auth.sessions s
          where s.user_id = u.id
            and s.id::text = (select auth.jwt()) ->> 'session_id'
            and (s.not_after is null or s.not_after > now())
        )
      )
  );
$$;
revoke all on function private.attendance_live_session() from public, anon, authenticated;

-- Effective tier: MAX(overall tier, organization/location tier). Organization and
-- location tiers require an ACTIVE tenant membership. Mirrors private.payroll_profile_level
-- (the newest shipped variant). Not granted to clients: it accepts an arbitrary profile id.
create or replace function private.attendance_profile_level(
  p_org uuid,
  p_location uuid,
  p_profile uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce(
      (select case r.role
         when 'owner' then 4
         when 'manager' then 3
         when 'assistant_manager' then 2
         else 0 end
       from public.overall_roles r
       where r.profile_id = p_profile),
      0
    ),
    case when exists (
      select 1 from public.memberships m
      where m.organization_id = p_org
        and m.profile_id = p_profile
        and m.active
    ) then
      greatest(
        coalesce(
          (select case lm.role
             when 'manager' then 3
             when 'assistant_manager' then 2
             else 1 end
           from public.location_memberships lm
           where lm.location_id = p_location
             and lm.profile_id = p_profile
             and lm.active),
          0
        ),
        coalesce(
          (select case
             when 'owner' = any(m.roles) then 4
             when 'general_manager' = any(m.roles) then 3
             when 'shift_manager' = any(m.roles) and (
               p_location is null or
               (select count(*) from public.locations x
                where x.organization_id = p_org and x.active and x.archived_at is null) <= 1
             ) then 2
             else 1 end
           from public.memberships m
           where m.organization_id = p_org
             and m.profile_id = p_profile
             and m.active),
          0
        )
      )
    else 0 end
  );
$$;
revoke all on function private.attendance_profile_level(uuid, uuid, uuid) from public, anon, authenticated;

-- Active, live caller membership in an organization.
create or replace function private.attendance_is_active_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.attendance_live_session()
    and exists (
      select 1 from public.memberships m
      where m.organization_id = p_org
        and m.profile_id = (select auth.uid())
        and m.active
    );
$$;
revoke all on function private.attendance_is_active_member(uuid) from public, anon;
grant execute on function private.attendance_is_active_member(uuid) to authenticated;

-- Management authority at a location:
--   * Overall Owner / Overall Manager (system-wide), OR
--   * ACTIVE Organization Owner / General Manager of the location's owning organization, OR
--   * effective tier >= 2 (location manager / assistant manager with an ACTIVE org
--     membership, Overall Assistant Manager, single-location Shift Manager) at a LIVE,
--     non-archived location.
-- Revoked (inactive) memberships, banned users and revoked sessions are all denied.
create or replace function private.attendance_can_manage_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and (select auth.uid()) is not null
      and private.attendance_live_session()
      and (
        exists (
          select 1 from public.overall_roles r
          where r.profile_id = (select auth.uid())
            and r.role in ('owner', 'manager')
        )
        or exists (
          select 1 from public.memberships m
          where m.organization_id = l.organization_id
            and m.profile_id = (select auth.uid())
            and m.active
            and m.roles && array['owner', 'general_manager']::public.app_role[]
        )
        or (
          l.active
          and l.archived_at is null
          and private.attendance_profile_level(l.organization_id, l.id, (select auth.uid())) >= 2
        )
      )
  );
$$;

revoke all on function private.attendance_can_manage_location(uuid) from public, anon;
grant execute on function private.attendance_can_manage_location(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Native Internal Attendance Data Model (V2-006.002)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_session_status'
  ) then
    create type public.attendance_session_status as enum (
      'active',
      'on_break',
      'completed',
      'auto_clocked_out',
      'voided'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_event_type'
  ) then
    create type public.attendance_event_type as enum (
      'clock_in',
      'clock_out',
      'break_start',
      'break_end',
      'manager_edit',
      'void'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_event_source'
  ) then
    create type public.attendance_event_source as enum (
      'web',
      'kiosk',
      'manager',
      'system'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_break_pay_classification'
  ) then
    -- Policy-neutral: 'unclassified' is the ONLY state a break has until a manager
    -- explicitly records the owner's paid/unpaid decision for that break.
    create type public.attendance_break_pay_classification as enum (
      'unclassified',
      'paid',
      'unpaid'
    );
  end if;
end
$$;

grant usage on type public.attendance_session_status to authenticated;
grant usage on type public.attendance_event_type to authenticated;
grant usage on type public.attendance_event_source to authenticated;
grant usage on type public.attendance_break_pay_classification to authenticated;

-- Attendance Sessions
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  location_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  service_date date not null,
  status public.attendance_session_status not null default 'active',
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  -- Facts only. Both are policy-neutral: gross elapsed time between the two absolute
  -- instants, and the sum of ALL closed break durations regardless of pay class.
  -- Anything that depends on break pay policy is derived in attendance_session_summaries.
  gross_elapsed_seconds integer check (gross_elapsed_seconds is null or gross_elapsed_seconds >= 0),
  total_break_seconds integer not null default 0 check (total_break_seconds >= 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_location_tenant_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete restrict,
  constraint attendance_sessions_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id) on delete restrict,
  constraint attendance_sessions_child_key
    unique (id, organization_id, location_id, profile_id),
  constraint attendance_sessions_valid_clock_times
    check (clock_out_at is null or clock_out_at >= clock_in_at),
  constraint attendance_sessions_closed_has_clock_out
    check (
      status not in ('completed', 'auto_clocked_out')
      or (clock_out_at is not null and gross_elapsed_seconds is not null)
    ),
  constraint attendance_sessions_break_within_gross
    check (gross_elapsed_seconds is null or total_break_seconds <= gross_elapsed_seconds)
);

comment on table public.attendance_sessions is
  'V2-006.002. Internal attendance sessions tracking active and completed work shifts. Stores policy-neutral facts only (gross elapsed, total break); payable time is derived in attendance_session_summaries.';

-- At most ONE open (active or on_break) session per employee across the organization.
create unique index if not exists attendance_sessions_one_open_per_employee
  on public.attendance_sessions (organization_id, profile_id)
  where status in ('active', 'on_break');

create index if not exists attendance_sessions_location_service_date_idx
  on public.attendance_sessions (location_id, service_date desc);

create index if not exists attendance_sessions_profile_service_date_idx
  on public.attendance_sessions (profile_id, service_date desc);

create index if not exists attendance_sessions_org_status_idx
  on public.attendance_sessions (organization_id, status);

-- Attendance Breaks
create table if not exists public.attendance_breaks (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- Break pay classification. Stored per break (with who/when) so a historical break
  -- stays interpretable after the owner's policy changes: policy never reclassifies
  -- old rows implicitly.
  pay_classification public.attendance_break_pay_classification not null default 'unclassified',
  classified_by uuid references public.profiles (id) on delete restrict,
  classified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_breaks_session_tenant_fk
    foreign key (session_id, organization_id, location_id, profile_id)
    references public.attendance_sessions (id, organization_id, location_id, profile_id)
    on delete restrict,
  constraint attendance_breaks_valid_interval
    check (end_time is null or end_time >= start_time),
  constraint attendance_breaks_duration_matches_close
    check ((end_time is null) = (duration_seconds is null)),
  constraint attendance_breaks_classification_attribution
    check (
      (pay_classification = 'unclassified' and classified_by is null and classified_at is null)
      or (pay_classification <> 'unclassified' and classified_by is not null and classified_at is not null)
    )
);

comment on table public.attendance_breaks is
  'V2-006.002. Break periods within an internal attendance session. pay_classification records the explicit paid/unpaid decision; unclassified is never treated as unpaid.';

create unique index if not exists attendance_breaks_one_active_per_session
  on public.attendance_breaks (session_id)
  where end_time is null;

create index if not exists attendance_breaks_session_idx
  on public.attendance_breaks (session_id, start_time asc);

create index if not exists attendance_breaks_location_idx
  on public.attendance_breaks (location_id);

-- Attendance Events (Append-Only Audit Stream)
create table if not exists public.attendance_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  profile_id uuid not null,
  event_type public.attendance_event_type not null,
  event_time timestamptz not null default now(),
  service_date date not null,
  source public.attendance_event_source not null default 'web',
  idempotency_key text
    check (idempotency_key is null or length(idempotency_key) between 1 and 128),
  -- Direct profile FK (not a membership FK): an Overall Owner/Manager acting across
  -- organizations has no membership row, and deleting an account must never cascade
  -- into the ledger. Authority is proven by the RPC at write time.
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  is_manager_correction boolean not null default false,
  reverses_event_id bigint references public.attendance_events (id) on delete restrict,
  correction_reason text
    check (not is_manager_correction or (correction_reason is not null and length(trim(correction_reason)) > 0)),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint attendance_events_session_tenant_fk
    foreign key (session_id, organization_id, location_id, profile_id)
    references public.attendance_sessions (id, organization_id, location_id, profile_id)
    on delete restrict
);

comment on table public.attendance_events is
  'V2-006.002. Immutable append-only log of clock in, clock out, break, and correction events. UPDATE, DELETE and TRUNCATE are refused by trigger.';

-- Idempotency keys are scoped to (organization, ACTOR): one user can never replay,
-- collide with, or read the result of another user's operation.
create unique index if not exists attendance_events_idempotency_idx
  on public.attendance_events (organization_id, actor_profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists attendance_events_session_idx
  on public.attendance_events (session_id, event_time asc);

create index if not exists attendance_events_loc_service_date_idx
  on public.attendance_events (location_id, service_date desc);

create index if not exists attendance_events_profile_time_idx
  on public.attendance_events (profile_id, event_time desc);

create index if not exists attendance_events_actor_idx
  on public.attendance_events (actor_profile_id);

-- Immutability enforcement on attendance_events (row UPDATE/DELETE and statement TRUNCATE).
create or replace function private.attendance_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'attendance_events is immutable and cannot be updated, deleted or truncated' using errcode = '23514';
end;
$$;

revoke all on function private.attendance_events_immutable() from public, anon, authenticated;

drop trigger if exists attendance_events_immutable_trigger on public.attendance_events;
create trigger attendance_events_immutable_trigger
  before update or delete on public.attendance_events
  for each row execute function private.attendance_events_immutable();

drop trigger if exists attendance_events_no_truncate_trigger on public.attendance_events;
create trigger attendance_events_no_truncate_trigger
  before truncate on public.attendance_events
  for each statement execute function private.attendance_events_immutable();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security & Grants (V2-006.002)
-- -----------------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.attendance_breaks enable row level security;
alter table public.attendance_events enable row level security;

-- Clients are read-only. Revoke from `authenticated` explicitly: Supabase default
-- privileges grant it INSERT/UPDATE/DELETE/TRUNCATE on new public tables, and TRUNCATE
-- bypasses both RLS and row-level triggers.
revoke all on table public.attendance_sessions from public, anon, authenticated;
grant select on table public.attendance_sessions to authenticated;

revoke all on table public.attendance_breaks from public, anon, authenticated;
grant select on table public.attendance_breaks to authenticated;

revoke all on table public.attendance_events from public, anon, authenticated;
grant select on table public.attendance_events to authenticated;

revoke all on sequence public.attendance_breaks_id_seq from public, anon, authenticated;
revoke all on sequence public.attendance_events_id_seq from public, anon, authenticated;

-- SELECT: an ACTIVE member reads their own rows; managers read their location.
drop policy if exists "attendance_sessions_select" on public.attendance_sessions;
create policy "attendance_sessions_select" on public.attendance_sessions
  for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.attendance_is_active_member(organization_id))
    or private.attendance_can_manage_location(location_id)
  );

drop policy if exists "attendance_breaks_select" on public.attendance_breaks;
create policy "attendance_breaks_select" on public.attendance_breaks
  for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.attendance_is_active_member(organization_id))
    or private.attendance_can_manage_location(location_id)
  );

drop policy if exists "attendance_events_select" on public.attendance_events;
create policy "attendance_events_select" on public.attendance_events
  for select to authenticated
  using (
    (profile_id = (select auth.uid()) and private.attendance_is_active_member(organization_id))
    or private.attendance_can_manage_location(location_id)
  );

-- Module enforcement (V2-004.004 pattern): a restrictive policy can only REMOVE access.
drop policy if exists attendance_sessions_module_enforcement on public.attendance_sessions;
create policy attendance_sessions_module_enforcement on public.attendance_sessions
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'attendance'));

drop policy if exists attendance_breaks_module_enforcement on public.attendance_breaks;
create policy attendance_breaks_module_enforcement on public.attendance_breaks
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'attendance'));

drop policy if exists attendance_events_module_enforcement on public.attendance_events;
create policy attendance_events_module_enforcement on public.attendance_events
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'attendance'));

-- -----------------------------------------------------------------------------
-- 5. Policy-neutral session summaries (derived, never stored)
--    net_payable_seconds is NULL unless the session is closed, has no open break and
--    EVERY break is explicitly classified. An unknown break is never counted as unpaid.
--    security_invoker: the caller's RLS on the base tables applies.
-- -----------------------------------------------------------------------------
create or replace view public.attendance_session_summaries
with (security_invoker = true) as
select
  s.id as session_id,
  s.organization_id,
  s.location_id,
  s.profile_id,
  s.service_date,
  s.status,
  s.clock_in_at,
  s.clock_out_at,
  s.gross_elapsed_seconds,
  s.total_break_seconds,
  coalesce(b.paid_seconds, 0)::integer as paid_break_seconds,
  coalesce(b.unpaid_seconds, 0)::integer as unpaid_break_seconds,
  coalesce(b.unclassified_seconds, 0)::integer as unclassified_break_seconds,
  coalesce(b.open_breaks, 0)::integer as open_break_count,
  coalesce(b.break_count, 0)::integer as break_count,
  (s.status in ('completed', 'auto_clocked_out')) as is_closed,
  (
    s.status in ('completed', 'auto_clocked_out')
    and coalesce(b.open_breaks, 0) = 0
    and coalesce(b.unclassified_count, 0) = 0
  ) as break_policy_resolved,
  case
    when s.status in ('completed', 'auto_clocked_out')
      and coalesce(b.open_breaks, 0) = 0
      and coalesce(b.unclassified_count, 0) = 0
    then s.gross_elapsed_seconds - coalesce(b.unpaid_seconds, 0)::integer
  end as net_payable_seconds
from public.attendance_sessions s
left join lateral (
  select
    sum(br.duration_seconds) filter (where br.pay_classification = 'paid') as paid_seconds,
    sum(br.duration_seconds) filter (where br.pay_classification = 'unpaid') as unpaid_seconds,
    sum(br.duration_seconds) filter (where br.pay_classification = 'unclassified') as unclassified_seconds,
    count(*) filter (where br.end_time is null) as open_breaks,
    count(*) filter (where br.pay_classification = 'unclassified') as unclassified_count,
    count(*) as break_count
  from public.attendance_breaks br
  where br.session_id = s.id
) b on true;

comment on view public.attendance_session_summaries is
  'V2-006. Derived per-session facts. net_payable_seconds is NULL while any break is open or unclassified (no assumed break-pay policy).';

revoke all on public.attendance_session_summaries from public, anon, authenticated;
grant select on public.attendance_session_summaries to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Auditable Mutation for Attendance Mode
-- -----------------------------------------------------------------------------
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
begin
  v_actor_profile_id := (select auth.uid());
  if v_actor_profile_id is null or not private.attendance_live_session() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Authority is proven BEFORE existence is revealed: an unknown location and a
  -- location the caller cannot manage are indistinguishable.
  select * into v_loc from public.locations where id = p_location_id;
  if not found or not private.can_manage_location_lifecycle(v_loc.organization_id) then
    raise exception 'Unauthorized to manage location attendance mode' using errcode = '42501';
  end if;

  v_reason := nullif(trim(p_reason), '');
  if v_reason is not null and length(v_reason) not between 3 and 500 then
    raise exception 'Reason must be between 3 and 500 characters' using errcode = '22023';
  end if;

  -- Serialise with clock operations (they hold FOR SHARE on this row).
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

  -- Leaving internal mode with employees still on the clock would strand their open
  -- sessions (native clock-out is refused outside internal mode). Close them first.
  if v_old_mode = 'internal_the_lineup' and p_mode is distinct from v_old_mode and exists (
    select 1 from public.attendance_sessions s
    where s.location_id = p_location_id
      and s.status in ('active', 'on_break')
  ) then
    raise exception 'Close all open attendance sessions before leaving internal attendance mode' using errcode = '55000';
  end if;

  update public.locations
  set attendance_mode = p_mode,
      updated_at = now()
  where id = p_location_id
  returning * into v_loc;

  insert into public.audit_events (
    organization_id,
    location_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    reason
  ) values (
    v_loc.organization_id,
    v_loc.id,
    v_actor_profile_id,
    'location_attendance_mode_updated',
    'location',
    v_loc.id::text,
    jsonb_build_object('attendance_mode', v_old_mode),
    jsonb_build_object('attendance_mode', p_mode),
    v_reason
  );

  return v_loc;
end;
$$;

revoke all on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) from public, anon;
grant execute on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Clock Integrity Rules & Atomic RPCs (V2-006.003)
-- -----------------------------------------------------------------------------

-- 7.0 Shared prologue. Order matters and is part of the security contract:
--   live session -> location (uniform denial) -> caller authority -> target membership /
--   assignment -> module enabled -> mode -> per-employee serialisation.
-- Nothing about a location (existence, module state, attendance mode) is revealed to a
-- caller who has no relationship to it.
create or replace function private.attendance_begin(
  p_location_id uuid,
  p_target_profile_id uuid,
  p_closing boolean default false
)
returns public.locations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_loc public.locations%rowtype;
  v_is_manager boolean;
begin
  if v_uid is null or not private.attendance_live_session() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_location_id is null or p_target_profile_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- FOR SHARE: serialises against set_location_attendance_mode (FOR UPDATE) so a mode
  -- change cannot interleave with a clock operation.
  select * into v_loc from public.locations where id = p_location_id for share;
  if not found then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  v_is_manager := private.attendance_can_manage_location(p_location_id);

  if p_target_profile_id = v_uid then
    if not v_is_manager and not private.attendance_is_active_member(v_loc.organization_id) then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;
  elsif not v_is_manager then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- The target must be an ACTIVE member of the location's organization.
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = v_loc.organization_id
      and m.profile_id = p_target_profile_id
      and m.active
  ) then
    raise exception 'Employee is not an active member of this organization' using errcode = '42501';
  end if;

  -- Opening operations require an ACTIVE assignment at this location for the TARGET
  -- (a manager clocking in themself is the only exemption). Closing operations do not:
  -- an employee whose assignment was removed mid-shift must still be able to clock out.
  if not p_closing
     and not (p_target_profile_id = v_uid and v_is_manager)
     and not exists (
       select 1 from public.location_memberships lm
       where lm.location_id = p_location_id
         and lm.profile_id = p_target_profile_id
         and lm.active
     ) then
    raise exception 'Employee is not assigned to this location' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(p_location_id, 'attendance');

  if v_loc.attendance_mode is distinct from 'internal_the_lineup' then
    raise exception 'Internal attendance is not enabled for this location' using errcode = '42501';
  end if;

  if not p_closing and (v_loc.archived_at is not null or not v_loc.active) then
    raise exception 'Location is archived or inactive' using errcode = '55000';
  end if;

  -- Serialise every operation for one employee so concurrent clock / break / retry
  -- requests are processed one at a time and idempotent replays are exact.
  perform pg_advisory_xact_lock(
    hashtextextended('attendance:' || v_loc.organization_id::text || ':' || p_target_profile_id::text, 0)
  );

  return v_loc;
end;
$$;
revoke all on function private.attendance_begin(uuid, uuid, boolean) from public, anon, authenticated;

-- 7.0b Idempotent replay lookup. Keys are scoped to (organization, actor) and bound to the
-- exact operation (event type, location, target employee). Reusing a key for anything
-- else is refused instead of silently swallowing the new request.
create or replace function private.attendance_replay(
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_key text,
  p_event_type public.attendance_event_type,
  p_location_id uuid,
  p_target_profile_id uuid
)
returns public.attendance_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.attendance_events%rowtype;
begin
  select * into v_event
  from public.attendance_events e
  where e.organization_id = p_organization_id
    and e.actor_profile_id = p_actor_profile_id
    and e.idempotency_key = p_key;

  if not found then
    return null;
  end if;

  if v_event.event_type <> p_event_type
     or v_event.location_id <> p_location_id
     or v_event.profile_id <> p_target_profile_id then
    raise exception 'Idempotency key was already used for a different operation' using errcode = '22023';
  end if;

  return v_event;
end;
$$;
revoke all on function private.attendance_replay(uuid, uuid, text, public.attendance_event_type, uuid, uuid) from public, anon, authenticated;

-- 7.1 Clock In
create or replace function public.attendance_clock_in(
  p_location_id uuid,
  p_profile_id uuid default null,
  p_idempotency_key text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_notes text := nullif(trim(p_notes), '');
  v_replay public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_now timestamptz;
  v_service_date date;
  v_session_id uuid;
  v_event_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_target_profile_id := coalesce(p_profile_id, v_caller_id);
  if v_key is not null and length(v_key) > 128 then
    raise exception 'Idempotency key is too long' using errcode = '22023';
  end if;
  if v_notes is not null and length(v_notes) > 500 then
    raise exception 'Notes are too long' using errcode = '22023';
  end if;

  v_loc := private.attendance_begin(p_location_id, v_target_profile_id, false);

  if v_key is not null then
    v_replay := private.attendance_replay(v_loc.organization_id, v_caller_id, v_key, 'clock_in', p_location_id, v_target_profile_id);
    if v_replay.id is not null then
      select * into v_session from public.attendance_sessions where id = v_replay.session_id;
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_session.id,
        'eventId', v_replay.id,
        'status', v_session.status,
        'clockInAt', v_session.clock_in_at,
        'serviceDate', v_session.service_date
      );
    end if;
  end if;

  if exists (
    select 1 from public.attendance_sessions s
    where s.organization_id = v_loc.organization_id
      and s.profile_id = v_target_profile_id
      and s.status in ('active', 'on_break')
  ) then
    raise exception 'Employee already has an open attendance session' using errcode = '23505';
  end if;

  if v_target_profile_id <> v_caller_id then
    v_source := 'manager';
  end if;

  -- clock_timestamp(), taken AFTER the per-employee lock, is monotonic with lock order.
  -- (now() is the transaction start and can precede the previous holder's timestamps.)
  v_now := clock_timestamp();
  -- service_date is the location-local calendar date of the clock-in instant.
  v_service_date := (v_now at time zone v_loc.time_zone)::date;

  insert into public.attendance_sessions (
    organization_id, location_id, profile_id, service_date, status, clock_in_at, created_by
  ) values (
    v_loc.organization_id, p_location_id, v_target_profile_id, v_service_date, 'active', v_now, v_caller_id
  )
  returning id into v_session_id;

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id,
    event_type, event_time, service_date, source, idempotency_key, actor_profile_id, metadata
  ) values (
    v_session_id, v_loc.organization_id, p_location_id, v_target_profile_id,
    'clock_in', v_now, v_service_date, v_source, v_key, v_caller_id,
    case when v_notes is not null then jsonb_build_object('notes', v_notes) else '{}'::jsonb end
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session_id,
    'eventId', v_event_id,
    'status', 'active',
    'clockInAt', v_now,
    'serviceDate', v_service_date
  );
end;
$$;

-- 7.2 Clock Out
create or replace function public.attendance_clock_out(
  p_location_id uuid,
  p_profile_id uuid default null,
  p_idempotency_key text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_notes text := nullif(trim(p_notes), '');
  v_replay public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_active_break public.attendance_breaks%rowtype;
  v_now timestamptz;
  v_break_duration integer;
  v_total_break_seconds integer;
  v_gross_seconds integer;
  v_unclassified integer;
  v_event_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_target_profile_id := coalesce(p_profile_id, v_caller_id);
  if v_key is not null and length(v_key) > 128 then
    raise exception 'Idempotency key is too long' using errcode = '22023';
  end if;
  if v_notes is not null and length(v_notes) > 500 then
    raise exception 'Notes are too long' using errcode = '22023';
  end if;

  v_loc := private.attendance_begin(p_location_id, v_target_profile_id, true);

  if v_key is not null then
    v_replay := private.attendance_replay(v_loc.organization_id, v_caller_id, v_key, 'clock_out', p_location_id, v_target_profile_id);
    if v_replay.id is not null then
      select * into v_session from public.attendance_sessions where id = v_replay.session_id;
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_session.id,
        'eventId', v_replay.id,
        'status', v_session.status,
        'clockOutAt', v_session.clock_out_at,
        'grossElapsedSeconds', v_session.gross_elapsed_seconds,
        'totalBreakSeconds', v_session.total_break_seconds
      );
    end if;
  end if;

  if v_target_profile_id <> v_caller_id then
    v_source := 'manager';
  end if;

  select * into v_session
  from public.attendance_sessions
  where organization_id = v_loc.organization_id
    and location_id = p_location_id
    and profile_id = v_target_profile_id
    and status in ('active', 'on_break')
  for update;

  if not found then
    raise exception 'No active attendance session found to clock out' using errcode = 'P0002';
  end if;

  v_now := greatest(clock_timestamp(), v_session.clock_in_at);
  v_total_break_seconds := v_session.total_break_seconds;

  -- Clocking out while on break closes that break at the clock-out instant. The break stays
  -- 'unclassified'; a human decides whether it is paid.
  if v_session.status = 'on_break' then
    select * into v_active_break
    from public.attendance_breaks
    where session_id = v_session.id
      and end_time is null
    for update;

    if found then
      v_now := greatest(v_now, v_active_break.start_time);
      v_break_duration := greatest(0, floor(extract(epoch from (v_now - v_active_break.start_time)))::integer);

      update public.attendance_breaks
      set end_time = v_now,
          duration_seconds = v_break_duration
      where id = v_active_break.id;

      v_total_break_seconds := v_total_break_seconds + v_break_duration;

      insert into public.attendance_events (
        session_id, organization_id, location_id, profile_id,
        event_type, event_time, service_date, source, actor_profile_id, metadata
      ) values (
        v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id,
        'break_end', v_now, v_session.service_date, v_source, v_caller_id,
        jsonb_build_object('auto_closed_by_clock_out', true)
      );
    end if;
  end if;

  -- Gross elapsed seconds between two absolute instants (never wall-clock arithmetic,
  -- so DST transitions and overnight shifts are exact).
  v_gross_seconds := greatest(0, floor(extract(epoch from (v_now - v_session.clock_in_at)))::integer);

  update public.attendance_sessions
  set status = 'completed',
      clock_out_at = v_now,
      gross_elapsed_seconds = v_gross_seconds,
      total_break_seconds = v_total_break_seconds,
      updated_at = v_now,
      updated_by = v_caller_id
  where id = v_session.id;

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id,
    event_type, event_time, service_date, source, idempotency_key, actor_profile_id, metadata
  ) values (
    v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id,
    'clock_out', v_now, v_session.service_date, v_source, v_key, v_caller_id,
    case when v_notes is not null then jsonb_build_object('notes', v_notes) else '{}'::jsonb end
  )
  returning id into v_event_id;

  select count(*)::integer into v_unclassified
  from public.attendance_breaks
  where session_id = v_session.id
    and pay_classification = 'unclassified';

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session.id,
    'eventId', v_event_id,
    'status', 'completed',
    'clockOutAt', v_now,
    'grossElapsedSeconds', v_gross_seconds,
    'totalBreakSeconds', v_total_break_seconds,
    'unclassifiedBreakCount', v_unclassified,
    -- Payable time is only knowable once every break is classified. Never guessed here.
    'netPayableSeconds', case when v_unclassified = 0 then v_gross_seconds else null end
  );
end;
$$;

-- 7.3 Break Start
create or replace function public.attendance_break_start(
  p_location_id uuid,
  p_profile_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_replay public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_now timestamptz;
  v_event_id bigint;
  v_break_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_target_profile_id := coalesce(p_profile_id, v_caller_id);
  if v_key is not null and length(v_key) > 128 then
    raise exception 'Idempotency key is too long' using errcode = '22023';
  end if;

  v_loc := private.attendance_begin(p_location_id, v_target_profile_id, false);

  if v_key is not null then
    v_replay := private.attendance_replay(v_loc.organization_id, v_caller_id, v_key, 'break_start', p_location_id, v_target_profile_id);
    if v_replay.id is not null then
      select * into v_session from public.attendance_sessions where id = v_replay.session_id;
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_session.id,
        'eventId', v_replay.id,
        'status', v_session.status
      );
    end if;
  end if;

  if v_target_profile_id <> v_caller_id then
    v_source := 'manager';
  end if;

  select * into v_session
  from public.attendance_sessions
  where organization_id = v_loc.organization_id
    and location_id = p_location_id
    and profile_id = v_target_profile_id
    and status in ('active', 'on_break')
  for update;

  if not found then
    raise exception 'No active attendance session found' using errcode = 'P0002';
  end if;

  if v_session.status = 'on_break' then
    raise exception 'Session is already on break' using errcode = '22023';
  end if;

  v_now := greatest(clock_timestamp(), v_session.clock_in_at);

  update public.attendance_sessions
  set status = 'on_break',
      updated_at = v_now,
      updated_by = v_caller_id
  where id = v_session.id;

  insert into public.attendance_breaks (
    session_id, organization_id, location_id, profile_id, start_time
  ) values (
    v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id, v_now
  )
  returning id into v_break_id;

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id,
    event_type, event_time, service_date, source, idempotency_key, actor_profile_id
  ) values (
    v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id,
    'break_start', v_now, v_session.service_date, v_source, v_key, v_caller_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session.id,
    'breakId', v_break_id,
    'eventId', v_event_id,
    'status', 'on_break',
    'breakStartAt', v_now
  );
end;
$$;

-- 7.4 Break End
create or replace function public.attendance_break_end(
  p_location_id uuid,
  p_profile_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := (select auth.uid());
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_key text := nullif(trim(p_idempotency_key), '');
  v_replay public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_break public.attendance_breaks%rowtype;
  v_now timestamptz;
  v_duration integer;
  v_event_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_target_profile_id := coalesce(p_profile_id, v_caller_id);
  if v_key is not null and length(v_key) > 128 then
    raise exception 'Idempotency key is too long' using errcode = '22023';
  end if;

  v_loc := private.attendance_begin(p_location_id, v_target_profile_id, true);

  if v_key is not null then
    v_replay := private.attendance_replay(v_loc.organization_id, v_caller_id, v_key, 'break_end', p_location_id, v_target_profile_id);
    if v_replay.id is not null then
      select * into v_session from public.attendance_sessions where id = v_replay.session_id;
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_session.id,
        'eventId', v_replay.id,
        'status', v_session.status
      );
    end if;
  end if;

  if v_target_profile_id <> v_caller_id then
    v_source := 'manager';
  end if;

  select * into v_session
  from public.attendance_sessions
  where organization_id = v_loc.organization_id
    and location_id = p_location_id
    and profile_id = v_target_profile_id
    and status in ('active', 'on_break')
  for update;

  if not found then
    raise exception 'No active attendance session found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'on_break' then
    raise exception 'Session is not currently on break' using errcode = '22023';
  end if;

  select * into v_break
  from public.attendance_breaks
  where session_id = v_session.id
    and end_time is null
  for update;

  if not found then
    raise exception 'No active break found to end' using errcode = 'P0002';
  end if;

  v_now := greatest(clock_timestamp(), v_break.start_time);
  v_duration := greatest(0, floor(extract(epoch from (v_now - v_break.start_time)))::integer);

  update public.attendance_breaks
  set end_time = v_now,
      duration_seconds = v_duration
  where id = v_break.id;

  update public.attendance_sessions
  set status = 'active',
      total_break_seconds = v_session.total_break_seconds + v_duration,
      updated_at = v_now,
      updated_by = v_caller_id
  where id = v_session.id;

  insert into public.attendance_events (
    session_id, organization_id, location_id, profile_id,
    event_type, event_time, service_date, source, idempotency_key, actor_profile_id
  ) values (
    v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id,
    'break_end', v_now, v_session.service_date, v_source, v_key, v_caller_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session.id,
    'breakId', v_break.id,
    'eventId', v_event_id,
    'status', 'active',
    'breakDurationSeconds', v_duration,
    'totalBreakSeconds', v_session.total_break_seconds + v_duration,
    'payClassification', 'unclassified'
  );
end;
$$;

revoke all on function public.attendance_clock_in(uuid, uuid, text, text) from public, anon;
grant execute on function public.attendance_clock_in(uuid, uuid, text, text) to authenticated;

revoke all on function public.attendance_clock_out(uuid, uuid, text, text) from public, anon;
grant execute on function public.attendance_clock_out(uuid, uuid, text, text) to authenticated;

revoke all on function public.attendance_break_start(uuid, uuid, text) from public, anon;
grant execute on function public.attendance_break_start(uuid, uuid, text) to authenticated;

revoke all on function public.attendance_break_end(uuid, uuid, text) from public, anon;
grant execute on function public.attendance_break_end(uuid, uuid, text) to authenticated;
