-- Migration: 20261106120000_module_backend_enforcement.sql
-- Subfeature V2-004.004: Per-Location Backend Module Enforcement
--
-- STAGED BY DEFAULT. Applying this migration changes NO behaviour: every guard
-- below returns "allowed" until public.module_enforcement_settings.mode is set
-- to 'active', and the database REFUSES to switch it on while any ACTIVE
-- location lacks an explicit configuration row for every module key.
--   * no module configuration row is inserted, guessed or backfilled
--     (legacy reconciliation remains V2-008.004 / owner-approved settings);
--   * no existing table, role or grant is widened;
--   * existing authorization is untouched -- the module check is an ADDITIONAL
--     restriction placed after the existing access check, never a replacement.
--
-- Contents
--   1. public.module_enforcement_settings   single-row activation switch
--   2. private.module_enforcement_readiness  read-only reconciliation report
--   3. activation guard trigger              readiness is enforced BY THE DATABASE
--   4. Pure decision helpers                 location_module_allows (+ parent lookups)
--   5. Raising assertion for RPC prologues
--   6. RPC seams: tasks_begin / inventory_begin / begin_board_write
--   7. Restrictive RLS policies on location-bound operational tables
--
-- What the database CAN and CANNOT cover is recorded in
-- docs/v2.0/features/004-location-module-configuration/004-backend-enforcement/ENTRY_POINT_MATRIX.md.
-- Payroll, Recipes, Team, Attendance links and the org-level tip/time-off tables
-- carry no location_id, so a location-scoped module check is impossible there
-- without the V2-005 location-binding redesign; those are enforced in the
-- server layer only and recorded as such.

-- -----------------------------------------------------------------------------
-- 1. Activation switch (exactly one row, 'staged' until an operator activates)
-- -----------------------------------------------------------------------------
create table if not exists public.module_enforcement_settings (
  singleton boolean primary key default true,
  mode text not null default 'staged',
  activated_at timestamptz,
  activation_reference text,
  updated_at timestamptz not null default now(),
  constraint module_enforcement_singleton check (singleton),
  constraint module_enforcement_mode_valid check (mode in ('staged', 'active')),
  constraint module_enforcement_active_has_evidence check (
    mode = 'staged'
    or (activated_at is not null and nullif(btrim(activation_reference), '') is not null)
  )
);

comment on table public.module_enforcement_settings is
  'V2-004.004 activation switch. staged = module guards allow everything (legacy behaviour); active = explicit Enabled row required. Changed only by a platform operator; the readiness trigger refuses activation while any active location is unconfigured.';

alter table public.module_enforcement_settings enable row level security;

drop policy if exists module_enforcement_settings_read on public.module_enforcement_settings;
create policy module_enforcement_settings_read on public.module_enforcement_settings
  for select to authenticated
  using (true);

revoke all on public.module_enforcement_settings from public, anon, authenticated;
grant select on public.module_enforcement_settings to authenticated;

