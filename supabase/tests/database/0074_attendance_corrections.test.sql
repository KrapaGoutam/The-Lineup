begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- --------------------------------------------------------------------------
-- V2-006.004 Manager Corrections - behavioural suite (real authenticated JWT subjects)
-- --------------------------------------------------------------------------

-- Fixtures ---------------------------------------------------------------------------
-- 01 org owner, 02 b1 location manager, 03 staff A, 04 staff B, 05 b2 manager (other location),
-- 06 other-org owner, 07 revoked b1 manager, 08 overall owner (no membership), 09 staff C
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000740' || lpad(n::text, 2, '0'))::uuid, 'u74_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 9) n;
insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000740' || lpad(n::text, 2, '0'))::uuid, 'User74 ' || n from generate_series(1, 9) n;
insert into public.overall_roles (profile_id, role) values ('00000000-0000-0000-0000-000000074008', 'owner');
insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000740a1', 'Org74', 'org-74', '00000000-0000-0000-0000-000000074001', '{}'),
  ('00000000-0000-0000-0000-0000000740a2', 'OtherOrg74', 'other-org-74', '00000000-0000-0000-0000-000000074006', '{}');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074007', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-000000074009', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000740a2', '00000000-0000-0000-0000-000000074006', array['owner']::public.app_role[], true);
insert into public.locations (id, organization_id, name, time_zone, address, active, attendance_mode) values
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-0000000740a1', 'B1', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000740b2', '00000000-0000-0000-0000-0000000740a1', 'B2', 'America/Chicago', '{}', true, 'internal_the_lineup'),
  ('00000000-0000-0000-0000-0000000740b3', '00000000-0000-0000-0000-0000000740a2', 'B3', 'America/Chicago', '{}', true, 'internal_the_lineup');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074002', 'manager', true),
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074003', 'staff', true),
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074004', 'staff', true),
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074009', 'staff', true),
  ('00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074007', 'manager', true),
  ('00000000-0000-0000-0000-0000000740b2', '00000000-0000-0000-0000-000000074005', 'manager', true);

-- Sessions (all in the past, built relative to a fixed base instant).
-- S1 staff A completed: base..base+8h with two UNCLASSIFIED breaks (30m + 15m)
-- S3 staff A completed earlier: base-30h..base-22h
-- S2 staff B open (active) since base+20h
-- S6 manager 02's own completed session
-- S7 staff C on_break with an OPEN break
-- S5 other-org session at b3
create temp table t74 as select date_trunc('hour', now()) - interval '60 hours' as base;
grant select on t74 to authenticated;

insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, total_break_seconds, created_by)
select s.id, '00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-0000000740b1', s.prof, (t.base + s.i)::date, s.st, t.base + s.i, case when s.o is null then null else t.base + s.o end, s.g, s.tb, s.prof
from t74 t, (values
  ('00000000-0000-0000-0000-00000074f001'::uuid, '00000000-0000-0000-0000-000000074003'::uuid, 'completed'::public.attendance_session_status, interval '0 hours', interval '8 hours', 28800, 2700),
  ('00000000-0000-0000-0000-00000074f003'::uuid, '00000000-0000-0000-0000-000000074003'::uuid, 'completed'::public.attendance_session_status, interval '-30 hours', interval '-22 hours', 28800, 0),
  ('00000000-0000-0000-0000-00000074f002'::uuid, '00000000-0000-0000-0000-000000074004'::uuid, 'active'::public.attendance_session_status, interval '20 hours', null, null, 0),
  ('00000000-0000-0000-0000-00000074f006'::uuid, '00000000-0000-0000-0000-000000074002'::uuid, 'completed'::public.attendance_session_status, interval '10 hours', interval '14 hours', 14400, 0),
  ('00000000-0000-0000-0000-00000074f007'::uuid, '00000000-0000-0000-0000-000000074009'::uuid, 'on_break'::public.attendance_session_status, interval '30 hours', null, null, 0)
) as s(id, prof, st, i, o, g, tb);

