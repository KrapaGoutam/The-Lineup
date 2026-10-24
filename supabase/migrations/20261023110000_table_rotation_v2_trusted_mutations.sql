-- Table Rotation V2 Part 1 / Phases 1B + 1D -- one trusted mutation and audit
-- boundary, atomic reassignment, and complete Undo/Redo.
--
-- Closes: D-01 (cross-actor End), D-05 (Clear Board Undo), D-06 (Clear Cell
-- Undo), D-08 (forgeable board_events); finishes D-02 on the procedural side.
-- Also lands: atomic reassign (End previous owner + Assign in one statement
-- chain), non-destructive Transfer, Remove-server guard, per-board
-- serialization, membership-only board authorization.
--
-- Shape
--   * Every board mutation is a public.board_* RPC with the SAME signature
--     the Server Actions already call, now SECURITY DEFINER with an empty
--     search_path. Each one authenticates auth.uid(), requires an ACTIVE
--     MEMBERSHIP row (never organizations.created_by -- the AUTH-001
--     creator bypass in private.has_org_role is not consulted on this
--     path), derives the location from the session, locks the session, runs
--     the historical/finalized lock against THAT session, and verifies that
--     every round / member id belongs to it. assigned_by is audit metadata
--     only: no authorization decision reads it.
--   * Authenticated clients lose INSERT/UPDATE/DELETE on the rotation graph,
--     the physical ledger, service sessions and board_events; the write
--     policies that paired with those grants are dropped. SELECT is
--     unchanged (Realtime and the Server Component reads keep working).
--   * board_events is append-only to clients. The only mutable column is
--     undone_at, and only inside board_undo/board_redo.
--
-- Compatibility: signatures, argument names and return types are unchanged,
-- so the previous frontend keeps working against this schema. Forward-only.

-- ---------------------------------------------------------------------
-- 1. Authorization helpers (membership-only).
-- ---------------------------------------------------------------------
create or replace function private.has_board_role(
  p_organization_id uuid,
  p_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.active
      and m.roles && p_roles
  );
$$;

-- The single seam for "may this caller operate the board at this location".
-- Today every active floor-team membership operates every location of its
-- organization (Feature 011 open editing). A later profile -> organization
-- membership -> location-access model changes THIS function only.
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
  select private.has_board_role(
    p_organization_id,
    array['owner','general_manager','shift_manager','host','server']::public.app_role[]
  );
$$;

revoke all on function private.has_board_role(uuid, public.app_role[]) from public, anon, authenticated;
revoke all on function private.can_operate_board(uuid, uuid) from public, anon, authenticated;

-- Common preamble of every board mutation. Returns the session's location.
create or replace function private.begin_board_write(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);
  return v_location;
end;
$$;

create or replace function private.assert_round_in_session(
  p_round_id bigint,
  p_service_session_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rotation_rounds r
    where r.id = p_round_id and r.service_session_id = p_service_session_id
  ) then
    raise exception 'That row is not on this board.';
  end if;
end;
$$;

create or replace function private.member_status_in_session(
  p_member_id bigint,
  p_service_session_id bigint
)
returns public.rotation_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.rotation_status;
begin
  select m.status into v_status
  from public.rotation_members m
  where m.id = p_member_id and m.service_session_id = p_service_session_id;

  if v_status is null then
    raise exception 'That column is not on this board.';
  end if;
  return v_status;
end;
$$;

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
begin
  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), p_event_type,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('v', 2),
    coalesce(p_inverse_payload, '{}'::jsonb) || jsonb_build_object('v', 2)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.begin_board_write(uuid, bigint) from public, anon, authenticated;
revoke all on function private.assert_round_in_session(bigint, bigint) from public, anon, authenticated;
revoke all on function private.member_status_in_session(bigint, bigint) from public, anon, authenticated;
revoke all on function private.emit_board_event(uuid, bigint, public.board_event_type, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Entry snapshot / restore / displacement helpers.
-- ---------------------------------------------------------------------
create or replace function private.entry_json(p_entry public.table_rotation_entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'table_label', p_entry.table_label,
    'status', p_entry.status,
    'assigned_by', p_entry.assigned_by,
    'assigned_at', p_entry.assigned_at,
    'ended_at', p_entry.ended_at,
    'ended_by', p_entry.ended_by
  );
$$;

create or replace function private.restore_entry(
  p_organization_id uuid,
  p_round_id bigint,
  p_member_id bigint,
  p_entry jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status,
    assigned_by, assigned_at, ended_at, ended_by
  )
  values (
    p_organization_id, p_round_id, p_member_id,
    p_entry->>'table_label',
    coalesce(p_entry->>'status', 'active'),
    coalesce((p_entry->>'assigned_by')::uuid, (select auth.uid())),
    coalesce((p_entry->>'assigned_at')::timestamptz, now()),
    (p_entry->>'ended_at')::timestamptz,
    (p_entry->>'ended_by')::uuid
  );
end;
$$;

create or replace function private.label_table_ids(p_location_id uuid, p_label text)
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct d.id), '{}'::bigint[])
  from unnest(string_to_array(coalesce(p_label, ''), '+')) as part
  join public.dining_tables d
    on d.location_id = p_location_id and d.label = trim(part) and d.active;
$$;

