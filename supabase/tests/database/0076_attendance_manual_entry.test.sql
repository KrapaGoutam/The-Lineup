begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- --------------------------------------------------------------------------
-- V2 Attendance Manual Entry - Comprehensive pgTAP Suite
-- --------------------------------------------------------------------------

-- 1. Fixtures ---------------------------------------------------------------
-- 01: org owner
-- 02: b1 location manager
-- 03: staff A at b1
-- 04: staff B at b1
-- 05: b2 location manager (different location in same org)
-- 06: foreign org owner
-- 07: revoked b1 manager (membership inactive)
-- 08: overall manager (role 'manager' in overall_roles)
-- 09: b1 assistant manager (role 'assistant_manager' at b1)
-- 10: shift manager (membership role 'shift_manager', not location manager)
-- 11: staff unassigned to b1 (member of org, but no location assignment)
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000760' || lpad(n::text, 2, '0'))::uuid,
       'u76_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 11) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000760' || lpad(n::text, 2, '0'))::uuid,
       'User76 ' || n
from generate_series(1, 11) n;

insert into public.overall_roles (profile_id, role)
values ('00000000-0000-0000-0000-000000076008', 'manager');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000760a1', 'Org76', 'org-76', '00000000-0000-0000-0000-000000076001', '{}'),
  ('00000000-0000-0000-0000-0000000760a2', 'OtherOrg76', 'other-org-76', '00000000-0000-0000-0000-000000076006', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076007', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076009', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076010', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076011', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000760a2', '00000000-0000-0000-0000-000000076006', array['owner']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active, attendance_mode) values
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-0000000760a1', 'B1', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000760b2', '00000000-0000-0000-0000-0000000760a1', 'B2', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000760be', '00000000-0000-0000-0000-0000000760a1', 'B_Ext', 'America/Chicago', '{}', true, 'external'),
  ('00000000-0000-0000-0000-0000000760b3', '00000000-0000-0000-0000-0000000760a2', 'B3', 'America/Chicago', '{}', true, 'internal_the_lineup');

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076002', 'manager', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003', 'staff', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004', 'staff', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076007', 'manager', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076009', 'assistant_manager', true),
  ('00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076010', 'staff', true),
  ('00000000-0000-0000-0000-0000000760b2', '00000000-0000-0000-0000-000000076005', 'manager', true),
  ('00000000-0000-0000-0000-0000000760be', '00000000-0000-0000-0000-000000076003', 'staff', true);

-- Reference time base: 5 days ago, fixed hour (noon CST = 18:00 UTC)
create temp table t76 as select
  (date_trunc('day', now()) - interval '5 days' + interval '18 hours') as base_in,
  (date_trunc('day', now()) - interval '5 days' + interval '26 hours') as base_out,
  ((date_trunc('day', now()) - interval '5 days' + interval '18 hours') at time zone 'America/Chicago')::date as base_date,
  (now() at time zone 'America/Chicago')::date as today_date,
  date_trunc('hour', now()) - interval '2 hours' as today_in;
grant select on t76 to authenticated;

-- 2. Direct client write denials --------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';

select throws_ok(
  $$ insert into public.attendance_sessions (organization_id, location_id, profile_id, service_date, created_by)
     values ('00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003', current_date, '00000000-0000-0000-0000-000000076002') $$,
  '42501', null, 'direct INSERT into attendance_sessions is denied to authenticated clients'
);

select throws_ok(
  $$ insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, event_time, service_date, source)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003', 'clock_in', now(), current_date, 'web') $$,
  '42501', null, 'direct INSERT into attendance_events is denied to authenticated clients'
);

-- 3. Authorization denials (uniform 42501) -----------------------------------
-- 3a. Staff cannot enter attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076003';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Staff self create attempt', 'k-staff-self'
     ) $$,
  '42501', 'Unauthorized', 'staff cannot perform manual entry'
);

-- 3b. Shift manager cannot enter attendance (no extra Shift Manager authority)
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076010';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Shift manager attempt', 'k-shift-mgr'
     ) $$,
  '42501', 'Unauthorized', 'shift manager cannot perform manual entry'
);

-- 3c. Manager of different location (05) cannot enter attendance at b1
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076005';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Cross location attempt', 'k-cross-loc'
     ) $$,
  '42501', 'Unauthorized', 'manager of different location is denied'
);

-- 3d. Foreign org owner (06) cannot enter attendance at b1
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076006';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Foreign org attempt', 'k-foreign-org'
     ) $$,
  '42501', 'Unauthorized', 'foreign organization owner is denied'
);

-- 3e. Revoked manager (07) cannot enter attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076007';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Revoked manager attempt', 'k-revoked-mgr'
     ) $$,
  '42501', 'Unauthorized', 'revoked manager is denied'
);

