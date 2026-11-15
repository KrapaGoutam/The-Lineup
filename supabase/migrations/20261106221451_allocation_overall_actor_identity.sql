-- V2-005.001: authenticated actor identity is independent of tenant affiliation.
-- Only attribution FKs change. Participant membership and tenant/location/session
-- FKs, RLS, RPC signatures, graph DML revocations and begin_board_write stay intact.
begin;

-- Validate the replacement reference BEFORE retiring each membership reference.
-- Existing session profile FKs already enforce started_by / closed_by identity.
alter table public.board_events
  add constraint board_events_actor_profile_fk foreign key (actor_profile_id)
    references public.profiles(id);
alter table public.table_rotation_entries
  add constraint table_rotation_entries_assigned_profile_fk foreign key (assigned_by)
    references public.profiles(id),
  add constraint table_rotation_entries_ended_profile_fk foreign key (ended_by)
    references public.profiles(id);

alter table public.service_sessions drop constraint service_started_by_member_fk;
alter table public.service_sessions drop constraint service_closed_by_member_fk;
alter table public.board_events drop constraint board_events_organization_id_actor_profile_id_fkey;
alter table public.table_rotation_entries drop constraint table_rotation_entries_organization_id_assigned_by_fkey;
alter table public.table_rotation_entries drop constraint table_rotation_entries_ended_by_fk;

create index service_sessions_started_actor_idx on public.service_sessions(started_by);
create index service_sessions_closed_actor_idx on public.service_sessions(closed_by) where closed_by is not null;
create index board_events_actor_profile_idx on public.board_events(actor_profile_id);
create index table_rotation_entries_assigned_actor_idx on public.table_rotation_entries(assigned_by);
create index table_rotation_entries_ended_actor_idx on public.table_rotation_entries(ended_by) where ended_by is not null;

