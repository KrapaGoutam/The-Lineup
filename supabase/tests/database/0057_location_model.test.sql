begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- --------------------------------------------------------------------------
-- Test identities and fixtures (0057 namespace)
-- --------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000057000'::uuid, 'overall_owner57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057001'::uuid, 'overall_mgr57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057002'::uuid, 'overall_asst_mgr57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057003'::uuid, 'monks_owner57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057004'::uuid, 'monks_gm57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057005'::uuid, 'jack_multi57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057006'::uuid, 'sam_single57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057007'::uuid, 'revoked_creator57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057008'::uuid, 'john_mixed57@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000057009'::uuid, 'outsider57@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000057000'::uuid, 'Overall Owner 57'),
  ('00000000-0000-0000-0000-000000057001'::uuid, 'Overall Manager 57'),
  ('00000000-0000-0000-0000-000000057002'::uuid, 'Overall Asst Mgr 57'),
  ('00000000-0000-0000-0000-000000057003'::uuid, 'Monks Owner 57'),
  ('00000000-0000-0000-0000-000000057004'::uuid, 'Monks GM 57'),
  ('00000000-0000-0000-0000-000000057005'::uuid, 'Jack Multi 57'),
  ('00000000-0000-0000-0000-000000057006'::uuid, 'Sam Single 57'),
  ('00000000-0000-0000-0000-000000057007'::uuid, 'Revoked Creator 57'),
  ('00000000-0000-0000-0000-000000057008'::uuid, 'John Mixed 57'),
  ('00000000-0000-0000-0000-000000057009'::uuid, 'Outsider 57');

-- Seed Overall Roles
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000057000'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000057001'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000057002'::uuid, 'assistant_manager'::public.overall_role);

-- Seed Organizations
insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000570a1'::uuid, 'Monks Pub 57', 'monks-pub-57', '00000000-0000-0000-0000-000000057007'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Liquor Tap 57', 'liquor-tap-57', '00000000-0000-0000-0000-000000057000'::uuid, '{}'::jsonb);

-- Seed Memberships
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000570a1'::uuid, '00000000-0000-0000-0000-000000057003'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a1'::uuid, '00000000-0000-0000-0000-000000057004'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a1'::uuid, '00000000-0000-0000-0000-000000057005'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a1'::uuid, '00000000-0000-0000-0000-000000057008'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a1'::uuid, '00000000-0000-0000-0000-000000057007'::uuid, array['owner']::public.app_role[], false), -- Inactive creator
  ('00000000-0000-0000-0000-0000000570a2'::uuid, '00000000-0000-0000-0000-000000057005'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a2'::uuid, '00000000-0000-0000-0000-000000057006'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000570a2'::uuid, '00000000-0000-0000-0000-000000057008'::uuid, array['general_manager']::public.app_role[], true);

-- Seed Locations
insert into public.locations (id, organization_id, name, time_zone, address, cover_weight, active)
values
  ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-0000000570a1'::uuid, 'Webster', 'America/Chicago', '{"city": "Webster"}'::jsonb, 0.25, true),
  ('00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-0000000570a2'::uuid, 'NASA', 'America/Chicago', '{"city": "Houston"}'::jsonb, 0.25, true),
  ('00000000-0000-0000-0000-0000000570b3'::uuid, '00000000-0000-0000-0000-0000000570a2'::uuid, 'League City', 'America/Chicago', '{"city": "League City"}'::jsonb, 0.25, true);

-- Seed Location Memberships
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-000000057005'::uuid, 'staff'::public.location_role, true), -- Jack @ Webster
  ('00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-000000057005'::uuid, 'staff'::public.location_role, true), -- Jack @ NASA
  ('00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-000000057006'::uuid, 'staff'::public.location_role, true), -- Sam @ NASA only
  ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-000000057008'::uuid, 'manager'::public.location_role, true), -- John @ Webster Manager
  ('00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-000000057008'::uuid, 'manager'::public.location_role, true), -- John @ NASA Manager
  ('00000000-0000-0000-0000-0000000570b3'::uuid, '00000000-0000-0000-0000-000000057008'::uuid, 'assistant_manager'::public.location_role, true); -- John @ League City Asst Mgr

-- --------------------------------------------------------------------------
-- 1. Structural Schema Invariants (DB-001 to DB-007)
-- --------------------------------------------------------------------------
select has_table('public', 'locations', 'DB-001: public.locations table reused');
select has_column('public', 'locations', 'id', 'DB-003a: locations.id column exists');
select col_type_is('public', 'locations', 'id', 'uuid', 'DB-003b: locations.id is UUID');
select col_is_fk('public', 'locations', 'organization_id', 'DB-002: locations.organization_id is foreign key');

-- Tenant-scoped name uniqueness
select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'NASA', 'America/Chicago') $$,
  '23505',
  null,
  'DB-004: Tenant-scoped name uniqueness rejects duplicate name in same org'
);

