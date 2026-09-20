-- Table Rotation Multi-View, Functionality Upgrade 1.1.
-- See docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md
-- for the full spec and reconciliation. Adds a lifecycle to
-- table_rotation_entries (active/ended/skipped) so Transfer, End Table,
-- and Skip Turn can be represented without a second table, extends the
-- occupancy trigger to respect it, and adds board_transfer/
-- board_end_table/board_skip_turn RPCs plus their undo/redo branches.

-- ---------------------------------------------------------------------
-- 1. Lifecycle columns. Additive: existing rows all default to 'active'
--    with their existing table_label -- both already satisfy the new
--    check constraint below, so no backfill is required.
-- ---------------------------------------------------------------------
alter table public.table_rotation_entries
  add column status text not null default 'active'
    check (status in ('active', 'ended', 'skipped')),
  add column ended_at timestamptz,
  alter column table_label drop not null;

alter table public.table_rotation_entries
  add constraint table_rotation_entries_label_status_check check (
    (status = 'skipped' and table_label is null)
    or (status <> 'skipped' and table_label is not null)
  );

-- ---------------------------------------------------------------------
-- 2. Occupancy trigger: only an ACTIVE entry with a real label ever
--    claims a physical table. An ended or skipped entry (or an UPDATE
--    that moves an entry away from active) releases any existing claim
--    and stops -- the same "release" path already used for DELETE.
-- ---------------------------------------------------------------------
create or replace function private.sync_table_occupancy() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session bigint;
  v_location uuid;
  v_confirm_transfer boolean;
  v_part text;
  v_dining_table_id bigint;
  v_conflict record;
begin
  if TG_OP in ('DELETE', 'UPDATE') then
    delete from public.section_assignments
    where table_rotation_entry_id = OLD.id and released_at is null;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  if NEW.status is distinct from 'active' then
    return NEW;
  end if;

  if NEW.table_label is null or length(trim(NEW.table_label)) = 0 then
    return NEW;
  end if;

  select rr.service_session_id, ss.location_id
    into v_session, v_location
  from public.rotation_rounds rr
  join public.service_sessions ss on ss.id = rr.service_session_id
  where rr.id = NEW.rotation_round_id;

  v_confirm_transfer := coalesce(nullif(current_setting('app.confirm_transfer', true), ''), 'false')::boolean;

  for v_part in select trim(part) from unnest(string_to_array(NEW.table_label, '+')) as part
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

    select sa.id, sa.rotation_member_id into v_conflict
    from public.section_assignments sa
    where sa.service_session_id = v_session
      and sa.dining_table_id = v_dining_table_id
      and sa.released_at is null
      and sa.rotation_member_id is distinct from NEW.rotation_member_id
    for update;

    if found then
      if v_confirm_transfer then
        update public.section_assignments set released_at = now() where id = v_conflict.id;
      else
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
      end if;
    end if;

    begin
      insert into public.section_assignments (
        organization_id, service_session_id, dining_table_id, server_profile_id,
        rotation_member_id, table_rotation_entry_id
      )
      select NEW.organization_id, v_session, v_dining_table_id, rm.server_profile_id,
        NEW.rotation_member_id, NEW.id
      from public.rotation_members rm
      where rm.id = NEW.rotation_member_id;
    exception
      when unique_violation then
        raise exception 'Table % is already assigned to another active server on this board.', v_part;
    end;
  end loop;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. board_assign: guard against silently overwriting a non-active
--    (ended/skipped) historical entry. Editing an already-active entry's
--    label in place is unchanged (that's the Grid's existing "edit"
--    behavior).
-- ---------------------------------------------------------------------
create or replace function public.board_assign(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint,
  p_table_label text,
  p_confirm_transfer boolean default false
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_status public.rotation_status;
  v_previous_label text;
  v_existing_status text;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.assert_board_not_locked(p_organization_id, v_session_id);

  select status into v_status
  from public.rotation_members
  where id = p_member_id and service_session_id = v_session_id;
  if v_status is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select table_label, status into v_previous_label, v_existing_status
  from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  if v_existing_status is not null and v_existing_status <> 'active' then
    raise exception 'That cell already has a % entry -- clear it before assigning a new table.', v_existing_status;
  end if;

  perform set_config('app.confirm_transfer', p_confirm_transfer::text, true);

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, p_table_label, 'active', (select auth.uid()))
  on conflict (rotation_round_id, rotation_member_id)
  do update set
    table_label = excluded.table_label,
    assigned_by = excluded.assigned_by,
    assigned_at = now();

  perform set_config('app.confirm_transfer', 'false', true);

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, v_session_id, (select auth.uid()), 'assign',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'table_label', p_table_label),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous_label)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. New event types.
-- ---------------------------------------------------------------------
alter type public.board_event_type add value if not exists 'transfer';
alter type public.board_event_type add value if not exists 'end';
alter type public.board_event_type add value if not exists 'skip';