-- Standalone #306 has no backend-enforcement dependency. When #305 is installed,
-- use its exact assertion after authority/location verification and before data access.
create function private.assert_board_module_if_installed(p_location_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_assertion regprocedure := to_regprocedure('private.assert_location_module_enabled(uuid,public.location_module_key)');
begin
  if v_assertion is not null then
    -- Function name comes from the verified catalog identity, never request text.
    execute format('select %s($1, $2)', v_assertion::oid::regproc)
      using p_location_id, 'table_allocation'::public.location_module_key;
  end if;
end;
$$;
revoke all on function private.assert_board_module_if_installed(uuid) from public, anon, authenticated;

-- Same creation/date/concurrency contract; all three persisted Overall tiers may
-- open a floor, as may the existing organization manager/assistant/host roles.
create or replace function private.get_or_create_active_session(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_time_zone text;
  v_today date;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;

  if not private.can_operate_board(p_organization_id, p_location_id) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  select l.time_zone into v_time_zone
  from public.locations l
  where l.id = p_location_id and l.organization_id = p_organization_id;
  if v_time_zone is null then
    raise exception 'That location does not belong to this restaurant.' using errcode = '42501';
  end if;

  perform private.assert_board_module_if_installed(p_location_id);

  -- A previous day is never opened or created (its board is read-only; the
  -- lock helper would reject any write anyway). Future dates keep working
  -- as before so a manager can stage tomorrow's floor.
  v_today := (now() at time zone v_time_zone)::date;
  if p_service_date < v_today then
    raise exception 'This board is read-only -- it is a previous day''s service.';
  end if;

  select s.id into v_session_id
  from public.service_sessions s
  where s.location_id = p_location_id
    and s.service_date = p_service_date
    and s.meal_period = 'service'
    and s.status = 'active';
  if v_session_id is not null then
    return v_session_id;
  end if;

  if not (
    exists (select 1 from public.overall_roles r
            where r.profile_id = (select auth.uid())
              and r.role in ('owner', 'manager', 'assistant_manager'))
    or private.has_board_role(
      p_organization_id,
      array['owner','general_manager','shift_manager','host']::public.app_role[]
    )
  ) then
    raise exception 'No active floor for today yet -- ask a manager or host to add the first server column.';
  end if;

  begin
    insert into public.service_sessions (
      organization_id, location_id, service_date, meal_period, status, started_at, started_by
    )
    values (
      p_organization_id, p_location_id, p_service_date, 'service', 'active', now(), (select auth.uid())
    )
    returning id into v_session_id;

    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, v_session_id, 1);

    return v_session_id;
  exception
    when unique_violation then
      -- A concurrent caller opened the same board first; theirs is as valid.
      select s.id into v_session_id
      from public.service_sessions s
      where s.location_id = p_location_id
        and s.service_date = p_service_date
        and s.meal_period = 'service'
        and s.status = 'active';
      if v_session_id is null then
        raise exception 'Could not open the board for that date -- a closed session already exists for it.';
      end if;
      return v_session_id;
  end;
end;
$$;

revoke all on function private.get_or_create_active_session(uuid, uuid, date) from public, anon, authenticated;


-- Preserve real actor and authority facts on every forward/reversal event.
-- This is provenance, never an authorization cache. Every RPC still rechecks live
-- roles. Revocation cannot erase old evidence or prevent authorized undo by others.
create or replace function private.emit_board_event(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_event_type public.board_event_type,
  p_payload jsonb,
  p_inverse_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_actor uuid := (select auth.uid());
  v_location uuid;
  v_name text;
  v_overall text;
  v_local text;
  v_roles public.app_role[];
  v_effective text;
begin
  select s.location_id into v_location from public.service_sessions s
  where s.id = p_service_session_id and s.organization_id = p_organization_id;
  if v_actor is null or v_location is null
     or not private.can_operate_board(p_organization_id, v_location) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  -- One statement snapshot binds the authority decision to its provenance facts,
  -- including when an administrator concurrently revokes a role/assignment.
  select p.display_name, r.role::text, m.roles, lm.role::text
  into v_name, v_overall, v_roles, v_local
  from public.profiles p
  left join public.overall_roles r on r.profile_id = p.id
  left join public.memberships m on m.profile_id = p.id
    and m.organization_id = p_organization_id and m.active
  left join public.location_memberships lm on lm.profile_id = m.profile_id
    and lm.location_id = v_location and lm.active
  where p.id = v_actor and private.can_operate_board(p_organization_id, v_location);
  if not found then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;

  -- Canonical location precedence: MAX(Overall, active location role).
  -- Org roles supply the existing, narrowly bounded pre-assignment legacy case.
  select tier into v_effective from (values
    ('owner', 4), ('manager', 3), ('assistant_manager', 2), ('staff', 1)
  ) tiers(tier, rank)
  where tier = v_overall or tier = v_local
     or (v_local is null and v_overall is null and tier = case
       when 'owner' = any(v_roles) then 'owner'
       when 'general_manager' = any(v_roles) then 'manager'
       when 'shift_manager' = any(v_roles) then 'assistant_manager'
       else 'staff' end)
  order by rank desc limit 1;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  ) values (
    p_organization_id, p_service_session_id, v_actor, p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'v', 2,
      'actor', jsonb_build_object(
        'profile_id', v_actor, 'display_name', v_name,
        'location_id', v_location, 'overall_role', v_overall,
        'organization_roles', coalesce(to_jsonb(v_roles), '[]'::jsonb),
        'location_role', v_local, 'effective_role', v_effective
      )
    ),
    coalesce(p_inverse_payload, '{}'::jsonb) || jsonb_build_object('v', 2)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.emit_board_event(uuid, bigint, public.board_event_type, jsonb, jsonb)
  from public, anon, authenticated;

-- Narrow Allocation display reader; does not widen profiles or memberships RLS.
-- Participants remain real tenant members. Historical columns retain their names.
create function public.board_location_roster(p_organization_id uuid, p_location_id uuid)
returns table(profile_id uuid, display_name text, roles public.app_role[], active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_location_id is null or not private.can_operate_board(p_organization_id, p_location_id) then
    raise exception 'Only an active floor team member can do that.' using errcode = '42501';
  end if;
  -- Compose with staged PR #305 when installed, without requiring it standalone.
  -- Existing authorization and concrete location checks always precede module state.
  perform private.assert_board_module_if_installed(p_location_id);
  return query
  select m.profile_id, p.display_name, m.roles, m.active
  from public.memberships m join public.profiles p on p.id = m.profile_id
  where m.organization_id = p_organization_id and (
    exists (select 1 from public.location_memberships lm
            where lm.location_id = p_location_id and lm.profile_id = m.profile_id and lm.active)
    or exists (select 1 from public.rotation_members rm
               join public.service_sessions s on s.id = rm.service_session_id
               where rm.server_profile_id = m.profile_id and s.location_id = p_location_id
                 and s.organization_id = p_organization_id)
    or exists (select 1 from public.board_events e
               join public.service_sessions s on s.id = e.service_session_id
               where e.actor_profile_id = m.profile_id and s.location_id = p_location_id
                 and s.organization_id = p_organization_id)
    or (
      (select count(*) from public.locations l where l.organization_id = p_organization_id
       and l.active and l.archived_at is null) = 1
      and not exists (select 1 from public.location_memberships lm
                      join public.locations l on l.id = lm.location_id
                      where l.organization_id = p_organization_id)
    )
  ) order by m.created_at, m.profile_id;
end;
$$;
revoke all on function public.board_location_roster(uuid, uuid) from public, anon;
grant execute on function public.board_location_roster(uuid, uuid) to authenticated;

commit;