insert into public.attendance_breaks (id, session_id, organization_id, location_id, profile_id, start_time, end_time, duration_seconds)
overriding system value
select v.id, v.sid, '00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-0000000740b1', v.prof, t.base + v.s, case when v.e is null then null else t.base + v.e end, v.d
from t74 t, (values
  (7401::bigint, '00000000-0000-0000-0000-00000074f001'::uuid, '00000000-0000-0000-0000-000000074003'::uuid, interval '3 hours', interval '3 hours 30 minutes', 1800),
  (7402::bigint, '00000000-0000-0000-0000-00000074f001'::uuid, '00000000-0000-0000-0000-000000074003'::uuid, interval '5 hours', interval '5 hours 15 minutes', 900),
  (7403::bigint, '00000000-0000-0000-0000-00000074f007'::uuid, '00000000-0000-0000-0000-000000074009'::uuid, interval '32 hours', null::interval, null::int)
) as v(id, sid, prof, s, e, d);

insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, event_time, service_date, source, actor_profile_id)
select s.id, s.organization_id, s.location_id, s.profile_id, e.t, case e.t when 'clock_in' then s.clock_in_at else s.clock_out_at end, s.service_date, 'web', s.profile_id
from public.attendance_sessions s, (values ('clock_in'::public.attendance_event_type), ('clock_out'::public.attendance_event_type)) e(t)
where s.id in ('00000000-0000-0000-0000-00000074f001', '00000000-0000-0000-0000-00000074f003', '00000000-0000-0000-0000-00000074f006')
  and (e.t = 'clock_in' or s.clock_out_at is not null);

-- Other-org session
insert into public.attendance_sessions (id, organization_id, location_id, profile_id, service_date, status, clock_in_at, clock_out_at, gross_elapsed_seconds, created_by)
select '00000000-0000-0000-0000-00000074f005', '00000000-0000-0000-0000-0000000740a2', '00000000-0000-0000-0000-0000000740b3', '00000000-0000-0000-0000-000000074006', (base)::date, 'completed', base, base + interval '4 hours', 14400, '00000000-0000-0000-0000-000000074006' from t74;

select is((select version from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f001'), 1, 'fixture session starts at version 1');

-- 1. Capability probe ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000740b1'), true, 'b1 manager can manage b1');
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000740b2'), false, 'b1 manager cannot manage b2');
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000740ff'), false, 'unknown location => false (no oracle)');

-- 2. Authorization denials: all identical, none reveal anything ----------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074003'; -- the employee themself
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'self edit attempt', null, (select base + interval '9 hours' from t74)) $$,
  '42501', 'Unauthorized', 'an employee cannot correct their own time'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074005'; -- manager of another location
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'wrong location', null, (select base + interval '9 hours' from t74)) $$,
  '42501', 'Unauthorized', 'a manager of another location cannot correct this session (cross-location)'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074006'; -- other organization owner
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'foreign org', null, (select base + interval '9 hours' from t74)) $$,
  '42501', 'Unauthorized', 'a foreign-organization owner cannot correct (foreign org)'
);
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074ffff', 1, 'unknown session', null, now() - interval '1 hour') $$,
  '42501', 'Unauthorized', 'unknown session id returns the identical denial'
);
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074007'; -- revoked membership
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'revoked manager', null, (select base + interval '9 hours' from t74)) $$,
  '42501', 'Unauthorized', 'a manager with a revoked membership cannot correct'
);
reset role;
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-000000074002';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'banned manager', null, (select base + interval '9 hours' from t74)) $$,
  '42501', 'Not authenticated', 'a banned manager cannot correct'
);
reset role;
update auth.users set banned_until = null where id = '00000000-0000-0000-0000-000000074002';
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';

