-- Feature 028. The per-cell counterpart to board_clear_row/clear_column/
-- clear_board -- but, unlike those three, open to any active member, not
-- manager-only, matching Reconciliation 1's explicit "edit, clear, or
-- update any table cell" scope (the bulk row/column/board clears stay
-- restricted; only a single cell's clear is opened here). Deliberately
-- calls only private.assert_board_not_locked, never
-- private.assert_is_board_manager. Relies directly on
-- table_rotation_entries_delete_any_member, whose finalized-lock check
-- was fixed in the previous migration to actually work for a server or
-- host, not just an owner/manager.
alter type public.board_event_type add value if not exists 'clear_cell';

create function public.board_clear_cell(
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
  v_previous_label text;
begin
  perform private.assert_board_not_locked(p_organization_id, p_service_session_id);

  select table_label into v_previous_label
  from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  delete from public.table_rotation_entries
  where rotation_round_id = p_round_id and rotation_member_id = p_member_id;

  insert into public.board_events (
    organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload
  )
  values (
    p_organization_id, p_service_session_id, (select auth.uid()), 'clear_cell',
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id),
    jsonb_build_object('round_id', p_round_id, 'member_id', p_member_id, 'table_label', v_previous_label)
  );
end;
$$;

revoke all on function public.board_clear_cell(uuid, bigint, bigint, bigint) from public, anon;
grant execute on function public.board_clear_cell(uuid, bigint, bigint, bigint) to authenticated;
