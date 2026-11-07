-- Migration: 20261106150000_table_allocation_location_scoping.sql
-- Feature: V2-005.001 - Table Allocation / Rotation Location Scoping
--
-- 1. Redefine private.can_operate_board(p_organization_id, p_location_id):
--    - Requires authenticated caller (auth.uid() IS NOT NULL)
--    - Enforces location existence, active status, unarchived status, and tenant ownership
--    - System-wide Overall roles (owner, manager, assistant_manager) operate any valid location
--    - Organization Owner/GM require the same explicit operational assignment as other scoped users
--    - Scoped users require active membership in the organization
--      AND active location assignment (public.location_memberships) for the target location
--
-- 2. Add private.can_operate_board_for_session(p_organization_id, p_service_session_id):
--    - Security-definer helper to authorize reads on child tables (rotation_members,
--      rotation_rounds, table_rotation_entries, board_events) via their parent session
--
-- 3. Update public.board_add_column:
--    - Validates target server has active org membership (or Overall role)
--    - Validates target server is assigned to this location (or is Overall role or Org Owner/GM)
--
-- 4. Scope SELECT RLS policies on allocation tables:
--    - public.service_sessions
--    - public.dining_tables
--    - public.dining_areas
--    - public.section_assignments
--    - public.rotation_members
--    - public.rotation_rounds
--    - public.table_rotation_entries
--    - public.board_events

-- -----------------------------------------------------------------------------
-- 1. Authority helper: private.can_operate_board
-- -----------------------------------------------------------------------------
create or replace function private.can_operate_board(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select auth.uid()) is not null
    and (
      -- If a specific location is provided, it must belong to p_organization_id,
      -- be active, and not archived.
      p_location_id is null
      or exists (
        select 1
        from public.locations l
        where l.id = p_location_id
          and l.organization_id = p_organization_id
          and l.active = true
          and l.archived_at is null
      )
    )
    and (
      -- Overall roles (owner, manager, assistant_manager) have authority across all locations
      exists (
        select 1
        from public.overall_roles orl
        where orl.profile_id = (select auth.uid())
          and orl.role in ('owner', 'manager', 'assistant_manager')
      )
      -- Floor team members (shift_manager, host, server) must be active org members
      -- AND have an active location_memberships row for the target location
      or (
        private.has_board_role(
          p_organization_id,
          array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
        )
        and (
          case
            when p_location_id is not null then
              exists (
                select 1
                from public.location_memberships lm
                join public.locations l on l.id = lm.location_id
                where lm.profile_id = (select auth.uid())
                  and lm.location_id = p_location_id
                  and lm.active = true
                  and l.organization_id = p_organization_id
                  and l.active = true
                  and l.archived_at is null
              )
              or (
                (select count(*) from public.locations legacy_location
                 where legacy_location.organization_id = p_organization_id
                   and legacy_location.active and legacy_location.archived_at is null) = 1
                and not exists (
                  select 1
                  from public.location_memberships lm
                  join public.locations l on l.id = lm.location_id
                  where l.organization_id = p_organization_id
                )
              )
            else
              exists (
                select 1
                from public.location_memberships lm
                join public.locations l on l.id = lm.location_id
                where lm.profile_id = (select auth.uid())
                  and lm.active = true
                  and l.organization_id = p_organization_id
                  and l.active = true
                  and l.archived_at is null
              )
              or (
                (select count(*) from public.locations legacy_location
                 where legacy_location.organization_id = p_organization_id
                   and legacy_location.active and legacy_location.archived_at is null) = 1
                and not exists (
                  select 1
                  from public.location_memberships lm
                  join public.locations l on l.id = lm.location_id
                  where l.organization_id = p_organization_id
                )
              )
          end
        )
      )
    )
  );
$$;