-- 3. Input validation -----------------------------------------------------------------------
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, '', null, (select base + interval '9 hours' from t74)) $$,
  '22023', 'A correction reason of 3 to 500 characters is required', 'empty reason is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, '    ', null, (select base + interval '9 hours' from t74)) $$,
  '22023', 'A correction reason of 3 to 500 characters is required', 'whitespace-only reason is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'ab', null, (select base + interval '9 hours' from t74)) $$,
  '22023', 'A correction reason of 3 to 500 characters is required', 'too-short reason is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'nothing asked') $$,
  '22023', 'No change was requested', 'a request with no change is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'same values', null, (select base + interval '8 hours' from t74)) $$,
  '22023', 'The requested values match the current record; nothing to correct', 'restating current values is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 99, 'stale please', null, (select base + interval '9 hours' from t74)) $$,
  'P0004', 'This attendance record was changed by someone else. Reload and try again.', 'stale version is rejected');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'backwards', (select base + interval '9 hours' from t74), null) $$,
  '22023', 'Clock-out cannot be before clock-in', 'clock-in after clock-out is rejected (negative duration)');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'future time', null, now() + interval '3 hours') $$,
  '22023', 'Corrected times cannot be in the future', 'future clock-out is rejected');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'break outside', (select base + interval '4 hours' from t74)) $$,
  '22023', 'Every break must fall inside the corrected shift', 'moving clock-in past an existing break is rejected');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'short shift', null, (select base + interval '4 hours' from t74)) $$,
  '22023', 'Every break must fall inside the corrected shift', 'ending the shift before a later break is rejected');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'overlap breaks', null, null,
       jsonb_build_array(jsonb_build_object('id', 7402, 'start_time', (select base + interval '3 hours 10 minutes' from t74), 'end_time', (select base + interval '3 hours 20 minutes' from t74)))) $$,
  '22023', 'Breaks cannot overlap', 'overlapping breaks are rejected');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'neg break', null, null,
       jsonb_build_array(jsonb_build_object('id', 7402, 'start_time', (select base + interval '5 hours' from t74), 'end_time', (select base + interval '4 hours' from t74)))) $$,
  '22023', 'Break end cannot be before break start', 'a break ending before it starts is rejected');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'foreign break', null, null,
       jsonb_build_array(jsonb_build_object('id', 7403, 'pay_classification', 'paid'))) $$,
  '22023', 'Break not found on this session', 'a break belonging to another session cannot be edited through this one');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'bad ts', null, null,
       jsonb_build_array(jsonb_build_object('id', 7401, 'end_time', 'not-a-time'))) $$,
  '22007', null, 'a malformed timestamp is a controlled error');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'overlap sessions', (select base - interval '25 hours' from t74)) $$,
  '23P01', 'The corrected shift overlaps another attendance session for this employee', 'a corrected shift cannot overlap the employee''s other session');