-- ---------------------------------------------------------------------
-- 5. board_transfer: moves the SAME active assignment to the destination
--    member's earliest genuinely empty round (never a round where that
--    member already has any row -- active, ended, or skipped all count
--    as "not empty" by construction, since the search is "no row at
--    all"). One transaction: delete source (releases occupancy via the
--    trigger), insert destination (claims it via the trigger) -- a real
--    conflict at the destination (should not normally arise, since the
--    source held the table) fails loudly rather than overwriting.
-- ---------------------------------------------------------------------
create function public.board_transfer(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_source_round_id bigint,
  p_source_member_id bigint,
  p_dest_member_id bigint
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_label text;
  v_source_status text;
  v_dest_status public.rotation_status;
  v_dest_round_id bigint;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select table_label, status into v_label, v_source_status
  from public.table_rotation_entries
  where rotation_round_id = p_source_round_id and rotation_member_id = p_source_member_id;

  if v_source_status is distinct from 'active' or v_label is null then
    raise exception 'That cell has no active assignment to transfer.';
  end if;

  select status into v_dest_status
  from public.rotation_members
  where id = p_dest_member_id and service_session_id = p_service_session_id;
  if v_dest_status is distinct from 'active' then
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
    -- Defensive: the auto-row rule should always keep a genuinely empty
    -- round available; top up once and retry rather than fail outright.
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

  delete from public.table_rotation_entries
  where rotation_round_id = p_source_round_id and rotation_member_id = p_source_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, v_dest_round_id, p_dest_member_id, v_label, 'active', (select auth.uid()));

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'transfer',
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

revoke all on function public.board_transfer(uuid, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.board_transfer(uuid, bigint, bigint, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 6. board_end_table: completes service. History stays (the row is
--    updated, never deleted); the trigger releases occupancy because the
--    row's status is no longer 'active'.
-- ---------------------------------------------------------------------
create function public.board_end_table(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint,
  p_member_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select status into v_status
  from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  if v_status is distinct from 'active' then
    raise exception 'That cell has no active assignment to end.';
  end if;

  update public.table_rotation_entries
  set status = 'ended', ended_at = now()
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'end',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id)
  );
end;
$$;

revoke all on function public.board_end_table(uuid, bigint, bigint, bigint) from public, anon;
grant execute on function public.board_end_table(uuid, bigint, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7. board_skip_turn: records a completed turn with no table. Never
--    touches occupancy (table_label is null, so the trigger's own label
--    check already keeps it out of section_assignments entirely).
-- ---------------------------------------------------------------------
create function public.board_skip_turn(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_round_id bigint,
  p_member_id bigint
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_status public.rotation_status;
  v_existing_status text;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, v_session_id);

  select status into v_status
  from public.rotation_members
  where id = p_member_id and service_session_id = v_session_id;
  if v_status is distinct from 'active' then
    raise exception 'That column is not active.';
  end if;

  select status into v_existing_status
  from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  if v_existing_status is not null then
    raise exception 'That cell already has a % entry -- clear it before marking it skipped.', v_existing_status;
  end if;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, p_round_id, p_member_id, null, 'skipped', (select auth.uid()));

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, v_session_id, (select auth.uid()), 'skip',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_session_id;
end;
$$;

revoke all on function public.board_skip_turn(uuid, uuid, date, bigint, bigint) from public, anon;
grant execute on function public.board_skip_turn(uuid, uuid, date, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Bulk clears now snapshot status too, so undoing a clear that swept
--    up an ended/skipped entry restores it as it actually was, not as a
--    plain active assignment. coalesce(...,'active') covers snapshots
--    from board_events rows written before this migration.
-- ---------------------------------------------------------------------
create or replace function public.board_clear_row(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_round_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('member_id', rotation_member_id, 'table_label', table_label, 'status', status)), '[]'::jsonb)
  into v_cleared
  from public.table_rotation_entries
  where rotation_round_id = p_round_id;

  delete from public.table_rotation_entries where rotation_round_id = p_round_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_row',
    jsonb_build_object('round_id', p_round_id),
    jsonb_build_object('round_id', p_round_id, 'entries', v_cleared)
  );
end;
$$;

