begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_table('public', 'registrations', 'registrations table exists (renamed from access_requests)');
select hasnt_table('public', 'access_requests', 'access_requests no longer exists under its old name');
select has_column('public', 'registrations', 'profile_id', 'registrations records the created profile');
select has_column('public', 'registrations', 'self_served', 'registrations flags self-served rows');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.registrations'::regclass),
  'registrations has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.registrations', 'UPDATE'),
  'authenticated cannot update registrations (no more approve/decline step)'
);

select * from finish();
rollback;
