begin;

create extension if not exists pgtap with schema extensions;

select plan(108);

-- --------------------------------------------------------------------------
-- V2-006 Attendance V2 Foundation (Batch A) - behavioural pgTAP suite
-- Every authorization assertion runs as the real `authenticated` role with a JWT
-- subject; nothing here only checks that an object exists.
-- --------------------------------------------------------------------------

-- 1. Schema invariants
select has_type('public', 'attendance_mode', 'attendance_mode enum exists');
select has_type('public', 'attendance_session_status', 'attendance_session_status enum exists');
select has_type('public', 'attendance_event_type', 'attendance_event_type enum exists');
select has_type('public', 'attendance_event_source', 'attendance_event_source enum exists');
select has_type('public', 'attendance_break_pay_classification', 'attendance_break_pay_classification enum exists');
select has_column('public', 'locations', 'attendance_mode', 'locations.attendance_mode exists');
select has_table('public', 'attendance_sessions', 'attendance_sessions exists');
select has_table('public', 'attendance_events', 'attendance_events exists');
select has_table('public', 'attendance_breaks', 'attendance_breaks exists');
select has_view('public', 'attendance_session_summaries', 'attendance_session_summaries view exists');
select hasnt_column('public', 'attendance_sessions', 'total_worked_seconds', 'no stored net-worked column (it assumed every break is unpaid)');
select has_column('public', 'attendance_sessions', 'gross_elapsed_seconds', 'gross_elapsed_seconds exists');
select col_default_is('public', 'attendance_breaks', 'pay_classification', 'unclassified'::public.attendance_break_pay_classification, 'breaks default to unclassified');

-- 2. Grants / function privileges (catalog level, role-accurate)
select is(
  (select count(*)::int from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   where has_table_privilege('authenticated', 'public.attendance_events', p)
      or has_table_privilege('authenticated', 'public.attendance_sessions', p)
      or has_table_privilege('authenticated', 'public.attendance_breaks', p)),
  0,
  'authenticated holds no write/TRUNCATE privilege on any attendance table'
);
select ok(
  has_table_privilege('authenticated', 'public.attendance_events', 'SELECT')
  and not has_table_privilege('anon', 'public.attendance_events', 'SELECT')
  and not has_table_privilege('anon', 'public.attendance_sessions', 'SELECT'),
  'authenticated may SELECT, anon may not'
);
select ok(
  not has_function_privilege('anon', 'public.attendance_clock_in(uuid,uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.attendance_clock_in(uuid,uuid,text,text)', 'EXECUTE'),
  'attendance_clock_in: anon denied, authenticated allowed'
);
select ok(
  not has_function_privilege('authenticated', 'private.attendance_begin(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.attendance_replay(uuid,uuid,text,public.attendance_event_type,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.attendance_profile_level(uuid,uuid,uuid)', 'EXECUTE'),
  'internal prologue / replay / level helpers are not callable by clients'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and ((n.nspname = 'public' and p.proname in ('attendance_clock_in','attendance_clock_out','attendance_break_start','attendance_break_end','set_location_attendance_mode'))
       or (n.nspname = 'private' and p.proname like 'attendance\_%'))
     and not (p.proconfig is not null and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
  0,
  'every attendance SECURITY DEFINER function pins search_path'
);

-- 3. Fixtures
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000730' || lpad(n::text, 2, '0'))::uuid, 'u73_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 11) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000730' || lpad(n::text, 2, '0'))::uuid, 'User73 ' || n
from generate_series(1, 11) n;

