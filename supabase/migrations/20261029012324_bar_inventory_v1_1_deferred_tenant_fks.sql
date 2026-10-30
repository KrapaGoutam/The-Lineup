-- Preserve the module's established tenant-cascade teardown invariant.
-- Actor/location checks remain enforced at transaction commit.
do $$
declare v record;
begin
  for v in select n.nspname,t.relname,c.conname from pg_constraint c
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname in ('inventory_date_lots','inventory_freshness_rules','inventory_saved_views')
      and c.contype='f' and not c.condeferrable
      and c.confrelid in ('public.memberships'::regclass,'public.locations'::regclass)
  loop
    execute format('alter table %I.%I alter constraint %I deferrable initially deferred',v.nspname,v.relname,v.conname);
  end loop;
end $$;
