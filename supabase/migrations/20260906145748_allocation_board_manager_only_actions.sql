-- Real gap found cross-checking DATA_MODEL.md's RLS matrix against what
-- was actually built, not live-tested this time but just as real:
-- "Table allocation rows | Manage (+ reorder/lock) ... | Write any active
-- column | Write any active column" means clear/reorder/add-row are meant
-- to stay manager-only, while only *assigning* a table is open to every
-- active member (Feature 011). rotation_members writes (add-column,
-- pause/resume/remove, move-column/reorder) already get this for free
-- from the pre-existing, untouched rotation_members_operate_service
-- policy (owner/general_manager/shift_manager/host, never server).
--
-- board_clear_row/board_clear_column/board_clear_board/board_add_row
-- don't: they write table_rotation_entries and rotation_rounds, both of
-- which had to become any-active-member-writable in the previous two
-- migrations for entirely different reasons (the standing-empty-round
-- auto-open during any member's ordinary assign; any member being able
-- to undo any recent action). That permissiveness is correct for assign
-- and for undo/redo, but it leaves these four specific actions reachable
-- by any active member calling the RPC directly, bypassing the UI's own
-- isManager gate entirely -- exactly the "the mutation path itself
-- refuses too, in case a control somehow slips through disabled"
-- principle this app already states elsewhere and now needs applied here
-- too.
--
-- Undo/redo are deliberately NOT given this guard: they're a single
-- shared "fix a recent mistake" mechanism open to any active member
-- regardless of who could have performed the original action, matching
-- the demo UI's Undo/Redo buttons, which have never been isManager-gated
-- the way Add row/Clear board are.
create function private.assert_is_board_manager(
  p_organization_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (
    select private.has_org_role(
      p_organization_id,
      array['owner','general_manager','shift_manager','host']::public.app_role[]
    )
  ) then
    raise exception 'Only a manager, owner, or host can do that.';
  end if;
end;
$$;

revoke all on function private.assert_is_board_manager(uuid) from public, anon;
grant execute on function private.assert_is_board_manager(uuid) to authenticated;

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
  perform private.assert_is_board_manager(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('member_id', rotation_member_id, 'table_label', table_label)), '[]'::jsonb)
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
  perform private.assert_is_board_manager(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object('round_id', rotation_round_id, 'table_label', table_label)), '[]'::jsonb)
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
  perform private.assert_is_board_manager(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', round.id,
    'sequence', round.sequence,
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object('member_id', entry.rotation_member_id, 'table_label', entry.table_label)), '[]'::jsonb)
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

create or replace function public.board_add_row(
  p_organization_id uuid,
  p_service_session_id bigint
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_sequence integer;
  v_round_id bigint;
begin
  perform private.assert_is_board_manager(p_organization_id);
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select coalesce(max(sequence), 0) + 1 into v_next_sequence
  from public.rotation_rounds
  where service_session_id = p_service_session_id;

  insert into public.rotation_rounds (organization_id, service_session_id, sequence)
  values (p_organization_id, p_service_session_id, v_next_sequence)
  returning id into v_round_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'add_row',
    jsonb_build_object('round_id', v_round_id, 'sequence', v_next_sequence),
    jsonb_build_object('round_id', v_round_id)
  );

  return v_round_id;
end;
$$;