create or replace function public.board_clear_column(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_member_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cleared jsonb;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('round_id', rotation_round_id, 'table_label', table_label, 'status', status)), '[]'::jsonb)
  into v_cleared
  from public.table_rotation_entries entry
  join public.rotation_rounds round on round.id = entry.rotation_round_id
  where entry.rotation_member_id = p_member_id
    and round.service_session_id = p_service_session_id;

  delete from public.table_rotation_entries
  where rotation_member_id = p_member_id
    and rotation_round_id in (
      select id from public.rotation_rounds where service_session_id = p_service_session_id
    );

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_column',
    jsonb_build_object('member_id', p_member_id),
    jsonb_build_object('member_id', p_member_id, 'entries', v_cleared)
  );
end;
$$;

create or replace function public.board_clear_board(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', round.id,
    'sequence', round.sequence,
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object('member_id', entry.rotation_member_id, 'table_label', entry.table_label, 'status', entry.status)), '[]'::jsonb)
      from public.table_rotation_entries entry
      where entry.rotation_round_id = round.id
    )
  )), '[]'::jsonb)
  into v_snapshot
  from public.rotation_rounds round
  where round.service_session_id = p_service_session_id;

  delete from public.rotation_rounds where service_session_id = p_service_session_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_board',
    '{}'::jsonb,
    jsonb_build_object('rounds', v_snapshot)
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Undo/redo: transfer, end, skip branches; clear_row/clear_column/
--    clear_board restores now include the snapshotted status.
-- ---------------------------------------------------------------------
create or replace function public.board_undo(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event record;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select * into v_event
  from public.board_events
  where service_session_id = p_service_session_id
    and undone_at is null
    and event_type <> 'undo' and event_type <> 'redo'
  order by created_at desc, id desc
  limit 1;

  if v_event.id is null then
    raise exception 'Nothing to undo.';
  end if;

  case v_event.event_type
    when 'assign' then
      if (v_event.inverse_payload->>'table_label') is null then
        delete from public.table_rotation_entries
        where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
          and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
      else
        update public.table_rotation_entries
        set table_label = v_event.inverse_payload->>'table_label', assigned_by = (select auth.uid()), assigned_at = now()
        where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
          and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
      end if;
    when 'add_column' then
      update public.rotation_members set status = 'unavailable'
      where id = (v_event.inverse_payload->>'member_id')::bigint;
    when 'pause_column', 'resume_column', 'remove_column' then
      update public.rotation_members
      set status = (v_event.inverse_payload->>'status')::public.rotation_status
      where id = (v_event.inverse_payload->>'member_id')::bigint;
    when 'clear_row' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      select p_organization_id, (v_event.inverse_payload->>'round_id')::bigint, (entry->>'member_id')::bigint, entry->>'table_label', coalesce(entry->>'status', 'active'), (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'entries') as entry;
    when 'clear_column' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      select p_organization_id, (entry->>'round_id')::bigint, (v_event.inverse_payload->>'member_id')::bigint, entry->>'table_label', coalesce(entry->>'status', 'active'), (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'entries') as entry;
    when 'clear_board' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      select (round->>'round_id')::bigint, p_organization_id, p_service_session_id, (round->>'sequence')::integer
      from jsonb_array_elements(v_event.inverse_payload->'rounds') as round;
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      select p_organization_id, (round->>'round_id')::bigint, (entry->>'member_id')::bigint, entry->>'table_label', coalesce(entry->>'status', 'active'), (select auth.uid())
      from jsonb_array_elements(v_event.inverse_payload->'rounds') as round,
           jsonb_array_elements(round->'entries') as entry;
    when 'move_column' then
      update public.rotation_members set position = (v_event.inverse_payload->>'a_position')::integer where id = (v_event.inverse_payload->>'a_member_id')::bigint;
      update public.rotation_members set position = (v_event.inverse_payload->>'b_position')::integer where id = (v_event.inverse_payload->>'b_member_id')::bigint;
    when 'add_row' then
      delete from public.rotation_rounds where id = (v_event.inverse_payload->>'round_id')::bigint;
    when 'delete_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values ((v_event.inverse_payload->>'round_id')::bigint, p_organization_id, p_service_session_id, (v_event.inverse_payload->>'sequence')::integer);
    when 'transfer' then
      delete from public.table_rotation_entries
      where rotation_round_id = (v_event.inverse_payload->>'dest_round_id')::bigint
        and rotation_member_id = (v_event.inverse_payload->>'dest_member_id')::bigint;
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      values (
        p_organization_id,
        (v_event.inverse_payload->>'source_round_id')::bigint,
        (v_event.inverse_payload->>'source_member_id')::bigint,
        v_event.inverse_payload->>'table_label', 'active', (select auth.uid())
      );
    when 'end' then
      update public.table_rotation_entries
      set status = 'active', ended_at = null
      where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
        and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
    when 'skip' then
      delete from public.table_rotation_entries
      where rotation_round_id = (v_event.inverse_payload->>'round_id')::bigint
        and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
    else
      raise exception 'Undo not supported for event type %', v_event.event_type;
  end case;

  update public.board_events set undone_at = now() where id = v_event.id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'undo',
    jsonb_build_object('undone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.board_redo(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event record;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  -- Upgrade 1.1: rewritten to order strictly by board_events.id (a
  -- `generated always as identity` column, so a total, gap-free order)
  -- rather than by created_at/undone_at timestamps. Timestamps are only
  -- as precise as the transaction they're written in -- an undo and the
  -- 'undo' log row it inserts share the exact same `now()` within one
  -- transaction, which made a redo immediately following an undo
  -- indistinguishable by timestamp (this surfaced first in this
  -- migration's own pgTAP coverage, which exercises several actions
  -- inside one wrapping transaction, but the same collision is possible
  -- in production under fast repeated calls). id ordering has no such
  -- ambiguity. "Latest touch" = the most recent undo/redo log row that
  -- targeted a given real event; a real event is redoable exactly when
  -- its latest touch was an undo, and nothing genuinely new has
  -- happened since (a fresh real action, not itself an undo/redo,
  -- superseding it).
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

  case v_event.event_type
    when 'assign' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      values (p_organization_id, (v_event.payload->>'round_id')::bigint, (v_event.payload->>'member_id')::bigint, v_event.payload->>'table_label', 'active', (select auth.uid()))
      on conflict (rotation_round_id, rotation_member_id)
      do update set table_label = excluded.table_label, assigned_by = excluded.assigned_by, assigned_at = now();
    when 'add_column' then
      update public.rotation_members set status = 'active' where id = (v_event.payload->>'member_id')::bigint;
    when 'pause_column', 'resume_column', 'remove_column' then
      update public.rotation_members set status = (v_event.payload->>'status')::public.rotation_status where id = (v_event.payload->>'member_id')::bigint;
    when 'clear_row' then
      delete from public.table_rotation_entries where rotation_round_id = (v_event.payload->>'round_id')::bigint;
    when 'clear_column' then
      delete from public.table_rotation_entries
      where rotation_member_id = (v_event.payload->>'member_id')::bigint
        and rotation_round_id in (select id from public.rotation_rounds where service_session_id = p_service_session_id);
    when 'clear_board' then
      delete from public.rotation_rounds where service_session_id = p_service_session_id;
      perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
    when 'move_column' then
      update public.rotation_members set position = (v_event.payload->>'a_position')::integer where id = (v_event.payload->>'a_member_id')::bigint;
      update public.rotation_members set position = (v_event.payload->>'b_position')::integer where id = (v_event.payload->>'b_member_id')::bigint;
    when 'add_row' then
      insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
      overriding system value
      values ((v_event.payload->>'round_id')::bigint, p_organization_id, p_service_session_id, (v_event.payload->>'sequence')::integer);
    when 'delete_row' then
      delete from public.rotation_rounds where id = (v_event.payload->>'round_id')::bigint;
    when 'transfer' then
      delete from public.table_rotation_entries
      where rotation_round_id = (v_event.payload->>'source_round_id')::bigint
        and rotation_member_id = (v_event.payload->>'source_member_id')::bigint;
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      values (
        p_organization_id,
        (v_event.payload->>'dest_round_id')::bigint,
        (v_event.payload->>'dest_member_id')::bigint,
        v_event.payload->>'table_label', 'active', (select auth.uid())
      );
    when 'end' then
      update public.table_rotation_entries
      set status = 'ended', ended_at = now()
      where rotation_round_id = (v_event.payload->>'round_id')::bigint
        and rotation_member_id = (v_event.payload->>'member_id')::bigint;
    when 'skip' then
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      values (
        p_organization_id,
        (v_event.payload->>'round_id')::bigint,
        (v_event.payload->>'member_id')::bigint,
        null, 'skipped', (select auth.uid())
      );
    else
      raise exception 'Redo not supported for event type %', v_event.event_type;
  end case;

  update public.board_events set undone_at = null where id = v_event.id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'redo',
    jsonb_build_object('redone_event_id', v_event.id, 'original_event_type', v_event.event_type),
    '{}'::jsonb
  );
end;
$$;