-- 3f. Target employee unassigned to location (11) is denied
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076011',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Unassigned employee attempt', 'k-unassigned'
     ) $$,
  '42501', 'Employee is not assigned to this location', 'target employee not assigned to location is denied'
);

-- 3g. Non-internal mode (external) is denied when called by org owner
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760be', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'External mode attempt', 'k-external'
     ) $$,
  '42501', 'Internal attendance is not enabled for this location', 'external mode location is denied'
);

-- 4. Input validation (22023) -----------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';

-- 4a. Reason empty
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       '', 'k-val-1'
     ) $$,
  '22023', 'Employee, service date, both explicit times when complete, reason and operation key are required', 'empty reason is rejected'
);

-- 4b. Reason too short (< 3 chars)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'no', 'k-val-2'
     ) $$,
  '22023', 'Employee, service date, both explicit times when complete, reason and operation key are required', 'too-short reason is rejected'
);

-- 4c. Reason too long (> 500 chars)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       repeat('x', 501), 'k-val-3'
     ) $$,
  '22023', 'Employee, service date, both explicit times when complete, reason and operation key are required', 'too-long reason is rejected'
);

-- 4d. Future punch (clock-in)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       ((now() + interval '1 hour') at time zone 'America/Chicago')::date, now() + interval '1 hour', now() + interval '5 hours',
       'Future shift', 'k-val-4'
     ) $$,
  '22023', 'Manual punches cannot be in the future', 'future clock-in is rejected'
);

-- 4e. Future punch (clock-out)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (now() at time zone 'America/Chicago')::date, now() - interval '1 hour', now() + interval '2 hours',
       'Future end', 'k-val-5'
     ) $$,
  '22023', 'Manual punches cannot be in the future', 'future clock-out is rejected'
);

-- 4f. Clock-out <= Clock-in
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_out from t76), (select base_in from t76),
       'Negative duration', 'k-val-6'
     ) $$,
  '22023', 'Clock-out must follow clock-in within 48 hours', 'clock-out before clock-in is rejected'
);

-- 4g. Clock-out > 48 hours
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_in + interval '49 hours' from t76),
       'Too long shift', 'k-val-7'
     ) $$,
  '22023', 'Clock-out must follow clock-in within 48 hours', 'shift > 48h is rejected'
);

-- 4h. Service date does not match location-local date of clock-in
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date + 1 from t76), (select base_in from t76), (select base_out from t76),
       'Mismatched service date', 'k-val-8'
     ) $$,
  '22023', 'Service date must match the location-local clock-in date', 'mismatched service date is rejected'
);

-- 4i. Open session on historical date
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), null,
       'Historical open entry', 'k-val-9'
     ) $$,
  '22023', 'Only a current local-date entry may remain open', 'open entry on past date is rejected'
);

-- 4j. Operation key too long (> 128 chars)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'Long key test', repeat('k', 129)
     ) $$,
  '22023', 'Employee, service date, both explicit times when complete, reason and operation key are required', 'too-long key is rejected'
);

-- 5. Successful completed manual entry ---------------------------------------
create temp table res_entry as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
  (select base_date from t76), (select base_in from t76), (select base_out from t76),
  'Legitimate missed shift', 'k-valid-01'
) as val;

select is((select (val->>'success')::boolean from res_entry), true, 'returns success true');
select is((select (val->>'idempotent')::boolean from res_entry), false, 'returns idempotent false for fresh insert');
select is((select val->>'status' from res_entry), 'completed', 'returns status completed');

-- Verify persisted session
select is(count(*)::integer, 1, 'session was persisted')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_entry);

select is(status::text, 'completed', 'persisted session is completed')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_entry);

select is(gross_elapsed_seconds, 28800, 'gross_elapsed_seconds is exactly 8 hours = 28800s')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_entry);

select is(created_by, '00000000-0000-0000-0000-000000076002'::uuid, 'created_by attributed to manager 02')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_entry);

select is(version, 1, 'session starts at version 1')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_entry);

-- Verify persisted events
select is(count(*)::integer, 2, 'two events were recorded (clock_in and clock_out)')
from public.attendance_events
where session_id = (select (val->>'sessionId')::uuid from res_entry);

select is(source, 'manager', 'clock_in event source is manager')
from public.attendance_events
where id = (select (val->>'eventId')::bigint from res_entry);

select is(actor_profile_id, '00000000-0000-0000-0000-000000076002'::uuid, 'clock_in actor is manager 02')
from public.attendance_events
where id = (select (val->>'eventId')::bigint from res_entry);

select is(idempotency_key, 'k-valid-01', 'clock_in event recorded idempotency key')
from public.attendance_events
where id = (select (val->>'eventId')::bigint from res_entry);

