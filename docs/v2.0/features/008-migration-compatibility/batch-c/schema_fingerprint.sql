-- Read-only. Whole-schema fingerprint of the public + private schemas (structure only, no row data).
-- One row per category: name | object count | md5 of the sorted canonical text.
with
cols as (select format('%s.%s.%s %s %s %s', table_schema, table_name, column_name, data_type, is_nullable, coalesce(column_default,'')) t
         from information_schema.columns where table_schema in ('public','private')),
cons as (select format('%s.%s %s %s', n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid)) t
         from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
         where n.nspname in ('public','private')),
idx as (select format('%s %s', schemaname, indexdef) t from pg_indexes where schemaname in ('public','private')),
pol as (select format('%s.%s %s %s %s %s %s', schemaname, tablename, policyname, cmd, roles::text, coalesce(qual,''), coalesce(with_check,'')) t
        from pg_policies where schemaname in ('public','private')),
trg as (select format('%s.%s %s', n.nspname, c.relname, pg_get_triggerdef(g.oid)) t
        from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace
        where not g.tgisinternal and n.nspname in ('public','private')),
fns as (select format('%s.%s(%s) %s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), md5(pg_get_functiondef(p.oid))) t
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
fnacl as (select format('%s.%s(%s) %s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), coalesce(p.proacl::text,'')) t
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
tblacl as (select format('%s.%s %s rls=%s force=%s', n.nspname, c.relname, coalesce(c.relacl::text,''), c.relrowsecurity, c.relforcerowsecurity) t
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m')),
al as (select 'columns' k, t from cols union all select 'constraints', t from cons union all select 'indexes', t from idx
       union all select 'policies', t from pol union all select 'triggers', t from trg union all select 'functions', t from fns
       union all select 'function_acl', t from fnacl union all select 'table_acl_rls', t from tblacl)
select k, count(*)::int as n, md5(string_agg(t, E'\n' order by t)) as h from al group by k order by k;
