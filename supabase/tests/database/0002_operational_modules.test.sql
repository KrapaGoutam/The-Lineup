begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'operating_hours', 'operating hours exist');
select has_table('public', 'shift_kind_defaults', 'shift defaults exist');
select has_table('public', 'passcode_credentials', 'passcode credentials exist');
select has_table('public', 'access_requests', 'access requests exist');
select has_table('public', 'rotation_rounds', 'rotation rounds exist');
select has_table('public', 'table_rotation_entries', 'table entries exist');
select has_table('public', 'board_events', 'board events exist');
select has_table('public', 'tip_pools', 'tip pools exist');
select has_table('public', 'tip_intervals', 'tip intervals exist');
select has_table('public', 'tip_interval_participants', 'tip participants exist');
select has_table('public', 'tip_allocations', 'tip allocations exist');
select has_function('public', 'recalculate_tip_pool', array['bigint'], 'tip recalculation function exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.table_rotation_entries'::regclass),
  'table rotation entries have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tip_allocations'::regclass),
  'tip allocations have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.passcode_credentials'::regclass),
  'passcode credentials have RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.tip_allocations', 'SELECT'),
  'anon cannot read tip allocations'
);
select ok(
  not has_table_privilege('authenticated', 'public.passcode_credentials', 'SELECT'),
  'authenticated browser clients cannot read passcode credentials'
);
select ok(
  has_table_privilege('authenticated', 'public.tip_allocations', 'SELECT'),
  'authenticated role reaches tip allocations through RLS'
);

select * from finish();
rollback;