insert into public.module_enforcement_settings (singleton, mode)
values (true, 'staged')
on conflict (singleton) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Readiness report (read-only; NEVER inserts or repairs a row)
--    "Active location" = active and not archived. A location is ready only when
--    it has an explicit row for EVERY value of public.location_module_key.
--    Duplicates are impossible (primary key) and malformed metadata is rejected
--    by the table CHECK, so key coverage is the remaining invariant.
-- -----------------------------------------------------------------------------
create or replace function private.module_enforcement_readiness()
returns table (
  organization_id uuid,
  location_id uuid,
  lifecycle text,
  expected_keys text[],
  configured_keys text[],
  missing_keys text[],
  ready boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with expected as (
    select array(
      select e::text from unnest(enum_range(null::public.location_module_key)) e order by 1
    ) as keys
  )
  select
    l.organization_id,
    l.id,
    'active'::text,
    x.keys,
    coalesce(c.keys, '{}'::text[]),
    array(select k from unnest(x.keys) k where k <> all (coalesce(c.keys, '{}'::text[])) order by k),
    not exists (select 1 from unnest(x.keys) k where k <> all (coalesce(c.keys, '{}'::text[])))
  from public.locations l
  cross join expected x
  left join lateral (
    select array_agg(m.module_key::text order by m.module_key::text) as keys
    from public.location_module_configs m
    where m.location_id = l.id
  ) c on true
  where l.active and l.archived_at is null
$$;

revoke all on function private.module_enforcement_readiness() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Activation guard. Only a platform operator (no end-user JWT) may change the
--    switch, never delete it, and 'active' requires (a) an activation
--    reference (owner approval record) and (b) a fully reconciled estate.
-- -----------------------------------------------------------------------------
create or replace function private.module_enforcement_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unready integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'The module enforcement switch cannot be deleted.' using errcode = '55000';
  end if;

  if tg_op = 'INSERT' then
    if new.mode <> 'staged' then
      raise exception 'The module enforcement switch is created staged.' using errcode = '55000';
    end if;
    return new;
  end if;

  if (select auth.uid()) is not null then
    raise exception 'Only a platform operator can change module enforcement.' using errcode = '42501';
  end if;
  if new.singleton is distinct from old.singleton then
    raise exception 'The module enforcement switch is a single row.' using errcode = '55000';
  end if;

  if new.mode = 'active' and old.mode <> 'active' then
    if nullif(btrim(coalesce(new.activation_reference, '')), '') is null then
      raise exception 'Activation needs a reference to the owner approval record.' using errcode = '55000';
    end if;
    select count(*) into v_unready from private.module_enforcement_readiness() r where not r.ready;
    if v_unready > 0 then
      raise exception 'Module enforcement cannot be activated: % active location(s) lack explicit configuration for every module.', v_unready
        using errcode = '55000',
              hint = 'Reconcile each active location (owner-approved), then retry. Nothing was changed.';
    end if;
    new.activated_at := now();
  elsif new.mode = 'staged' then
    new.activated_at := null;
    new.activation_reference := null;
  end if;

  new.updated_at := now();
  return new;
end
$$;

revoke all on function private.module_enforcement_settings_guard() from public, anon, authenticated;

drop trigger if exists module_enforcement_settings_guard on public.module_enforcement_settings;
create trigger module_enforcement_settings_guard
  before insert or update or delete on public.module_enforcement_settings
  for each row execute function private.module_enforcement_settings_guard();

-- -----------------------------------------------------------------------------
-- 4. Decision helpers (pure reads; NO actor parameter, NO authorization granted)
--    Staged -> true. Active -> the location must be active, not archived, and
--    have an explicit is_enabled = true row for the module. A missing row, a
--    NULL location or any other state is false. These helpers answer ONLY the
--    module question; role/membership checks stay where they already are.
-- -----------------------------------------------------------------------------
create or replace function private.module_enforcement_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.mode = 'active' from public.module_enforcement_settings s where s.singleton),
    false
  )
$$;

