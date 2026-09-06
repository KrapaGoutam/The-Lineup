-- Real bug found live-testing undo, not assumed: Feature 011's
-- table_rotation_entries_write_any_member is a single `for all` policy
-- requiring `assigned_by = auth.uid()` in both `using` and `with check`.
-- That's correct for INSERT (the new row is always attributed to the
-- caller, so it's always satisfied, which is what makes "assign to any
-- column" work at all) -- but for UPDATE/DELETE, `using` is checked
-- against the row as it already exists. A member can only modify or
-- delete a row *they themselves* created, never one someone else did.
--
-- Concretely: board_undo, reversing someone else's assign, needs to
-- delete or restore a row that person created -- blocked. And
-- board_clear_row/board_clear_column/board_clear_board (manager-only in
-- the UI, but not distinguished by role at the RLS layer, since the
-- prior manager-only policy for this table was dropped by the same
-- Feature 011 migration and never replaced) need to delete every entry
-- in a row/column/board regardless of who wrote each one -- also
-- blocked, for any entry not created by whoever clicked Clear. Feature
-- 011 shipped demo-only, so this never actually executed against real
-- RLS until Phase C did.
--
-- Fix: split the single policy into INSERT (unchanged -- attribution to
-- self is what makes "any column" work) and UPDATE/DELETE (no ownership
-- condition on the existing row -- any active member may modify or
-- remove any entry, matching the "any active member, always attributed,
-- never restricted by whose column or whose prior entry" philosophy
-- SECURITY.md already documents for this table). UPDATE's `with check`
-- still requires the *new* row to attribute to the caller, same as
-- before.
drop policy "table_rotation_entries_write_any_member" on public.table_rotation_entries;

create policy "table_rotation_entries_insert_any_member" on public.table_rotation_entries
  for insert to authenticated
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

create policy "table_rotation_entries_update_any_member" on public.table_rotation_entries
  for update to authenticated
  using (
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
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

create policy "table_rotation_entries_delete_any_member" on public.table_rotation_entries
  for delete to authenticated
  using (
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
