begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- F-1: verify effective privileges, not the presence of REVOKE text.
select ok(not has_table_privilege('anon', 'public.location_memberships', 'SELECT'), 'anon cannot select location assignments');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'INSERT'), 'anon cannot insert location assignments');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'UPDATE'), 'anon cannot update location assignments');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'DELETE'), 'anon cannot delete location assignments');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'TRUNCATE'), 'anon cannot truncate location assignments outside RLS');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'REFERENCES'), 'anon cannot reference location assignments');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'TRIGGER'), 'anon cannot create location-assignment triggers');
select ok(not has_table_privilege('anon', 'public.location_memberships', 'MAINTAIN'), 'anon cannot maintain location assignments');

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.inventory_adjustments_id_seq',
      'public.inventory_change_log_id_seq',
      'public.kiosk_pairing_attempts_id_seq',
      'public.location_lifecycle_events_id_seq',
      'public.location_memberships_id_seq',
      'public.task_events_id_seq',
      'public.task_notifications_id_seq'
    ]) as target(name)
    where has_sequence_privilege('anon', target.name, 'USAGE')
       or has_sequence_privilege('anon', target.name, 'SELECT')
       or has_sequence_privilege('anon', target.name, 'UPDATE')
  ),
  'anon has no effective privilege on the seven audited sequences'
);

select ok(not has_function_privilege('anon', 'public.locations_guard_payload()', 'EXECUTE'), 'anon cannot execute location trigger function');
select ok(not has_function_privilege('anon', 'public.organizations_guard_immutability()', 'EXECUTE'), 'anon cannot execute organization trigger function');
select ok(
  not exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(p.proacl) acl
    where p.oid in ('public.locations_guard_payload()'::regprocedure,
                    'public.organizations_guard_immutability()'::regprocedure)
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no explicit EXECUTE grant on the two trigger functions'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    where n.nspname = 'public'
      and d.defaclrole = 'postgres'::regrole
      and d.defaclobjtype in ('r', 'S', 'f')
      and acl.grantee = 'anon'::regrole
  ),
  'postgres has no explicit future public table, sequence or function grants to anon'
);

-- Owner-approved V9-X2 exception: detect, but do not mutate, platform-owned
-- supabase_admin defaults. This assertion must change only after the separate
-- owner-authorized admin operation, not by silently broadening this migration.
select ok(
  exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    where n.nspname = 'public'
      and d.defaclrole = 'supabase_admin'::regrole
      and d.defaclobjtype in ('r', 'S', 'f')
      and acl.grantee = 'anon'::regrole
  ),
  'read-only follow-up detector: supabase_admin still has explicit public anon defaults'
);

-- Compatibility controls: the authenticated assignment workflow and platform
-- APIs retain their existing grants. No global PUBLIC function default changes.
select ok(has_table_privilege('authenticated', 'public.location_memberships', 'SELECT'), 'authenticated assignment read retained');
select ok(has_table_privilege('authenticated', 'public.location_memberships', 'INSERT'), 'authenticated assignment insert retained');
select ok(has_table_privilege('authenticated', 'public.location_memberships', 'UPDATE'), 'authenticated assignment update retained');
select ok(has_table_privilege('authenticated', 'public.location_memberships', 'DELETE'), 'authenticated assignment delete retained');
select ok(has_sequence_privilege('authenticated', 'public.location_memberships_id_seq', 'USAGE'), 'authenticated assignment identity usage retained');
select ok(has_schema_privilege('anon', 'public', 'USAGE'), 'anonymous public schema usage retained');
select ok(has_schema_privilege('anon', 'graphql_public', 'USAGE'), 'anonymous GraphQL schema usage retained');
select ok(has_function_privilege('anon', 'graphql_public.graphql(text,text,jsonb,jsonb)', 'EXECUTE'), 'GraphQL platform RPC retained');

select * from finish();
rollback;
