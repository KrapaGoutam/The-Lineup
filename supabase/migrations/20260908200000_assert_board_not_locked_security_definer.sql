-- Feature 028. Real, more serious bug than the previous migration alone
-- fixed -- found live-testing board_clear_cell as a plain server against
-- a finalized board, not assumed: private.assert_board_not_locked
-- (20260906140000) is declared `security invoker`, not `security
-- definer`, despite its own comment claiming it independently enforces
-- the finalized-tips lock the way the RLS policies do. Being invoker, its
-- own SELECT against tip_pools is *itself* subject to
-- tip_pools_select_manager -- exactly the same class of bug the previous
-- migration fixed at the RLS layer, except this one silently defeats the
-- lock at the RPC layer, for every board_* RPC at once (board_assign,
-- add_column, set_column_status, clear_row, clear_column, clear_board,
-- move_column, add_row, undo, redo, and the new clear_cell), not just
-- table_rotation_entries writes.
--
-- Confirmed directly in a live psql session: calling
-- private.assert_board_not_locked as a plain server against a finalized
-- session raised nothing; the exact same call as postgres correctly
-- raised. This means the "temporal lock invariant" -- the board must be
-- read-only for everyone, including managers, once tips are finalized --
-- has in practice only ever been enforced for owner/general_manager/
-- shift_manager, the only roles that can read tip_pools directly. A
-- server or host has been able to keep editing a finalized board this
-- entire time.
--
-- Fix: security definer, matching has_org_role / can_manage_member /
-- is_service_date_tip_finalized -- the same pattern this schema already
-- uses everywhere else for "a check needs to see into a table the
-- caller can't directly read".
create or replace function private.assert_board_not_locked(
  p_organization_id uuid,
  p_service_session_id bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked boolean;
begin
  select exists (
    select 1
    from public.service_sessions session
    join public.tip_pools pool
      on pool.location_id = session.location_id
     and pool.service_date = session.service_date
     and pool.organization_id = session.organization_id
    where session.id = p_service_session_id
      and session.organization_id = p_organization_id
      and pool.status = 'finalized'
  ) into v_locked;

  if v_locked then
    raise exception 'Tips are finalized for today -- the board is locked until a manager or owner reopens it.';
  end if;
end;
$$;

revoke all on function private.assert_board_not_locked(uuid, bigint) from public, anon;
grant execute on function private.assert_board_not_locked(uuid, bigint) to authenticated;
