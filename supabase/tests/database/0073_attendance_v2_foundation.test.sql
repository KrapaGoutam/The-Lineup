begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- --------------------------------------------------------------------------
-- V2-006 Attendance V2 Foundation pgTAP Test Suite (0073 namespace)
-- --------------------------------------------------------------------------

-- 1. Schema Invariants: enum types and columns exist
select has_type('public', 'attendance_mode', 'public.attendance_mode enum exists');
select has_type('public', 'attendance_session_status', 'public.attendance_session_status enum exists');
select has_type('public', 'attendance_event_type', 'public.attendance_event_type enum exists');
select has_type('public', 'attendance_event_source', 'public.attendance_event_source enum exists');
select has_column('public', 'locations', 'attendance_mode', 'locations.attendance_mode column exists');
select has_table('public', 'attendance_sessions', 'public.attendance_sessions table exists');
select has_table('public', 'attendance_events', 'public.attendance_events table exists');
select has_table('public', 'attendance_breaks', 'public.attendance_breaks table exists');

-- 2. Setup Test Fixtures
-- Users & Profiles
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000073001'::uuid, 'overall_owner@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000073002'::uuid, 'monks_owner@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000073003'::uuid, 'webster_mgr@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000073004'::uuid, 'webster_staff1@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000073005'::uuid, 'webster_staff2@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000073006'::uuid, 'other_org_staff@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000073001'::uuid, 'Overall Owner 73'),
  ('00000000-0000-0000-0000-000000073002'::uuid, 'Monks Owner 73'),
  ('00000000-0000-0000-0000-000000073003'::uuid, 'Webster Manager 73'),
  ('00000000-0000-0000-0000-000000073004'::uuid, 'Webster Staff 1'),
  ('00000000-0000-0000-0000-000000073005'::uuid, 'Webster Staff 2'),
  ('00000000-0000-0000-0000-000000073006'::uuid, 'Other Org Staff');

insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000073001'::uuid, 'owner'::public.overall_role);

insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000730a1'::uuid, 'Monks 73', 'monks-73', '00000000-0000-0000-0000-000000073002'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000730a2'::uuid, 'Other Org 73', 'other-org-73', '00000000-0000-0000-0000-000000073006'::uuid, '{}'::jsonb);

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000730a1'::uuid, '00000000-0000-0000-0000-000000073002'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1'::uuid, '00000000-0000-0000-0000-000000073003'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1'::uuid, '00000000-0000-0000-0000-000000073004'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1'::uuid, '00000000-0000-0000-0000-000000073005'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a2'::uuid, '00000000-0000-0000-0000-000000073006'::uuid, array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active)
values
  ('00000000-0000-0000-0000-0000000730b1'::uuid, '00000000-0000-0000-0000-0000000730a1'::uuid, 'Webster 73', 'America/Chicago', '{}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000730b2'::uuid, '00000000-0000-0000-0000-0000000730a1'::uuid, 'Archived 73', 'America/Chicago', '{}'::jsonb, false),
  ('00000000-0000-0000-0000-0000000730b3'::uuid, '00000000-0000-0000-0000-0000000730a2'::uuid, 'Other Location 73', 'America/Chicago', '{}'::jsonb, true);

update public.locations
set archived_at = now()
where id = '00000000-0000-0000-0000-0000000730b2'::uuid;

insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-0000000730b1'::uuid, '00000000-0000-0000-0000-000000073003'::uuid, 'manager'::public.location_role, true),
  ('00000000-0000-0000-0000-0000000730b1'::uuid, '00000000-0000-0000-0000-000000073004'::uuid, 'staff'::public.location_role, true);

-- Staff 2 belongs to Monks org, but is NOT assigned to Webster location.

-- --------------------------------------------------------------------------
-- 3. Attendance Mode Tests (V2-006.001)
-- --------------------------------------------------------------------------
-- Initially attendance_mode is NULL (unconfigured)
select is(
  (select attendance_mode from public.locations where id = '00000000-0000-0000-0000-0000000730b1'::uuid),
  null,
  'New/existing location has NULL attendance_mode by default (unconfigured)'
);