create or replace function private.location_module_allows(
  p_location_id uuid,
  p_module public.location_module_key
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not private.module_enforcement_active()
    or exists (
      select 1
      from public.locations l
      join public.location_module_configs c on c.location_id = l.id
      where l.id = p_location_id
        and l.active
        and l.archived_at is null
        and c.module_key = p_module
        and c.is_enabled
    )
$$;

-- Parent lookups for child tables that carry no location_id of their own.
create or replace function private.service_session_module_allows(p_service_session_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.module_enforcement_active() or exists (
    select 1 from public.service_sessions s
    where s.id = p_service_session_id
      and private.location_module_allows(s.location_id, 'table_allocation')
  )
$$;

create or replace function private.seating_module_allows(p_seating_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.module_enforcement_active() or exists (
    select 1 from public.seatings s
    where s.id = p_seating_id
      and private.location_module_allows(s.location_id, 'table_allocation')
  )
$$;

create or replace function private.shift_module_allows(p_shift_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.module_enforcement_active() or exists (
    select 1 from public.shifts s
    where s.id = p_shift_id
      and private.location_module_allows(s.location_id, 'schedule')
  )
$$;

create or replace function private.tip_pool_module_allows(p_tip_pool_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.module_enforcement_active() or exists (
    select 1 from public.tip_pools p
    where p.id = p_tip_pool_id
      and private.location_module_allows(p.location_id, 'tips')
  )
$$;

create or replace function private.tip_interval_module_allows(p_tip_interval_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.module_enforcement_active() or exists (
    select 1
    from public.tip_intervals i
    join public.tip_pools p on p.id = i.tip_pool_id
    where i.id = p_tip_interval_id
      and private.location_module_allows(p.location_id, 'tips')
  )
$$;

-- A task-scoped row hangs off a task and/or a checklist instance. A row tied to
-- neither (a generic notification) is not location-bound and stays visible.
create or replace function private.task_scope_module_allows(
  p_task_id uuid,
  p_checklist_instance_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    not private.module_enforcement_active()
    or (p_task_id is null and p_checklist_instance_id is null)
    or (
      p_task_id is not null
      and exists (
        select 1 from public.tasks t
        where t.id = p_task_id and private.location_module_allows(t.location_id, 'tasks')
      )
    )
    or (
      p_task_id is null
      and p_checklist_instance_id is not null
      and exists (
        select 1 from public.checklist_instances i
        where i.id = p_checklist_instance_id and private.location_module_allows(i.location_id, 'tasks')
      )
    )
$$;

revoke all on function private.module_enforcement_active() from public, anon;
revoke all on function private.location_module_allows(uuid, public.location_module_key) from public, anon;
revoke all on function private.service_session_module_allows(bigint) from public, anon;
revoke all on function private.seating_module_allows(bigint) from public, anon;
revoke all on function private.shift_module_allows(bigint) from public, anon;
revoke all on function private.tip_pool_module_allows(bigint) from public, anon;
revoke all on function private.tip_interval_module_allows(bigint) from public, anon;
revoke all on function private.task_scope_module_allows(uuid, uuid) from public, anon;
-- Policies evaluate these as the calling role.
grant execute on function private.module_enforcement_active() to authenticated;
grant execute on function private.location_module_allows(uuid, public.location_module_key) to authenticated;
grant execute on function private.service_session_module_allows(bigint) to authenticated;
grant execute on function private.seating_module_allows(bigint) to authenticated;
grant execute on function private.shift_module_allows(bigint) to authenticated;
grant execute on function private.tip_pool_module_allows(bigint) to authenticated;
grant execute on function private.tip_interval_module_allows(bigint) to authenticated;
grant execute on function private.task_scope_module_allows(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Raising assertion for RPC prologues. Called only AFTER the caller has
--    passed the existing access check, so an unauthorized caller learns nothing
--    about a location's module configuration.
-- -----------------------------------------------------------------------------
create or replace function private.assert_location_module_enabled(
  p_location_id uuid,
  p_module public.location_module_key
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.location_module_allows(p_location_id, p_module) then
    raise exception 'This module is turned off for this location.'
      using errcode = '42501', detail = 'module_unavailable';
  end if;
end
$$;

revoke all on function private.assert_location_module_enabled(uuid, public.location_module_key) from public, anon;

-- -----------------------------------------------------------------------------
-- 6. RPC seams. Every task / checklist / inventory / board RPC already funnels
--    through one prologue helper; each is re-declared VERBATIM with the module
--    assertion added after the existing authorization.
-- -----------------------------------------------------------------------------
create or replace function private.tasks_begin(p_organization_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if not private.tasks_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to tasks for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'tasks');
end;
$function$;

create or replace function private.inventory_begin(p_organization_id uuid, p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  if not private.inventory_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to Bar Inventory for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'bar_inventory');
  return v_actor;
end;
$function$;

create or replace function private.begin_board_write(p_organization_id uuid, p_service_session_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_location uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;

  if not private.can_operate_board(p_organization_id, null) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  select s.location_id into v_location
  from public.service_sessions s
  where s.id = p_service_session_id and s.organization_id = p_organization_id
  for no key update;

  if v_location is null then
    raise exception 'That service session does not exist for this restaurant.' using errcode = '42501';
  end if;

  if not private.can_operate_board(p_organization_id, v_location) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  perform private.assert_location_module_enabled(v_location, 'table_allocation');

  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);
  return v_location;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Restrictive RLS policies. One RESTRICTIVE policy per location-bound
--    operational table: it can only REMOVE access that the existing permissive
--    policies grant, so no table is widened. SECURITY DEFINER RPCs bypass RLS
--    and are covered by the section 6 seams; direct PostgREST access (reads,
--    inserts, updates, deletes, Realtime) is covered here.
-- -----------------------------------------------------------------------------
-- Tables clients can only READ (writes happen inside SECURITY DEFINER RPCs):
-- a restrictive SELECT policy is enough and keeps the 'no client write policy' invariants true.

drop policy if exists tasks_module_enforcement on public.tasks;
create policy tasks_module_enforcement on public.tasks
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tasks'));

drop policy if exists task_recurrence_rules_module_enforcement on public.task_recurrence_rules;
create policy task_recurrence_rules_module_enforcement on public.task_recurrence_rules
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tasks'));

drop policy if exists checklist_templates_module_enforcement on public.checklist_templates;
create policy checklist_templates_module_enforcement on public.checklist_templates
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tasks'));

drop policy if exists checklist_instances_module_enforcement on public.checklist_instances;
create policy checklist_instances_module_enforcement on public.checklist_instances
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'tasks'));

drop policy if exists task_assignments_module_enforcement on public.task_assignments;
create policy task_assignments_module_enforcement on public.task_assignments
  as restrictive for select to authenticated
  using (private.task_scope_module_allows(task_id, null));

drop policy if exists task_events_module_enforcement on public.task_events;
create policy task_events_module_enforcement on public.task_events
  as restrictive for select to authenticated
  using (private.task_scope_module_allows(task_id, checklist_instance_id));

drop policy if exists task_notifications_module_enforcement on public.task_notifications;
create policy task_notifications_module_enforcement on public.task_notifications
  as restrictive for select to authenticated
  using (private.task_scope_module_allows(task_id, checklist_instance_id));

drop policy if exists section_assignments_module_enforcement on public.section_assignments;
create policy section_assignments_module_enforcement on public.section_assignments
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists service_sessions_module_enforcement on public.service_sessions;
create policy service_sessions_module_enforcement on public.service_sessions
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists rotation_members_module_enforcement on public.rotation_members;
create policy rotation_members_module_enforcement on public.rotation_members
  as restrictive for select to authenticated
  using (private.service_session_module_allows(service_session_id));

drop policy if exists rotation_rounds_module_enforcement on public.rotation_rounds;
create policy rotation_rounds_module_enforcement on public.rotation_rounds
  as restrictive for select to authenticated
  using (private.service_session_module_allows(service_session_id));

drop policy if exists table_rotation_entries_module_enforcement on public.table_rotation_entries;
create policy table_rotation_entries_module_enforcement on public.table_rotation_entries
  as restrictive for select to authenticated
  using (private.service_session_module_allows(service_session_id));

drop policy if exists board_events_module_enforcement on public.board_events;
create policy board_events_module_enforcement on public.board_events
  as restrictive for select to authenticated
  using (private.service_session_module_allows(service_session_id));

drop policy if exists inventory_stock_module_enforcement on public.inventory_stock;
create policy inventory_stock_module_enforcement on public.inventory_stock
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_adjustments_module_enforcement on public.inventory_adjustments;
create policy inventory_adjustments_module_enforcement on public.inventory_adjustments
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_date_lots_module_enforcement on public.inventory_date_lots;
create policy inventory_date_lots_module_enforcement on public.inventory_date_lots
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_freshness_rules_module_enforcement on public.inventory_freshness_rules;
create policy inventory_freshness_rules_module_enforcement on public.inventory_freshness_rules
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_import_batches_module_enforcement on public.inventory_import_batches;
create policy inventory_import_batches_module_enforcement on public.inventory_import_batches
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_order_drafts_module_enforcement on public.inventory_order_drafts;
create policy inventory_order_drafts_module_enforcement on public.inventory_order_drafts
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_order_draft_items_module_enforcement on public.inventory_order_draft_items;
create policy inventory_order_draft_items_module_enforcement on public.inventory_order_draft_items
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_saved_views_module_enforcement on public.inventory_saved_views;
create policy inventory_saved_views_module_enforcement on public.inventory_saved_views
  as restrictive for select to authenticated
  using (private.location_module_allows(location_id, 'bar_inventory'));

drop policy if exists inventory_change_log_module_enforcement on public.inventory_change_log;
create policy inventory_change_log_module_enforcement on public.inventory_change_log
  as restrictive for select to authenticated
  using (location_id is null or private.location_module_allows(location_id, 'bar_inventory'));

-- Tables clients can WRITE directly (existing permissive write policies): restrict every command.

drop policy if exists dining_areas_module_enforcement on public.dining_areas;
create policy dining_areas_module_enforcement on public.dining_areas
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'))
  with check (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists dining_tables_module_enforcement on public.dining_tables;
create policy dining_tables_module_enforcement on public.dining_tables
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'))
  with check (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists floor_templates_module_enforcement on public.floor_templates;
create policy floor_templates_module_enforcement on public.floor_templates
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'))
  with check (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists seatings_module_enforcement on public.seatings;
create policy seatings_module_enforcement on public.seatings
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'table_allocation'))
  with check (private.location_module_allows(location_id, 'table_allocation'));

drop policy if exists seating_tables_module_enforcement on public.seating_tables;
create policy seating_tables_module_enforcement on public.seating_tables
  as restrictive for all to authenticated
  using (private.seating_module_allows(seating_id))
  with check (private.seating_module_allows(seating_id));

drop policy if exists shifts_module_enforcement on public.shifts;
create policy shifts_module_enforcement on public.shifts
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'schedule'))
  with check (private.location_module_allows(location_id, 'schedule'));

drop policy if exists schedule_periods_module_enforcement on public.schedule_periods;
create policy schedule_periods_module_enforcement on public.schedule_periods
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'schedule'))
  with check (private.location_module_allows(location_id, 'schedule'));

drop policy if exists shift_templates_module_enforcement on public.shift_templates;
create policy shift_templates_module_enforcement on public.shift_templates
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'schedule'))
  with check (private.location_module_allows(location_id, 'schedule'));

drop policy if exists shift_kind_defaults_module_enforcement on public.shift_kind_defaults;
create policy shift_kind_defaults_module_enforcement on public.shift_kind_defaults
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'schedule'))
  with check (private.location_module_allows(location_id, 'schedule'));

