begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- --------------------------------------------------------------------------
-- Test identities and fixtures (0055 namespace)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000055000'::uuid, 'creator55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055001'::uuid, 'noncreator_owner55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055002'::uuid, 'monks_gm55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055003'::uuid, 'staff_bob55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055004'::uuid, 'target_sam55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055005'::uuid, 'overall_owner55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055006'::uuid, 'overall_mgr55@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000055007'::uuid, 'overall_asst_mgr55@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000055000'::uuid, 'Creator 55'),
  ('00000000-0000-0000-0000-000000055001'::uuid, 'Noncreator Owner 55'),
  ('00000000-0000-0000-0000-000000055002'::uuid, 'Monks GM 55'),
  ('00000000-0000-0000-0000-000000055003'::uuid, 'Staff Bob 55'),
  ('00000000-0000-0000-0000-000000055004'::uuid, 'Target Sam 55'),
  ('00000000-0000-0000-0000-000000055005'::uuid, 'Overall Owner 55'),
  ('00000000-0000-0000-0000-000000055006'::uuid, 'Overall Manager 55'),
  ('00000000-0000-0000-0000-000000055007'::uuid, 'Overall Asst Mgr 55');

-- Seed Overall Roles
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000055005'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000055006'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000055007'::uuid, 'assistant_manager'::public.overall_role);

-- Seed Organizations
-- Org 1: Monks Pub, created by Creator 55
-- Org 2: Liquor Tap, created by Creator 55
insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, 'Monks Pub 55', 'monks-pub-55', '00000000-0000-0000-0000-000000055000'::uuid),
  ('00000000-0000-0000-0000-0000000550a2'::uuid, 'Liquor Tap 55', 'liquor-tap-55', '00000000-0000-0000-0000-000000055000'::uuid);

-- Seed Locations
insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-0000000550b1'::uuid, '00000000-0000-0000-0000-0000000550a1'::uuid, 'Webster 55', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000550b2'::uuid, '00000000-0000-0000-0000-0000000550a2'::uuid, 'NASA 55', 'America/Chicago');

-- Seed Memberships:
-- Creator has active owner membership in Monks
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055000'::uuid, array['owner']::public.app_role[], true);

-- Noncreator has active owner membership in Monks
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055001'::uuid, array['owner']::public.app_role[], true);

-- Monks GM has active general_manager membership in Monks only
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055002'::uuid, array['general_manager']::public.app_role[], true);

-- Staff Bob has active server membership in Monks and active server in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055003'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000550a2'::uuid, '00000000-0000-0000-0000-000000055003'::uuid, array['server']::public.app_role[], true);

-- Target Sam has active server membership in Monks and active server in Liquor Tap
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055004'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000550a2'::uuid, '00000000-0000-0000-0000-000000055004'::uuid, array['server']::public.app_role[], true);

-- --------------------------------------------------------------------------
-- SEC-012: Structural validation of private.has_org_role
-- --------------------------------------------------------------------------
select ok(
  pg_get_functiondef('private.has_org_role'::regproc) !~ 'created_by',
  'SEC-012a: private.has_org_role definition does not reference created_by (bypass eliminated)'
);

select ok(
  (select prosecdef from pg_proc where oid = 'private.has_org_role'::regproc),
  'SEC-012b: private.has_org_role remains SECURITY DEFINER'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.apply_location_assignment_changes'::regproc),
  'SEC-012c: public.apply_location_assignment_changes is SECURITY DEFINER'
);

-- --------------------------------------------------------------------------
-- SEC-001: Creator with active owner membership: ALLOW
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055000', true);

select ok(
  private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['owner']::public.app_role[]
  ),
  'SEC-001a: Creator with active owner membership passes has_org_role'
);

select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000550a1'::uuid),
  1,
  'SEC-001b: Creator with active owner membership can view organization via RLS'
);

select lives_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "assign", "role": "staff"}]'::jsonb
  )$$,
  'SEC-001c: Creator with active owner membership can assign locations'
);

-- --------------------------------------------------------------------------
-- SEC-002: Creator with inactive membership: DENY
-- --------------------------------------------------------------------------
reset role;
update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-0000000550a1'::uuid
  and profile_id = '00000000-0000-0000-0000-000000055000'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055000', true);

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['owner']::public.app_role[]
  ),
  'SEC-002a: Creator with inactive membership fails has_org_role for owner'
);

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['server']::public.app_role[]
  ),
  'SEC-002b: Creator with inactive membership fails has_org_role for server'
);

select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000550a1'::uuid),
  0,
  'SEC-002c: Creator with inactive membership cannot view organization via RLS'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "update", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-002d: Creator with inactive membership denied apply_location_assignment_changes'
);

