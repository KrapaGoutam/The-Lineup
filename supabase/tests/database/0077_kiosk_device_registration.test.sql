begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

-- --------------------------------------------------------------------------
-- V2-007 Kiosk Device Registration & Management — pgTAP Test Suite
-- --------------------------------------------------------------------------

-- 1. Fixtures ---------------------------------------------------------------
-- 01: org owner
-- 02: b1 location manager
-- 03: staff at b1
-- 04: b1 assistant manager (not full manager)
-- 05: shift manager in memberships (not location manager)
-- 06: foreign org owner
-- 07: b2 location manager
-- 08: overall manager (role 'manager' in overall_roles)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000770' || lpad(n::text, 2, '0'))::uuid,
       'u77_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 8) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000770' || lpad(n::text, 2, '0'))::uuid,
       'User77 ' || n
from generate_series(1, 8) n;

insert into public.overall_roles (profile_id, role)
values ('00000000-0000-0000-0000-000000077008', 'manager');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000770a1', 'Org77', 'org-77', '00000000-0000-0000-0000-000000077001', '{}'),
  ('00000000-0000-0000-0000-0000000770a2', 'OtherOrg77', 'other-org-77', '00000000-0000-0000-0000-000000077006', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077005', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a2', '00000000-0000-0000-0000-000000077006', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-000000077007', array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active, attendance_mode) values
  ('00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-0000000770a1', 'B1', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000770b2', '00000000-0000-0000-0000-0000000770a1', 'B2', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000770b3', '00000000-0000-0000-0000-0000000770a2', 'B3 Foreign', 'America/Chicago', '{}', true, 'internal_the_lineup');

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-000000077002', 'manager', true),
  ('00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-000000077003', 'staff', true),
  ('00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-000000077004', 'assistant_manager', true),
  ('00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-000000077005', 'staff', true),
  ('00000000-0000-0000-0000-0000000770b2', '00000000-0000-0000-0000-000000077007', 'manager', true);

-- Helper to switch auth identity in tests
create or replace function set_test_user(uid uuid) returns void as $$
begin
  if uid is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
  else
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
  end if;
end;
$$ language plpgsql;

-- 2. Authorization Helper Tests (private.kiosk_can_manage_location) ---------

-- Owner can manage
select set_test_user('00000000-0000-0000-0000-000000077001');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), true, 'Org owner can manage kiosk for location');

-- Location manager can manage
select set_test_user('00000000-0000-0000-0000-000000077002');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), true, 'Location manager can manage kiosk for location');

-- Overall manager can manage
select set_test_user('00000000-0000-0000-0000-000000077008');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), true, 'Overall manager can manage kiosk for location');

-- Assistant manager CANNOT manage
select set_test_user('00000000-0000-0000-0000-000000077004');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), false, 'Assistant manager denied kiosk management');

-- Shift manager in memberships CANNOT manage
select set_test_user('00000000-0000-0000-0000-000000077005');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), false, 'Shift manager denied kiosk management');

-- Regular staff CANNOT manage
select set_test_user('00000000-0000-0000-0000-000000077003');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), false, 'Staff denied kiosk management');

-- Foreign org owner CANNOT manage B1
select set_test_user('00000000-0000-0000-0000-000000077006');
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), false, 'Foreign org owner denied kiosk management on B1');

-- Anonymous CANNOT manage
select set_test_user(null);
select is(private.kiosk_can_manage_location('00000000-0000-0000-0000-0000000770b1'), false, 'Anonymous denied kiosk management');

-- 3. Pairing Code Generation -----------------------------------------------

-- Staff cannot generate pairing code
select set_test_user('00000000-0000-0000-0000-000000077003');
select throws_ok(
  $$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000770b1', 'Tablet 1', 'hash_test_12345678901234567890123456789012') $$,
  '42501',
  'Unauthorized',
  'Staff cannot generate pairing code'
);

