begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Test identities and fixtures
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000051000'::uuid, 'creator@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051001'::uuid, 'jack@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051002'::uuid, 'sam@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051003'::uuid, 'tom@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051004'::uuid, 'jerry@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000051005'::uuid, 'outsider@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000051000'::uuid, 'System Creator'),
  ('00000000-0000-0000-0000-000000051001'::uuid, 'Jack Multi-Org'),
  ('00000000-0000-0000-0000-000000051002'::uuid, 'Sam Liquor Tap'),
  ('00000000-0000-0000-0000-000000051003'::uuid, 'Tom Monks'),
  ('00000000-0000-0000-0000-000000051004'::uuid, 'Jerry Multi-Org'),
  ('00000000-0000-0000-0000-000000051005'::uuid, 'Outsider Person');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000510a1'::uuid, 'Monks Bar', 'monks-bar-51', '00000000-0000-0000-0000-000000051000'::uuid),
  ('00000000-0000-0000-0000-0000000510a2'::uuid, 'Liquor Tap Lounge', 'liquor-tap-51', '00000000-0000-0000-0000-000000051000'::uuid);

-- --------------------------------------------------------------------------
-- DB-001: One profile can have an active membership in Monks
-- --------------------------------------------------------------------------
insert into public.memberships (organization_id, profile_id, roles, active)
values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051001'::uuid, array['general_manager']::public.app_role[], true);

select ok(
  exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a1'::uuid
      and profile_id = '00000000-0000-0000-0000-000000051001'::uuid
      and active = true
  ),
  'DB-001: Jack has active membership in Monks'
);

-- --------------------------------------------------------------------------
-- DB-002: Same profile can simultaneously have an active membership in Liquor Tap
-- --------------------------------------------------------------------------
insert into public.memberships (organization_id, profile_id, roles, active)
values ('00000000-0000-0000-0000-0000000510a2'::uuid, '00000000-0000-0000-0000-000000051001'::uuid, array['server']::public.app_role[], true);

select ok(
  exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid
      and profile_id = '00000000-0000-0000-0000-000000051001'::uuid
      and active = true
  ),
  'DB-002: Jack has simultaneous active membership in Liquor Tap'
);

-- --------------------------------------------------------------------------
-- DB-003: The two membership rows remain independent
-- --------------------------------------------------------------------------
update public.memberships
set roles = array['owner']::public.app_role[]
where organization_id = '00000000-0000-0000-0000-0000000510a1'::uuid
  and profile_id = '00000000-0000-0000-0000-000000051001'::uuid;

select is(
  (select roles from public.memberships where organization_id = '00000000-0000-0000-0000-0000000510a1'::uuid and profile_id = '00000000-0000-0000-0000-000000051001'::uuid),
  array['owner']::public.app_role[],
  'DB-003a: Monks membership role updated to owner'
);

select is(
  (select roles from public.memberships where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid and profile_id = '00000000-0000-0000-0000-000000051001'::uuid),
  array['server']::public.app_role[],
  'DB-003b: Liquor Tap membership role remains unaffected as server'
);

-- --------------------------------------------------------------------------
-- DB-004: Duplicate membership for the same (profile_id, organization_id) is prevented
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051001'::uuid, array['server']::public.app_role[], true)$$,
  '23505',
  null,
  'DB-004: Duplicate membership row for same profile and organization rejected by unique constraint'
);

-- --------------------------------------------------------------------------
-- DB-005: Different organization roles coexist for one profile
-- --------------------------------------------------------------------------
select is(
  (select count(distinct roles) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051001'::uuid),
  2::bigint,
  'DB-005: Jack holds distinct roles across his two organization memberships'
);

-- --------------------------------------------------------------------------
-- DB-006: Inactive membership persists
-- --------------------------------------------------------------------------
update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000051001'::uuid;

select ok(
  exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid
      and profile_id = '00000000-0000-0000-0000-000000051001'::uuid
      and active = false
  ),
  'DB-006: Inactive membership row persists in database for history and audit'
);

-- --------------------------------------------------------------------------
-- DB-007: Inactive membership is distinguishable from active membership
-- --------------------------------------------------------------------------
select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051001'::uuid and active = true),
  1::bigint,
  'DB-007a: Exactly 1 active membership returned for Jack'
);

select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051001'::uuid),
  2::bigint,
  'DB-007b: Total memberships (active + inactive) remains 2'
);

