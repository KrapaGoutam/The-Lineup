begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- --------------------------------------------------------------------------
-- V2-005.001 Table Allocation / Rotation Location Scoping (0063 namespace)
--
-- Actors
--   ...630000 Overall Owner            ...630001 Overall Manager
--   ...630002 Overall Assistant Mgr    ...630003 Monks Owner
--   ...630004 Monks GM                 ...630005 Liquor Tap Owner
--   ...630006 Liquor Tap GM            ...630007 Monks shift_mgr (Webster)
--   ...630008 Monks server (Webster)   ...630009 Monks server (Galveston)
--   ...630010 Monks server (no loc)    ...630011 Monks server (revoked)
--   ...630012 Liquor Tap server (NASA)
--
-- Organizations & Locations
--   Org 1: Monks (...6300a1)
--     Loc 1: Webster (...6300b1) - Active
--     Loc 2: Galveston (...6300b2) - Active
--     Loc 3: Inactive Loc (...6300b3) - Inactive (active=false, archived_at=null)
--     Loc 4: Archived Loc (...6300b4) - Archived (active=false, archived_at=now())
--   Org 2: Liquor Tap (...6300a2)
--     Loc 5: NASA (...6300b5) - Active
-- --------------------------------------------------------------------------

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000630' || lpad(n::text, 2, '0'))::uuid,
       'u63' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(0, 12) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000630' || lpad(n::text, 2, '0'))::uuid,
       'User 63' || n
from generate_series(0, 12) n;

insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000063000'::uuid, 'owner'::public.overall_role),
  ('00000000-0000-0000-0000-000000063001'::uuid, 'manager'::public.overall_role),
  ('00000000-0000-0000-0000-000000063002'::uuid, 'assistant_manager'::public.overall_role);

insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000630a1'::uuid, 'Monks 63', 'monks-63', '00000000-0000-0000-0000-000000063003'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, 'Liquor Tap 63', 'liquor-tap-63', '00000000-0000-0000-0000-000000063005'::uuid, '{}'::jsonb);

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063000'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063003'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063004'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063007'::uuid, array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063008'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063009'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063010'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063011'::uuid, array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, '00000000-0000-0000-0000-000000063005'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, '00000000-0000-0000-0000-000000063006'::uuid, array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, '00000000-0000-0000-0000-000000063012'::uuid, array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at)
values
  ('00000000-0000-0000-0000-0000000630b1'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'Webster', 'America/Chicago', '{}'::jsonb, true, null),
  ('00000000-0000-0000-0000-0000000630b2'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'Galveston', 'America/Chicago', '{}'::jsonb, true, null),
  ('00000000-0000-0000-0000-0000000630b3'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'Inactive Loc', 'America/Chicago', '{}'::jsonb, false, null),
  ('00000000-0000-0000-0000-0000000630b4'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'Archived Loc', 'America/Chicago', '{}'::jsonb, false, now()),
  ('00000000-0000-0000-0000-0000000630b5'::uuid, '00000000-0000-0000-0000-0000000630a2'::uuid, 'NASA', 'America/Chicago', '{}'::jsonb, true, null);

insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000630b1'::uuid, '00000000-0000-0000-0000-000000063007'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000630b1'::uuid, '00000000-0000-0000-0000-000000063008'::uuid, 'staff'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000630b2'::uuid, '00000000-0000-0000-0000-000000063009'::uuid, 'staff'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000630b5'::uuid, '00000000-0000-0000-0000-000000063012'::uuid, 'staff'::public.location_role, true);

-- Add dining areas and tables
insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values
  (6301, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid, 'Main Dining', 1),
  (6302, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid, 'Patio', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, active)
overriding system value
values
  (6311, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid, 6301, 'T1', 4, true),
  (6312, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid, 6301, 'T2', 4, true),
  (6321, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid, 6302, 'P1', 4, true);

-- Add service sessions
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values
  (6351, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid, '2026-11-06'::date, 'service', 'active'),
  (6352, '00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid, '2026-11-06'::date, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values
  (6361, '00000000-0000-0000-0000-0000000630a1'::uuid, 6351, 1),
  (6362, '00000000-0000-0000-0000-0000000630a1'::uuid, 6352, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, status, position)
overriding system value
values
  (6371, '00000000-0000-0000-0000-0000000630a1'::uuid, 6351, '00000000-0000-0000-0000-000000063008'::uuid, 'active', 0),
  (6372, '00000000-0000-0000-0000-0000000630a1'::uuid, 6352, '00000000-0000-0000-0000-000000063009'::uuid, 'active', 0);

insert into public.table_rotation_entries (id, organization_id, service_session_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
overriding system value
values
  (6381, '00000000-0000-0000-0000-0000000630a1'::uuid, 6351, 6361, 6371, 'T1', 'active', '00000000-0000-0000-0000-000000063007'::uuid),
  (6382, '00000000-0000-0000-0000-0000000630a1'::uuid, 6352, 6362, 6372, 'P1', 'active', '00000000-0000-0000-0000-000000063007'::uuid);

-- --------------------------------------------------------------------------
-- 1. private.can_operate_board Unit Verification
-- --------------------------------------------------------------------------
-- Anonymous caller
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  false,
  'AL-01a: anonymous caller cannot operate board'
);

-- Overall Owner
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  true,
  'AL-01b: Overall Owner can operate any valid location'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b3'::uuid),
  false,
  'AL-14a: Inactive location rejects Overall Owner'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b4'::uuid),
  false,
  'AL-15a: Archived location rejects Overall Owner'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b5'::uuid),
  false,
  'AL-16a: Location belonging to different organization returns false'
);

