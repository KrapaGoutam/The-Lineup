-- Migration: 20261110000000_attendance_v2_foundation.sql
-- Feature V2-006: Attendance V2 — Batch A Foundation
-- Subfeatures:
--   V2-006.001: Per-Location Attendance Mode Configuration
--   V2-006.002: Native Internal Attendance Data Model
--   V2-006.003: Clock Integrity Rules
--
-- Invariants:
--   * Additive, forward-only schema.
--   * No silent backfill or default attendance_mode assigned to existing locations (NULL = unconfigured).
--   * Composite tenant FKs enforce tenant isolation.
--   * Historical attendance_events are immutable and append-only.
--   * Atomic concurrency protection prevents duplicate open sessions and race conditions.

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

-- Add attendance_mode column to locations (nullable, no default)
alter table public.locations
  add column if not exists attendance_mode public.attendance_mode;

comment on column public.locations.attendance_mode is
  'V2-006.001. Per-location attendance mode (external, internal_the_lineup, disabled). NULL means unconfigured / missing (fails closed for internal clocking; preserves legacy Neon reads where allowed).';

-- -----------------------------------------------------------------------------
-- 2. Authority Helper for Attendance Management
-- -----------------------------------------------------------------------------
create or replace function private.attendance_can_manage_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    -- 1. Overall Owner or Manager
    select 1 from public.overall_roles
    where profile_id = (select auth.uid())
      and role in ('owner', 'manager')
  ) or exists (
    -- 2. Organization Owner or General Manager of the location's owning organization
    select 1 from public.locations l
    where l.id = p_location_id
      and private.has_org_role(
        l.organization_id,
        array['owner', 'general_manager']::public.app_role[]
      )
  ) or exists (
    -- 3. Location Manager or Assistant Manager explicitly assigned to this location
    select 1 from public.location_memberships lm
    where lm.location_id = p_location_id
      and lm.profile_id = (select auth.uid())
      and lm.active = true
      and lm.role in ('manager', 'assistant_manager')
  );
$$;

revoke all on function private.attendance_can_manage_location(uuid) from public, anon;
grant execute on function private.attendance_can_manage_location(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Auditable Mutation for Attendance Mode
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
begin
  v_actor_profile_id := auth.uid();
  if v_actor_profile_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_loc
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception 'Location not found' using errcode = 'P0002';
  end if;

  -- Authority: Overall Owner/Manager or Org Owner/General Manager
  if not private.can_manage_location_lifecycle(v_loc.organization_id) then
    raise exception 'Unauthorized to manage location attendance mode' using errcode = '42501';
  end if;

  -- Cannot configure archived or inactive locations
  if v_loc.archived_at is not null or not v_loc.active then
    raise exception 'Cannot configure attendance mode on archived or inactive location' using errcode = '55000';
  end if;

  -- Optimistic concurrency check
  if p_expected_updated_at is not null and v_loc.updated_at <> p_expected_updated_at then
    raise exception 'Location was modified by another operation' using errcode = 'P0004';
  end if;

  v_old_mode := v_loc.attendance_mode;

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
    nullif(trim(p_reason), '')
  );

  return v_loc;
end;
$$;

revoke all on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) from public, anon;
grant execute on function public.set_location_attendance_mode(uuid, public.attendance_mode, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Native Internal Attendance Data Model (V2-006.002)
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
      'auto_clocked_out'
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
      'manager_edit'
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
end
$$;

grant usage on type public.attendance_session_status to authenticated;
grant usage on type public.attendance_event_type to authenticated;
grant usage on type public.attendance_event_source to authenticated;

-- Attendance Sessions
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  service_date date not null,
  status public.attendance_session_status not null default 'active',
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  total_break_seconds integer not null default 0 check (total_break_seconds >= 0),
  total_worked_seconds integer check (total_worked_seconds is null or total_worked_seconds >= 0),
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_location_tenant_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade,
  constraint attendance_sessions_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id) on delete cascade,
  constraint attendance_sessions_valid_clock_times
    check (clock_out_at is null or clock_out_at >= clock_in_at),
  constraint attendance_sessions_completed_has_clock_out
    check (status not in ('completed', 'auto_clocked_out') or clock_out_at is not null)
);

comment on table public.attendance_sessions is
  'V2-006.002. Internal attendance sessions tracking active and completed work shifts.';

-- Enforce at most ONE open (active or on_break) session per employee across the organization
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
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint attendance_breaks_location_tenant_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade,
  constraint attendance_breaks_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id) on delete cascade,
  constraint attendance_breaks_valid_interval
    check (end_time is null or end_time >= start_time)
);

comment on table public.attendance_breaks is
  'V2-006.002. Break periods within an internal attendance session.';

