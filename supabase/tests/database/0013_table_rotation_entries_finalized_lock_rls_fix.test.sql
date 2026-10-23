begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Feature 028 (originally a raw-RLS test), rewritten for Table Rotation V2
-- Part 1: the finalized-day lock must hold for a plain SERVER -- a role that
-- cannot read tip_pools at all -- through the only write path that now
-- exists, the board_* RPCs. The lock is evaluated by the SECURITY DEFINER
-- lock helper (and re-checked by the row-level guard trigger on every
-- entry write), so the manager-only visibility of tip_pools can no longer
-- neutralize it. Direct table writes are denied outright.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000028001', '028-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028002', '028-server@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000028001', 'PGTAP 028 Owner'),
  ('00000000-0000-0000-0000-000000028002', 'PGTAP 028 Server');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000028101', 'PGTAP 028 Org', 'pgtap-028-org', '00000000-0000-0000-0000-000000028001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000028201', '00000000-0000-0000-0000-000000028101', 'PGTAP 028 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028002', array['server']::public.app_role[], true);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', (now() at time zone 'America/Chicago')::date, 'service', 'active');

insert into public.tip_pools (id, organization_id, location_id, service_date, status)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', (now() at time zone 'America/Chicago')::date, 'draft');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', 900001, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', 900001, '00000000-0000-0000-0000-000000028002', 1);

-- Confirm the server genuinely cannot read tip_pools directly -- the
-- precondition that made the original bug possible.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select is(
  (select count(*)::int from public.tip_pools where id = 900001),
  0,
  'a server cannot see this org''s tip_pools row directly -- the precondition for the original bug'
);

-- Assign, not finalized: succeeds through the RPC.
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', (now() at time zone 'America/Chicago')::date, 900001, 900001, '12', false) $$,
  'a server can assign a table while the day''s tip pool is still draft'
);

-- Clear Cell, not finalized: succeeds.
select lives_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028101', 900001, 900001, 900001) $$,
  'a server can clear that cell while still draft'
);

-- Finalize tips for the date, seeded as postgres (clear the simulated JWT
-- too: a context with no user is the trusted/service context).
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.tip_pools
set status = 'finalized', finalized_at = now(), finalized_by = '00000000-0000-0000-0000-000000028001'
where id = 900001;
insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
values ('00000000-0000-0000-0000-000000028101', 900001, 900001, '12', '00000000-0000-0000-0000-000000028002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);

select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', (now() at time zone 'America/Chicago')::date, 900001, 900001, '14', false) $$,
  'P0001',
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'a server is blocked from assigning once tips are finalized'
);
select throws_ok(
  $$ select public.board_end_table('00000000-0000-0000-0000-000000028101', 900001, 900001, 900001) $$,
  'P0001',
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'a server is blocked from ending a table once tips are finalized'
);
select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028101', 900001, 900001, 900001) $$,
  'P0001',
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'a server is blocked from clearing a cell once tips are finalized'
);

reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900001 and rotation_member_id = 900001),
  1,
  'the entry is still there after the blocked attempts -- confirmed as postgres'
);

-- And the raw table is closed to the role entirely.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select throws_ok(
  $$ delete from public.table_rotation_entries where rotation_round_id = 900001 and rotation_member_id = 900001 $$,
  '42501',
  null,
  'a server cannot delete a table entry directly -- writes go through the board_* RPCs'
);
reset role;

select * from finish();
rollback;
