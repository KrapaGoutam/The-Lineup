begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'memberships', 'memberships exists');
select has_table('public', 'schedule_periods', 'schedule periods exist');
select has_table('public', 'dining_tables', 'dining tables exist');
select has_table('public', 'service_sessions', 'service sessions exist');
select has_table('public', 'rotation_members', 'rotation members exist');
select has_table('public', 'seatings', 'seatings exist');
select has_table('public', 'audit_events', 'audit events exist');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.seatings'::regclass),
  'seatings has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.seatings', 'SELECT'),
  'anon cannot select seatings'
);

select * from finish();
rollback;
