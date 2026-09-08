-- Feature 028. Real, more serious bug found live-testing against the
-- local database as a plain server (not assumed, not caught by reading
-- the SQL text alone): table_rotation_entries_insert_any_member,
-- _update_any_member, and _delete_any_member (20260906144901) each carry
-- a `not exists (select 1 from rotation_rounds ... join tip_pools ...)`
-- clause meant to lock the board once tips are finalized. That subquery
-- is a plain SELECT, so it is itself subject to RLS on tip_pools --
-- and tip_pools_select_manager (20260905125418) only lets
-- owner/general_manager/shift_manager read it. For a server or host, the
-- join to tip_pools returns zero rows regardless of the pool's real
-- status, so `not exists(...)` is always true and the finalized check is
-- silently inert for exactly the roles it matters most for.
--
-- This was never caught because every real code path goes through a
-- board_* RPC, and private.assert_board_not_locked (20260906140000) is
-- itself SECURITY DEFINER, so it already sees tip_pools correctly
-- regardless of the caller's own grants -- the RPC-level guard has
-- always worked. The raw RLS policies underneath it, independently
-- enforcing the same thing as defense-in-depth, have not: confirmed by
-- deleting a finalized day's entry directly as a server, bypassing every
-- RPC, in a live psql session against the actual local database, not
-- inferred from the migration text.
--
-- Fix: one new SECURITY DEFINER helper (matching the existing
-- private.has_org_role / private.can_manage_member pattern for exactly
-- this class of problem -- a policy subquery that needs to see into a
-- table the calling role can't directly SELECT), used by all three
-- policies. assert_board_not_locked is untouched -- it was already
-- correct.
create function private.is_service_date_tip_finalized(
  p_organization_id uuid,
  p_rotation_round_id bigint
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rotation_rounds round
    join public.service_sessions session
      on session.id = round.service_session_id
     and session.organization_id = p_organization_id
    join public.tip_pools pool
      on pool.location_id = session.location_id
     and pool.service_date = session.service_date
     and pool.organization_id = p_organization_id
    where round.id = p_rotation_round_id
      and pool.status = 'finalized'
  );
$$;

revoke all on function private.is_service_date_tip_finalized(uuid, bigint) from public, anon;
grant execute on function private.is_service_date_tip_finalized(uuid, bigint) to authenticated;

drop policy "table_rotation_entries_insert_any_member" on public.table_rotation_entries;
drop policy "table_rotation_entries_update_any_member" on public.table_rotation_entries;
drop policy "table_rotation_entries_delete_any_member" on public.table_rotation_entries;

create policy "table_rotation_entries_insert_any_member" on public.table_rotation_entries
  for insert to authenticated
  with check (
    assigned_by = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not (select private.is_service_date_tip_finalized(organization_id, rotation_round_id))
  );

create policy "table_rotation_entries_update_any_member" on public.table_rotation_entries
  for update to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not (select private.is_service_date_tip_finalized(organization_id, rotation_round_id))
  )
  with check (
    assigned_by = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

create policy "table_rotation_entries_delete_any_member" on public.table_rotation_entries
  for delete to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not (select private.is_service_date_tip_finalized(organization_id, rotation_round_id))
  );
