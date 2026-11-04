begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- --------------------------------------------------------------------------
-- Test identities and fixtures (0056 namespace)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000056000'::uuid, 'overall_owner56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056001'::uuid, 'overall_mgr56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056002'::uuid, 'overall_asst_mgr56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056003'::uuid, 'monks_owner56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056004'::uuid, 'monks_gm56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056005'::uuid, 'staff_jack56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056006'::uuid, 'staff_sam56@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000056007'::uuid, 'revoked_creator56@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000056000'::uuid, 'Overall Owner 56'),
  ('00000000-0000-0000-0000-000000056001'::uuid, 'Overall Manager 56'),
  ('00000000-0000-0000-0000-000000056002'::uuid, 'Overall Asst Mgr 56'),
  ('00000000-0000-0000-0000-000000056003'::uuid, 'Monks Owner 56'),
  ('00000000-0000-0000-0000-000000056004'::uuid, 'Monks GM 56'),
  ('00000000-0000-0000-0000-000000056005'::uuid, 'Jack MultiOrg 56'),
  ('00000000-0000-0000-0000-000000056006'::uuid, 'Sam SingleOrg 56'),
  ('00000000-0000-0000-0000-000000056007'::uuid, 'Revoked Creator 56');

-- Seed Overall Roles
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000056000'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000056001'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000056002'::uuid, 'assistant_manager'::public.overall_role);

-- Seed Organizations
-- Org A: Monks (created_by Revoked Creator 56)
-- Org B: Liquor Tap (created_by Overall Owner 56)
insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000560a1'::uuid, 'Monks Pub 56', 'monks-pub-56', '00000000-0000-0000-0000-000000056007'::uuid, '{"branding": {"primaryColor": "#ff0000"}}'::jsonb),
  ('00000000-0000-0000-0000-0000000560a2'::uuid, 'Liquor Tap 56', 'liquor-tap-56', '00000000-0000-0000-0000-000000056000'::uuid, '{"branding": {"primaryColor": "#00ff00"}}'::jsonb);

-- Seed Memberships
-- Monks Owner has active owner membership in Monks
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-000000056003'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-000000056004'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-000000056005'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000560a2'::uuid, '00000000-0000-0000-0000-000000056005'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000560a2'::uuid, '00000000-0000-0000-0000-000000056006'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-000000056007'::uuid, array['owner']::public.app_role[], false); -- Revoked Creator: INACTIVE

-- --------------------------------------------------------------------------
-- 1. Structural Schema Invariants (DB-001 to DB-006)
-- --------------------------------------------------------------------------
select has_table('public', 'organizations', 'DB-001: public.organizations table reused');
select has_column('public', 'organizations', 'id', 'DB-002a: organizations.id column exists');
select col_type_is('public', 'organizations', 'id', 'uuid', 'DB-002b: organizations.id is UUID');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'DB-002c: public.organizations has RLS enabled'
);

-- Slug format constraint rejects uppercase
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('Bad', 'BAD_SLUG', '00000000-0000-0000-0000-000000056000'::uuid) $$,
  '23514',
  null,
  'DB-004: Slug regex constraint rejects uppercase/invalid format'
);

-- Slug unique constraint rejects duplicate
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('Duplicate', 'monks-pub-56', '00000000-0000-0000-0000-000000056000'::uuid) $$,
  '23505',
  null,
  'DB-003: Slug unique constraint rejects duplicate slug'
);

-- Name constraint rejects empty / whitespace
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('   ', 'valid-slug-xyz', '00000000-0000-0000-0000-000000056000'::uuid) $$,
  '23514',
  null,
  'DB-005: Name constraint rejects whitespace-only string'
);

-- Settings must be JSONB object
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by, settings) values ('Test', 'test-json-arr', '00000000-0000-0000-0000-000000056000'::uuid, '["not", "an", "object"]'::jsonb) $$,
  '23514',
  null,
  'DB-006: Settings constraint rejects non-object jsonb'
);

