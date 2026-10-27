-- Bar Inventory V1 / BI-9 (owner decision D7): Realtime is a notification only.
--
-- The database stays the truth. A change to a count or a ledger row sends a
-- "something changed" signal; the screen ignores what the signal carries and
-- re-reads through the normal loaders. Nothing about quantities is ever taken
-- from an event payload.
--
-- Access: Realtime applies each table's SELECT policy per subscriber, so only a
-- management role with access to the location is told anything (the policies
-- are the BI-2 ones: private.inventory_can_access_location). No policy,
-- grant or table changes here.
--
-- Scope is exactly what the spec asks for: inventory_stock and
-- inventory_adjustments. Catalog edits (a rename, an archive) are picked up
-- by the focus / visibility re-read and by every write's own version check.
--
-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form and a multi-table
-- statement aborts on the first existing member, so each table is added only
-- if it is not already a member (the migration is safe to re-run).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_stock'
  ) then
    alter publication supabase_realtime add table public.inventory_stock;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_adjustments'
  ) then
    alter publication supabase_realtime add table public.inventory_adjustments;
  end if;
end;
$$;
