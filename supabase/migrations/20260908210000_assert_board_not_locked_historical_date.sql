-- Feature 028, Step 5 (date & month navigation). Server-side counterpart
-- to the UI's own isHistorical gate: without this, a client that
-- legitimately holds a past day's service_session_id -- Step 5's own
-- date/month navigator lets any signed-in person load one via
-- getAllocationContextForDateAction -- could call any board_* RPC
-- directly and mutate a concluded day's rotation, since none of them
-- previously checked the session's own service_date against today. This
-- is the same bug class already fixed twice in this feature
-- (20260908180000's RLS fix, 20260908200000's SECURITY DEFINER fix): a
-- lock that only really holds for whoever happens to respect the UI.
--
-- Every board_* RPC already calls assert_board_not_locked (see
-- 20260906140000) -- extending it here, rather than duplicating a check
-- in nine separate RPC bodies, is the same reasoning that made it the
-- single fix point for the tip-finalized lock.
--
-- "Today" is evaluated in the *location's own* time zone, matching every
-- other service-date computation in this feature
-- (zonedWallTimeFromInstant on the TypeScript side) -- not the database
-- server's zone.
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
  v_historical boolean;
begin
  select
    exists (
      select 1
      from public.service_sessions session
      join public.tip_pools pool
        on pool.location_id = session.location_id
       and pool.service_date = session.service_date
       and pool.organization_id = session.organization_id
      where session.id = p_service_session_id
        and session.organization_id = p_organization_id
        and pool.status = 'finalized'
    ),
    exists (
      select 1
      from public.service_sessions session
      join public.locations location on location.id = session.location_id
      where session.id = p_service_session_id
        and session.organization_id = p_organization_id
        and session.service_date < (now() at time zone location.time_zone)::date
    )
  into v_locked, v_historical;

  if v_historical then
    raise exception 'This board is read-only -- it is a previous day''s service.';
  end if;

  if v_locked then
    raise exception 'Tips are finalized for today -- the board is locked until a manager or owner reopens it.';
  end if;
end;
$$;

revoke all on function private.assert_board_not_locked(uuid, bigint) from public, anon;
grant execute on function private.assert_board_not_locked(uuid, bigint) to authenticated;