-- --------------------------------------------------------------------------
-- 2. RLS Security Tests (DB-007 to DB-013)
-- --------------------------------------------------------------------------

-- Overall Owner can SELECT all organizations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056000', true);
select is(
  (select count(*)::int from public.organizations where id in ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-0000000560a2'::uuid)),
  2,
  'DB-007a: Overall Owner can select all organizations via global visibility'
);

-- Overall Manager can SELECT all organizations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056001', true);
select is(
  (select count(*)::int from public.organizations where id in ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-0000000560a2'::uuid)),
  2,
  'DB-007b: Overall Manager can select all organizations via global visibility'
);

-- Sam (Single Org: Liquor Tap) can only select Liquor Tap, NOT Monks
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056006', true);
select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000560a2'::uuid),
  1,
  'DB-007c: Sam can select Liquor Tap (active member)'
);
select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000560a1'::uuid),
  0,
  'DB-007d: Sam CANNOT select Monks (tenant isolation enforced)'
);

-- Jack (Multi Org: Monks + Liquor Tap) can select both
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056005', true);
select is(
  (select count(*)::int from public.organizations where id in ('00000000-0000-0000-0000-0000000560a1'::uuid, '00000000-0000-0000-0000-0000000560a2'::uuid)),
  2,
  'DB-007e: Multi-org member Jack selects both organizations'
);

-- Revoked Creator with inactive membership: CANNOT select Monks (#106 resolution)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056007', true);
select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000560a1'::uuid),
  0,
  'DB-010: Revoked creator with inactive membership cannot select organization (#106)'
);

-- Direct INSERT on organizations:
-- Overall Owner: ALLOWED
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056000', true);
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-0000000560a3'::uuid, 'Owner Created Org', 'owner-created-org-56', '00000000-0000-0000-0000-000000056000'::uuid);
select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000560a3'::uuid),
  1,
  'DB-009a: Overall Owner is allowed direct INSERT on public.organizations'
);

-- Staff Jack: Direct INSERT DENIED by RLS
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056005', true);
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('Staff Org', 'staff-org-56', '00000000-0000-0000-0000-000000056005'::uuid) $$,
  '42501',
  null,
  'DB-009b: Staff user direct INSERT on public.organizations blocked by RLS'
);

-- Overall Manager: Direct INSERT DENIED (tenant creation is owner-exclusive)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056001', true);
select throws_ok(
  $$ insert into public.organizations (name, slug, created_by) values ('Manager Org', 'mgr-org-56', '00000000-0000-0000-0000-000000056001'::uuid) $$,
  '42501',
  null,
  'DB-009c: Overall Manager direct INSERT on public.organizations blocked by RLS'
);

-- UPDATE: Monks GM can update Monks
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056004', true);
update public.organizations
set name = 'Monks Pub Renamed 56'
where id = '00000000-0000-0000-0000-0000000560a1'::uuid;
reset role;
select is(
  (select name from public.organizations where id = '00000000-0000-0000-0000-0000000560a1'::uuid),
  'Monks Pub Renamed 56',
  'DB-011: Active GM can update organization name'
);

-- UPDATE: Monks GM CANNOT update Liquor Tap (cross-tenant mutation blocked)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056004', true);
update public.organizations
set name = 'Hacked Liquor Tap'
where id = '00000000-0000-0000-0000-0000000560a2'::uuid;
reset role;
select is(
  (select name from public.organizations where id = '00000000-0000-0000-0000-0000000560a2'::uuid),
  'Liquor Tap 56',
  'DB-013: Monks GM cannot update Liquor Tap (cross-tenant write isolated)'
);

-- Staff Jack cannot update organization
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056005', true);
update public.organizations
set name = 'Staff Hacked Monks'
where id = '00000000-0000-0000-0000-0000000560a1'::uuid;
reset role;
select is(
  (select name from public.organizations where id = '00000000-0000-0000-0000-0000000560a1'::uuid),
  'Monks Pub Renamed 56',
  'DB-008: Staff member cannot update organization (blocked by RLS)'
);