select is(metadata->>'kind', 'manual_entry', 'clock_in event metadata contains kind manual_entry')
from public.attendance_events
where id = (select (val->>'eventId')::bigint from res_entry);

select is((metadata->'manual_payload'->>'location_id')::uuid, '00000000-0000-0000-0000-0000000760b1'::uuid, 'payload bound in metadata')
from public.attendance_events
where id = (select (val->>'eventId')::bigint from res_entry);

-- 6. Idempotency and retries ------------------------------------------------
-- 6a. Exact retry returns idempotent: true with same session and event IDs
create temp table res_retry as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
  (select base_date from t76), (select base_in from t76), (select base_out from t76),
  'Legitimate missed shift', 'k-valid-01'
) as val;

select is((select (val->>'success')::boolean from res_retry), true, 'retry returns success true');
select is((select (val->>'idempotent')::boolean from res_retry), true, 'retry returns idempotent true');
select is((select val->>'sessionId' from res_retry), (select val->>'sessionId' from res_entry), 'retry returns same sessionId');
select is((select val->>'eventId' from res_retry), (select val->>'eventId' from res_entry), 'retry returns same eventId');

-- 6b. Reusing key with different payload is refused
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out + interval '1 hour' from t76),
       'Different shift duration', 'k-valid-01'
     ) $$,
  '22023', 'Operation key is already bound to different attendance values', 'reusing key with different times is rejected'
);

select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in from t76), (select base_out from t76),
       'A completely different reason text', 'k-valid-01'
     ) $$,
  '22023', 'Operation key is already bound to different attendance values', 'reusing key with different reason is rejected'
);

-- 7. Overlap prevention -----------------------------------------------------
-- Overlapping by 1 hour with the shift just created (base_in + 2h .. base_out + 2h)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
       (select base_date from t76), (select base_in + interval '2 hours' from t76), (select base_out + interval '2 hours' from t76),
       'Overlapping shift attempt', 'k-overlap-01'
     ) $$,
  '23P01', 'This entry overlaps another attendance session for the employee', 'overlapping shift is rejected'
);

-- 8. Multiple non-overlapping shifts on the same date -----------------------
-- Second shift: 2 hours earlier on the same date (base_in - 5h .. base_in - 1h)
create temp table res_second_shift as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
  (select base_date from t76), (select base_in - interval '5 hours' from t76), (select base_in - interval '1 hour' from t76),
  'Second non-overlapping shift on same day', 'k-same-day-split'
) as val;

select is((select (val->>'success')::boolean from res_second_shift), true, 'second shift on same day succeeds');
select is((
  select count(*)::integer from public.attendance_sessions
  where profile_id = '00000000-0000-0000-0000-000000076003'
    and service_date = (select base_date from t76)
), 2, 'employee has exactly 2 non-overlapping sessions on the same service date');

-- 9. Other authorized roles -------------------------------------------------
-- 9a. Assistant Manager at location (09) can enter attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076009';
create temp table res_asst as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
  (select base_date from t76), (select base_in from t76), (select base_out from t76),
  'Assistant manager entry', 'k-asst-mgr'
) as val;
select is((select (val->>'success')::boolean from res_asst), true, 'assistant manager entry succeeds');

-- 9b. Organization Owner (01) can enter attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
create temp table res_owner as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
  (select base_date from t76), (select base_in - interval '5 hours' from t76), (select base_in - interval '1 hour' from t76),
  'Org owner entry', 'k-org-owner'
) as val;
select is((select (val->>'success')::boolean from res_owner), true, 'org owner entry succeeds');

-- 9c. Overall Manager (08) can enter attendance
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076008';
create temp table res_overall as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
  (select base_date from t76), (select base_in - interval '10 hours' from t76), (select base_in - interval '6 hours' from t76),
  'Overall manager entry', 'k-overall-mgr'
) as val;
select is((select (val->>'success')::boolean from res_overall), true, 'overall manager entry succeeds');

-- 10. Open session handling on current local date ---------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
create temp table res_open as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
  (select today_date from t76), (select today_in from t76), null,
  'Forgot to clock in today', 'k-open-today'
) as val;

select is((select (val->>'success')::boolean from res_open), true, 'open session today succeeds');
select is((select val->>'status' from res_open), 'active', 'open session status is active');
select is(status::text, 'active', 'persisted open session is active')
from public.attendance_sessions
where id = (select (val->>'sessionId')::uuid from res_open);

-- Attempting second open session for same employee while active session exists
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
       (select today_date from t76), (select today_in + interval '30 minutes' from t76), null,
       'Second open shift attempt', 'k-open-second'
     ) $$,
  '23P01', 'This entry overlaps another attendance session for the employee', 'second open shift overlaps and is rejected'
);