create unique index if not exists attendance_breaks_one_active_per_session
  on public.attendance_breaks (session_id)
  where end_time is null;

create index if not exists attendance_breaks_session_idx
  on public.attendance_breaks (session_id, start_time asc);

-- Attendance Events (Append-Only Audit Stream)
create table if not exists public.attendance_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type public.attendance_event_type not null,
  event_time timestamptz not null default now(),
  service_date date not null,
  source public.attendance_event_source not null default 'web',
  idempotency_key text,
  actor_profile_id uuid not null references public.profiles (id),
  is_manager_correction boolean not null default false,
  reverses_event_id bigint references public.attendance_events (id),
  correction_reason text
    check (not is_manager_correction or (correction_reason is not null and length(trim(correction_reason)) > 0)),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint attendance_events_location_tenant_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade,
  constraint attendance_events_membership_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id) on delete cascade,
  constraint attendance_events_actor_membership_fk
    foreign key (organization_id, actor_profile_id)
    references public.memberships (organization_id, profile_id) on delete cascade
);

comment on table public.attendance_events is
  'V2-006.002. Immutable append-only log of clock in, clock out, break, and correction events.';

create unique index if not exists attendance_events_idempotency_idx
  on public.attendance_events (organization_id, location_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists attendance_events_session_idx
  on public.attendance_events (session_id, event_time asc);

create index if not exists attendance_events_loc_service_date_idx
  on public.attendance_events (location_id, service_date desc);

create index if not exists attendance_events_profile_time_idx
  on public.attendance_events (profile_id, event_time desc);

-- Immutability enforcement trigger on attendance_events
create or replace function private.attendance_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'attendance_events is immutable and cannot be updated or deleted' using errcode = '23514';
end;
$$;

revoke all on function private.attendance_events_immutable() from public, anon, authenticated;

drop trigger if exists attendance_events_immutable_trigger on public.attendance_events;
create trigger attendance_events_immutable_trigger
  before update or delete on public.attendance_events
  for each row execute function private.attendance_events_immutable();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security & Grants (V2-006.002)
-- -----------------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.attendance_breaks enable row level security;
alter table public.attendance_events enable row level security;

-- Revoke write privileges on tables: all mutations must go through atomic RPCs
revoke all on table public.attendance_sessions from public, anon;
grant select on table public.attendance_sessions to authenticated;

revoke all on table public.attendance_breaks from public, anon;
grant select on table public.attendance_breaks to authenticated;

revoke all on table public.attendance_events from public, anon;
grant select on table public.attendance_events to authenticated;

-- SELECT policies: Employee can read their own; Managers can read for location
drop policy if exists "attendance_sessions_select" on public.attendance_sessions;
create policy "attendance_sessions_select" on public.attendance_sessions
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.attendance_can_manage_location(location_id)
  );

drop policy if exists "attendance_breaks_select" on public.attendance_breaks;
create policy "attendance_breaks_select" on public.attendance_breaks
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.attendance_can_manage_location(location_id)
  );

drop policy if exists "attendance_events_select" on public.attendance_events;
create policy "attendance_events_select" on public.attendance_events
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.attendance_can_manage_location(location_id)
  );

-- -----------------------------------------------------------------------------
-- 6. Clock Integrity Rules & Atomic RPCs (V2-006.003)
-- -----------------------------------------------------------------------------