-- 01 overall owner (NO membership anywhere), 02 org owner, 03 b1 location manager, 04 staff1 (b1),
-- 05 staff2 (org member, not assigned), 06 other-org staff, 07 revoked employee (inactive membership,
-- still assigned), 08 staff3 (b1), 09 b4 location manager, 10 revoked b1 manager, 11 overall assistant manager
insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-0000-0000-000000073001', 'owner'),
  ('00000000-0000-0000-0000-000000073011', 'assistant_manager');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000730a1', 'Monks 73', 'monks-73', '00000000-0000-0000-0000-000000073002', '{}'),
  ('00000000-0000-0000-0000-0000000730a2', 'Other Org 73', 'other-org-73', '00000000-0000-0000-0000-000000073006', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073002', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073007', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073008', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073009', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-000000073010', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000730a2', '00000000-0000-0000-0000-000000073006', array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active) values
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-0000000730a1', 'Webster 73', 'America/Chicago', '{}', true),
  ('00000000-0000-0000-0000-0000000730b2', '00000000-0000-0000-0000-0000000730a1', 'Archived 73', 'America/Chicago', '{}', true),
  ('00000000-0000-0000-0000-0000000730b3', '00000000-0000-0000-0000-0000000730a2', 'Other Org Loc 73', 'America/Chicago', '{}', true),
  ('00000000-0000-0000-0000-0000000730b4', '00000000-0000-0000-0000-0000000730a1', 'Second Loc 73', 'America/Chicago', '{}', true),
  ('00000000-0000-0000-0000-0000000730b5', '00000000-0000-0000-0000-0000000730a1', 'External Loc 73', 'America/Chicago', '{}', true),
  ('00000000-0000-0000-0000-0000000730b6', '00000000-0000-0000-0000-0000000730a1', 'Kiritimati 73', 'Pacific/Kiritimati', '{}', true),
  ('00000000-0000-0000-0000-0000000730b7', '00000000-0000-0000-0000-0000000730a1', 'Pago Pago 73', 'Pacific/Pago_Pago', '{}', true);

update public.locations set active = false, archived_at = now()
where id = '00000000-0000-0000-0000-0000000730b2';

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073003', 'manager', true),
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004', 'staff', true),
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073007', 'staff', true),
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073008', 'staff', true),
  ('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073010', 'manager', true),
  ('00000000-0000-0000-0000-0000000730b4', '00000000-0000-0000-0000-000000073009', 'manager', true),
  ('00000000-0000-0000-0000-0000000730b6', '00000000-0000-0000-0000-000000073004', 'staff', true),
  ('00000000-0000-0000-0000-0000000730b7', '00000000-0000-0000-0000-000000073004', 'staff', true);

-- 4. Mode configuration (V2-006.001) -----------------------------------------
select is(
  (select attendance_mode from public.locations where id = '00000000-0000-0000-0000-0000000730b1'),
  null,
  'existing/new locations are unconfigured (NULL) - no silent default'
);

-- Unconfigured location fails closed for native clocking (caller is a legitimate assignee)
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1') $$,
  '42501', 'Internal attendance is not enabled for this location',
  'NULL attendance_mode fails closed for native clock-in'
);

-- Staff, location manager (not an org/overall owner) cannot set the mode
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'internal_the_lineup') $$,
  '42501', 'Unauthorized to manage location attendance mode',
  'staff cannot configure attendance mode'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'internal_the_lineup') $$,
  '42501', 'Unauthorized to manage location attendance mode',
  'a location manager cannot configure attendance mode (lifecycle authority only)'
);
-- Unknown location and unmanageable location are indistinguishable
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730ff', 'internal_the_lineup') $$,
  '42501', 'Unauthorized to manage location attendance mode',
  'unknown location returns the same denial (no existence oracle)'
);

