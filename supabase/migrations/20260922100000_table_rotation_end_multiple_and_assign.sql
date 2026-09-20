-- Table Rotation Multi-View, multi-table follow-up, "End one or more".
-- See docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md
-- section 9. Expands the Floor decision dialog's "End existing table(s)
-- & assign" choice from ending exactly one round to ending any
-- non-empty selection of a server's active rounds -- one, several, or
-- all of them -- in the same atomic step as assigning the new table.
--
-- No schema change: still no limit on how many active rows a member can
-- hold, and this is still one row ended per selected round, exactly as
-- board_end_table already does it -- just batched, and paired with one
-- new active row, in a single transaction/event.

drop function if exists public.board_end_and_assign(uuid, bigint, bigint, bigint, text);

create function public.board_end_and_assign(
  p_organization_id uuid,
  p_service_session_id bigint,
  p_end_round_ids bigint[],
  p_member_id bigint,
  p_table_label text
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_active_count int;
  v_dest_round_id bigint;
begin
  perform private.assert_is_active_board_member(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  if p_end_round_ids is null or array_length(p_end_round_ids, 1) is null then
    raise exception 'Select at least one table to end.';
  end if;

  -- All-or-nothing: every selected round must still be an active row for
  -- this exact member, checked before ending any of them, so a stale
  -- selection (something else already ended/reassigned one of them
  -- while the dialog was open) can't half-apply.
  select count(*) into v_active_count
  from public.table_rotation_entries
  where rotation_round_id = any(p_end_round_ids)
    and rotation_member_id = p_member_id
    and status = 'active';

  if v_active_count <> array_length(p_end_round_ids, 1) then
    raise exception 'One or more selected tables are no longer active for this server -- refresh and try again.';
  end if;

  -- Searched before the update below, while every selected round still
  -- holds its active row -- none of them can be picked as the new row's
  -- own destination.
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

  -- One UPDATE, N rows -- each still fires private.sync_table_occupancy
  -- per row (a row-level trigger), releasing every selected table's
  -- occupancy. If any single row's release conflicts for some reason,
  -- the whole statement (and so the whole transaction) rolls back,
  -- preserving the "avoid partial failure" requirement.
  update public.table_rotation_entries
  set status = 'ended', ended_at = now()
  where rotation_round_id = any(p_end_round_ids)
    and rotation_member_id = p_member_id;

  insert into public.table_rotation_entries (
    organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by
  )
  values (p_organization_id, v_dest_round_id, p_member_id, p_table_label, 'active', (select auth.uid()));

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'end_and_assign',
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', p_table_label
    ),
    jsonb_build_object(
      'end_round_ids', to_jsonb(p_end_round_ids), 'assign_round_id', v_dest_round_id,
      'member_id', p_member_id, 'table_label', p_table_label
    )
  );

  perform private.ensure_trailing_round(p_organization_id, p_service_session_id);
  return v_dest_round_id;
end;
$$;

revoke all on function public.board_end_and_assign(uuid, bigint, bigint[], bigint, text) from public, anon;
grant execute on function public.board_end_and_assign(uuid, bigint, bigint[], bigint, text) to authenticated;

-- board_undo/board_redo: the end_and_assign branch now works over
-- end_round_ids (a JSON array) instead of a single end_round_id. Each
-- restore-to-active in undo is one UPDATE affecting every ended round at
-- once -- same all-or-nothing guarantee as the forward action: if
-- reactivating any one of them would steal a table from a newer valid
-- claim, private.sync_table_occupancy raises and the whole undo rolls
-- back rather than partially restoring.
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
    when 'end_and_assign' then
      delete from public.table_rotation_entries
      where rotation_round_id = (v_event.inverse_payload->>'assign_round_id')::bigint
        and rotation_member_id = (v_event.inverse_payload->>'member_id')::bigint;
      update public.table_rotation_entries
      set status = 'active', ended_at = null
      where rotation_round_id in (
        select (jsonb_array_elements_text(v_event.inverse_payload->'end_round_ids'))::bigint
      )
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
    when 'end_and_assign' then
      update public.table_rotation_entries
      set status = 'ended', ended_at = now()
      where rotation_round_id in (
        select (jsonb_array_elements_text(v_event.payload->'end_round_ids'))::bigint
      )
      and rotation_member_id = (v_event.payload->>'member_id')::bigint;
      insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
      values (
        p_organization_id,
        (v_event.payload->>'assign_round_id')::bigint,
        (v_event.payload->>'member_id')::bigint,
        v_event.payload->>'table_label', 'active', (select auth.uid())
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