-- Org Owner / General Manager
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063003', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  true,
  'AL-02a: Monks Owner can operate Webster'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid),
  true,
  'AL-02b: Monks Owner can operate Galveston'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a2'::uuid, '00000000-0000-0000-0000-0000000630b5'::uuid),
  false,
  'AL-02c: Monks Owner cannot operate Liquor Tap (NASA)'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063004', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  true,
  'AL-03a: Monks GM can operate Webster'
);

-- Webster Assigned Server
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063008', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  true,
  'AL-04a: Webster server CAN operate Webster'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid),
  false,
  'AL-11a: Webster server CANNOT operate Galveston (cross-location denial in same org)'
);

-- Galveston Assigned Server
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063009', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  false,
  'AL-11b: Galveston server CANNOT operate Webster'
);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b2'::uuid),
  true,
  'AL-04b: Galveston server CAN operate Galveston'
);

-- Unassigned Server
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063010', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  false,
  'AL-10a: Unassigned Monks server CANNOT operate Webster'
);

-- Revoked Member
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063011', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  false,
  'AL-12a: Revoked member CANNOT operate Webster'
);

-- Foreign Org Server
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063012', true);
select is(
  private.can_operate_board('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-0000000630b1'::uuid),
  false,
  'AL-18a: Liquor Tap server CANNOT operate Monks Webster'
);

-- --------------------------------------------------------------------------
-- 2. public.board_add_column Verification
-- --------------------------------------------------------------------------
-- As Monks GM:
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063004', true);

-- AL-07: Add server assigned to Webster succeeds
select lives_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063008'::uuid
     ) $$,
  'AL-07: Adding server assigned to location succeeds'
);

-- AL-08: Add Overall Owner to Webster board succeeds
select lives_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063000'::uuid
     ) $$,
  'AL-08: Adding Overall role user to any location succeeds'
);

-- AL-09: Add Galveston server to Webster board is denied
select throws_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063009'::uuid
     ) $$,
  'That person is not assigned to this location.',
  'AL-09: Adding server assigned to different location in same org is denied'
);

-- AL-10: Add unassigned user in same org is denied
select throws_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063010'::uuid
     ) $$,
  'That person is not assigned to this location.',
  'AL-10: Adding unassigned user in same org is denied'
);

-- AL-13: Deactivated member cannot be added
select throws_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063011'::uuid
     ) $$,
  'That person is not an active member of this restaurant.',
  'AL-13: Adding deactivated member is denied'
);

-- Foreign organization server cannot be added
select throws_ok(
  $$ select public.board_add_column(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       '00000000-0000-0000-0000-000000063012'::uuid
     ) $$,
  'That person is not an active member of this restaurant.',
  'AL-18b: Adding foreign org user is denied'
);

-- --------------------------------------------------------------------------
-- 3. Direct Board Mutation RPC Cross-Location Isolation (AL-23)
-- --------------------------------------------------------------------------
-- Switch to Galveston server (profile ...630009)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063009', true);

-- Galveston server operating on Webster session (6351) is DENIED
select throws_ok(
  $$ select public.board_add_row('00000000-0000-0000-0000-0000000630a1'::uuid, 6351) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23a: Galveston server cannot add row to Webster board'
);

select throws_ok(
  $$ select public.board_clear_row('00000000-0000-0000-0000-0000000630a1'::uuid, 6351, 6361) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23b: Galveston server cannot clear row on Webster board'
);

select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-0000000630a1'::uuid, 6351, 6361, 6371) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23c: Galveston server cannot clear cell on Webster board'
);

select throws_ok(
  $$ select public.board_clear_board('00000000-0000-0000-0000-0000000630a1'::uuid, 6351) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23d: Galveston server cannot clear Webster board'
);

select throws_ok(
  $$ select public.board_undo('00000000-0000-0000-0000-0000000630a1'::uuid, 6351) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23e: Galveston server cannot undo on Webster board'
);

select throws_ok(
  $$ select public.board_redo('00000000-0000-0000-0000-0000000630a1'::uuid, 6351) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23f: Galveston server cannot redo on Webster board'
);

select throws_ok(
  $$ select public.board_assign(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       6361,
       6371,
       'T2'
     ) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23g: Galveston server cannot assign on Webster board'
);