set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073002';
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b2', 'internal_the_lineup') $$,
  '55000', 'Cannot configure attendance mode on archived or inactive location',
  'archived location cannot be configured'
);
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'internal_the_lineup', null, 'x') $$,
  '22023', 'Reason must be between 3 and 500 characters',
  'too-short reason is a controlled error, not a raw constraint violation'
);
select lives_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'internal_the_lineup', null, 'Enable internal attendance') $$,
  'org owner can enable internal mode at b1'
);
-- Overall Owner with NO membership can configure (audit trigger admits Overall actors)
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073001';
select lives_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b4', 'internal_the_lineup', null, 'Overall owner enables b4') $$,
  'Overall Owner without any membership can configure attendance mode'
);
select lives_ok($$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b5', 'external') $$, 'b5 set to external');
select lives_ok($$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b6', 'internal_the_lineup') $$, 'b6 (UTC+14) internal');
select lives_ok($$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b7', 'internal_the_lineup') $$, 'b7 (UTC-11) internal');

reset role;
select is(
  (select count(*)::int from public.audit_events
   where location_id = '00000000-0000-0000-0000-0000000730b4' and action = 'location_attendance_mode_updated'
     and actor_profile_id = '00000000-0000-0000-0000-000000073001'),
  1,
  'mode change is audited with the true actor'
);

set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073002';
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'disabled', '2020-01-01 00:00:00+00') $$,
  'P0004', 'Location was modified by another operation',
  'stale expected_updated_at is rejected'
);

-- 5. Clock-in authorization matrix (V2-006.003) -------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073005'; -- org member, not assigned
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1') $$,
  '42501', 'Employee is not assigned to this location',
  'unassigned org member cannot clock in'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073006'; -- other organization
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1') $$,
  '42501', 'Unauthorized',
  'foreign-organization user gets a uniform denial'
);
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730ff') $$,
  '42501', 'Unauthorized',
  'unknown location returns the identical denial'
);
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b5') $$,
  '42501', 'Unauthorized',
  'foreign user learns nothing about another org location mode (external b5 -> uniform denial)'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073007'; -- revoked employee
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1') $$,
  '42501', 'Unauthorized',
  'revoked (inactive) membership cannot clock in even with a stale location assignment'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004'; -- staff1 (also assigned to b6 and b7)
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b5') $$,
  '42501', 'Employee is not assigned to this location',
  'org member cannot reach the external-mode location b5 (not assigned)'
);
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073008') $$,
  '42501', 'Unauthorized',
  'staff cannot clock in a colleague by supplying their profile id'
);
-- Managers: cross-location, revoked, banned and revoked-session denials
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073009'; -- manager of b4 only
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004') $$,
  '42501', 'Unauthorized',
  'a manager of another location cannot clock in an employee at b1'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073010'; -- b1 manager with REVOKED org membership
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004') $$,
  '42501', 'Unauthorized',
  'a location manager whose organization membership was revoked loses authority'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003'; -- legit b1 manager
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005') $$,
  '42501', 'Employee is not assigned to this location',
  'a manager cannot clock in an employee who is not assigned to the location'
);
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073007') $$,
  '42501', 'Employee is not an active member of this organization',
  'a manager cannot clock in an employee whose membership is revoked'
);
-- Revoked session: JWT carries a session_id that has no live auth.sessions row
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-000000073003","session_id":"00000000-0000-0000-0000-00000000dead"}';
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004') $$,
  '42501', 'Not authenticated',
  'a JWT whose session was revoked loses attendance authority immediately'
);
set local "request.jwt.claims" to '';
reset role;
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-000000073003';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004') $$,
  '42501', 'Not authenticated',
  'a banned manager is denied'
);
reset role;
update auth.users set banned_until = null where id = '00000000-0000-0000-0000-000000073003';
set local role authenticated;

-- 6. Authorized clock-in, idempotency scoping, duplicates ------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select lives_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', null, 'k-shared', 'Opening shift') $$,
  'assigned staff clocks in'
);
select is(
  (select status from public.attendance_sessions where profile_id = '00000000-0000-0000-0000-000000073004' and location_id = '00000000-0000-0000-0000-0000000730b1'),
  'active'::public.attendance_session_status,
  'session is active'
);
select is(
  (select (public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', null, 'k-shared') ->> 'idempotent')::boolean),
  true,
  'exact replay of the same key returns idempotent: true'
);
select is(
  (select count(*)::int from public.attendance_sessions where profile_id = '00000000-0000-0000-0000-000000073004'),
  1,
  'replay created no second session'
);
select throws_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', null, 'k-different') $$,
  '23505', 'Employee already has an open attendance session',
  'clock-in while already open is rejected'
);
select throws_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1', null, 'k-shared') $$,
  '22023', 'Idempotency key was already used for a different operation',
  'a key bound to clock_in cannot be reused for a different operation'
);
-- Another user using the same key string must NOT receive staff1's result and must still act
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073008';
select is(
  (select (public.attendance_clock_in('00000000-0000-0000-0000-0000000730b1', null, 'k-shared') ->> 'idempotent')::boolean),
  false,
  'another user reusing a key string gets a fresh clock-in, not the first user''s replay'
);
select is(
  (select count(*)::int from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b1' and status = 'active'),
  1,
  'cross-user key reuse did not leak staff1''s session through RLS (staff3 sees only its own)'
);
-- Same-actor, same-key but a different target is refused (manager replaying onto someone else)
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select lives_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073008', 'k-mgr') $$,
  'manager starts a break for staff3'
);
select throws_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073004', 'k-mgr') $$,
  '22023', 'Idempotency key was already used for a different operation',
  'a key cannot be replayed onto a different target employee'
);

