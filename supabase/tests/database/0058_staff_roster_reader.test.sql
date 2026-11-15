begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- V2-002.004: public.list_organization_staff — authorized organization roster reader.
-- Fixtures use the 0058 namespace.

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000580000'::uuid, 'creator58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580001'::uuid, 'org_owner58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580002'::uuid, 'org_gm58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580003'::uuid, 'orgb_gm58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580004'::uuid, 'org_server58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580005'::uuid, 'overall_owner58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580006'::uuid, 'overall_mgr58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580007'::uuid, 'overall_asst58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580008'::uuid, 'target_sam58@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000580009'::uuid, 'former_lee58@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000580000'::uuid, 'Creator 58'),
  ('00000000-0000-0000-0000-000000580001'::uuid, 'Org Owner 58'),
  ('00000000-0000-0000-0000-000000580002'::uuid, 'Org GM 58'),
  ('00000000-0000-0000-0000-000000580003'::uuid, 'Org B GM 58'),
  ('00000000-0000-0000-0000-000000580004'::uuid, 'Org Server 58'),
  ('00000000-0000-0000-0000-000000580005'::uuid, 'Overall Owner 58'),
  ('00000000-0000-0000-0000-000000580006'::uuid, 'Overall Manager 58'),
  ('00000000-0000-0000-0000-000000580007'::uuid, 'Overall Asst Mgr 58'),
  ('00000000-0000-0000-0000-000000580008'::uuid, 'Target Sam 58'),
  ('00000000-0000-0000-0000-000000580009'::uuid, 'Former Lee 58');

insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000580005'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000580006'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000580007'::uuid, 'assistant_manager'::public.overall_role);

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-0000000580a1'::uuid, 'Liquor Tap 58', 'liquor-tap-58', '00000000-0000-0000-0000-000000580000'::uuid),
  ('00000000-0000-0000-0000-0000000580a2'::uuid, 'Monks Pub 58', 'monks-pub-58', '00000000-0000-0000-0000-000000580000'::uuid);

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-0000000580b1'::uuid, '00000000-0000-0000-0000-0000000580a1'::uuid, 'League City 58', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000580b2'::uuid, '00000000-0000-0000-0000-0000000580a2'::uuid, 'Webster 58', 'America/Chicago');

-- Org A: creator (REVOKED: inactive owner), owner, GM, server, Sam (active), Lee (inactive).
-- Org B: its own GM only.
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580000'::uuid, array['owner']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580001'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580002'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580004'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580008'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580009'::uuid, array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000580a2'::uuid, '00000000-0000-0000-0000-000000580003'::uuid, array['general_manager']::public.app_role[], true);

-- Structure
select ok((select prosecdef from pg_proc where oid = 'public.list_organization_staff(uuid,uuid,integer,integer)'::regprocedure),
  'list_organization_staff is SECURITY DEFINER (authority re-checked inside)');
select ok(array_to_string((select proconfig from pg_proc where oid = 'public.list_organization_staff(uuid,uuid,integer,integer)'::regprocedure), ',') like '%search_path=%',
  'list_organization_staff pins search_path');
select ok(not has_function_privilege('anon', 'public.list_organization_staff(uuid,uuid,integer,integer)', 'execute'),
  'anon has no EXECUTE on list_organization_staff');
select ok(has_function_privilege('authenticated', 'public.list_organization_staff(uuid,uuid,integer,integer)', 'execute'),
  'authenticated has EXECUTE on list_organization_staff');
select ok(pg_get_function_result('public.list_organization_staff(uuid,uuid,integer,integer)'::regprocedure) !~* '(avatar|email|passcode)',
  'list_organization_staff exposes no avatar, email or credential columns');

set local role authenticated;

-- SEC-01: Overall Owner WITHOUT organization membership reads the roster
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580005', true);
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)), 6, 'SEC-01a: Overall Owner without membership reads the full org roster');
select is((select display_name from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid) where profile_id = '00000000-0000-0000-0000-000000580009'::uuid), 'Former Lee 58',
  'SEC-01b: roster includes inactive members with their display name');
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid, '00000000-0000-0000-0000-000000580008'::uuid)), 1, 'SEC-01c: single-member lookup returns exactly the requested member');
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid, null, 2)), 2, 'SEC-01d: page size is honored');

-- SEC-02: Overall Manager WITHOUT organization membership
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580006', true);
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)), 6, 'SEC-02: Overall Manager without membership reads the full org roster');

-- SEC-03 / SEC-04: active Org Owner and General Manager
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580001', true);
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)), 6, 'SEC-03: Org Owner reads own organization roster');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580002', true);
select is((select count(*)::int from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)), 6, 'SEC-04a: Org General Manager reads own organization roster');
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a2'::uuid)$$, '42501', null,
  'SEC-04b: Org A General Manager cannot read Org B roster');

-- SEC-05: cross-organization / ordinary member denial
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580003', true);
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)$$, '42501', null,
  'SEC-05a: Org B General Manager cannot read Org A roster');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580004', true);
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)$$, '42501', null,
  'SEC-05b: ordinary org member (server) cannot read the roster');

-- SEC-06: revoked creator without independent authority
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580000', true);
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)$$, '42501', null,
  'SEC-06: revoked creator (inactive membership) cannot read the roster');

-- SEC-07: Overall Assistant Manager alone has no roster or assignment authority
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580007', true);
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)$$, '42501', null,
  'SEC-07a: Overall Assistant Manager alone cannot read the roster');
select throws_ok($$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000580008'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000580b1", "action": "assign", "role": "staff"}]'::jsonb
  )$$, '42501', null,
  'SEC-07b: Overall Assistant Manager alone cannot mutate assignments');

reset role;
set local role anon;
select throws_ok($$select * from public.list_organization_staff('00000000-0000-0000-0000-0000000580a1'::uuid)$$, '42501', null,
  'anon is denied roster access');
reset role;

-- SEC-08: Overall Owner (no org membership) performs a valid assignment via the existing RPC
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580005', true);
select lives_ok($$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000580008'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000580b1", "action": "assign", "role": "manager"}]'::jsonb
  )$$, 'SEC-08a: Overall Owner without membership can assign an active member');
reset role;
select is((select role::text from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000580008'::uuid and location_id = '00000000-0000-0000-0000-0000000580b1'::uuid),
  'manager', 'SEC-08b: assignment was persisted with the requested location role');

-- SEC-09: target without ACTIVE organization membership cannot be assigned
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580005', true);
select throws_ok($$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000580009'::uuid,
    '[{"locationId": "00000000-0000-0000-0000-0000000580b1", "action": "assign", "role": "staff"}]'::jsonb
  )$$, '42501', null, 'SEC-09a: inactive organization member cannot be assigned');
reset role;
select is((select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000580009'::uuid), 0,
  'SEC-09b: no assignment row was created for the inactive member');

-- SEC-10: mixed authorized / unauthorized batch fails atomically
delete from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000580008'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000580002', true);
select throws_ok($$select * from public.apply_location_assignment_changes(
    '00000000-0000-0000-0000-000000580008'::uuid,
    '[
      {"locationId": "00000000-0000-0000-0000-0000000580b1", "action": "assign", "role": "staff"},
      {"locationId": "00000000-0000-0000-0000-0000000580b2", "action": "assign", "role": "staff"}
    ]'::jsonb
  )$$, '42501', null, 'SEC-10a: batch with an unauthorized location is rejected');
reset role;
select is((select count(*)::int from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000580008'::uuid), 0,
  'SEC-10b: zero partial writes after the rejected batch');

select * from finish();
rollback;