-- End (not delete) every OTHER server's active entry that holds a table the
-- new label claims, so the new assignment can take it in the same
-- transaction. A combined assignment is only displaced as a whole: if the
-- holder's entry covers tables the new label does not, the reassignment is
-- refused rather than silently releasing tables nobody asked about.
-- Returns the displaced entries for the audit event / undo.
create or replace function private.displace_conflicting_entries(
  p_service_session_id bigint,
  p_location_id uuid,
  p_label text,
  p_member_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tables bigint[];
  v_entry record;
  v_entry_tables bigint[];
  v_displaced jsonb := '[]'::jsonb;
begin
  v_tables := private.label_table_ids(p_location_id, p_label);
  if cardinality(v_tables) = 0 then
    return v_displaced;
  end if;

  for v_entry in
    select distinct e.id, e.rotation_round_id, e.rotation_member_id, e.table_label
    from public.section_assignments sa
    join public.table_rotation_entries e on e.id = sa.table_rotation_entry_id
    where sa.service_session_id = p_service_session_id
      and sa.released_at is null
      and sa.dining_table_id = any (v_tables)
      and e.rotation_member_id <> p_member_id
    order by e.id
  loop
    v_entry_tables := private.label_table_ids(p_location_id, v_entry.table_label);
    if not (v_entry_tables <@ v_tables) then
      raise exception
        'Table % is part of a combined assignment (%) held by another server -- end or transfer that whole assignment first.',
        trim(p_label), v_entry.table_label;
    end if;

    update public.table_rotation_entries
    set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
    where id = v_entry.id;

    v_displaced := v_displaced || jsonb_build_array(
      jsonb_build_object('round_id', v_entry.rotation_round_id, 'member_id', v_entry.rotation_member_id)
    );
  end loop;

  return v_displaced;
end;
$$;

-- Reactivate / re-end a list of {round_id, member_id} entries (undo / redo of
-- a displacement). Scoped to the session of the event being replayed.
create or replace function private.reactivate_entries(p_list jsonb, p_service_session_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_list, '[]'::jsonb))
  loop
    update public.table_rotation_entries
    set status = 'active', ended_at = null, ended_by = null
    where service_session_id = p_service_session_id
      and rotation_round_id = (v_item->>'round_id')::bigint
      and rotation_member_id = (v_item->>'member_id')::bigint
      and status = 'ended';
  end loop;
end;
$$;

create or replace function private.end_entries(p_list jsonb, p_service_session_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_list, '[]'::jsonb))
  loop
    update public.table_rotation_entries
    set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
    where service_session_id = p_service_session_id
      and rotation_round_id = (v_item->>'round_id')::bigint
      and rotation_member_id = (v_item->>'member_id')::bigint
      and status = 'active';
  end loop;
end;
$$;

