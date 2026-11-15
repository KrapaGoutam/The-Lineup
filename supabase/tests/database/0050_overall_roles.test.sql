begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- 1. Schema structure checks
select has_type('public', 'overall_role', 'overall_role enum exists');
select has_table('public', 'overall_roles', 'overall_roles table exists');
select has_column('public', 'overall_roles', 'id', 'overall_roles.id exists');
select has_column('public', 'overall_roles', 'profile_id', 'overall_roles.profile_id exists');
select has_column('public', 'overall_roles', 'role', 'overall_roles.role exists');
select has_column('public', 'overall_roles', 'created_at', 'overall_roles.created_at exists');
select has_column('public', 'overall_roles', 'created_by', 'overall_roles.created_by exists');
select has_column('public', 'overall_roles', 'updated_at', 'overall_roles.updated_at exists');
select col_is_pk('public', 'overall_roles', 'id', 'overall_roles.id is primary key');
select col_is_unique('public', 'overall_roles', ARRAY['profile_id'], 'profile_id has unique constraint');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.overall_roles'::regclass),
  'overall_roles has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.overall_roles', 'SELECT'),
  'anon cannot select overall_roles'
);

select ok(
  has_table_privilege('authenticated', 'public.overall_roles', 'SELECT'),
  'authenticated can select overall_roles'
);

select ok(
  not has_table_privilege('authenticated', 'public.overall_roles', 'INSERT'),
  'authenticated cannot insert into overall_roles directly'
);

-- Seed test identities
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000050001'::uuid, 'user1@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050002'::uuid, 'user2@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050003'::uuid, 'user3@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000050004'::uuid, 'user4@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000050001'::uuid, 'Overall Owner Person'),
  ('00000000-0000-0000-0000-000000050002'::uuid, 'Overall Manager Person'),
  ('00000000-0000-0000-0000-000000050003'::uuid, 'Overall Assistant Manager Person'),
  ('00000000-0000-0000-0000-000000050004'::uuid, 'Regular Person No Overall Role');

-- 2. Valid assignments
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000050001'::uuid, 'owner'),
  ('00000000-0000-0000-0000-000000050002'::uuid, 'manager'),
  ('00000000-0000-0000-0000-000000050003'::uuid, 'assistant_manager');

select is(
  (select role::text from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000050001'::uuid),
  'owner',
  'Overall Owner assigned and persisted'
);

select is(
  (select role::text from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000050002'::uuid),
  'manager',
  'Overall Manager assigned and persisted'
);

select is(
  (select role::text from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000050003'::uuid),
  'assistant_manager',
  'Overall Assistant Manager assigned and persisted'
);

-- 3. Invariants & rejection of invalid assignments
-- Duplicate assignment for same profile fails
select throws_ok(
  $$insert into public.overall_roles (profile_id, role) values ('00000000-0000-0000-0000-000000050001'::uuid, 'manager')$$,
  '23505',
  null,
  'Cannot hold multiple simultaneous overall roles (profile_id uniqueness enforced)'
);

-- Invalid enum value fails
select throws_ok(
  $$insert into public.overall_roles (profile_id, role) values ('00000000-0000-0000-0000-000000050004'::uuid, 'server'::public.overall_role)$$,
  '22P02',
  null,
  'Unsupported overall role values rejected'
);

-- 4. RLS isolation & privilege checks
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000050001', true);

-- User 1 can read their own overall role
select is(
  (select role::text from public.overall_roles),
  'owner',
  'User 1 can read own overall role'
);

-- User 1 cannot see User 2's role (RLS filters it out)
select is(
  (select count(*)::int from public.overall_roles where profile_id = '00000000-0000-0000-0000-000000050002'::uuid),
  0,
  'User 1 cannot view other users overall roles'
);

-- User 4 (regular user with no overall role) sees 0 rows
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000050004', true);
select is(
  (select count(*)::int from public.overall_roles),
  0,
  'User 4 with no assignment resolves to 0 rows'
);

reset role;

select * from finish();
rollback;