drop policy if exists shift_assignments_module_enforcement on public.shift_assignments;
create policy shift_assignments_module_enforcement on public.shift_assignments
  as restrictive for all to authenticated
  using (private.shift_module_allows(shift_id))
  with check (private.shift_module_allows(shift_id));

drop policy if exists tip_pools_module_enforcement on public.tip_pools;
create policy tip_pools_module_enforcement on public.tip_pools
  as restrictive for all to authenticated
  using (private.location_module_allows(location_id, 'tips'))
  with check (private.location_module_allows(location_id, 'tips'));

drop policy if exists tip_intervals_module_enforcement on public.tip_intervals;
create policy tip_intervals_module_enforcement on public.tip_intervals
  as restrictive for all to authenticated
  using (private.tip_pool_module_allows(tip_pool_id))
  with check (private.tip_pool_module_allows(tip_pool_id));

drop policy if exists tip_allocations_module_enforcement on public.tip_allocations;
create policy tip_allocations_module_enforcement on public.tip_allocations
  as restrictive for all to authenticated
  using (private.tip_pool_module_allows(tip_pool_id))
  with check (private.tip_pool_module_allows(tip_pool_id));

drop policy if exists tip_interval_participants_module_enforcement on public.tip_interval_participants;
create policy tip_interval_participants_module_enforcement on public.tip_interval_participants
  as restrictive for all to authenticated
  using (private.tip_interval_module_allows(tip_interval_id))
  with check (private.tip_interval_module_allows(tip_interval_id));

