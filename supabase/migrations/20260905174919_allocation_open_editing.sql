-- Feature 011: drop the self-or-manager write restriction on the
-- allocation board only. Any active member may write any column;
-- attribution (`assigned_by`) is never relaxed. A finalized tip pool for
-- that service date freezes the board for everyone, including managers.
-- See docs/features/011-allocation-board-open-editing.md.

drop policy "table_rotation_entries_write_manager" on public.table_rotation_entries;
drop policy "table_rotation_entries_write_own" on public.table_rotation_entries;

create policy "table_rotation_entries_write_any_member" on public.table_rotation_entries
  for all to authenticated
  using (
    assigned_by = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not exists (
      select 1
      from public.rotation_rounds round
      join public.service_sessions session
        on session.id = round.service_session_id
       and session.organization_id = table_rotation_entries.organization_id
      join public.tip_pools pool
        on pool.location_id = session.location_id
       and pool.service_date = session.service_date
       and pool.organization_id = table_rotation_entries.organization_id
      where round.id = table_rotation_entries.rotation_round_id
        and pool.status = 'finalized'
    )
  )
  with check (
    assigned_by = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])) and
    not exists (
      select 1
      from public.rotation_rounds round
      join public.service_sessions session
        on session.id = round.service_session_id
       and session.organization_id = table_rotation_entries.organization_id
      join public.tip_pools pool
        on pool.location_id = session.location_id
       and pool.service_date = session.service_date
       and pool.organization_id = table_rotation_entries.organization_id
      where round.id = table_rotation_entries.rotation_round_id
        and pool.status = 'finalized'
    )
  );

-- The reopen direction (finalized -> draft) was previously impossible:
-- tip_pools_update_draft_manager's `using` clause requires the *current*
-- row to already be draft, so no policy permitted correcting a finalized
-- pool in either direction. This adds exactly that missing transition,
-- manager/owner only, and the constraint below still requires
-- finalized_at/finalized_by to be cleared together with the status change.
create policy "tip_pools_reopen_manager" on public.tip_pools
  for update to authenticated
  using (
    status = 'finalized' and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  )
  with check (
    status = 'draft' and
    finalized_at is null and
    finalized_by is null and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
