-- Migration: 20261104020000_location_lifecycle_integrity.sql
-- Subfeature V2-002.005: Location Lifecycle Integrity
--
-- Safe deactivation, archive rules and operational cascade protection for
-- public.locations. Forward-only; no previously applied migration is edited.
--
-- Lifecycle representation (ONE source of truth, backward compatible):
--   ACTIVE   : active = true  AND archived_at IS NULL
--   INACTIVE : active = false AND archived_at IS NULL
--   ARCHIVED : active = false AND archived_at IS NOT NULL
-- `locations.active` keeps its meaning for every existing reader; the only new
-- column is `archived_at`. A CHECK constraint forbids active = true with a
-- non-null archived_at.
--
-- 1. locations.archived_at + consistency constraint
-- 2. Authority helper private.can_manage_location_lifecycle
-- 3. Append-only audit table public.location_lifecycle_events
-- 4. Direct-update bypass guard on public.locations (client roles cannot change
--    `active` / `archived_at`; only the lifecycle RPC can)
-- 5. Hard-delete protection (privileges + trigger)
-- 6. Blocker analysis (private) + readiness reader (public)
-- 7. Transactional transition RPC public.transition_location_lifecycle
-- 8. Operational write guards: no NEW operational work at a non-active location,
--    serialized against the transition with a FOR SHARE lock (closes the
--    time-of-check/time-of-use gap)

-- -----------------------------------------------------------------------------
-- 1. Lifecycle metadata
-- -----------------------------------------------------------------------------
alter table public.locations
  add column if not exists archived_at timestamptz;

alter table public.locations
  drop constraint if exists locations_lifecycle_state_consistent;
alter table public.locations
  add constraint locations_lifecycle_state_consistent
  check (archived_at is null or active = false);

comment on column public.locations.archived_at is
  'V2-002.005. Non-null only for ARCHIVED locations (active is then false). Set exclusively by public.transition_location_lifecycle.';