-- Revoked creator cannot update organization
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056007', true);
update public.organizations
set name = 'Revoked Creator Hacked Monks'
where id = '00000000-0000-0000-0000-0000000560a1'::uuid;
reset role;
select is(
  (select name from public.organizations where id = '00000000-0000-0000-0000-0000000560a1'::uuid),
  'Monks Pub Renamed 56',
  'DB-012: Revoked creator with inactive membership cannot update organization'
);

-- --------------------------------------------------------------------------
-- 3. Immutability Guard Trigger Tests (DB-014)
-- --------------------------------------------------------------------------
reset role;

-- Attempting to update id raises exception
select throws_ok(
  $$ update public.organizations set id = gen_random_uuid() where slug = 'monks-pub-56' $$,
  '22023',
  null,
  'DB-014a: Updating organizations.id is rejected by immutability trigger'
);

-- Attempting to update created_by raises exception
select throws_ok(
  $$ update public.organizations set created_by = gen_random_uuid() where slug = 'monks-pub-56' $$,
  '22023',
  null,
  'DB-014b: Updating organizations.created_by is rejected by immutability trigger'
);

-- Attempting to update created_at raises exception
select throws_ok(
  $$ update public.organizations set created_at = now() - interval '1 year' where slug = 'monks-pub-56' $$,
  '22023',
  null,
  'DB-014c: Updating organizations.created_at is rejected by immutability trigger'
);

-- --------------------------------------------------------------------------
-- 4. Atomic Tenant Provisioning RPC Tests (DB-015 to DB-016)
-- --------------------------------------------------------------------------

-- Overall Owner calls provision_organization successfully
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056000', true);
select lives_ok(
  $$ select public.provision_organization('New Tavern', 'new-tavern-56', '00000000-0000-0000-0000-000000056003'::uuid, '{"branding":{"primaryColor":"#123456"}}'::jsonb) $$,
  'DB-015a: Overall Owner can execute public.provision_organization'
);

-- Verify organization and owner membership were created atomically
reset role;
select is(
  (select count(*)::int from public.organizations where slug = 'new-tavern-56'),
  1,
  'DB-015b: provision_organization created organization row'
);
select is(
  (
    select count(*)::int from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where o.slug = 'new-tavern-56'
      and m.profile_id = '00000000-0000-0000-0000-000000056003'::uuid
      and m.active = true
      and m.roles = array['owner']::public.app_role[]
  ),
  1,
  'DB-015c: provision_organization atomically created active owner membership row'
);

-- Non-Overall Owner (Overall Manager) calling provision_organization throws 42501
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056001', true);
select throws_ok(
  $$ select public.provision_organization('Manager Tavern', 'mgr-tavern-56') $$,
  '42501',
  null,
  'DB-016a: Overall Manager calling provision_organization rejected with 42501'
);

-- Staff Jack calling provision_organization throws 42501
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056005', true);
select throws_ok(
  $$ select public.provision_organization('Staff Tavern', 'staff-tavern-56') $$,
  '42501',
  null,
  'DB-016b: Staff member calling provision_organization rejected with 42501'
);

-- Overall Owner calling provision_organization with non-existent owner profile throws P0002
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000056000', true);
select throws_ok(
  $$ select public.provision_organization('Ghost Tavern', 'ghost-tavern-56', '00000000-0000-0000-0000-ffffffffffff'::uuid) $$,
  'P0002',
  null,
  'DB-015d: provision_organization with invalid owner profile raises P0002'
);

-- Verify NO orphaned organization was left after failed owner bootstrap
reset role;
select is(
  (select count(*)::int from public.organizations where slug = 'ghost-tavern-56'),
  0,
  'DB-015e: Failed owner bootstrap rolls back tenant creation (0 orphaned organizations)'
);

select * from finish();
rollback;