select throws_ok(
  $$ select public.board_skip_turn(
       '00000000-0000-0000-0000-0000000630a1'::uuid,
       '00000000-0000-0000-0000-0000000630b1'::uuid,
       '2026-11-06'::date,
       6361,
       6371
     ) $$,
  '42501',
  'Only an active floor team member can do that.',
  'AL-23h: Galveston server cannot skip turn on Webster board'
);

-- Galveston server operating on Galveston session (6352) SUCCEEDS
select lives_ok(
  $$ select public.board_add_row('00000000-0000-0000-0000-0000000630a1'::uuid, 6352) $$,
  'AL-23i: Galveston server CAN add row to Galveston board'
);

-- --------------------------------------------------------------------------
-- 4. PostgREST RLS SELECT Isolation Across Locations (AL-25, AL-26)
-- --------------------------------------------------------------------------
-- Under Webster server actor (...630008)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063008', true);

-- service_sessions: can only see Webster
select is(
  (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  1,
  'AL-25a: Webster server can see Webster session'
);
select is(
  (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000630b2'::uuid),
  0,
  'AL-25b: Webster server CANNOT see Galveston session (0 rows)'
);

-- dining_tables: can only see Webster
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  2,
  'AL-25c: Webster server can see Webster dining tables'
);
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-0000000630b2'::uuid),
  0,
  'AL-25d: Webster server CANNOT see Galveston dining tables (0 rows)'
);

-- dining_areas: can only see Webster
select is(
  (select count(*)::int from public.dining_areas where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  1,
  'AL-25e: Webster server can see Webster dining areas'
);
select is(
  (select count(*)::int from public.dining_areas where location_id = '00000000-0000-0000-0000-0000000630b2'::uuid),
  0,
  'AL-25f: Webster server CANNOT see Galveston dining areas (0 rows)'
);

-- section_assignments: can only see Webster
select is(
  (select count(*)::int from public.section_assignments where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  1,
  'AL-25g: Webster server can see Webster section assignments'
);
select is(
  (select count(*)::int from public.section_assignments where location_id = '00000000-0000-0000-0000-0000000630b2'::uuid),
  0,
  'AL-25h: Webster server CANNOT see Galveston section assignments (0 rows)'
);

-- rotation_members: child table isolated via service session
select ok(
  (select count(*)::int from public.rotation_members where service_session_id = 6351) >= 1,
  'AL-26a: Webster server can see Webster rotation members'
);
select is(
  (select count(*)::int from public.rotation_members where service_session_id = 6352),
  0,
  'AL-26b: Webster server CANNOT see Galveston rotation members (0 rows)'
);

-- rotation_rounds: child table isolated via service session
select ok(
  (select count(*)::int from public.rotation_rounds where service_session_id = 6351) >= 1,
  'AL-26c: Webster server can see Webster rotation rounds'
);
select is(
  (select count(*)::int from public.rotation_rounds where service_session_id = 6352),
  0,
  'AL-26d: Webster server CANNOT see Galveston rotation rounds (0 rows)'
);

-- table_rotation_entries: child table isolated via service session
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 6351),
  1,
  'AL-26e: Webster server can see Webster table rotation entries'
);
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 6352),
  0,
  'AL-26f: Webster server CANNOT see Galveston table rotation entries (0 rows)'
);

-- Under Galveston server actor (...630009)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063009', true);

select is(
  (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  0,
  'AL-25i: Galveston server CANNOT see Webster session (0 rows)'
);
select is(
  (select count(*)::int from public.service_sessions where location_id = '00000000-0000-0000-0000-0000000630b2'::uuid),
  1,
  'AL-25j: Galveston server can see Galveston session'
);
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-0000000630b1'::uuid),
  0,
  'AL-25k: Galveston server CANNOT see Webster dining tables (0 rows)'
);
select is(
  (select count(*)::int from public.rotation_members where service_session_id = 6351),
  0,
  'AL-26g: Galveston server CANNOT see Webster rotation members (0 rows)'
);
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 6351),
  0,
  'AL-26h: Galveston server CANNOT see Webster table rotation entries (0 rows)'
);

-- Under Monks GM actor (...630004) - can see both locations in Monks
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063004', true);
select is(
  (select count(*)::int from public.service_sessions where organization_id = '00000000-0000-0000-0000-0000000630a1'::uuid),
  2,
  'AL-03b: Monks GM can see all service sessions across Monks locations'
);
select is(
  (select count(*)::int from public.dining_tables where organization_id = '00000000-0000-0000-0000-0000000630a1'::uuid),
  3,
  'AL-03c: Monks GM can see all dining tables across Monks locations'
);

-- Under Overall Owner actor (...630000) - can see all locations across all orgs
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select is(
  (select count(*)::int from public.service_sessions),
  2,
  'AL-01c: Overall Owner can see service sessions across all locations'
);

reset role;

select * from finish();

rollback;