-- 4. A valid correction: append-only audit, effective values, versioning ------------------------
select is((select count(*)::int from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001'), 2, 'session has its 2 original events');
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'Forgot to clock out on time', null, (select base + interval '8 hours 30 minutes' from t74), '[]'::jsonb, false, 'fix-1') $$,
  'authorized manager corrects the clock-out with a reason'
);
select is((select (gross_elapsed_seconds, total_break_seconds, version, correction_count)::text from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f001'),
  '(30600,2700,2,1)', 'effective gross recomputed from absolute instants; version and correction_count advanced');
select is((select count(*)::int from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and not is_manager_correction), 2, 'the 2 original events are still present and untouched');
select is((select count(*)::int from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and is_manager_correction), 1, 'exactly one correction event was appended');
reset role;
select is(
  (select e.event_time from public.attendance_events e where e.session_id = '00000000-0000-0000-0000-00000074f001' and e.event_type = 'clock_out' and not e.is_manager_correction),
  (select base + interval '8 hours' from t74), 'the ORIGINAL clock-out event still records the original value');
select is(
  (select (actor_profile_id::text || '|' || correction_reason || '|' || source::text || '|' || (reverses_event_id is not null)::text)
   from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and is_manager_correction),
  '00000000-0000-0000-0000-000000074002|Forgot to clock out on time|manager|true',
  'correction records actor, reason, source and references the original clock-out event');
select ok(
  (select (e.metadata -> 'before' ->> 'clock_out_at')::timestamptz = t.base + interval '8 hours'
      and (e.metadata -> 'after' ->> 'clock_out_at')::timestamptz = t.base + interval '8 hours 30 minutes'
   from public.attendance_events e, t74 t
   where e.session_id = '00000000-0000-0000-0000-00000074f001' and e.is_manager_correction),
  'correction stores original and corrected values');
select is(
  (select (metadata ->> 'seq') || '/' || (metadata ->> 'version_before') || '/' || (metadata ->> 'version_after') || '/' || (metadata -> 'changed_fields')::text
   from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and is_manager_correction),
  '1/1/2/["clock_out_at", "gross_elapsed_seconds"]', 'correction stores sequence, version transition and changed fields');
select ok((select event_time from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and is_manager_correction) > now() - interval '1 minute',
  'the audit timestamp is server-generated (now), not the corrected time');
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';

-- Idempotent replay & key binding
select is((select (public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'Forgot to clock out on time', null, (select base + interval '8 hours 30 minutes' from t74), '[]'::jsonb, false, 'fix-1') ->> 'idempotent')::boolean),
  true, 'retrying the same correction (same key) is an idempotent replay');
select is((select correction_count from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f001'), 1, 'replay did not apply a second correction');
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f006', 1, 'reuse key', null, (select base + interval '15 hours' from t74), '[]'::jsonb, false, 'fix-1') $$,
  '22023', 'Idempotency key was already used for a different operation', 'a key cannot be replayed onto another session');

-- Stale version after a correction
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 1, 'second manager stale', null, (select base + interval '9 hours' from t74)) $$,
  'P0004', null, 'a second manager holding the pre-correction version is rejected');

-- Classification correction & derived totals
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000074f001'), null::int, 'net payable still NULL while breaks are unclassified');
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 2, 'Owner confirmed break policy', null, null,
       jsonb_build_array(jsonb_build_object('id', 7401, 'pay_classification', 'unpaid'), jsonb_build_object('id', 7402, 'pay_classification', 'paid'))) $$,
  'manager classifies breaks with a reason');
select is((select (paid_break_seconds, unpaid_break_seconds, unclassified_break_seconds, net_payable_seconds, version, correction_count)::text
           from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000074f001'),
  '(900,1800,0,28800,3,2)', 'corrected totals: net = gross 30600 - confirmed-unpaid 1800; correction indicators exposed');
select is((select classified_by from public.attendance_breaks where id = 7401), '00000000-0000-0000-0000-000000074002'::uuid, 'classification is attributed to the manager');

-- Break time correction recomputes duration and totals
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f001', 3, 'Break was 40 minutes', null, null,
       jsonb_build_array(jsonb_build_object('id', 7401, 'end_time', (select base + interval '3 hours 40 minutes' from t74)))) $$,
  'manager corrects a break end');