-- Re-activate Jack in Liquor Tap for subsequent tests
update public.memberships
set active = true
where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid
  and profile_id = '00000000-0000-0000-0000-000000051001'::uuid;

-- Seed remaining acceptance identities: Sam, Tom, Jerry
insert into public.memberships (organization_id, profile_id, roles, active)
values
  -- Sam: Liquor Tap only
  ('00000000-0000-0000-0000-0000000510a2'::uuid, '00000000-0000-0000-0000-000000051002'::uuid, array['server']::public.app_role[], true),
  -- Tom: Monks only
  ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051003'::uuid, array['server']::public.app_role[], true),
  -- Jerry: Both Monks and Liquor Tap
  ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051004'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000510a2'::uuid, '00000000-0000-0000-0000-000000051004'::uuid, array['server']::public.app_role[], true);

-- --------------------------------------------------------------------------
-- DB-008: Invalid role values remain rejected
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051005'::uuid, '{}'::public.app_role[], true)$$,
  '23514',
  null,
  'DB-008a: Empty roles array rejected by cardinality check constraint'
);

select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051005'::uuid, array['overall_owner']::public.app_role[], true)$$,
  '22P02',
  null,
  'DB-008b: Overall role enum value rejected from organization membership roles'
);

-- --------------------------------------------------------------------------
-- DB-009: Foreign-key integrity is enforced
-- --------------------------------------------------------------------------
select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, array['server']::public.app_role[], true)$$,
  '23503',
  null,
  'DB-009a: Membership for non-existent profile rejected by foreign key'
);

select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000051001'::uuid, array['server']::public.app_role[], true)$$,
  '23503',
  null,
  'DB-009b: Membership for non-existent organization rejected by foreign key'
);

-- --------------------------------------------------------------------------
-- DB-010: Normal user cannot self-enroll through direct client mutation
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051005', true);

select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a1'::uuid, '00000000-0000-0000-0000-000000051005'::uuid, array['server']::public.app_role[], true)$$,
  '42501',
  null,
  'DB-010: Outsider cannot self-enroll into Monks via direct client insert'
);

-- --------------------------------------------------------------------------
-- DB-011: Normal user cannot create membership for another user
-- --------------------------------------------------------------------------
-- Sam (server at Liquor Tap) cannot add Outsider to Liquor Tap
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051002', true);

select throws_ok(
  $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-0000000510a2'::uuid, '00000000-0000-0000-0000-000000051005'::uuid, array['server']::public.app_role[], true)$$,
  '42501',
  null,
  'DB-011: Staff member cannot create membership for another user'
);

-- --------------------------------------------------------------------------
-- DB-012: User cannot infer access to Organization B solely from membership in Organization A
-- --------------------------------------------------------------------------
-- Tom is a member of Monks only. Tom must see Monks memberships, but 0 memberships for Liquor Tap.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051003', true);

select ok(
  exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a1'::uuid
      and profile_id = '00000000-0000-0000-0000-000000051003'::uuid
  ),
  'DB-012a: Tom can select his own membership in Monks'
);

select ok(
  not exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a2'::uuid
  ),
  'DB-012b: Tom cannot select any memberships from Liquor Tap where he has no affiliation'
);

-- Sam is a member of Liquor Tap only. Sam cannot see Monks memberships.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000051002', true);

select ok(
  not exists(
    select 1 from public.memberships
    where organization_id = '00000000-0000-0000-0000-0000000510a1'::uuid
  ),
  'DB-012c: Sam cannot select any memberships from Monks where he has no affiliation'
);

-- Reset role
reset role;

-- Acceptance summary verification across permanent identities
select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051001'::uuid and active = true),
  2::bigint,
  'Acceptance: Jack has exactly 2 active memberships (Monks and Liquor Tap)'
);

select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051002'::uuid and active = true),
  1::bigint,
  'Acceptance: Sam has exactly 1 active membership (Liquor Tap)'
);

select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051003'::uuid and active = true),
  1::bigint,
  'Acceptance: Tom has exactly 1 active membership (Monks)'
);

select is(
  (select count(*) from public.memberships where profile_id = '00000000-0000-0000-0000-000000051004'::uuid and active = true),
  2::bigint,
  'Acceptance: Jerry has exactly 2 active memberships (Monks and Liquor Tap)'
);

rollback;