-- The one place a member's status changes. A server cannot be taken off the
-- rotation (status 'unavailable') while they still own an active table --
-- that would orphan the assignment (End or Transfer first).
create or replace function private.set_member_status(
  p_service_session_id bigint,
  p_member_id bigint,
  p_status public.rotation_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'unavailable' and exists (
    select 1 from public.table_rotation_entries e
    where e.rotation_member_id = p_member_id
      and e.service_session_id = p_service_session_id
      and e.status = 'active'
  ) then
    raise exception 'This server still has active tables -- end or transfer them before removing the server.';
  end if;

  update public.rotation_members
  set status = p_status, updated_at = now()
  where id = p_member_id and service_session_id = p_service_session_id;
end;
$$;

revoke all on function private.entry_json(public.table_rotation_entries) from public, anon, authenticated;
revoke all on function private.restore_entry(uuid, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function private.label_table_ids(uuid, text) from public, anon, authenticated;
revoke all on function private.displace_conflicting_entries(bigint, uuid, text, bigint) from public, anon, authenticated;
revoke all on function private.reactivate_entries(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.end_entries(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.set_member_status(bigint, bigint, public.rotation_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Session open / lookup. DEFINER so the direct service_sessions write
--    grant can go. A previous day is never opened; only owner / manager /
--    host may create a board (a server joins an open floor, never opens it).
-- ---------------------------------------------------------------------
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

  if not private.has_board_role(
    p_organization_id,
    array['owner','general_manager','shift_manager','host']::public.app_role[]
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

-- ---------------------------------------------------------------------
-- 4. Occupancy trigger: the confirm-transfer back door is retired. A
--    conflicting claim is now ALWAYS an error here; the only way to take an
--    occupied table is board_assign's explicit displacement, which ENDS the
--    previous owner's entry (history kept) before inserting the new one.
-- ---------------------------------------------------------------------
create or replace function private.sync_table_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_part text;
  v_dining_table_id bigint;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.table_label is not distinct from old.table_label then
    return new;
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    delete from public.section_assignments
    where table_rotation_entry_id = old.id and released_at is null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  if new.table_label is null or length(trim(new.table_label)) = 0 then
    return new;
  end if;

  select ss.location_id into v_location
  from public.service_sessions ss
  where ss.id = new.service_session_id;

  for v_part in select trim(part) from unnest(string_to_array(new.table_label, '+')) as part
  loop
    if v_part = '' then
      continue;
    end if;

    select id into v_dining_table_id
    from public.dining_tables
    where location_id = v_location and label = v_part and active;

    if v_dining_table_id is null then
      continue;
    end if;

    begin
      insert into public.section_assignments (
        organization_id, service_session_id, location_id, dining_table_id,
        server_profile_id, rotation_member_id, table_rotation_entry_id
      )
      select new.organization_id, new.service_session_id, v_location, v_dining_table_id,
        rm.server_profile_id, new.rotation_member_id, new.id
      from public.rotation_members rm
      where rm.id = new.rotation_member_id;
    exception
      when unique_violation then
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
    end;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. The board RPCs.
-- ---------------------------------------------------------------------

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
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.begin_board_write(p_organization_id, v_session_id);

  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_server_profile_id and m.active
  ) then
    raise exception 'That person is not an active member of this restaurant.';
  end if;

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

create or replace function public.board_add_row(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_sequence integer;
  v_round_id bigint;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  select coalesce(max(sequence), 0) + 1 into v_next_sequence
  from public.rotation_rounds
  where service_session_id = p_service_session_id;

  insert into public.rotation_rounds (organization_id, service_session_id, sequence)
  values (p_organization_id, p_service_session_id, v_next_sequence)
  returning id into v_round_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'add_row',
    jsonb_build_object('round_id', v_round_id, 'sequence', v_next_sequence),
    jsonb_build_object('round_id', v_round_id)
  );

  return v_round_id;
end;
$$;

create or replace function public.board_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_location uuid;
  v_label text := nullif(trim(coalesce(p_table_label, '')), '');
  v_previous record;
  v_displaced jsonb := '[]'::jsonb;
begin
  if v_label is null then
    raise exception 'Enter a table.';
  end if;

  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  v_location := private.begin_board_write(p_organization_id, v_session_id);

  perform private.assert_round_in_session(p_round_id, v_session_id);
  if private.member_status_in_session(p_member_id, v_session_id) is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select e.table_label, e.status, e.assigned_by, e.assigned_at into v_previous
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id and e.rotation_member_id = p_member_id;

  if v_previous.status is not null and v_previous.status <> 'active' then
    raise exception 'That cell already has a % entry -- clear it before assigning a new table.', v_previous.status;
  end if;

  -- Atomic reassign: only when the caller explicitly confirmed taking the
  -- table. Otherwise a held table is refused by the occupancy trigger.
  if coalesce(p_confirm_transfer, false) then
    v_displaced := private.displace_conflicting_entries(v_session_id, v_location, v_label, p_member_id);
  end if;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, v_label, 'active', (select auth.uid()))
  on conflict (rotation_round_id, rotation_member_id)
  do update set
    table_label = excluded.table_label,
    assigned_by = excluded.assigned_by,
    assigned_at = now(),
    ended_at = null,
    ended_by = null;

  perform private.emit_board_event(
    p_organization_id, v_session_id, 'assign',
    jsonb_build_object(
      'round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_label,
      'displaced', v_displaced
    ),
    jsonb_build_object(
      'round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous.table_label,
      'prev_assigned_by', v_previous.assigned_by, 'prev_assigned_at', v_previous.assigned_at,
      'displaced', v_displaced
    )
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

create or replace function public.board_clear_cell(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint,
  p_member_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.assert_round_in_session(p_round_id, p_service_session_id);
  perform private.member_status_in_session(p_member_id, p_service_session_id);

  select private.entry_json(e) into v_snapshot
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id and e.rotation_member_id = p_member_id;

  -- Clearing an already-empty cell is a no-op, not an undoable event.
  if v_snapshot is null then
    return;
  end if;

  delete from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'clear_cell',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'entry', v_snapshot)
  );
end;
$$;

create or replace function public.board_clear_row(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.assert_round_in_session(p_round_id, p_service_session_id);

  select coalesce(
    jsonb_agg(jsonb_build_object('member_id', e.rotation_member_id) || private.entry_json(e)),
    '[]'::jsonb
  )
  into v_cleared
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id;

  delete from public.table_rotation_entries where rotation_round_id = p_round_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'clear_row',
    jsonb_build_object('round_id', p_round_id),
    jsonb_build_object('round_id', p_round_id, 'entries', v_cleared)
  );
end;
$$;

create or replace function public.board_clear_column(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.member_status_in_session(p_member_id, p_service_session_id);

  select coalesce(
    jsonb_agg(jsonb_build_object('round_id', e.rotation_round_id) || private.entry_json(e)),
    '[]'::jsonb
  )
  into v_cleared
  from public.table_rotation_entries e
  where e.rotation_member_id = p_member_id and e.service_session_id = p_service_session_id;

  delete from public.table_rotation_entries
  where rotation_member_id = p_member_id and service_session_id = p_service_session_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'clear_column',
    jsonb_build_object('member_id', p_member_id),
    jsonb_build_object('member_id', p_member_id, 'entries', v_cleared)
  );
end;
$$;

create or replace function public.board_clear_board(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'round_id', r.id,
      'sequence', r.sequence,
      'entries', (
        select coalesce(
          jsonb_agg(jsonb_build_object('member_id', e.rotation_member_id) || private.entry_json(e)),
          '[]'::jsonb
        )
        from public.table_rotation_entries e
        where e.rotation_round_id = r.id
      )
    ) order by r.sequence
  ), '[]'::jsonb)
  into v_snapshot
  from public.rotation_rounds r
  where r.service_session_id = p_service_session_id;

  delete from public.rotation_rounds where service_session_id = p_service_session_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'clear_board',
    '{}'::jsonb,
    jsonb_build_object('rounds', v_snapshot)
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
end;
$$;

create or replace function public.board_delete_row(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence integer;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  select sequence into v_sequence
  from public.rotation_rounds
  where id = p_round_id and service_session_id = p_service_session_id;
  if v_sequence is null then
    raise exception 'Round not found.';
  end if;

  if exists (select 1 from public.table_rotation_entries where rotation_round_id = p_round_id) then
    raise exception 'Clear this row before deleting it -- it still has assignments.';
  end if;

  delete from public.rotation_rounds where id = p_round_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'delete_row',
    jsonb_build_object('round_id', p_round_id, 'sequence', v_sequence),
    jsonb_build_object('round_id', p_round_id, 'sequence', v_sequence)
  );
end;
$$;

create or replace function public.board_set_column_status(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_db_status public.rotation_status;
  v_event public.board_event_type;
  v_previous_status public.rotation_status;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  v_db_status := case p_status
    when 'active' then 'active'::public.rotation_status
    when 'paused' then 'paused'::public.rotation_status
    when 'removed' then 'unavailable'::public.rotation_status
    else null
  end;
  if v_db_status is null then
    raise exception 'Unknown column status: %', p_status;
  end if;

  v_event := case p_status
    when 'active' then 'resume_column'::public.board_event_type
    when 'paused' then 'pause_column'::public.board_event_type
    when 'removed' then 'remove_column'::public.board_event_type
  end;

  select m.status into v_previous_status
  from public.rotation_members m
  where m.id = p_member_id and m.service_session_id = p_service_session_id;
  if v_previous_status is null then
    raise exception 'Column not found.';
  end if;

  -- Removal is blocked while the server owns an active table; pause is not.
  perform private.set_member_status(p_service_session_id, p_member_id, v_db_status);

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, v_event,
    jsonb_build_object('member_id', p_member_id, 'status', p_status),
    jsonb_build_object('member_id', p_member_id, 'status', v_previous_status::text)
  );
end;
$$;

create or replace function public.board_move_column(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_id bigint;
  v_moving_position integer;
  v_target_position integer;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.member_status_in_session(p_member_id, p_service_session_id);

  if p_direction not in ('up', 'down') then
    raise exception 'Unknown direction: %', p_direction;
  end if;

  -- Adjacency among visible (non-removed) columns only. Reordering changes
  -- who is up next; it never touches any table assignment.
  with visible as (
    select id, position, row_number() over (order by position) as rank
    from public.rotation_members
    where service_session_id = p_service_session_id and status <> 'unavailable'
  ),
  target as (
    select v.id, v.position from visible v
    where v.rank = (
      select rank + case when p_direction = 'up' then -1 else 1 end
      from visible where id = p_member_id
    )
  )
  select id, position into v_target_id, v_target_position from target;

  if v_target_id is null then
    return;
  end if;

  select position into v_moving_position
  from public.rotation_members where id = p_member_id;

  update public.rotation_members set position = v_target_position where id = p_member_id;
  update public.rotation_members set position = v_moving_position where id = v_target_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'move_column',
    jsonb_build_object('a_member_id', p_member_id, 'a_position', v_target_position,
                       'b_member_id', v_target_id, 'b_position', v_moving_position),
    jsonb_build_object('a_member_id', p_member_id, 'a_position', v_moving_position,
                       'b_member_id', v_target_id, 'b_position', v_target_position)
  );
end;
$$;

-- Transfer ends the source assignment (kept as history) and starts the same
-- physical table(s) for the destination server in one transaction.
create or replace function public.board_transfer(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_source_round_id bigint,
  p_source_member_id bigint,
  p_dest_member_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_source_status text;
  v_dest_round_id bigint;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.assert_round_in_session(p_source_round_id, p_service_session_id);
  perform private.member_status_in_session(p_source_member_id, p_service_session_id);

  if p_source_member_id = p_dest_member_id then
    raise exception 'Choose a different server to transfer to.';
  end if;

  select e.table_label, e.status into v_label, v_source_status
  from public.table_rotation_entries e
  where e.rotation_round_id = p_source_round_id and e.rotation_member_id = p_source_member_id;

  if v_source_status is distinct from 'active' or v_label is null then
    raise exception 'That cell has no active assignment to transfer.';
  end if;

  if private.member_status_in_session(p_dest_member_id, p_service_session_id) is distinct from 'active' then
    raise exception 'That destination column is not active.';
  end if;

  select r.id into v_dest_round_id
  from public.rotation_rounds r
  where r.service_session_id = p_service_session_id
    and not exists (
      select 1 from public.table_rotation_entries e
      where e.rotation_round_id = r.id and e.rotation_member_id = p_dest_member_id
    )
  order by r.sequence asc
  limit 1;

  if v_dest_round_id is null then
    perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
    select r.id into v_dest_round_id
    from public.rotation_rounds r
    where r.service_session_id = p_service_session_id
      and not exists (
        select 1 from public.table_rotation_entries e
        where e.rotation_round_id = r.id and e.rotation_member_id = p_dest_member_id
      )
    order by r.sequence asc
    limit 1;
  end if;

  if v_dest_round_id is null then
    raise exception 'No available row to transfer into.';
  end if;

  update public.table_rotation_entries
  set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
  where rotation_round_id = p_source_round_id and rotation_member_id = p_source_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, v_dest_round_id, p_dest_member_id, v_label, 'active', (select auth.uid()));

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'transfer',
    jsonb_build_object(
      'source_round_id', p_source_round_id, 'source_member_id', p_source_member_id,
      'dest_round_id', v_dest_round_id, 'dest_member_id', p_dest_member_id, 'table_label', v_label
    ),
    jsonb_build_object(
      'source_round_id', p_source_round_id, 'source_member_id', p_source_member_id,
      'dest_round_id', v_dest_round_id, 'dest_member_id', p_dest_member_id, 'table_label', v_label
    )
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
  return v_dest_round_id;
end;
$$;

-- D-01: authorization is membership + an unlocked board. Who originally
-- assigned the table is irrelevant; the closer is recorded in ended_by.
create or replace function public.board_end_table(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint,
  p_member_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);
  perform private.assert_round_in_session(p_round_id, p_service_session_id);
  perform private.member_status_in_session(p_member_id, p_service_session_id);

  select e.status into v_status
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id and e.rotation_member_id = p_member_id;

  if v_status is distinct from 'active' then
    raise exception 'That cell has no active assignment to end.';
  end if;

  update public.table_rotation_entries
  set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'end',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id)
  );