-- 7. Breaks: transitions, pay classification stays neutral ---------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select lives_ok($$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1', null, 'b-1') $$, 'break starts');
select is(
  (select status from public.attendance_sessions where profile_id = '00000000-0000-0000-0000-000000073004'),
  'on_break'::public.attendance_session_status, 'session is on_break'
);
select throws_ok($$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1') $$, '22023', 'Session is already on break', 'breaks cannot overlap');
select lives_ok($$ select public.attendance_break_end('00000000-0000-0000-0000-0000000730b1', null, 'b-2') $$, 'break ends');
select throws_ok($$ select public.attendance_break_end('00000000-0000-0000-0000-0000000730b1') $$, '22023', 'Session is not currently on break', 'cannot end a break that is not open');
select is(
  (select pay_classification from public.attendance_breaks where profile_id = '00000000-0000-0000-0000-000000073004'),
  'unclassified'::public.attendance_break_pay_classification,
  'a finished break is UNCLASSIFIED, not silently unpaid'
);
-- A removed assignment must not strand an open shift: closing operations skip the assignment check
reset role;
update public.location_memberships set active = false
where location_id = '00000000-0000-0000-0000-0000000730b1' and profile_id = '00000000-0000-0000-0000-000000073004';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select throws_ok(
  $$ select public.attendance_break_start('00000000-0000-0000-0000-0000000730b1') $$,
  '42501', 'Employee is not assigned to this location',
  'opening operations require a current assignment'
);

-- Mode change blocked while employees are on the clock
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073002';
select throws_ok(
  $$ select public.set_location_attendance_mode('00000000-0000-0000-0000-0000000730b1', 'external') $$,
  '55000', 'Close all open attendance sessions before leaving internal attendance mode',
  'leaving internal mode with open sessions is refused'
);

-- 8. Clock-out ---------------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select lives_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1', null, 'out-1', 'End of shift') $$,
  'a de-assigned employee can still clock out an open session'
);
select is(
  (select (public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1', null, 'out-1') ->> 'idempotent')::boolean),
  true, 'clock-out replay is idempotent'
);
select throws_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1') $$,
  'P0002', 'No active attendance session found to clock out',
  'clock-out without an open session is rejected'
);
select is(
  (select s.gross_elapsed_seconds >= 0 and s.total_break_seconds >= 0 and s.clock_out_at >= s.clock_in_at
   from public.attendance_sessions s where s.profile_id = '00000000-0000-0000-0000-000000073004'),
  true, 'elapsed intervals are non-negative'
);
select is(
  (select net_payable_seconds from public.attendance_session_summaries where profile_id = '00000000-0000-0000-0000-000000073004'),
  null::integer,
  'net payable is NULL while a break is unclassified (no assumed policy)'
);
select is(
  (select break_policy_resolved from public.attendance_session_summaries where profile_id = '00000000-0000-0000-0000-000000073004'),
  false, 'break policy is reported unresolved'
);

-- Manager clocks out an employee who is on break: the break is closed consistently
select throws_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073008', 'out-x') $$,
  '42501', 'Unauthorized',
  'staff cannot clock out a colleague'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select lives_ok(
  $$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073008', 'out-mgr') $$,
  'manager clocks out an employee who is on break'
);
reset role;
select is(
  (select count(*)::int from public.attendance_breaks where profile_id = '00000000-0000-0000-0000-000000073008' and end_time is null),
  0, 'the open break was closed by clock-out'
);
select is(
  (select (metadata ->> 'auto_closed_by_clock_out')::boolean from public.attendance_events
   where profile_id = '00000000-0000-0000-0000-000000073008' and event_type = 'break_end'),
  true, 'the auto-closed break is marked in the audit stream'
);
select is(
  (select source::text || ':' || actor_profile_id::text from public.attendance_events
   where profile_id = '00000000-0000-0000-0000-000000073008' and event_type = 'clock_out'),
  'manager:00000000-0000-0000-0000-000000073003',
  'manager action is attributed to the real actor with source=manager'
);

-- Overall Owner without membership can act (actor FK is a profile FK)
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073001';
select lives_ok(
  $$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b4', '00000000-0000-0000-0000-000000073009') $$,
  'Overall Owner (no membership row) can clock in an assigned employee'
);
reset role;
select is(
  (select actor_profile_id from public.attendance_events where profile_id = '00000000-0000-0000-0000-000000073009' and event_type = 'clock_in'),
  '00000000-0000-0000-0000-000000073001'::uuid,
  'event records the Overall Owner as actor'
);

-- 9. Timezone service_date ------------------------------------------------------
-- staff1 is assigned to b6 (UTC+14) and b7 (UTC-11): 25h apart, so the local dates always differ.
update public.location_memberships set active = true
where location_id = '00000000-0000-0000-0000-0000000730b1' and profile_id = '00000000-0000-0000-0000-000000073004';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select lives_ok($$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b6') $$, 'clock in at UTC+14 location');
select lives_ok($$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b6') $$, 'clock out UTC+14');
select lives_ok($$ select public.attendance_clock_in('00000000-0000-0000-0000-0000000730b7') $$, 'clock in at UTC-11 location');
select isnt(
  (select service_date from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b6'),
  (select service_date from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b7'),
  'service_date follows each location''s own time zone'
);
select is(
  (select service_date from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b6'),
  (select (clock_in_at at time zone 'Pacific/Kiritimati')::date from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b6'),
  'service_date equals the location-local date of the clock-in instant'
);
select lives_ok($$ select public.attendance_clock_out('00000000-0000-0000-0000-0000000730b7') $$, 'clock out UTC-11');

-- 10. Read isolation (RLS) ---------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073005';
select is((select count(*)::int from public.attendance_sessions), 0, 'an unrelated org member sees no one else''s sessions');
select is((select count(*)::int from public.attendance_events), 0, 'an unrelated org member sees no events');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073006';
select is((select count(*)::int from public.attendance_sessions), 0, 'a foreign-organization user sees nothing');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select is(
  (select count(*)::int from public.attendance_sessions where profile_id <> '00000000-0000-0000-0000-000000073004'),
  0, 'an employee sees only their own sessions'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select ok(
  (select count(*)::int from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b1') >= 2
  and (select count(*)::int from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b4') = 0,
  'a b1 manager reads b1 attendance but not b4'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073009';
select is(
  (select count(*)::int from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b1'),
  0, 'a b4 manager cannot read b1 attendance'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073010';
select is((select count(*)::int from public.attendance_sessions), 0, 'a manager with revoked membership reads nothing');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073007';
select is((select count(*)::int from public.attendance_sessions), 0, 'a revoked employee reads nothing');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073011';
select ok((select count(*)::int from public.attendance_sessions) > 0, 'Overall Assistant Manager (tier 2) reads across locations per the access model');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073001';
select ok((select count(*)::int from public.attendance_sessions where location_id = '00000000-0000-0000-0000-0000000730b4') = 1, 'Overall Owner reads any location');

-- 11. Direct client writes are impossible (privilege level, not just RLS) --------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073004';
select throws_ok(
  $$ insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, service_date, actor_profile_id)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1',
             '00000000-0000-0000-0000-000000073004', 'clock_in', current_date, '00000000-0000-0000-0000-000000073004') $$,
  '42501', null, 'direct INSERT into attendance_events is denied'
);
select throws_ok(
  $$ update public.attendance_sessions set clock_in_at = clock_in_at - interval '3 hours' where profile_id = '00000000-0000-0000-0000-000000073004' $$,
  '42501', null, 'direct UPDATE of a session (time theft) is denied'
);
select throws_ok(
  $$ delete from public.attendance_breaks $$,
  '42501', null, 'direct DELETE of breaks is denied'
);
select throws_ok(
  $$ truncate public.attendance_events $$,
  '42501', null, 'TRUNCATE of the audit ledger is denied for clients'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000073003';
select throws_ok(
  $$ update public.attendance_sessions set clock_out_at = now() where location_id = '00000000-0000-0000-0000-0000000730b1' $$,
  '42501', null, 'even a manager cannot write sessions directly (RPC only)'
);

-- 12. Ledger immutability (even for the table owner) ---------------------------------
reset role;
select throws_ok(
  $$ update public.attendance_events set event_time = now() - interval '1 hour' $$,
  '23514', 'attendance_events is immutable and cannot be updated, deleted or truncated',
  'attendance_events cannot be updated'
);
select throws_ok(
  $$ delete from public.attendance_events $$,
  '23514', 'attendance_events is immutable and cannot be updated, deleted or truncated',
  'attendance_events cannot be deleted'
);
select throws_ok(
  $$ truncate public.attendance_events cascade $$,
  '23514', 'attendance_events is immutable and cannot be updated, deleted or truncated',
  'attendance_events cannot be truncated, even by its owner'
);

-- 13. Data integrity constraints ---------------------------------------------------------
select throws_ok(
  $$ insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, service_date, actor_profile_id)
     select s.id, s.organization_id, '00000000-0000-0000-0000-0000000730b4', s.profile_id, 'clock_in', s.service_date, s.profile_id
     from public.attendance_sessions s where s.location_id = '00000000-0000-0000-0000-0000000730b1' limit 1 $$,
  '23503', null, 'an event cannot attach to a session from a different location (composite tenant FK)'
);
select throws_ok(
  $$ insert into public.attendance_sessions (organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, created_by)
     values ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005',
             current_date, 'completed', now(), now() - interval '1 hour', 0, '00000000-0000-0000-0000-000000073005') $$,
  '23514', null, 'a session cannot end before it starts'
);
select throws_ok(
  $$ insert into public.attendance_sessions (organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
     values ('00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005',
             current_date, 'completed', now() - interval '1 hour', now(), 3600, 7200, '00000000-0000-0000-0000-000000073005') $$,
  '23514', null, 'total break time cannot exceed the shift'
);
select throws_ok(
  $$ insert into public.attendance_breaks (session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds, pay_classification)
     select id, organization_id, location_id, profile_id, now(), now(), 0, 'unpaid' from public.attendance_sessions limit 1 $$,
  '23514', null, 'a classified break must carry who/when (no anonymous classification)'
);

-- 14. Derived summary: policy-neutral facts across a DST transition --------------------
-- 2026-11-01 05:00Z..09:00Z in America/Chicago spans the fall-back instant (07:00Z):
-- wall clocks show 00:00 CDT -> 03:00 CST (3 wall hours) but 4 real hours elapsed.
insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
values ('00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1',
        '00000000-0000-0000-0000-000000073005', '2026-10-31', 'completed',
        '2026-11-01 05:00:00+00', '2026-11-01 09:00:00+00', 14400, 1800, '00000000-0000-0000-0000-000000073005');
insert into public.attendance_breaks (session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds, pay_classification, classified_by, classified_at) values
  ('00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005', '2026-11-01 06:00:00+00', '2026-11-01 06:10:00+00', 600, 'paid', '00000000-0000-0000-0000-000000073002', now()),
  ('00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005', '2026-11-01 07:30:00+00', '2026-11-01 07:45:00+00', 900, 'unpaid', '00000000-0000-0000-0000-000000073002', now()),
  ('00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-0000000730a1', '00000000-0000-0000-0000-0000000730b1', '00000000-0000-0000-0000-000000073005', '2026-11-01 08:00:00+00', '2026-11-01 08:05:00+00', 300, 'unclassified', null, null);

select is(
  (select gross_elapsed_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000007f001'),
  14400, 'gross elapsed across the DST fall-back is 4 real hours'
);
select is(
  (select paid_break_seconds || '/' || unpaid_break_seconds || '/' || unclassified_break_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000007f001'),
  '600/900/300', 'summary separates paid, confirmed-unpaid and unclassified break time'
);
select is(
  (select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000007f001'),
  null::integer, 'one unclassified break keeps net payable NULL'
);
update public.attendance_breaks set pay_classification = 'unpaid', classified_by = '00000000-0000-0000-0000-000000073002', classified_at = now()
where session_id = '00000000-0000-0000-0000-00000007f001' and pay_classification = 'unclassified';
select is(
  (select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000007f001'),
  14400 - 900 - 300, 'once every break is classified, net = gross minus CONFIRMED unpaid breaks only (paid break not deducted)'
);

select * from finish();
rollback;