-- Deny unauthenticated caller on set_location_attendance_mode
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'internal_the_lineup'::public.attendance_mode) $$,
  '42501',
  'Not authenticated',
  'set_location_attendance_mode fails closed for unauthenticated caller'
);

-- Deny staff caller on set_location_attendance_mode
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';

select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'internal_the_lineup'::public.attendance_mode) $$,
  '42501',
  'Unauthorized to manage location attendance mode',
  'Staff member cannot configure location attendance mode'
);

-- Deny configuring archived location
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073002';

select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b2'::uuid, 'internal_the_lineup'::public.attendance_mode) $$,
  '55000',
  'Cannot configure attendance mode on archived or inactive location',
  'Archived location attendance mode cannot be modified'
);

-- Allow organization owner to configure attendance mode to 'internal_the_lineup'
select lives_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'internal_the_lineup'::public.attendance_mode, null, 'Enabling internal mode for testing') $$,
  'Org Owner can configure location attendance mode'
);

select is(
  (select attendance_mode from public.locations where id = '00000000-0000-0000-0000-0000000730b1'::uuid),
  'internal_the_lineup'::public.attendance_mode,
  'Location attendance_mode successfully updated to internal_the_lineup'
);

-- Check audit event recorded for mode change
select is(
  (select count(*)::int from public.audit_events
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and action = 'location_attendance_mode_updated'),
  1,
  'Mode change is recorded in public.audit_events with actor attribution'
);

-- Concurrency conflict on mismatched expected_updated_at
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'disabled'::public.attendance_mode, '2020-01-01 00:00:00+00'::timestamptz) $$,
  'P0004',
  'Location was modified by another operation',
  'Optimistic concurrency check rejects stale update'
);

-- --------------------------------------------------------------------------
-- 4. Clock Integrity Tests (V2-006.003)
-- --------------------------------------------------------------------------

-- 4.1 Reject clock-in when location attendance_mode is NOT internal_the_lineup
-- Temporarily set mode to 'external'
select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'external'::public.attendance_mode);

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  '42501',
  'Internal attendance is not enabled for this location',
  'Clock-in rejected when location is in external mode'
);

-- Restore mode to 'internal_the_lineup'
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073002';
select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1'::uuid, 'internal_the_lineup'::public.attendance_mode);

-- 4.2 Reject clock-in when employee is not assigned to location
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073005'; -- Monks member, not assigned to Webster
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  '42501',
  'Employee is not assigned to this location',
  'Clock-in rejected for unassigned employee'
);

-- 4.3 Reject clock-in across organizations
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073006'; -- Other Org member
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  '42501',
  'Employee is not a member of this organization',
  'Cross-organization clock-in rejected'
);

-- 4.4 Authorized clock-in for assigned employee (Staff 1)
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select lives_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-clockin-1', 'Opening shift') $$,
  'Assigned staff member can clock in at authorized location'
);

-- Verify session state in database
select is(
  (select status from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and profile_id = '00000000-0000-0000-0000-000000073004'::uuid),
  'active'::public.attendance_session_status,
  'Attendance session is active'
);

select is(
  (select count(*)::int from public.attendance_events
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and profile_id = '00000000-0000-0000-0000-000000073004'::uuid
     and event_type = 'clock_in'),
  1,
  'Clock-in event recorded in attendance_events'
);

-- 4.5 Idempotent retry of clock-in with same idempotency key
select is(
  (select (public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-clockin-1') ->> 'idempotent')::boolean),
  true,
  'Repeated clock-in with same idempotency key returns idempotent: true without error'
);

-- 4.6 Reject duplicate clock-in without idempotency key
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-different') $$,
  '23505',
  'Employee already has an open attendance session',
  'Duplicate clock-in rejected for open session'
);

-- 4.7 Break transitions
-- Start break
select lives_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-break-1') $$,
  'Starting break on active session succeeds'
);

select is(
  (select status from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and profile_id = '00000000-0000-0000-0000-000000073004'::uuid),
  'on_break'::public.attendance_session_status,
  'Session status transitioned to on_break'
);