-- 6.1 Clock In
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
  v_caller_id uuid;
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_is_manager boolean := false;
  v_existing_event public.attendance_events%rowtype;
  v_existing_session public.attendance_sessions%rowtype;
  v_service_date date;
  v_session_id uuid;
  v_event_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_target_profile_id := coalesce(p_profile_id, v_caller_id);

  -- 1. Location verification
  select * into v_loc
  from public.locations
  where id = p_location_id;

  if not found then
    raise exception 'Location not found' using errcode = 'P0002';
  end if;

  if v_loc.archived_at is not null or not v_loc.active then
    raise exception 'Location is archived or inactive' using errcode = '55000';
  end if;

  -- 2. Attendance mode verification: must be explicitly 'internal_the_lineup'
  if v_loc.attendance_mode is null or v_loc.attendance_mode <> 'internal_the_lineup' then
    raise exception 'Internal attendance is not enabled for this location' using errcode = '42501';
  end if;

  -- 3. Authorization check
  v_is_manager := private.attendance_can_manage_location(p_location_id);

  if v_target_profile_id <> v_caller_id then
    if not v_is_manager then
      raise exception 'Unauthorized: only managers can clock in for another employee' using errcode = '42501';
    end if;
    v_source := 'manager';
  end if;

  -- 4. Employee organization membership verification
  if not exists (
    select 1 from public.memberships
    where organization_id = v_loc.organization_id
      and profile_id = v_target_profile_id
  ) then
    raise exception 'Employee is not a member of this organization' using errcode = '42501';
  end if;

  -- 5. Employee location assignment verification
  if not v_is_manager and not exists (
    select 1 from public.location_memberships
    where location_id = p_location_id
      and profile_id = v_target_profile_id
      and active = true
  ) then
    raise exception 'Employee is not assigned to this location' using errcode = '42501';
  end if;

  -- 6. Idempotency check
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing_event
    from public.attendance_events
    where organization_id = v_loc.organization_id
      and location_id = p_location_id
      and idempotency_key = trim(p_idempotency_key);

    if found then
      select * into v_existing_session
      from public.attendance_sessions
      where id = v_existing_event.session_id;

      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_existing_session.id,
        'eventId', v_existing_event.id,
        'status', v_existing_session.status,
        'clockInAt', v_existing_session.clock_in_at,
        'serviceDate', v_existing_session.service_date
      );
    end if;
  end if;

  -- 7. Reject duplicate clock-in for an already open session
  if exists (
    select 1 from public.attendance_sessions
    where organization_id = v_loc.organization_id
      and profile_id = v_target_profile_id
      and status in ('active', 'on_break')
  ) then
    raise exception 'Employee already has an open attendance session' using errcode = '23505';
  end if;

  -- 8. Compute service_date in location-local timezone
  v_service_date := (now() at time zone v_loc.time_zone)::date;

  -- 9. Insert new attendance session
  insert into public.attendance_sessions (
    organization_id,
    location_id,
    profile_id,
    service_date,
    status,
    clock_in_at,
    created_by
  ) values (
    v_loc.organization_id,
    p_location_id,
    v_target_profile_id,
    v_service_date,
    'active',
    now(),
    v_caller_id
  )
  returning id into v_session_id;

  -- 10. Insert clock_in event
  insert into public.attendance_events (
    session_id,
    organization_id,
    location_id,
    profile_id,
    event_type,
    event_time,
    service_date,
    source,
    idempotency_key,
    actor_profile_id,
    metadata
  ) values (
    v_session_id,
    v_loc.organization_id,
    p_location_id,
    v_target_profile_id,
    'clock_in',
    now(),
    v_service_date,
    v_source,
    nullif(trim(p_idempotency_key), ''),
    v_caller_id,
    case when p_notes is not null then jsonb_build_object('notes', trim(p_notes)) else '{}'::jsonb end
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session_id,
    'eventId', v_event_id,
    'status', 'active',
    'clockInAt', now(),
    'serviceDate', v_service_date
  );
end;
$$;