-- Time-zone persistence validation: rejects invalid strings and ambiguous abbreviations
select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Invalid Zone Loc 1', 'Texas') $$,
  '22023',
  null,
  'DB-005a: Trigger rejects invalid time zone text Texas'
);

select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Invalid Zone Loc 2', 'CST') $$,
  '22023',
  null,
  'DB-005b: Trigger rejects ambiguous fixed abbreviation CST'
);

select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Invalid Zone Loc 3', 'GMT-6') $$,
  '22023',
  null,
  'DB-005c: Trigger rejects ambiguous fixed offset GMT-6'
);

-- Address object validation: rejects non-object jsonb
select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone, address) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Bad Address Loc', 'America/Chicago', '["not", "an", "object"]'::jsonb) $$,
  '22023',
  null,
  'DB-006: Trigger rejects non-object address payload'
);

-- Operating-hours storage validation: overnight hours supported
insert into public.operating_hours (organization_id, location_id, day_of_week, opening_local, closing_local, closed)
values ('00000000-0000-0000-0000-0000000570a2'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, 5, '17:00'::time, '02:00'::time, false);

select ok(
  exists (
    select 1 from public.operating_hours
    where location_id = '00000000-0000-0000-0000-0000000570b2'::uuid
      and day_of_week = 5
      and opening_local = '17:00'::time
      and closing_local = '02:00'::time
  ),
  'DB-007a: Overnight operating hours stored successfully (17:00 -> 02:00)'
);

-- Operating-hours storage validation: identical opening and closing rejected
select throws_ok(
  $$ insert into public.operating_hours (organization_id, location_id, day_of_week, opening_local, closing_local, closed)
     values ('00000000-0000-0000-0000-0000000570a2'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, 6, '11:00'::time, '11:00'::time, false) $$,
  '23514',
  null,
  'DB-007b: Operating hours check constraint rejects identical opening and closing times'
);

-- --------------------------------------------------------------------------
-- 2. RLS Security Tests (DB-008 to DB-014, DB-017)
-- --------------------------------------------------------------------------

