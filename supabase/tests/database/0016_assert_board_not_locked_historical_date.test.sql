begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Feature 028, Step 5. Proves the server-side half of the historical
-- read-only lock: a plain server who legitimately holds a past day's
-- service_session_id (as the date navigator hands them) cannot call
-- board_assign or board_clear_cell against it, even though tips for
-- that day were never finalized -- the historical-date check is
-- independent of, and evaluated before, the tip-finalized check.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000028501', '0285-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028502', '0285-server@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000028501', 'PGTAP 0285 Owner'),
  ('00000000-0000-0000-0000-000000028502', 'PGTAP 0285 Server');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000028511', 'PGTAP 0285 Org', 'pgtap-0285-org', '00000000-0000-0000-0000-000000028501');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000028521', '00000000-0000-0000-0000-000000028511', 'PGTAP 0285 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000028511', '00000000-0000-0000-0000-000000028501', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028511', '00000000-0000-0000-0000-000000028502', array['server']::public.app_role[], true);

-- A concluded, never-finalized session from a week ago -- the ordinary
-- case Step 5 exists to let people browse to, and precisely the case
-- 20260908210000 closes the gap for.
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900005, '00000000-0000-0000-0000-000000028511', '00000000-0000-0000-0000-000000028521', current_date - 7, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900005, '00000000-0000-0000-0000-000000028511', 900005, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900005, '00000000-0000-0000-0000-000000028511', 900005, '00000000-0000-0000-0000-000000028502', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028502', true);

select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000028511'::uuid, '00000000-0000-0000-0000-000000028521'::uuid, current_date - 7, 900005, 900005, '5') $$,
  'This board is read-only -- it is a previous day''s service.',
  'a plain server cannot board_assign against a session from a previous day, even though tips were never finalized'
);

select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028511'::uuid, 900005, 900005, 900005) $$,
  'This board is read-only -- it is a previous day''s service.',
  'board_clear_cell is blocked the same way against the same historical session'
);

reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900005 and rotation_member_id = 900005),
  0,
  'nothing was actually written -- the blocked calls did not leave a row behind'
);

-- Regression: today's own session, still open and not finalized, must
-- remain fully writable -- the historical check must not accidentally
-- catch today itself.
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900006, '00000000-0000-0000-0000-000000028511', '00000000-0000-0000-0000-000000028521', current_date, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900006, '00000000-0000-0000-0000-000000028511', 900006, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900006, '00000000-0000-0000-0000-000000028511', 900006, '00000000-0000-0000-0000-000000028502', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028502', true);

select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000028511'::uuid, '00000000-0000-0000-0000-000000028521'::uuid, current_date, 900006, 900006, '9') $$,
  'a plain server can still board_assign against today''s own session -- the historical check does not catch today'
);

reset role;
select is(
  (select table_label::text from public.table_rotation_entries where rotation_round_id = 900006 and rotation_member_id = 900006),
  '9',
  'the allowed write against today''s session actually landed'
);

select * from finish();
rollback;
