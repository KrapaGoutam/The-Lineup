-- Table Rotation production stability hotfix: concurrency-safe
-- rotation_members.position.
--
-- Production error: "duplicate key value violates unique constraint
-- rotation_members_service_session_id_position_key". Root cause:
-- board_add_column took p_position as a CLIENT-supplied parameter --
-- allocation-workspace.tsx computed it as `board.columns.length` from
-- whatever board snapshot that device last read. Two tablets adding a
-- server around the same moment (both reading, say, 3 existing columns)
-- both compute position 3 and both call board_add_column with the same
-- value -- two concurrent, otherwise-unrelated transactions, so the
-- existing DEFERRABLE INITIALLY DEFERRED constraint (added in
-- 20260906140000 for board_move_column's *same-transaction* swap) does
-- not help: that only defers the check to commit *within one
-- transaction*, not across two.
--
-- Fix: position is now computed SERVER-SIDE, inside the same
-- transaction as the insert, after taking a row lock on the owning
-- service_sessions row. `select ... for update` on that row makes every
-- concurrent board_add_column call for the *same session* wait for the
-- previous one to commit before computing its own max(position)+1, so
-- two concurrent calls can never compute the same value. Sessions are
-- independent (each row is locked separately), so this does not
-- serialize unrelated locations/dates against each other.
--
-- A second, related race lives one level up: private.get_or_create_
-- active_session's own read-then-insert of the day's service_sessions
-- row has the identical shape (two tablets both find no active session,
-- both insert) against the pre-existing partial unique index
-- service_sessions_one_active_per_meal. That index is not deferrable
-- (deferrable uniqueness is not needed there -- only one write can ever
-- win), so the fix is a plain catch-and-reselect on unique_violation.
--
-- rotation_members.position itself is NOT compacted/reused (removing a
-- column only sets status = 'unavailable', see board_set_column_status
-- -- this migration does not change that, and max(position)+1 remains
-- correct with gaps).

-- ---------------------------------------------------------------------
-- 1. get_or_create_active_session: tolerate a losing concurrent insert.
-- ---------------------------------------------------------------------
create or replace function private.get_or_create_active_session(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
begin
  select id into v_session_id
  from public.service_sessions
  where location_id = p_location_id
    and service_date = p_service_date
    and meal_period = 'service'
    and status = 'active';

  if v_session_id is not null then
    return v_session_id;
  end if;

  begin
    insert into public.service_sessions (
      organization_id, location_id, service_date, meal_period, status,
      started_at, started_by
    )
    values (
      p_organization_id, p_location_id, p_service_date, 'service', 'active',
      now(), (select auth.uid())
    )
    returning id into v_session_id;

    insert into public.rotation_rounds (organization_id, service_session_id, sequence)
    values (p_organization_id, v_session_id, 1);

    return v_session_id;
  exception
    when unique_violation then
      -- Another concurrent call won the race against
      -- service_sessions_one_active_per_meal -- their session is just as
      -- valid as the one this call would have created, so use it.
      select id into v_session_id
      from public.service_sessions
      where location_id = p_location_id
        and service_date = p_service_date
        and meal_period = 'service'
        and status = 'active';
      return v_session_id;
  end;
exception
  when insufficient_privilege then
    raise exception 'No active floor for today yet -- ask a manager or host to add the first server column.';
end;
$$;

-- ---------------------------------------------------------------------
-- 2. board_add_column: p_position dropped from the signature, computed
--    inside the function under a row lock instead. Old 5-arg overload
--    explicitly dropped (matches board_assign/board_end_and_assign's
--    own precedent elsewhere in this feature) rather than left
--    ambiguous for PostgREST.
-- ---------------------------------------------------------------------
drop function if exists public.board_add_column(uuid, uuid, date, uuid, integer);

create function public.board_add_column(
  p_organization_id uuid,
  p_location_id uuid,
  p_service_date date,
  p_server_profile_id uuid
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id bigint;
  v_member_id bigint;
  v_next_position integer;
begin
  v_session_id := private.get_or_create_active_session(p_organization_id, p_location_id, p_service_date);
  perform private.assert_board_not_locked(p_organization_id, v_session_id);

  -- Serializes concurrent board_add_column calls for this one session:
  -- the second caller's SELECT ... FOR UPDATE blocks until the first
  -- caller's transaction commits (or rolls back), so max(position)+1 is
  -- always computed against a state that already reflects every other
  -- concurrent add for this session -- two tablets adding at the same
  -- moment can no longer compute the same next position. Sessions are
  -- locked independently (a different service_session_id's row is a
  -- different lock), so this never serializes across locations/dates.
  perform 1 from public.service_sessions where id = v_session_id for update;

  select coalesce(max(position), -1) + 1 into v_next_position
  from public.rotation_members
  where service_session_id = v_session_id;

  -- Re-adding someone previously removed reactivates their existing row
  -- (their history under it stays attached, at its own original
  -- position -- v_next_position is simply unused on this branch) rather
  -- than trying to insert a second one, which unique
  -- (service_session_id, server_profile_id) would reject outright.
  insert into public.rotation_members (
    organization_id, service_session_id, server_profile_id, status, position
  )
  values (p_organization_id, v_session_id, p_server_profile_id, 'active', v_next_position)
  on conflict (service_session_id, server_profile_id)
  do update set status = 'active'
  returning id into v_member_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, v_session_id, (select auth.uid()), 'add_column',
    jsonb_build_object('member_id', v_member_id, 'server_profile_id', p_server_profile_id),
    jsonb_build_object('member_id', v_member_id)
  );

  perform private.ensure_trailing_round(p_organization_id, v_session_id);
  return v_member_id;
end;
$$;

revoke all on function public.board_add_column(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.board_add_column(uuid, uuid, date, uuid) to authenticated;