-- Location manager generates pairing code successfully
select set_test_user('00000000-0000-0000-0000-000000077002');
select lives_ok(
  $$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000770b1', 'Front Bar Tablet', 'code_hash_11111111111111111111111111111111') $$,
  'Location manager can generate pairing code'
);

-- Pairing code row is present with correct attributes
select is(
  (select device_name from public.kiosk_pairing_codes where code_hash = 'code_hash_11111111111111111111111111111111'),
  'Front Bar Tablet',
  'Pairing code stored with correct device name'
);

select is(
  (select location_id from public.kiosk_pairing_codes where code_hash = 'code_hash_11111111111111111111111111111111'),
  '00000000-0000-0000-0000-0000000770b1'::uuid,
  'Pairing code stored with correct location ID'
);

-- Reject empty device name
select throws_ok(
  $$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000770b1', '   ', 'code_hash_22222222222222222222222222222222') $$,
  '22023',
  'Device name must be between 1 and 100 characters',
  'Reject blank device name'
);

-- 4. Pairing Code Consumption & Device Creation -----------------------------

-- Reject invalid pairing code
select set_test_user(null); -- Anonymous tablet
select throws_ok(
  $$ select public.kiosk_consume_pairing_code('non_existent_code_hash_123456789012', 'token_hash_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'P0002',
  'Pairing code not recognized',
  'Reject unknown pairing code'
);

-- Consume valid pairing code successfully
select lives_ok(
  $$ select public.kiosk_consume_pairing_code('code_hash_11111111111111111111111111111111', 'token_hash_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  'Consume valid pairing code successfully'
);

-- Verify device was created in kiosk_devices
select is(
  (select count(*)::int from public.kiosk_devices where device_token_hash = 'token_hash_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and status = 'active'),
  1,
  'Kiosk device created with active status'
);

-- Verify pairing code is marked as used
select is(
  (select used_at is not null from public.kiosk_pairing_codes where code_hash = 'code_hash_11111111111111111111111111111111'),
  true,
  'Pairing code marked as used'
);

-- Reject reuse of already consumed pairing code
select throws_ok(
  $$ select public.kiosk_consume_pairing_code('code_hash_11111111111111111111111111111111', 'token_hash_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') $$,
  '22023',
  'Pairing code already used',
  'Reject re-consumption of pairing code'
);

-- 5. Kiosk Devices RLS & Isolation -----------------------------------------

set local role authenticated;

-- Manager at B1 can see B1 device
select set_test_user('00000000-0000-0000-0000-000000077002');
select is(
  (select count(*)::int from public.kiosk_devices where location_id = '00000000-0000-0000-0000-0000000770b1'),
  1,
  'B1 manager can view B1 kiosk devices via RLS'
);

-- Staff at B1 CANNOT see B1 device via RLS
select set_test_user('00000000-0000-0000-0000-000000077003');
select is(
  (select count(*)::int from public.kiosk_devices where location_id = '00000000-0000-0000-0000-0000000770b1'),
  0,
  'Staff cannot view kiosk devices via RLS'
);

-- Foreign org manager CANNOT see B1 device via RLS
select set_test_user('00000000-0000-0000-0000-000000077006');
select is(
  (select count(*)::int from public.kiosk_devices where location_id = '00000000-0000-0000-0000-0000000770b1'),
  0,
  'Foreign manager cannot view B1 kiosk devices via RLS'
);

reset role;

-- 6. Device Management (Rename, Reassign, Revoke) ---------------------------

create temp table cur_dev as
select id from public.kiosk_devices where device_token_hash = 'token_hash_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

-- Staff cannot rename device
select set_test_user('00000000-0000-0000-0000-000000077003');
select throws_ok(
  format('select public.kiosk_rename_device(%L, %L)', (select id from cur_dev), 'New Name'),
  '42501',
  'Unauthorized',
  'Staff cannot rename kiosk device'
);

-- Manager renames device successfully
select set_test_user('00000000-0000-0000-0000-000000077002');
select lives_ok(
  format('select public.kiosk_rename_device(%L, %L)', (select id from cur_dev), 'Patio Station Tablet'),
  'Manager can rename kiosk device'
);

select is(
  (select name from public.kiosk_devices where id = (select id from cur_dev)),
  'Patio Station Tablet',
  'Device name updated'
);

-- Staff cannot reassign device
select set_test_user('00000000-0000-0000-0000-000000077003');
select throws_ok(
  format('select public.kiosk_reassign_device(%L, %L)', (select id from cur_dev), '00000000-0000-0000-0000-0000000770b2'),
  '42501',
  'Unauthorized',
  'Staff cannot reassign kiosk device'
);

-- Org Owner reassigns device to B2 (rotates credentials & invalidates token)
select set_test_user('00000000-0000-0000-0000-000000077001');
select lives_ok(
  format('select public.kiosk_reassign_device(%L, %L)', (select id from cur_dev), '00000000-0000-0000-0000-0000000770b2'),
  'Owner can reassign kiosk device'
);

select is(
  (select location_id from public.kiosk_devices where id = (select id from cur_dev)),
  '00000000-0000-0000-0000-0000000770b2'::uuid,
  'Device location updated to B2'
);

select is(
  (select device_token_hash is null from public.kiosk_devices where id = (select id from cur_dev)),
  true,
  'Reassigned device token hash invalidated'
);

-- Staff cannot revoke device
select set_test_user('00000000-0000-0000-0000-000000077003');
select throws_ok(
  format('select public.kiosk_revoke_device(%L, %L)', (select id from cur_dev), 'Lost tablet'),
  '42501',
  'Unauthorized',
  'Staff cannot revoke kiosk device'
);

-- B2 manager revokes device
select set_test_user('00000000-0000-0000-0000-000000077007');
select lives_ok(
  format('select public.kiosk_revoke_device(%L, %L)', (select id from cur_dev), 'Decommissioned tablet'),
  'B2 manager can revoke kiosk device'
);

select is(
  (select status from public.kiosk_devices where id = (select id from cur_dev)),
  'revoked',
  'Device status changed to revoked'
);

select is(
  (select revocation_reason from public.kiosk_devices where id = (select id from cur_dev)),
  'Decommissioned tablet',
  'Revocation reason recorded'
);

-- 7. Mandatory Remediation 7: SQL Table Privileges Direct Mutation Revocation ----

-- Direct INSERT on kiosk_devices by authenticated user is denied
select set_test_user('00000000-0000-0000-0000-000000077001');
set local role authenticated;
select throws_ok(
  $$ insert into public.kiosk_devices (organization_id, location_id, name, device_token_hash)
     values ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-0000000770b1', 'Hacked', 'hack_token_hash') $$,
  '42501',
  'permission denied for table kiosk_devices',
  'Direct INSERT on kiosk_devices denied to authenticated'
);

-- Direct UPDATE on kiosk_devices by authenticated user is denied
select throws_ok(
  $$ update public.kiosk_devices set name = 'Hacked Name' where organization_id = '00000000-0000-0000-0000-0000000770a1' $$,
  '42501',
  'permission denied for table kiosk_devices',
  'Direct UPDATE on kiosk_devices denied to authenticated'
);

-- Direct INSERT on kiosk_pairing_codes by authenticated user is denied
select throws_ok(
  $$ insert into public.kiosk_pairing_codes (organization_id, location_id, device_name, code_hash, created_by)
     values ('00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-0000000770b1', 'Hacked Code', 'hack_code_hash', '00000000-0000-0000-0000-000000077001') $$,
  '42501',
  'permission denied for table kiosk_pairing_codes',
  'Direct INSERT on kiosk_pairing_codes denied to authenticated'
);

-- Direct UPDATE on kiosk_pairing_codes by authenticated user is denied
select throws_ok(
  $$ update public.kiosk_pairing_codes set device_name = 'Hacked' where code_hash = 'code_hash_11111111111111111111111111111111' $$,
  '42501',
  'permission denied for table kiosk_pairing_codes',
  'Direct UPDATE on kiosk_pairing_codes denied to authenticated'
);

reset role;

-- 8. Mandatory Remediation 4: Pairing Attempt Failure Accounting & Lockout -----

-- Location manager generates a fresh pairing code to test failure lockout
select set_test_user('00000000-0000-0000-0000-000000077002');
select lives_ok(
  $$ select public.kiosk_generate_pairing_code('00000000-0000-0000-0000-0000000770b1', 'Test Brute Force Tablet', 'code_hash_bruteforce_test_12345678') $$,
  'Location manager creates brute-force test pairing code'
);

-- Recording pairing failure logs to kiosk_pairing_attempts and increments attempt_count
select set_test_user(null);
select lives_ok(
  $$ select public.kiosk_record_pairing_failure('code_hash_bruteforce_test_12345678', '192.168.1.50') $$,
  'Record pairing failure logs without error'
);

select is(
  (select attempt_count from public.kiosk_pairing_codes where code_hash = 'code_hash_bruteforce_test_12345678'),
  1,
  'kiosk_record_pairing_failure increments attempt_count to 1'
);

-- Advance attempt_count to max_attempts (5)
update public.kiosk_pairing_codes set attempt_count = 5 where code_hash = 'code_hash_bruteforce_test_12345678';

-- Attempting to consume locked out pairing code raises exception
select throws_ok(
  $$ select public.kiosk_consume_pairing_code('code_hash_bruteforce_test_12345678', 'token_hash_bruteforce_lockout_123456789012') $$,
  '22023',
  'Pairing code exceeded maximum attempts',
  'Locked out pairing code is rejected'
);

-- Global rate limit: insert 10 failed attempts within 15 minutes
insert into public.kiosk_pairing_attempts (code_hash, client_identifier, succeeded, attempted_at)
select 'unknown_hash_' || n, 'attacker-client', false, now() - interval '1 minute'
from generate_series(1, 10) n;

select throws_ok(
  $$ select public.kiosk_consume_pairing_code('any_code_hash_test_12345678', 'token_hash_test_token_min_32_chars_123456') $$,
  '22023',
  'Too many failed pairing attempts. Please wait 15 minutes.',
  'Global rate limit blocks pairing consumption after 10 recent failures'
);

-- 9. Mandatory Remediation 6: Revocation Purges Active Sessions ----------------

-- Insert a new active device and a session for it
insert into public.kiosk_devices (id, organization_id, location_id, name, device_token_hash, status)
values ('00000000-0000-0000-0000-0000000770d1', '00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-0000000770b1', 'Session Test Tablet', 'session_test_token_hash_12345678901234567890', 'active');

insert into public.kiosk_sessions (id, device_id, organization_id, location_id, profile_id, display_name, session_token_hash, encrypted_access_token, expires_at)
values ('00000000-0000-0000-0000-0000000770e1', '00000000-0000-0000-0000-0000000770d1', '00000000-0000-0000-0000-0000000770a1', '00000000-0000-0000-0000-0000000770b1', '00000000-0000-0000-0000-000000077002', 'Manager User', 'sess_hash_12345678901234567890123456789012', 'enc_token_12345678901234567890123456789012', now() + interval '3 minutes');

-- Manager revokes the device
select set_test_user('00000000-0000-0000-0000-000000077002');
select lives_ok(
  $$ select public.kiosk_revoke_device('00000000-0000-0000-0000-0000000770d1', 'Lost device') $$,
  'Manager revokes device'
);

-- Verify that active sessions for this device were deleted
select is(
  (select count(*)::int from public.kiosk_sessions where device_id = '00000000-0000-0000-0000-0000000770d1'),
  0,
  'Device revocation purges active kiosk_sessions'
);

select * from finish();
rollback;