-- 6.2 Clock Out
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
  v_caller_id uuid;
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_is_manager boolean := false;
  v_existing_event public.attendance_events%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_active_break public.attendance_breaks%rowtype;
  v_now timestamptz := now();
  v_break_duration integer := 0;
  v_total_break_seconds integer;
  v_worked_seconds integer;
  v_event_id bigint;
  v_source public.attendance_event_source := 'web';
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_target_profile_id := coalesce(p_profile_id, v_caller_id);

  select * into v_loc
  from public.locations
  where id = p_location_id;

  if not found then
    raise exception 'Location not found' using errcode = 'P0002';
  end if;

  if v_loc.attendance_mode is null or v_loc.attendance_mode <> 'internal_the_lineup' then
    raise exception 'Internal attendance is not enabled for this location' using errcode = '42501';
  end if;

  v_is_manager := private.attendance_can_manage_location(p_location_id);
  if v_target_profile_id <> v_caller_id then
    if not v_is_manager then
      raise exception 'Unauthorized: only managers can clock out another employee' using errcode = '42501';
    end if;
    v_source := 'manager';
  end if;

  -- Idempotency check
  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing_event
    from public.attendance_events
    where organization_id = v_loc.organization_id
      and location_id = p_location_id
      and idempotency_key = trim(p_idempotency_key);

    if found then
      select * into v_session
      from public.attendance_sessions
      where id = v_existing_event.session_id;

      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'sessionId', v_session.id,
        'eventId', v_existing_event.id,
        'status', v_session.status,
        'clockOutAt', v_session.clock_out_at,
        'totalWorkedSeconds', v_session.total_worked_seconds,
        'totalBreakSeconds', v_session.total_break_seconds
      );
    end if;
  end if;

  -- Lock open session
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

  v_total_break_seconds := v_session.total_break_seconds;

  -- Auto-close active break if employee clocks out while on break
  if v_session.status = 'on_break' then
    select * into v_active_break
    from public.attendance_breaks
    where session_id = v_session.id
      and end_time is null
    for update;

    if found then
      v_break_duration := greatest(0, extract(epoch from (v_now - v_active_break.start_time))::integer);
      update public.attendance_breaks
      set end_time = v_now,
          duration_seconds = v_break_duration
      where id = v_active_break.id;

      v_total_break_seconds := v_total_break_seconds + v_break_duration;

      insert into public.attendance_events (
        session_id, organization_id, location_id, profile_id,
        event_type, event_time, service_date, source, actor_profile_id
      ) values (
        v_session.id, v_loc.organization_id, p_location_id, v_target_profile_id,
        'break_end', v_now, v_session.service_date, v_source, v_caller_id
      );
    end if;
  end if;

  -- Elapsed seconds in UTC (never string subtraction)
  v_worked_seconds := greatest(0, extract(epoch from (v_now - v_session.clock_in_at))::integer - v_total_break_seconds);

  update public.attendance_sessions
  set status = 'completed',
      clock_out_at = v_now,
      total_break_seconds = v_total_break_seconds,
      total_worked_seconds = v_worked_seconds,
      updated_at = v_now,
      updated_by = v_caller_id
  where id = v_session.id;

  insert into public.attendance_events (
    session_id,
    organization_id,
    location_id,
    profile_id,
    event_type,
    event_time,
    service_date,
    source,
    idempotency_key,
    actor_profile_id,
    metadata
  ) values (
    v_session.id,
    v_loc.organization_id,
    p_location_id,
    v_target_profile_id,
    'clock_out',
    v_now,
    v_session.service_date,
    v_source,
    nullif(trim(p_idempotency_key), ''),
    v_caller_id,
    case when p_notes is not null then jsonb_build_object('notes', trim(p_notes)) else '{}'::jsonb end
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'sessionId', v_session.id,
    'eventId', v_event_id,
    'status', 'completed',
    'clockOutAt', v_now,
    'totalWorkedSeconds', v_worked_seconds,
    'totalBreakSeconds', v_total_break_seconds
  );
end;
$$;

-- 6.3 Break Start
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
  v_caller_id uuid;
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_existing_event public.attendance_events%rowtype;
  v_now timestamptz := now();
  v_event_id bigint;
  v_break_id bigint;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_target_profile_id := coalesce(p_profile_id, v_caller_id);

  select * into v_loc from public.locations where id = p_location_id;
  if not found or v_loc.attendance_mode is null or v_loc.attendance_mode <> 'internal_the_lineup' then
    raise exception 'Internal attendance is not enabled for this location' using errcode = '42501';
  end if;

  if v_target_profile_id <> v_caller_id and not private.attendance_can_manage_location(p_location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing_event
    from public.attendance_events
    where organization_id = v_loc.organization_id
      and location_id = p_location_id
      and idempotency_key = trim(p_idempotency_key);
    if found then
      return jsonb_build_object('success', true, 'idempotent', true, 'status', 'on_break');
    end if;
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
    'break_start', v_now, v_session.service_date,
    case when v_target_profile_id <> v_caller_id then 'manager'::public.attendance_event_source else 'web'::public.attendance_event_source end,
    nullif(trim(p_idempotency_key), ''), v_caller_id
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

-- 6.4 Break End
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
  v_caller_id uuid;
  v_target_profile_id uuid;
  v_loc public.locations%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_break public.attendance_breaks%rowtype;
  v_existing_event public.attendance_events%rowtype;
  v_now timestamptz := now();
  v_duration integer;
  v_event_id bigint;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_target_profile_id := coalesce(p_profile_id, v_caller_id);

  select * into v_loc from public.locations where id = p_location_id;
  if not found or v_loc.attendance_mode is null or v_loc.attendance_mode <> 'internal_the_lineup' then
    raise exception 'Internal attendance is not enabled for this location' using errcode = '42501';
  end if;

  if v_target_profile_id <> v_caller_id and not private.attendance_can_manage_location(p_location_id) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select * into v_existing_event
    from public.attendance_events
    where organization_id = v_loc.organization_id
      and location_id = p_location_id
      and idempotency_key = trim(p_idempotency_key);
    if found then
      return jsonb_build_object('success', true, 'idempotent', true, 'status', 'active');
    end if;
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

  v_duration := greatest(0, extract(epoch from (v_now - v_break.start_time))::integer);

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
    'break_end', v_now, v_session.service_date,
    case when v_target_profile_id <> v_caller_id then 'manager'::public.attendance_event_source else 'web'::public.attendance_event_source end,
    nullif(trim(p_idempotency_key), ''), v_caller_id
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
    'totalBreakSeconds', v_session.total_break_seconds + v_duration
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