-- An uncertain response from just before midnight must remain replayable on
-- the next local date. Seed the already-committed shape because clock_timestamp()
-- cannot be advanced inside this transactional pgTAP suite.
reset role;
create temp table t76_prior_open as
select (now() at time zone 'America/Chicago')::date - 1 as service_date,
       (((now() at time zone 'America/Chicago')::date - 1 + time '10:00')
         at time zone 'America/Chicago') as clock_in_at;
grant select on t76_prior_open to authenticated;
insert into public.attendance_sessions (
  id, organization_id, location_id, profile_id, service_date, status,
  clock_in_at, created_by
)
select '00000000-0000-0000-0000-0000000760c1',
       '00000000-0000-0000-0000-0000000760a1',
       '00000000-0000-0000-0000-0000000760b1',
       '00000000-0000-0000-0000-000000076003',
       service_date, 'active', clock_in_at,
       '00000000-0000-0000-0000-000000076002'
from t76_prior_open;
insert into public.attendance_events (
  session_id, organization_id, location_id, profile_id, event_type,
  event_time, service_date, source, idempotency_key, actor_profile_id,
  correction_reason, metadata
)
select '00000000-0000-0000-0000-0000000760c1',
       '00000000-0000-0000-0000-0000000760a1',
       '00000000-0000-0000-0000-0000000760b1',
       '00000000-0000-0000-0000-000000076003',
       'clock_in', clock_in_at, service_date, 'manager', 'k-prior-open',
       '00000000-0000-0000-0000-000000076002', 'Midnight retry',
       jsonb_build_object('manual_payload', jsonb_build_object(
         'location_id', '00000000-0000-0000-0000-0000000760b1'::uuid,
         'profile_id', '00000000-0000-0000-0000-000000076003'::uuid,
         'service_date', service_date, 'clock_in_at', clock_in_at,
         'clock_out_at', null, 'reason', 'Midnight retry'))
from t76_prior_open;
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';
select is((public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1',
  '00000000-0000-0000-0000-000000076003',
  (select service_date from t76_prior_open),
  (select clock_in_at from t76_prior_open), null,
  'Midnight retry', 'k-prior-open'
)->>'idempotent')::boolean, true, 'prior-local-date open entry replays after midnight');

-- 11. Frozen payroll month protection (55000) -------------------------------
reset role;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076001';
-- Insert an external neon payroll period for Staff B (04) in 2026-06-01
insert into public.payroll_periods (
  organization_id, neon_user_id, period_month,
  hours_snapshot, rate_cents_snapshot, gross_cents, status,
  generated_at, generated_by, attendance_source
) values (
  '00000000-0000-0000-0000-0000000760a1', 76004,
  '2026-06-01'::date, 40, 2000, 80000, 'locked', now(), '00000000-0000-0000-0000-000000076001', 'external_neon'
);

-- Link Staff B to neon_user_id 76004
insert into public.attendance_identity_links (
  organization_id, profile_id, neon_user_id, linked_by
) values (
  '00000000-0000-0000-0000-0000000760a1', '00000000-0000-0000-0000-000000076004', 76004,
  '00000000-0000-0000-0000-000000076001'
);

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000076002';

-- Attempt to insert attendance in June 2026 for Staff B
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
       '2026-06-15'::date, '2026-06-15T15:00:00Z'::timestamptz, '2026-06-15T23:00:00Z'::timestamptz,
       'Shift in frozen payroll month', 'k-frozen-period'
     ) $$,
  '55000', 'PERIOD_FROZEN: attendance cannot be inserted into an existing payroll month',
  'manual entry into a month with a payroll period is rejected'
);

-- Overnight shift ending in June 2026 (starting May 31 11pm, ending June 1 7am)
select throws_ok(
  $$ select public.attendance_manual_entry(
       '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076004',
       '2026-05-31'::date, '2026-05-31T23:00:00-05:00'::timestamptz, '2026-06-01T07:00:00-05:00'::timestamptz,
       'Overnight shift into frozen month', 'k-frozen-overnight'
     ) $$,
  '55000', 'PERIOD_FROZEN: attendance cannot be inserted into an existing payroll month',
  'overnight shift ending in frozen month is rejected'
);

-- Unfrozen month (e.g. March 2026) for Staff A succeeds
create temp table res_unfrozen as
select public.attendance_manual_entry(
  '00000000-0000-0000-0000-0000000760b1', '00000000-0000-0000-0000-000000076003',
  '2026-03-10'::date, '2026-03-10T15:00:00Z'::timestamptz, '2026-03-10T23:00:00Z'::timestamptz,
  'Shift in unfrozen historical month', 'k-unfrozen-month'
) as val;

select is((select (val->>'success')::boolean from res_unfrozen), true, 'manual entry in unfrozen month succeeds');

rollback;