end;
$$;

create or replace function public.board_skip_turn(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_existing_status text;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.begin_board_write(p_organization_id, v_session_id);
  perform private.assert_round_in_session(p_round_id, v_session_id);

  if private.member_status_in_session(p_member_id, v_session_id) is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select e.status into v_existing_status
  from public.table_rotation_entries e
  where e.rotation_round_id = p_round_id and e.rotation_member_id = p_member_id;

  if v_existing_status is not null then
    raise exception 'That cell already has a % entry -- clear it before marking it skipped.', v_existing_status;
  end if;

  -- A skip changes future rotation state only: it never touches any
  -- active assignment the server already holds.
  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, null, 'skipped', (select auth.uid()));

  perform private.emit_board_event(
    p_organization_id, v_session_id, 'skip',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

create or replace function public.board_end_and_assign(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_end_round_ids bigint[],
  p_member_id bigint,
  p_table_label text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := nullif(trim(coalesce(p_table_label, '')), '');
  v_active_count int;
  v_dest_round_id bigint;
begin
  if v_label is null then
    raise exception 'Enter a table.';
  end if;

  perform private.begin_board_write(p_organization_id, p_service_session_id);
  if private.member_status_in_session(p_member_id, p_service_session_id) is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  if p_end_round_ids is null or array_length(p_end_round_ids, 1) is null then
    raise exception 'Select at least one table to end.';
  end if;

  select count(*) into v_active_count
  from public.table_rotation_entries
  where service_session_id = p_service_session_id
    and rotation_round_id = any (p_end_round_ids)
    and rotation_member_id = p_member_id
    and status = 'active';

  if v_active_count <> array_length(p_end_round_ids, 1) then
    raise exception 'One or more selected tables are no longer active for this server -- refresh and try again.';
  end if;

  select r.id into v_dest_round_id
  from public.rotation_rounds r
  where r.service_session_id = p_service_session_id
    and not exists (
      select 1 from public.table_rotation_entries e
      where e.rotation_round_id = r.id and e.rotation_member_id = p_member_id
    )
  order by r.sequence asc
  limit 1;

  if v_dest_round_id is null then
    perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
    select r.id into v_dest_round_id
    from public.rotation_rounds r
    where r.service_session_id = p_service_session_id
      and not exists (
        select 1 from public.table_rotation_entries e
        where e.rotation_round_id = r.id and e.rotation_member_id = p_member_id
      )
    order by r.sequence asc
    limit 1;
  end if;

  if v_dest_round_id is null then
    raise exception 'No available row to assign into.';
  end if;

  update public.table_rotation_entries
  set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
  where service_session_id = p_service_session_id
    and rotation_round_id = any (p_end_round_ids)
    and rotation_member_id = p_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, v_dest_round_id, p_member_id, v_label, 'active', (select auth.uid()));

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'end_and_assign',
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', v_label
    ),
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', v_label
    )
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
  return v_dest_round_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Undo / Redo -- logical command reversal, serialized per board by