revoke all on function private.can_operate_board(uuid, uuid) from public, anon;
grant execute on function private.can_operate_board(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Authority helper for session-based child tables
-- -----------------------------------------------------------------------------
create or replace function private.can_operate_board_for_session(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_sessions s
    where s.id = p_service_session_id
      and s.organization_id = p_organization_id
      and private.can_operate_board(s.organization_id, s.location_id)
  );
$$;

revoke all on function private.can_operate_board_for_session(uuid, bigint) from public, anon;
grant execute on function private.can_operate_board_for_session(uuid, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Hardened public.board_add_column with location assignment validation
-- -----------------------------------------------------------------------------
create or replace function public.board_add_column(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_server_profile_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_member_id bigint;
  v_next_position integer;
  v_previous_status public.rotation_status;
begin
  if p_location_id is null or not private.can_operate_board(p_organization_id, p_location_id) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  -- 1. Server must have active membership in this organization (or Overall role)
  if not (
    exists (
      select 1 from public.overall_roles orl
      where orl.profile_id = p_server_profile_id
        and orl.role in ('owner', 'manager', 'assistant_manager')
    )
    or exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id
        and m.profile_id = p_server_profile_id
        and m.active = true
    )
  ) then
    raise exception 'That person is not an active member of this restaurant.';
  end if;

  -- 2. Server must be assigned to this location (or hold an Overall role)
  if not (
    exists (
      select 1 from public.overall_roles orl
      where orl.profile_id = p_server_profile_id
        and orl.role in ('owner', 'manager', 'assistant_manager')
    )
    or exists (
      select 1 from public.location_memberships lm
      where lm.profile_id = p_server_profile_id
        and lm.location_id = p_location_id
        and lm.active = true
    )
    or (
      (select count(*) from public.locations legacy_location
       where legacy_location.organization_id = p_organization_id
         and legacy_location.active and legacy_location.archived_at is null) = 1
      and not exists (
        select 1
        from public.location_memberships lm
        join public.locations l on l.id = lm.location_id
        where l.organization_id = p_organization_id
      )
    )
  ) then
    raise exception 'That person is not assigned to this location.';
  end if;

  -- Target eligibility is checked before creating any session or event.
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.begin_board_write(p_organization_id, v_session_id);

  -- begin_board_write holds the session row lock, so max(position)+1 is
  -- computed against a state that already reflects every other writer.
  select coalesce(max(position), -1) + 1 into v_next_position
  from public.rotation_members
  where service_session_id = v_session_id;

  select m.status into v_previous_status
  from public.rotation_members m
  where m.service_session_id = v_session_id and m.server_profile_id = p_server_profile_id;

  insert into public.rotation_members (
    organization_id, service_session_id, server_profile_id, status, position
  )
  values (p_organization_id, v_session_id, p_server_profile_id, 'active', v_next_position)
  on conflict (service_session_id, server_profile_id)
  do update set status = 'active', updated_at = now()
  returning id into v_member_id;

  perform private.emit_board_event(
    p_organization_id, v_session_id, 'add_column',
    jsonb_build_object('member_id', v_member_id, 'server_profile_id', p_server_profile_id),
    jsonb_build_object(
      'member_id', v_member_id,
      'status', coalesce(v_previous_status::text, 'unavailable')
    )
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_member_id;
end;
$$;

revoke all on function public.board_add_column(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.board_add_column(uuid, uuid, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Scope SELECT RLS policies on allocation tables
-- -----------------------------------------------------------------------------
-- service_sessions
drop policy if exists service_sessions_select_member on public.service_sessions;
create policy service_sessions_select_member on public.service_sessions
  for select to authenticated
  using (private.can_operate_board(organization_id, location_id));

-- dining_tables
drop policy if exists dining_tables_select_member on public.dining_tables;
create policy dining_tables_select_member on public.dining_tables
  for select to authenticated
  using (private.can_operate_board(organization_id, location_id));

-- dining_areas
drop policy if exists dining_areas_select_member on public.dining_areas;
create policy dining_areas_select_member on public.dining_areas
  for select to authenticated
  using (private.can_operate_board(organization_id, location_id));

-- section_assignments
drop policy if exists section_assignments_select_member on public.section_assignments;
create policy section_assignments_select_member on public.section_assignments
  for select to authenticated
  using (private.can_operate_board(organization_id, location_id));

-- rotation_members
drop policy if exists rotation_members_select_member on public.rotation_members;
create policy rotation_members_select_member on public.rotation_members
  for select to authenticated
  using (private.can_operate_board_for_session(organization_id, service_session_id));

-- rotation_rounds
drop policy if exists rotation_rounds_select_member on public.rotation_rounds;
create policy rotation_rounds_select_member on public.rotation_rounds
  for select to authenticated
  using (private.can_operate_board_for_session(organization_id, service_session_id));

-- table_rotation_entries
drop policy if exists table_rotation_entries_select_member on public.table_rotation_entries;
create policy table_rotation_entries_select_member on public.table_rotation_entries
  for select to authenticated
  using (private.can_operate_board_for_session(organization_id, service_session_id));

-- board_events
drop policy if exists board_events_select_member on public.board_events;
create policy board_events_select_member on public.board_events
  for select to authenticated
  using (private.can_operate_board_for_session(organization_id, service_session_id));

-- -----------------------------------------------------------------------------
-- 5. Performance index for active profile location membership lookups
-- -----------------------------------------------------------------------------
create index if not exists location_memberships_active_profile_idx
  on public.location_memberships (profile_id)
  where active;

-- Existing manager FOR ALL policies are permissive, including SELECT.
-- Bound those policies too: replacing only the named SELECT policy is insufficient.
create policy dining_tables_location_scope on public.dining_tables
  as restrictive for all to authenticated
  using (private.can_operate_board(organization_id, location_id))
  with check (private.can_operate_board(organization_id, location_id));
create policy dining_areas_location_scope on public.dining_areas
  as restrictive for all to authenticated
  using (private.can_operate_board(organization_id, location_id))
  with check (private.can_operate_board(organization_id, location_id));