create or replace function private.location_lifecycle_status(
  p_active boolean,
  p_archived_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_archived_at is not null then 'archived'
    when p_active then 'active'
    else 'inactive'
  end;
$$;

revoke all on function private.location_lifecycle_status(boolean, timestamptz) from public, anon;
grant execute on function private.location_lifecycle_status(boolean, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Lifecycle authority (identical to every other V2-002 management action)
--    Overall Owner / Overall Manager, OR active Organization Owner / General
--    Manager of the location's OWNING organization. Location managers, shift
--    managers, host/server and Overall Assistant Managers are denied. No
--    `organizations.created_by` bypass (Issue #106) -- private.has_org_role
--    consults only active membership rows.
-- -----------------------------------------------------------------------------
create or replace function private.can_manage_location_lifecycle(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.overall_roles orl
    where orl.profile_id = (select auth.uid())
      and orl.role in ('owner', 'manager')
  )
  or private.has_org_role(
    p_organization_id,
    array['owner', 'general_manager']::public.app_role[]
  );
$$;

revoke all on function private.can_manage_location_lifecycle(uuid) from public, anon;
grant execute on function private.can_manage_location_lifecycle(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Append-only lifecycle audit trail
--    A dedicated table (not public.audit_events): audit_events requires the
--    actor to be an ORGANIZATION member, which an Overall Owner/Manager acting
--    across organizations is not. The actor is stored as a plain uuid (no FK)
--    so deleting an account can never erase or block history.
-- -----------------------------------------------------------------------------
create table if not exists public.location_lifecycle_events (
  id bigint generated always as identity primary key,
  location_id uuid not null,
  organization_id uuid not null,
  actor_profile_id uuid not null,
  action text not null
    check (action in ('deactivate', 'reactivate', 'archive', 'restore_archive')),
  previous_state text not null
    check (previous_state in ('active', 'inactive', 'archived')),
  new_state text not null
    check (new_state in ('active', 'inactive', 'archived')),
  reason text not null
    check (length(trim(reason)) between 3 and 500),
  blockers_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(blockers_snapshot) = 'array'),
  changed_at timestamptz not null default now(),
  constraint location_lifecycle_events_location_tenant_fk
    foreign key (location_id, organization_id)
    references public.locations (id, organization_id),
  constraint location_lifecycle_events_transition_valid
    check ((action, previous_state, new_state) in (
      ('deactivate', 'active', 'inactive'),
      ('reactivate', 'inactive', 'active'),
      ('archive', 'inactive', 'archived'),
      ('restore_archive', 'archived', 'inactive')
    ))
);

comment on table public.location_lifecycle_events is
  'V2-002.005. Append-only audit trail of location lifecycle transitions. Written only by public.transition_location_lifecycle.';

create index if not exists location_lifecycle_events_location_idx
  on public.location_lifecycle_events (location_id, changed_at desc, id desc);
create index if not exists location_lifecycle_events_org_idx
  on public.location_lifecycle_events (organization_id, changed_at desc);

alter table public.location_lifecycle_events enable row level security;

revoke all on table public.location_lifecycle_events from public, anon, authenticated;
grant select on table public.location_lifecycle_events to authenticated;

drop policy if exists "location_lifecycle_events_select_manager" on public.location_lifecycle_events;
create policy "location_lifecycle_events_select_manager" on public.location_lifecycle_events
  for select
  to authenticated
  using (private.can_manage_location_lifecycle(organization_id));

create or replace function private.location_lifecycle_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'location_lifecycle_events is append-only' using errcode = '23514';
end;
$$;

revoke all on function private.location_lifecycle_events_append_only() from public, anon, authenticated;

drop trigger if exists location_lifecycle_events_append_only on public.location_lifecycle_events;
create trigger location_lifecycle_events_append_only
  before update or delete on public.location_lifecycle_events
  for each row execute function private.location_lifecycle_events_append_only();

drop trigger if exists location_lifecycle_events_no_truncate on public.location_lifecycle_events;
create trigger location_lifecycle_events_no_truncate
  before truncate on public.location_lifecycle_events
  for each statement execute function private.location_lifecycle_events_append_only();

-- -----------------------------------------------------------------------------
-- 4. Direct-update bypass guard on public.locations
--    Client roles (authenticated / anon) may keep editing location METADATA
--    through the existing RLS update policy, but can no longer touch the
--    lifecycle columns directly: no reason, no audit event, no blocker check
--    and no transition rule would apply. SECURITY DEFINER functions run as
--    their owner, so public.transition_location_lifecycle and
--    public.provision_location are unaffected.
-- -----------------------------------------------------------------------------
create or replace function private.locations_guard_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.active is distinct from true or new.archived_at is not null then
        raise exception 'Locations are created active; use public.transition_location_lifecycle to change lifecycle state'
          using errcode = '42501';
      end if;
    elsif new.active is distinct from old.active
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Location lifecycle state can only change through public.transition_location_lifecycle'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.locations_guard_lifecycle() from public, anon, authenticated;

drop trigger if exists locations_guard_lifecycle on public.locations;
create trigger locations_guard_lifecycle
  before insert or update on public.locations
  for each row execute function private.locations_guard_lifecycle();

-- -----------------------------------------------------------------------------
-- 5. Hard-delete protection
--    (a) No DELETE/TRUNCATE privilege is granted to client roles (re-asserted
--        idempotently). (b) A trigger rejects any DELETE executed as a client
--        role. No SECURITY DEFINER function in this schema deletes locations
--        (asserted by pgTAP), so no end-user path can remove a row. Privileged
--        maintenance sessions (postgres / service_role) remain possible for
--        break-glass operations such as test-fixture teardown, and the
--        lifecycle audit FK still blocks removal of any location that has
--        lifecycle history.
-- -----------------------------------------------------------------------------
revoke delete, truncate on table public.locations from public, anon, authenticated;

create or replace function private.locations_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Locations cannot be deleted; deactivate and archive them instead'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.locations_forbid_delete() from public, anon, authenticated;

drop trigger if exists locations_forbid_delete on public.locations;
create trigger locations_forbid_delete
  before delete on public.locations
  for each row execute function private.locations_forbid_delete();

-- -----------------------------------------------------------------------------
-- 6. Blocker analysis
--    Classification per action (HARD blocks the transition, WARNING does not).
--    HISTORICAL records (closed sessions, finalized tip pools, completed
--    tasks, ledger rows, assignments) never block and are only counted.
--    Counts are bounded at 1000 per category; only counts, never rows.
-- -----------------------------------------------------------------------------
create or replace function private.location_lifecycle_blockers(p_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_result jsonb;
begin
  select l.time_zone into v_tz from public.locations l where l.id = p_location_id;
  if v_tz is null then
    return '[]'::jsonb;
  end if;
  v_today := (now() at time zone v_tz)::date;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', v.code,
      'count', v.cnt,
      'capped', v.cnt >= 1000,
      'deactivate', v.on_deactivate,
      'archive', v.on_archive
    ) order by v.ord
  ), '[]'::jsonb)
  into v_result
  from (values
    (1, 'ACTIVE_SERVICE_SESSIONS',
      (select count(*) from (select 1 from public.service_sessions s
        where s.location_id = p_location_id and s.status = 'active' limit 1000) x),
      'hard', 'hard'),
    (2, 'OPEN_SEATINGS',
      (select count(*) from (select 1 from public.seatings st
        where st.location_id = p_location_id and st.status = 'seated' limit 1000) x),
      'hard', 'hard'),
    (3, 'PLANNED_SERVICE_SESSIONS',
      (select count(*) from (select 1 from public.service_sessions s
        where s.location_id = p_location_id and s.status = 'planned' limit 1000) x),
      'warning', 'hard'),
    (4, 'OPEN_TASKS',
      (select count(*) from (select 1 from public.tasks t
        where t.location_id = p_location_id
          and t.status in ('open', 'in_progress', 'blocked') limit 1000) x),
      'warning', 'hard'),
    (5, 'ACTIVE_RECURRENCE_RULES',
      (select count(*) from (select 1 from public.task_recurrence_rules r
        where r.location_id = p_location_id and r.active limit 1000) x),
      'warning', 'hard'),
    (6, 'DRAFT_TIP_POOLS',
      (select count(*) from (select 1 from public.tip_pools tp
        where tp.location_id = p_location_id and tp.status = 'draft' limit 1000) x),
      'warning', 'hard'),
    (7, 'PUBLISHED_FUTURE_SHIFTS',
      (select count(*) from (select 1 from public.shifts sh
        join public.schedule_periods sp on sp.id = sh.schedule_period_id
        where sh.location_id = p_location_id
          and sp.status = 'published'
          and sh.starts_at > now() limit 1000) x),
      'warning', 'hard'),
    (8, 'DRAFT_SCHEDULE_PERIODS',
      (select count(*) from (select 1 from public.schedule_periods sp
        where sp.location_id = p_location_id
          and sp.status = 'draft'
          and sp.ends_on >= v_today limit 1000) x),
      'warning', 'hard'),
    (9, 'OPEN_ORDER_DRAFTS',
      (select count(*) from (select 1 from public.inventory_order_drafts d
        where d.location_id = p_location_id and d.status = 'draft' limit 1000) x),
      'warning', 'hard'),
    (10, 'STAGED_IMPORT_BATCHES',
      (select count(*) from (select 1 from public.inventory_import_batches b
        where b.location_id = p_location_id and b.status = 'staged' limit 1000) x),
      'warning', 'hard')
  ) as v(ord, code, cnt, on_deactivate, on_archive)
  where v.cnt > 0;

  return v_result;
end;
$$;

revoke all on function private.location_lifecycle_blockers(uuid) from public, anon, authenticated;

create or replace function private.location_lifecycle_retained(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'locationAssignments',
      (select count(*) from (select 1 from public.location_memberships m
        where m.location_id = p_location_id limit 1000) x),
    'closedServiceSessions',
      (select count(*) from (select 1 from public.service_sessions s
        where s.location_id = p_location_id and s.status = 'closed' limit 1000) x),
    'shifts',
      (select count(*) from (select 1 from public.shifts sh
        where sh.location_id = p_location_id limit 1000) x),
    'finalizedTipPools',
      (select count(*) from (select 1 from public.tip_pools tp
        where tp.location_id = p_location_id and tp.status = 'finalized' limit 1000) x),
    'completedTasks',
      (select count(*) from (select 1 from public.tasks t
        where t.location_id = p_location_id
          and t.status in ('completed', 'cancelled') limit 1000) x),
    'inventoryAdjustments',
      (select count(*) from (select 1 from public.inventory_adjustments a
        where a.location_id = p_location_id limit 1000) x),
    'lifecycleEvents',
      (select count(*) from (select 1 from public.location_lifecycle_events e
        where e.location_id = p_location_id limit 1000) x)
  );
$$;

revoke all on function private.location_lifecycle_retained(uuid) from public, anon, authenticated;

-- Informational readiness reader. The transition RPC re-checks everything
-- itself inside its own transaction; this result is never trusted.
create or replace function public.get_location_lifecycle_readiness(p_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_loc public.locations%rowtype;
  v_status text;
  v_blockers jsonb;
  v_deactivate_blocked boolean;
  v_archive_blocked boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_location_id is null then
    raise exception 'Location ID is required' using errcode = '22023';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  if not found then
    raise exception 'Location % does not exist', p_location_id using errcode = 'P0002';
  end if;

  if not private.can_manage_location_lifecycle(v_loc.organization_id) then
    raise exception 'Unauthorized: location lifecycle requires management authority over organization %', v_loc.organization_id
      using errcode = '42501';
  end if;

  v_status := private.location_lifecycle_status(v_loc.active, v_loc.archived_at);
  v_blockers := private.location_lifecycle_blockers(v_loc.id);

  select coalesce(bool_or(b ->> 'deactivate' = 'hard'), false),
         coalesce(bool_or(b ->> 'archive' = 'hard'), false)
  into v_deactivate_blocked, v_archive_blocked
  from jsonb_array_elements(v_blockers) b;

  return jsonb_build_object(
    'locationId', v_loc.id,
    'organizationId', v_loc.organization_id,
    'status', v_status,
    'canDeactivate', v_status = 'active' and not v_deactivate_blocked,
    'canReactivate', v_status = 'inactive',
    'canArchive', v_status = 'inactive' and not v_archive_blocked,
    'canRestoreArchive', v_status = 'archived',
    'blockers', v_blockers,
    'retained', private.location_lifecycle_retained(v_loc.id)
  );
end;
$$;

revoke all on function public.get_location_lifecycle_readiness(uuid) from public, anon;
grant execute on function public.get_location_lifecycle_readiness(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Transactional transition RPC
--    State machine:
--      deactivate       active   -> inactive
--      reactivate       inactive -> active
--      archive          inactive -> archived
--      restore_archive  archived -> inactive   (never straight to active)
--    Custom SQLSTATEs: LC001 blocked, LC002 invalid transition, LC003 state
--    conflict (expected state no longer matches).
-- -----------------------------------------------------------------------------
create or replace function public.transition_location_lifecycle(
  p_location_id uuid,
  p_action text,
  p_reason text,
  p_expected_status text default null
)
returns public.locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org uuid;
  v_loc public.locations%rowtype;
  v_action text;
  v_reason text;
  v_prev text;
  v_next text;
  v_blockers jsonb;
  v_hard jsonb;
begin
  -- 1. Authentication (actor is NEVER a parameter)
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_location_id is null then
    raise exception 'Location ID is required' using errcode = '22023';
  end if;

  -- 2. Resolve the owning organization from trusted persisted data and verify
  --    authority BEFORE taking any lock (organization_id is immutable).
  select l.organization_id into v_org from public.locations l where l.id = p_location_id;
  if v_org is null then
    raise exception 'Location % does not exist', p_location_id using errcode = 'P0002';
  end if;
  if not private.can_manage_location_lifecycle(v_org) then
    raise exception 'Unauthorized: location lifecycle requires management authority over organization %', v_org
      using errcode = '42501';
  end if;

  -- 3. Input validation
  v_action := lower(trim(coalesce(p_action, '')));
  if v_action not in ('deactivate', 'reactivate', 'archive', 'restore_archive') then
    raise exception 'Invalid lifecycle action: %', coalesce(p_action, '<null>') using errcode = '22023';
  end if;
  v_reason := trim(coalesce(p_reason, ''));
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'A reason of 3 to 500 characters is required' using errcode = '22023';
  end if;
  if p_expected_status is not null and p_expected_status not in ('active', 'inactive', 'archived') then
    raise exception 'Invalid expected status: %', p_expected_status using errcode = '22023';
  end if;

  -- 4. Serialize against every other transition and (via the guards in section
  --    8) against every operational writer: lock the row, then re-read it.
  select * into v_loc from public.locations where id = p_location_id for no key update;
  if not found then
    raise exception 'Location % does not exist', p_location_id using errcode = 'P0002';
  end if;

  v_prev := private.location_lifecycle_status(v_loc.active, v_loc.archived_at);

  if p_expected_status is not null and p_expected_status <> v_prev then
    raise exception 'Location state changed: expected %, found %', p_expected_status, v_prev
      using errcode = 'LC003';
  end if;

  -- 5. Transition validity
  v_next := case
    when v_action = 'deactivate' and v_prev = 'active' then 'inactive'
    when v_action = 'reactivate' and v_prev = 'inactive' then 'active'
    when v_action = 'archive' and v_prev = 'inactive' then 'archived'
    when v_action = 'restore_archive' and v_prev = 'archived' then 'inactive'
    else null
  end;
  if v_next is null then
    raise exception 'Cannot % a location that is %', replace(v_action, '_', ' '), v_prev
      using errcode = 'LC002';
  end if;

  -- 6. Transactional blocker re-check (hard blockers only; warnings are
  --    recorded in the audit snapshot). Nothing is closed or finalized.
  v_blockers := '[]'::jsonb;
  if v_action in ('deactivate', 'archive') then
    v_blockers := private.location_lifecycle_blockers(v_loc.id);
    select coalesce(jsonb_agg(b), '[]'::jsonb) into v_hard
    from jsonb_array_elements(v_blockers) b
    where b ->> v_action = 'hard';
    if jsonb_array_length(v_hard) > 0 then
      raise exception 'Cannot % this location while unresolved operational work exists', v_action
        using errcode = 'LC001', detail = v_hard::text;
    end if;
  end if;

  -- 7. State change + audit event: one statement pair, one transaction.
  update public.locations
  set active = (v_next = 'active'),
      archived_at = case when v_next = 'archived' then now() else null end
  where id = v_loc.id
  returning * into v_loc;

  insert into public.location_lifecycle_events (
    location_id, organization_id, actor_profile_id,
    action, previous_state, new_state, reason, blockers_snapshot, changed_at
  ) values (
    v_loc.id, v_loc.organization_id, v_actor,
    v_action, v_prev, v_next, v_reason, v_blockers, now()
  );

  return v_loc;
end;
$$;

revoke all on function public.transition_location_lifecycle(uuid, text, text, text) from public, anon;
grant execute on function public.transition_location_lifecycle(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Operational write guards
--    NEW operational work is rejected at a location that is not ACTIVE. Only
--    INSERT (and the activation / re-activation edges below) are guarded:
--    closing a session, finalizing a draft tip pool, completing or cancelling
--    a task, corrections and every read remain possible, and historical rows
--    are never touched. The location row is read FOR SHARE so a concurrent
--    transition (which holds FOR NO KEY UPDATE) and a concurrent writer
--    serialize: either the writer commits first and the transition then sees
--    its work as a blocker, or the transition commits first and the writer is
--    rejected.
--
--    Deliberately NOT guarded (and why):
--      * inventory_stock -- zero-balance rows are auto-seeded for EVERY
--        location of an organization whenever a catalog product is created;
--        guarding it would break product creation for the whole tenant.
--        Stock changes are guarded through inventory_adjustments (the ledger).
--      * configuration (shift_templates, dining_areas/tables, floor_templates,
--        operating_hours, shift_kind_defaults, checklist_templates,
--        inventory_freshness_rules, inventory_saved_views) -- not operational
--        activity; managers may still prepare or correct them.
--      * payroll_* and attendance_identity_links -- organization-scoped, no
--        location relationship.
-- -----------------------------------------------------------------------------
create or replace function private.guard_location_operational_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_archived_at timestamptz;
begin
  select l.active, l.archived_at
  into v_active, v_archived_at
  from public.locations l
  where l.id = new.location_id
  for share;

  if not found then
    return new; -- the foreign key reports the missing location
  end if;

  if not v_active then
    raise exception 'LOCATION_NOT_ACTIVE: % is not allowed because the location is %',
      tg_table_name,
      case when v_archived_at is not null then 'archived' else 'inactive' end
      using errcode = '55000',
            hint = 'Reactivate the location (restore it from the archive first if archived) before starting new operational work.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_location_operational_write() from public, anon, authenticated;

do $guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'schedule_periods',
    'shifts',
    'service_sessions',
    'seatings',
    'tasks',
    'checklist_instances',
    'task_recurrence_rules',
    'tip_pools',
    'inventory_adjustments',
    'inventory_order_drafts',
    'inventory_import_batches',
    'inventory_date_lots'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_location_lifecycle_guard', v_table);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function private.guard_location_operational_write()',
      v_table || '_location_lifecycle_guard', v_table
    );
  end loop;
end
$guards$;

-- Starting (activating) a planned service session is new operational work too.
drop trigger if exists service_sessions_location_lifecycle_activate_guard on public.service_sessions;
create trigger service_sessions_location_lifecycle_activate_guard
  before update on public.service_sessions
  for each row
  when (new.status = 'active' and old.status is distinct from 'active')
  execute function private.guard_location_operational_write();

-- New staff assignments (and re-activating an inactive assignment) are denied
-- on every write path, not only inside apply_location_assignment_changes.
drop trigger if exists location_memberships_location_lifecycle_guard on public.location_memberships;
create trigger location_memberships_location_lifecycle_guard
  before insert on public.location_memberships
  for each row
  when (new.active)
  execute function private.guard_location_operational_write();

drop trigger if exists location_memberships_location_lifecycle_activate_guard on public.location_memberships;
create trigger location_memberships_location_lifecycle_activate_guard
  before update on public.location_memberships
  for each row
  when (new.active and not old.active)
  execute function private.guard_location_operational_write();