-- Reject break start when already on break
select throws_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  '22023',
  'Session is already on break',
  'Cannot start break when already on break'
);

-- End break
select lives_ok(
  $$ select public.attendance_break_end('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-breakend-1') $$,
  'Ending break succeeds'
);

select is(
  (select status from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and profile_id = '00000000-0000-0000-0000-000000073004'::uuid),
  'active'::public.attendance_session_status,
  'Session status returned to active after break end'
);

-- Reject break end when not on break
select throws_ok(
  $$ select public.attendance_break_end('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  '22023',
  'Session is not currently on break',
  'Cannot end break when session is active'
);

-- 4.8 Clock-out
select lives_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'idemp-clockout-1', 'End of shift') $$,
  'Clock-out succeeds on open session'
);

select is(
  (select status from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
     and profile_id = '00000000-0000-0000-0000-000000073004'::uuid),
  'completed'::public.attendance_session_status,
  'Session status transitioned to completed'
);

-- Reject clock-out when no session is open
select throws_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1'::uuid) $$,
  'P0002',
  'No active attendance session found to clock out',
  'Clock-out rejected when no session is open'
);

-- 4.9 Immutability check on attendance_events
set local role postgres; -- Even postgres / superuser trigger blocks updates/deletes!
select throws_ok(
  $$ update public.attendance_events set event_time = now() - interval '1 hour' where profile_id = '00000000-0000-0000-0000-000000073004'::uuid $$,
  '23514',
  'attendance_events is immutable and cannot be updated or deleted',
  'attendance_events rows cannot be updated (immutable audit trail)'
);

select throws_ok(
  $$ delete from public.attendance_events where profile_id = '00000000-0000-0000-0000-000000073004'::uuid $$,
  '23514',
  'attendance_events is immutable and cannot be updated or deleted',
  'attendance_events rows cannot be deleted (append-only)'
);

-- 4.10 Direct table write prevention via RLS
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';

select throws_ok(
  $$ insert into public.attendance_events (
       session_id, organization_id, location_id, profile_id, event_type, service_date, actor_profile_id
     ) values (
       gen_random_uuid(), '00000000-0000-0000-0000-0000000730a1'::uuid, '00000000-0000-0000-0000-0000000730b1'::uuid,
       '00000000-0000-0000-0000-000000073004'::uuid, 'clock_in', current_date, '00000000-0000-0000-0000-000000073004'::uuid
     ) $$,
  '42501',
  null,
  'Direct insert to attendance_events is prohibited by RLS/privileges'
);

-- 4.11 RLS Isolation: Staff cannot read other employees' attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073005'; -- Staff 2
select is(
  (select count(*)::int from public.attendance_sessions
   where profile_id = '00000000-0000-0000-0000-000000073004'::uuid),
  0,
  'Staff cannot see another employee sessions via RLS'
);

-- Manager at Webster CAN read all employee attendance at Webster
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003'; -- Webster Manager
select is(
  (select count(*)::int from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid),
  1,
  'Location Manager can read employee attendance sessions at their location'
);

-- 4.12 Manager Clocking Out Employee on Break (Auto-close break on clock-out)
-- Start new session for Staff 1
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'shift-2-clockin');
select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1'::uuid, null, 'shift-2-break');

-- Manager clocks out Staff 1 while on break
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003'; -- Webster Manager
select lives_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1'::uuid, '00000000-0000-0000-0000-000000073004'::uuid, 'shift-2-clockout') $$,
  'Manager can clock out an employee who is on break'
);

-- Verify that active break was auto-closed
select is(
  (select count(*)::int from public.attendance_breaks where end_time is null),
  0,
  'Active break was automatically closed upon clock-out'
);

-- 4.13 Overnight Shift & Timezone Verification
-- In America/Chicago, midnight is 05:00 UTC or 06:00 UTC.
-- Verify service_date matches location local calendar date
select is(
  (select service_date from public.attendance_sessions
   where location_id = '00000000-0000-0000-0000-0000000730b1'::uuid
   order by created_at desc limit 1),
  (now() at time zone 'America/Chicago')::date,
  'Session service_date matches location timezone date'
);

select * from finish();
rollback;