--    begin_board_write's session lock. Snapshots carry full row state so a
--    reversal restores assigned_by / assigned_at / ended_* too.
-- ---------------------------------------------------------------------
create or replace function public.board_undo(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_inv jsonb;
  v_entry jsonb;
  v_round jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  select * into v_event
  from public.board_events
  where service_session_id = p_service_session_id
    and undone_at is null
    and event_type <> 'undo' and event_type <> 'redo'
  -- id, not created_at: now() is the TRANSACTION start, so a writer that
  -- waited on the session lock commits later with an earlier created_at.
  -- Redo already orders by id.
  order by id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Nothing to undo.';
  end if;

  v_inv := v_event.inverse_payload;

  case v_event.event_type
    when 'assign' then
      -- Free the new owner's claim first, then give displaced owners back
      -- their tables.
      if (v_inv->>'table_label') is null then
        delete from public.table_rotation_entries
        where service_session_id = p_service_session_id
          and rotation_round_id = (v_inv->>'round_id')::bigint
          and rotation_member_id = (v_inv->>'member_id')::bigint;
      else
        update public.table_rotation_entries
        set table_label = v_inv->>'table_label',
            assigned_by = coalesce((v_inv->>'prev_assigned_by')::uuid, (select auth.uid())),
            assigned_at = coalesce((v_inv->>'prev_assigned_at')::timestamptz, now())
        where service_session_id = p_service_session_id
          and rotation_round_id = (v_inv->>'round_id')::bigint
          and rotation_member_id = (v_inv->>'member_id')::bigint;
      end if;
      perform private.reactivate_entries(v_inv->'displaced', p_service_session_id);

    when 'add_column' then
      perform private.set_member_status(
        p_service_session_id, (v_inv->>'member_id')::bigint,
        coalesce(v_inv->>'status', 'unavailable')::public.rotation_status
      );

    when 'pause_column', 'resume_column', 'remove_column' then
      perform private.set_member_status(
        p_service_session_id, (v_inv->>'member_id')::bigint,
        (v_inv->>'status')::public.rotation_status
      );

    when 'clear_cell' then
      v_entry := coalesce(
        v_inv->'entry',
        case when (v_inv->>'table_label') is null then null
             else jsonb_build_object('table_label', v_inv->>'table_label', 'status', 'active') end
      );
      if v_entry is not null then
        perform private.restore_entry(
          p_organization_id, (v_inv->>'round_id')::bigint, (v_inv->>'member_id')::bigint, v_entry
        );
      end if;

    when 'clear_row' then
      for v_entry in select * from jsonb_array_elements(v_inv->'entries')
      loop
        perform private.restore_entry(
          p_organization_id, (v_inv->>'round_id')::bigint, (v_entry->>'member_id')::bigint, v_entry
        );
      end loop;

    when 'clear_column' then
      for v_entry in select * from jsonb_array_elements(v_inv->'entries')
      loop
        perform private.restore_entry(
          p_organization_id, (v_entry->>'round_id')::bigint, (v_inv->>'member_id')::bigint, v_entry
        );
      end loop;

    when 'clear_board' then
      -- Clear Board leaves only freshly created blank trailing rows. They
      -- hold the same sequence numbers the snapshot restores (D-05), so
      -- drop them first -- refusing if anything newer was assigned.
      if exists (
        select 1 from public.table_rotation_entries e
        where e.service_session_id = p_service_session_id
      ) then
        raise exception 'The board has newer assignments -- nothing to restore over.';
      end if;
      delete from public.rotation_rounds where service_session_id = p_service_session_id;
      for v_round in select * from jsonb_array_elements(v_inv->'rounds')
      loop
        insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
        overriding system value
        values (
          (v_round->>'round_id')::bigint, p_organization_id, p_service_session_id,
          (v_round->>'sequence')::integer
        );
        for v_entry in select * from jsonb_array_elements(v_round->'entries')
        loop
          perform private.restore_entry(
            p_organization_id, (v_round->>'round_id')::bigint, (v_entry->>'member_id')::bigint, v_entry
          );
        end loop;
      end loop;

    when 'move_column' then
      update public.rotation_members set position = (v_inv->>'a_position')::integer
      where id = (v_inv->>'a_member_id')::bigint and service_session_id = p_service_session_id;
      update public.rotation_members set position = (v_inv->>'b_position')::integer
      where id = (v_inv->>'b_member_id')::bigint and service_session_id = p_service_session_id;

    when 'add_row' then
      if exists (
        select 1 from public.table_rotation_entries e
        where e.rotation_round_id = (v_inv->>'round_id')::bigint
      ) then
        raise exception 'That row now has assignments -- nothing to remove.';
      end if;
      delete from public.rotation_rounds
      where id = (v_inv->>'round_id')::bigint and service_session_id = p_service_session_id;

    when 'delete_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values (
        (v_inv->>'round_id')::bigint, p_organization_id, p_service_session_id,
        (v_inv->>'sequence')::integer
      );

    when 'transfer' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_inv->>'dest_round_id')::bigint
        and rotation_member_id = (v_inv->>'dest_member_id')::bigint;
      if coalesce((v_inv->>'v')::int, 1) >= 2 then
        update public.table_rotation_entries
        set status = 'active', ended_at = null, ended_by = null
        where service_session_id = p_service_session_id
          and rotation_round_id = (v_inv->>'source_round_id')::bigint
          and rotation_member_id = (v_inv->>'source_member_id')::bigint
          and status = 'ended';
      else
        -- Pre-V2 transfers deleted the source row.
        perform private.restore_entry(
          p_organization_id, (v_inv->>'source_round_id')::bigint, (v_inv->>'source_member_id')::bigint,
          jsonb_build_object('table_label', v_inv->>'table_label', 'status', 'active')
        );
      end if;

    when 'end' then
      update public.table_rotation_entries
      set status = 'active', ended_at = null, ended_by = null
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_inv->>'round_id')::bigint
        and rotation_member_id = (v_inv->>'member_id')::bigint;

    when 'skip' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_inv->>'round_id')::bigint
        and rotation_member_id = (v_inv->>'member_id')::bigint
        and status = 'skipped';

    when 'end_and_assign' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_inv->>'assign_round_id')::bigint
        and rotation_member_id = (v_inv->>'member_id')::bigint;
      perform private.reactivate_entries(
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'round_id', value::bigint, 'member_id', (v_inv->>'member_id')::bigint
          )), '[]'::jsonb)
          from jsonb_array_elements_text(v_inv->'end_round_ids')
        ),
        p_service_session_id
      );

    else
      raise exception 'Undo not supported for event type %', v_event.event_type;
  end case;

  perform set_config('app.board_event_undo', 'on', true);
  update public.board_events set undone_at = now() where id = v_event.id;
  perform set_config('app.board_event_undo', 'off', true);

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'undo',
    jsonb_build_object('undone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.board_redo(
  p_organization_id uuid,
  p_service_session_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_pl jsonb;
  v_end_list jsonb;
begin
  perform private.begin_board_write(p_organization_id, p_service_session_id);

  with touches as (
    select (payload->>'undone_event_id')::bigint as event_id, id as touch_id, true as is_undo
    from public.board_events
    where service_session_id = p_service_session_id and event_type = 'undo'
    union all
    select (payload->>'redone_event_id')::bigint as event_id, id as touch_id, false as is_undo
    from public.board_events
    where service_session_id = p_service_session_id and event_type = 'redo'
  ),
  latest_touch as (
    select distinct on (event_id) event_id, touch_id, is_undo
    from touches
    order by event_id, touch_id desc
  ),
  latest_real_id as (
    select coalesce(max(id), 0) as id
    from public.board_events
    where service_session_id = p_service_session_id
      and event_type not in ('undo', 'redo')
  )
  select e.* into v_event
  from public.board_events e
  join latest_touch lt on lt.event_id = e.id
  cross join latest_real_id
  where lt.is_undo and lt.touch_id > latest_real_id.id
  order by lt.touch_id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Nothing to redo.';
  end if;

  v_pl := v_event.payload;

  case v_event.event_type
    when 'assign' then
      perform private.end_entries(v_pl->'displaced', p_service_session_id);
      insert into public.table_rotation_entries (
        organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
      )
      values (
        p_organization_id, (v_pl->>'round_id')::bigint, (v_pl->>'member_id')::bigint,
        v_pl->>'table_label', 'active', (select auth.uid())
      )
      on conflict (rotation_round_id, rotation_member_id)
      do update set table_label = excluded.table_label, assigned_by = excluded.assigned_by,
        assigned_at = now(), ended_at = null, ended_by = null;

    when 'add_column' then
      perform private.set_member_status(p_service_session_id, (v_pl->>'member_id')::bigint, 'active');

    when 'pause_column', 'resume_column', 'remove_column' then
      -- The payload carries the UI status; map it to the stored enum.
      perform private.set_member_status(
        p_service_session_id, (v_pl->>'member_id')::bigint,
        case v_pl->>'status'
          when 'active' then 'active'::public.rotation_status
          when 'paused' then 'paused'::public.rotation_status
          when 'removed' then 'unavailable'::public.rotation_status
          else (v_pl->>'status')::public.rotation_status
        end
      );

    when 'clear_cell' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_pl->>'round_id')::bigint
        and rotation_member_id = (v_pl->>'member_id')::bigint;

    when 'clear_row' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_pl->>'round_id')::bigint;

    when 'clear_column' then
      delete from public.table_rotation_entries
      where service_session_id = p_service_session_id
        and rotation_member_id = (v_pl->>'member_id')::bigint;

    when 'clear_board' then
      delete from public.rotation_rounds where service_session_id = p_service_session_id;
      perform private.ensure_trailing_round(p_organization_id, p_service_session_id);

    when 'move_column' then
      update public.rotation_members set position = (v_pl->>'a_position')::integer
      where id = (v_pl->>'a_member_id')::bigint and service_session_id = p_service_session_id;
      update public.rotation_members set position = (v_pl->>'b_position')::integer
      where id = (v_pl->>'b_member_id')::bigint and service_session_id = p_service_session_id;

    when 'add_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values (
        (v_pl->>'round_id')::bigint, p_organization_id, p_service_session_id,
        (v_pl->>'sequence')::integer
      );

    when 'delete_row' then
      delete from public.rotation_rounds
      where id = (v_pl->>'round_id')::bigint and service_session_id = p_service_session_id;

    when 'transfer' then
      if coalesce((v_pl->>'v')::int, 1) >= 2 then
        update public.table_rotation_entries
        set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
        where service_session_id = p_service_session_id
          and rotation_round_id = (v_pl->>'source_round_id')::bigint
          and rotation_member_id = (v_pl->>'source_member_id')::bigint
          and status = 'active';
      else
        delete from public.table_rotation_entries
        where service_session_id = p_service_session_id
          and rotation_round_id = (v_pl->>'source_round_id')::bigint
          and rotation_member_id = (v_pl->>'source_member_id')::bigint;
      end if;
      insert into public.table_rotation_entries (
        organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
      )
      values (
        p_organization_id, (v_pl->>'dest_round_id')::bigint, (v_pl->>'dest_member_id')::bigint,
        v_pl->>'table_label', 'active', (select auth.uid())
      );

    when 'end' then
      update public.table_rotation_entries
      set status = 'ended', ended_at = now(), ended_by = (select auth.uid())
      where service_session_id = p_service_session_id
        and rotation_round_id = (v_pl->>'round_id')::bigint
        and rotation_member_id = (v_pl->>'member_id')::bigint
        and status = 'active';

    when 'skip' then
      insert into public.table_rotation_entries (
        organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
      )
      values (
        p_organization_id, (v_pl->>'round_id')::bigint, (v_pl->>'member_id')::bigint,
        null, 'skipped', (select auth.uid())
      );

    when 'end_and_assign' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'round_id', value::bigint, 'member_id', (v_pl->>'member_id')::bigint
      )), '[]'::jsonb)
      into v_end_list
      from jsonb_array_elements_text(v_pl->'end_round_ids');
      perform private.end_entries(v_end_list, p_service_session_id);
      insert into public.table_rotation_entries (
        organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
      )
      values (
        p_organization_id, (v_pl->>'assign_round_id')::bigint, (v_pl->>'member_id')::bigint,
        v_pl->>'table_label', 'active', (select auth.uid())
      );

    else
      raise exception 'Redo not supported for event type %', v_event.event_type;
  end case;

  perform set_config('app.board_event_undo', 'on', true);
  update public.board_events set undone_at = null where id = v_event.id;
  perform set_config('app.board_event_undo', 'off', true);

  perform private.emit_board_event(
    p_organization_id, p_service_session_id, 'redo',
    jsonb_build_object('redone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. board_events: append-only for clients (D-08).
-- ---------------------------------------------------------------------
create or replace function private.guard_board_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No JWT = trusted maintenance context (retention cron, cascade delete of
  -- a whole session / organization, migrations).
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Board events are append-only.' using errcode = '42501';
  end if;

  -- The one sanctioned change: undone_at, inside board_undo / board_redo.
  if coalesce(current_setting('app.board_event_undo', true), '') = 'on'
     and (new.id, new.organization_id, new.service_session_id, new.actor_profile_id,
          new.event_type, new.payload, new.inverse_payload, new.created_at)
         is not distinct from
         (old.id, old.organization_id, old.service_session_id, old.actor_profile_id,
          old.event_type, old.payload, old.inverse_payload, old.created_at) then
    return new;
  end if;

  raise exception 'Board events are append-only.' using errcode = '42501';
end;
$$;

revoke all on function private.guard_board_event_change() from public, anon, authenticated;

create trigger board_events_append_only
  before update or delete on public.board_events
  for each row execute function private.guard_board_event_change();

-- ---------------------------------------------------------------------
-- 8. Retire the second mutation API: drop the write policies and revoke
--    the raw DML grants. SELECT policies / grants are untouched.
-- ---------------------------------------------------------------------
drop policy if exists table_rotation_entries_insert_any_member on public.table_rotation_entries;
drop policy if exists table_rotation_entries_update_any_member on public.table_rotation_entries;
drop policy if exists table_rotation_entries_delete_any_member on public.table_rotation_entries;
drop policy if exists rotation_rounds_write_any_member on public.rotation_rounds;
drop policy if exists rotation_members_operate_service on public.rotation_members;
drop policy if exists service_sessions_operate_service on public.service_sessions;
drop policy if exists board_events_insert_member on public.board_events;
drop policy if exists board_events_update_any_member on public.board_events;

revoke insert, update, delete on public.table_rotation_entries from authenticated;
revoke insert, update, delete on public.rotation_rounds from authenticated;
revoke insert, update, delete on public.rotation_members from authenticated;
revoke insert, update, delete on public.section_assignments from authenticated;
revoke insert, update, delete on public.service_sessions from authenticated;
revoke insert, update, delete on public.board_events from authenticated;

-- ---------------------------------------------------------------------
-- 9. Exact public RPC ACL: authenticated only (idempotent re-assertion).
-- ---------------------------------------------------------------------
revoke all on function public.board_add_column(uuid, uuid, date, uuid) from public, anon;
revoke all on function public.board_add_row(uuid, bigint) from public, anon;
revoke all on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean) from public, anon;
revoke all on function public.board_clear_board(uuid, bigint) from public, anon;
revoke all on function public.board_clear_cell(uuid, bigint, bigint, bigint) from public, anon;
revoke all on function public.board_clear_column(uuid, bigint, bigint) from public, anon;
revoke all on function public.board_clear_row(uuid, bigint, bigint) from public, anon;
revoke all on function public.board_delete_row(uuid, bigint, bigint) from public, anon;
revoke all on function public.board_end_and_assign(uuid, bigint, bigint[], bigint, text) from public, anon;
revoke all on function public.board_end_table(uuid, bigint, bigint, bigint) from public, anon;
revoke all on function public.board_move_column(uuid, bigint, bigint, text) from public, anon;
revoke all on function public.board_redo(uuid, bigint) from public, anon;
revoke all on function public.board_set_column_status(uuid, bigint, bigint, text) from public, anon;
revoke all on function public.board_skip_turn(uuid, uuid, date, bigint, bigint) from public, anon;
revoke all on function public.board_transfer(uuid, bigint, bigint, bigint, bigint) from public, anon;
revoke all on function public.board_undo(uuid, bigint) from public, anon;

grant execute on function public.board_add_column(uuid, uuid, date, uuid) to authenticated;
grant execute on function public.board_add_row(uuid, bigint) to authenticated;
grant execute on function public.board_assign(uuid, uuid, date, bigint, bigint, text, boolean) to authenticated;
grant execute on function public.board_clear_board(uuid, bigint) to authenticated;
grant execute on function public.board_clear_cell(uuid, bigint, bigint, bigint) to authenticated;
grant execute on function public.board_clear_column(uuid, bigint, bigint) to authenticated;
grant execute on function public.board_clear_row(uuid, bigint, bigint) to authenticated;
grant execute on function public.board_delete_row(uuid, bigint, bigint) to authenticated;
grant execute on function public.board_end_and_assign(uuid, bigint, bigint[], bigint, text) to authenticated;
grant execute on function public.board_end_table(uuid, bigint, bigint, bigint) to authenticated;
grant execute on function public.board_move_column(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.board_redo(uuid, bigint) to authenticated;
grant execute on function public.board_set_column_status(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.board_skip_turn(uuid, uuid, date, bigint, bigint) to authenticated;
grant execute on function public.board_transfer(uuid, bigint, bigint, bigint, bigint) to authenticated;
grant execute on function public.board_undo(uuid, bigint) to authenticated;