-- Overall Owner can SELECT all locations across organizations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057000', true);
select is(
  (select count(*)::int from public.locations where id in ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-0000000570b3'::uuid)),
  3,
  'DB-010a: Overall Owner can select all locations via global baseline'
);

-- Overall Manager can SELECT all locations across organizations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057001', true);
select is(
  (select count(*)::int from public.locations where id in ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-0000000570b3'::uuid)),
  3,
  'DB-010b: Overall Manager can select all locations via global baseline'
);

-- Sam (Liquor Tap member) can SELECT Liquor Tap locations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057006', true);
select is(
  (select count(*)::int from public.locations where organization_id = '00000000-0000-0000-0000-0000000570a2'::uuid),
  2,
  'DB-010c: Sam selects Liquor Tap locations (NASA & League City)'
);

-- Sam CANNOT select Monks locations (cross-tenant isolated)
select is(
  (select count(*)::int from public.locations where organization_id = '00000000-0000-0000-0000-0000000570a1'::uuid),
  0,
  'DB-010d: Sam CANNOT select Monks locations (cross-tenant isolation enforced)'
);

-- Jack (multi-org member) selects locations from both organizations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057005', true);
select is(
  (select count(*)::int from public.locations where id in ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-0000000570b3'::uuid)),
  3,
  'DB-010e: Multi-org member Jack selects locations across both authorized organizations'
);

-- Ordinary staff direct INSERT on public.locations blocked by RLS
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057006', true);
select throws_ok(
  $$ insert into public.locations (organization_id, name, time_zone) values ('00000000-0000-0000-0000-0000000570a2'::uuid, 'Sam New Branch', 'America/Chicago') $$,
  '42501',
  null,
  'DB-008: Staff member direct INSERT on public.locations blocked by RLS'
);

-- Ordinary staff direct UPDATE on public.locations blocked by RLS
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057006', true);
update public.locations
set name = 'Sam Hack NASA'
where id = '00000000-0000-0000-0000-0000000570b2'::uuid;
reset role;
select is(
  (select name from public.locations where id = '00000000-0000-0000-0000-0000000570b2'::uuid),
  'NASA',
  'DB-009: Staff member direct UPDATE on public.locations blocked by RLS (name unchanged)'
);

-- Monks GM cannot update Liquor Tap NASA (cross-tenant write denied)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057004', true);
update public.locations
set name = 'Monks GM Tamper NASA'
where id = '00000000-0000-0000-0000-0000000570b2'::uuid;
reset role;
select is(
  (select name from public.locations where id = '00000000-0000-0000-0000-0000000570b2'::uuid),
  'NASA',
  'DB-011: Monks GM cannot update Liquor Tap NASA (cross-tenant write isolated)'
);

-- Authenticated user with no memberships sees 0 locations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057009', true);
select is(
  (select count(*)::int from public.locations where id in ('00000000-0000-0000-0000-0000000570b1'::uuid, '00000000-0000-0000-0000-0000000570b2'::uuid, '00000000-0000-0000-0000-0000000570b3'::uuid)),
  0,
  'DB-017: Authenticated user with no memberships or roles sees 0 locations'
);

-- Revoked creator with inactive membership cannot select locations
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057007', true);
select is(
  (select count(*)::int from public.locations where id = '00000000-0000-0000-0000-0000000570b1'::uuid),
  0,
  'DB-013: Revoked creator with inactive membership cannot select location (#106)'
);

-- --------------------------------------------------------------------------
-- 3. Immutability Guards (DB-012)
-- --------------------------------------------------------------------------
reset role;

-- Location ID mutation rejected
select throws_ok(
  $$ update public.locations set id = '00000000-0000-0000-0000-0000000570ff'::uuid where id = '00000000-0000-0000-0000-0000000570b1'::uuid $$,
  '22023',
  'Location ID is immutable',
  'DB-012a: Updating locations.id is rejected by immutability trigger'
);

-- Location organization_id mutation rejected
select throws_ok(
  $$ update public.locations set organization_id = '00000000-0000-0000-0000-0000000570a2'::uuid where id = '00000000-0000-0000-0000-0000000570b1'::uuid $$,
  '22023',
  'Location organization_id is immutable',
  'DB-012b: Updating locations.organization_id is rejected by immutability trigger'
);

-- Location created_at mutation rejected
select throws_ok(
  $$ update public.locations set created_at = now() - interval '10 days' where id = '00000000-0000-0000-0000-0000000570b1'::uuid $$,
  '22023',
  'Location created_at is immutable',
  'DB-012c: Updating locations.created_at is rejected by immutability trigger'
);

-- Inactive org membership grants no management authority (DB-014)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057007', true);
select throws_ok(
  $$ select public.provision_location('00000000-0000-0000-0000-0000000570a1'::uuid, 'Revoked Branch', 'America/Chicago') $$,
  '42501',
  'Unauthorized: location provisioning requires management authority',
  'DB-014: Inactive membership grants no management authority to provision location'
);

-- --------------------------------------------------------------------------
-- 4. Provisioning RPC & Role Preservation (DB-015, DB-016, DB-018)
-- --------------------------------------------------------------------------

-- Overall Owner calls provision_location successfully
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057000', true);

select lives_ok(
  $$ select public.provision_location('00000000-0000-0000-0000-0000000570a2'::uuid, 'Clear Lake', 'America/Chicago', '{"city": "Clear Lake"}'::jsonb) $$,
  'DB-015a: Overall Owner can execute public.provision_location'
);

-- Verify location was inserted
select ok(
  exists (
    select 1 from public.locations
    where organization_id = '00000000-0000-0000-0000-0000000570a2'::uuid
      and name = 'Clear Lake'
  ),
  'DB-015b: provision_location created location row'
);

-- Verify NO synthetic staff memberships were created
select is(
  (select count(*)::int from public.location_memberships lm
   join public.locations l on l.id = lm.location_id
   where l.name = 'Clear Lake'),
  0,
  'DB-015c: provision_location did NOT synthesize any staff membership rows (0 created)'
);

-- John mixed-role regression preserved
select ok(
  (select role = 'manager'::public.location_role from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000057008'::uuid and location_id = '00000000-0000-0000-0000-0000000570b1'::uuid)
  and (select role = 'manager'::public.location_role from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000057008'::uuid and location_id = '00000000-0000-0000-0000-0000000570b2'::uuid)
  and (select role = 'assistant_manager'::public.location_role from public.location_memberships where profile_id = '00000000-0000-0000-0000-000000057008'::uuid and location_id = '00000000-0000-0000-0000-0000000570b3'::uuid),
  'DB-016: John mixed-role assignments preserved across Webster, NASA, and League City'
);

-- Staff calling provision_location raises 42501
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057006', true);
select throws_ok(
  $$ select public.provision_location('00000000-0000-0000-0000-0000000570a2'::uuid, 'Sam Illegal Loc', 'America/Chicago') $$,
  '42501',
  'Unauthorized: location provisioning requires management authority',
  'DB-018a: Staff member calling provision_location rejected with 42501'
);

-- Overall Owner calling with invalid organization ID raises P0002
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000057000', true);
select throws_ok(
  $$ select public.provision_location('00000000-0000-0000-0000-000000057999'::uuid, 'Ghost Org Loc', 'America/Chicago') $$,
  'P0002',
  'Target organization does not exist',
  'DB-018b: provision_location with non-existent organization raises P0002'
);

-- Overall Owner calling with invalid time_zone raises 22023
select throws_ok(
  $$ select public.provision_location('00000000-0000-0000-0000-0000000570a2'::uuid, 'Bad TZ Loc', 'America/Huston') $$,
  '22023',
  null,
  'DB-018c: provision_location with invalid time zone raises 22023'
);

rollback;