select throws_ok(
  $$insert into public.location_memberships (location_id, profile_id, role)
    values ('00000000-0000-0000-0000-0000000550b1'::uuid, '00000000-0000-0000-0000-000000055003'::uuid, 'staff')$$,
  '42501',
  null,
  'SEC-002e: Creator with inactive membership denied direct insert on location_memberships'
);

-- --------------------------------------------------------------------------
-- SEC-003: Creator with deleted membership row: DENY
-- --------------------------------------------------------------------------
reset role;
delete from public.memberships
where organization_id = '00000000-0000-0000-0000-0000000550a1'::uuid
  and profile_id = '00000000-0000-0000-0000-000000055000'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055000', true);

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['owner']::public.app_role[]
  ),
  'SEC-003a: Creator with deleted membership fails has_org_role entirely'
);

select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000550a1'::uuid),
  0,
  'SEC-003b: Creator with deleted membership cannot view organization via RLS'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "update", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-003c: Creator with deleted membership denied apply_location_assignment_changes'
);

-- --------------------------------------------------------------------------
-- SEC-004: Creator without sufficient role: DENY elevated capability
-- --------------------------------------------------------------------------
reset role;
insert into public.memberships (organization_id, profile_id, roles, active)
values ('00000000-0000-0000-0000-0000000550a1'::uuid, '00000000-0000-0000-0000-000000055000'::uuid, array['server']::public.app_role[], true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055000', true);

select ok(
  private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['server']::public.app_role[]
  ),
  'SEC-004a: Creator with server role passes server check'
);

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['owner']::public.app_role[]
  ),
  'SEC-004b: Creator with server role fails elevated owner check'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "update", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-004c: Creator with server role cannot assign locations'
);

-- --------------------------------------------------------------------------
-- SEC-005: Noncreator with active authorized membership: ALLOW
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055001', true);

select ok(
  private.has_org_role(
    '00000000-0000-0000-0000-0000000550a1'::uuid,
    array['owner']::public.app_role[]
  ),
  'SEC-005a: Noncreator with active owner role passes has_org_role'
);

select is(
  (select count(*)::int from public.organizations where id = '00000000-0000-0000-0000-0000000550a1'::uuid),
  1,
  'SEC-005b: Noncreator owner can view organization via RLS'
);

-- --------------------------------------------------------------------------
-- SEC-006: Unauthorized cross-organization access: DENY
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055002', true); -- Monks GM

select ok(
  not private.has_org_role(
    '00000000-0000-0000-0000-0000000550a2'::uuid,
    array['general_manager']::public.app_role[]
  ),
  'SEC-006a: Monks GM fails has_org_role in Liquor Tap'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b2", "action": "assign", "role": "staff"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-006b: Monks GM cannot mutate Liquor Tap NASA location assignment'
);

-- --------------------------------------------------------------------------
-- SEC-008 & SEC-009: Normal staff self-promotion and cross-user promotion: DENY
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055003', true); -- Staff Bob

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055003'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "assign", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-008: Normal staff cannot self-promote to Manager via RPC'
);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "update", "role": "manager"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-009: Normal staff cannot promote another user via RPC'
);

-- --------------------------------------------------------------------------
-- SEC-011: Unauthorized batch assignment: zero partial writes
-- (Monks GM attempts batch: 1 Monks Webster + 1 Liquor Tap NASA)
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055002', true); -- Monks GM

reset role;
delete from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000055004'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055002', true);

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[
      {"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "assign", "role": "staff"},
      {"locationId": "00000000-0000-0000-0000-0000000550b2", "action": "assign", "role": "staff"}
    ]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-011a: Batch containing unauthorized cross-org item throws 42501'
);

reset role;
select is(
  (select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000055004'::uuid),
  0,
  'SEC-011b: Atomicity preserved: zero partial writes on batch abort'
);

-- --------------------------------------------------------------------------
-- SEC-013 & SEC-014: Overall Owner & Overall Manager global authority: ALLOW
-- --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055005', true); -- Overall Owner

select lives_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "assign", "role": "manager"}]'::jsonb
  )$$,
  'SEC-013: Overall Owner can assign locations across organizations without org membership'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055006', true); -- Overall Manager

select lives_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b2", "action": "assign", "role": "staff"}]'::jsonb
  )$$,
  'SEC-014: Overall Manager can assign locations across organizations without org membership'
);

-- --------------------------------------------------------------------------
-- SEC-015: Overall Assistant Manager boundary: DENY elevated manager capability
-- --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000055007', true); -- Overall Asst Mgr

select throws_ok(
  $$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000055004'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000550b1", "action": "update", "role": "staff"}]'::jsonb
  )$$,
  '42501',
  null,
  'SEC-015: Overall Assistant Manager is denied elevated assignment management without org GM/owner role'
);

reset role;

select * from finish();
rollback;