select is((select (duration_seconds)::text from public.attendance_breaks where id = 7401), '2400', 'break duration recomputed');
select is((select total_break_seconds from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f001'), 3300, 'session total break recomputed (2400 + 900)');

-- 5. Missing clock-out (open session) and open break ----------------------------------------------
select lives_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f007', 1, 'Employee left while on break', null, (select base + interval '33 hours' from t74)) $$,
  'manager closes an open on_break session');
select is((select (status::text || '/' || gross_elapsed_seconds || '/' || total_break_seconds) from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f007'),
  'completed/10800/3600', 'session completed; the open break ended with the shift');
select is((select count(*)::int from public.attendance_breaks where session_id = '00000000-0000-0000-0000-00000074f007' and end_time is null), 0, 'no break is left open');

-- 6. Concurrency token: an employee's own clock action invalidates a manager's view ------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074004'; -- staff B, open session f002
select lives_ok($$ select public.attendance_break_start('00000000-0000-0000-0000-0000000740b1') $$, 'staff B starts a break (changes the session)');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f002', 1, 'manager sees old state', (select base + interval '19 hours' from t74)) $$,
  'P0004', null, 'a manager acting on a pre-clock-action version is rejected (version bumps on every change)');

-- 7. Self-correction is allowed but flagged ------------------------------------------------------------
select lives_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f006', 1, 'Fix my own punch', null, (select base + interval '14 hours 15 minutes' from t74)) $$, 'a manager can correct their own session');
reset role;
select is((select (metadata ->> 'self_correction')::boolean from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f006' and is_manager_correction), true, 'self-correction is flagged in the audit trail');
set local role authenticated;

-- 8. Void ---------------------------------------------------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074001'; -- org owner
select throws_ok(
  $$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f003', 1, 'void plus edit', (select base - interval '29 hours' from t74), null, '[]'::jsonb, true) $$,
  '22023', 'Voiding a session cannot be combined with other changes', 'void cannot be combined with other changes');
select lives_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f003', 1, 'Entered by mistake', null, null, '[]'::jsonb, true) $$, 'org owner voids an erroneous session');
select is((select status from public.attendance_sessions where id = '00000000-0000-0000-0000-00000074f003'), 'voided'::public.attendance_session_status, 'session is voided');
select is((select net_payable_seconds from public.attendance_session_summaries where session_id = '00000000-0000-0000-0000-00000074f003'), null::int, 'a voided session yields no payable time');
select throws_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f003', 2, 'edit voided', null, (select base - interval '21 hours' from t74)) $$,
  '55000', 'A voided session cannot be corrected', 'a voided session cannot be edited');
reset role;
select is((select event_type::text from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f003' and is_manager_correction), 'void', 'void is recorded as a void ledger event');

-- 9. Overall owner without any membership may correct (actor FK is a profile FK) -------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074008';
select lives_ok($$ select public.attendance_correct_session('00000000-0000-0000-0000-00000074f006', 2, 'Overall review adjustment', null, (select base + interval '14 hours 30 minutes' from t74)) $$, 'Overall Owner with no membership row can correct');

-- 10. Read isolation for the correction history ---------------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074003'; -- staff A
select ok((select count(*)::int from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001' and is_manager_correction) >= 3, 'an employee can see the corrections made to their own session');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074004'; -- staff B
select is((select count(*)::int from public.attendance_events where session_id = '00000000-0000-0000-0000-00000074f001'), 0, 'another employee sees no correction history');
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074005'; -- b2 manager
select is((select count(*)::int from public.attendance_events where is_manager_correction and location_id = '00000000-0000-0000-0000-0000000740b1'), 0, 'a manager of another location cannot read this location''s corrections');

-- 11. Clients cannot forge corrections directly ----------------------------------------------------------------------
set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-000000074002';
select throws_ok($$ update public.attendance_sessions set clock_in_at = clock_in_at - interval '2 hours' where id = '00000000-0000-0000-0000-00000074f001' $$, '42501', null, 'a manager cannot edit sessions directly (RPC only)');
select throws_ok($$ insert into public.attendance_events (session_id, organization_id, location_id, profile_id, event_type, service_date, actor_profile_id, is_manager_correction, correction_reason)
  values ('00000000-0000-0000-0000-00000074f001', '00000000-0000-0000-0000-0000000740a1', '00000000-0000-0000-0000-0000000740b1', '00000000-0000-0000-0000-000000074003', 'manager_edit', current_date, '00000000-0000-0000-0000-000000074002', true, 'forged') $$,
  '42501', null, 'a manager cannot forge correction events directly');
select is(public.attendance_can_manage('00000000-0000-0000-0000-0000000740b1'), true, 'sanity: the manager remains authorized throughout');

select * from finish();
rollback;
