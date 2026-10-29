begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- ---------------------------------------------------------------------
-- Bar Inventory V1 / BI-9 -- Realtime is a notification only (owner decision D7).
-- BI-RT-001: the two tables are on the publication and nothing else in the
-- module is. Realtime applies each table's SELECT policy per subscriber, so
-- the access rules are the ones 0035 already proves; here we prove that the
-- tables stay protected (RLS on, no client writes) now that they publish.
-- ---------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_stock'
  ),
  'BI-RT-001 inventory_stock is on the realtime publication'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_adjustments'
  ),
  'BI-RT-001 inventory_adjustments is on the realtime publication'
);

-- Only those two: catalog, batches and the change log never publish.
select is(
  (
    select array_agg(tablename::text order by tablename)
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'inventory\_%'
  ),
  array['inventory_adjustments', 'inventory_date_lots', 'inventory_freshness_rules', 'inventory_stock'],
  'BI-RT-001 stock, ledger, dates and rules publish; catalog, personal views and audit do not'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.inventory_stock'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.inventory_adjustments'::regclass),
  'RLS stays enabled on both published tables (Realtime applies the SELECT policy per subscriber)'
);

select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('inventory_stock', 'inventory_adjustments')
      and cmd <> 'SELECT'
  ),
  0,
  'neither published table has a client write policy'
);

select ok(
  not has_table_privilege('anon', 'public.inventory_stock', 'select')
  and not has_table_privilege('anon', 'public.inventory_adjustments', 'select'),
  'anon cannot read either published table'
);

select ok(
  not has_table_privilege('authenticated', 'public.inventory_stock', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.inventory_adjustments', 'insert,update,delete'),
  'authenticated has select only; every change goes through the RPCs'
);

select * from finish();
rollback;
