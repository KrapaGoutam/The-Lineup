begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(
  (select prosecdef from pg_proc where pronamespace = 'private'::regnamespace and proname = 'assert_board_not_locked'),
  'assert_board_not_locked is now SECURITY DEFINER'
);

-- Feature 028. board_assign is the single most-used board_* RPC (every
-- ordinary table assignment goes through it) -- proving the fix here,
-- not just on the new clear-cell RPC, is the real regression test for
-- "the temporal lock invariant has never actually worked for a plain
-- server or host."
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000028401', '0284-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028402', '0284-server@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000028401', 'PGTAP 0284 Owner'),
  ('00000000-0000-0000-0000-000000028402', 'PGTAP 0284 Server');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000028411', 'PGTAP 0284 Org', 'pgtap-0284-org', '00000000-0000-0000-0000-000000028401');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000028421', '00000000-0000-0000-0000-000000028411', 'PGTAP 0284 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000028411', '00000000-0000-0000-0000-000000028401', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028411', '00000000-0000-0000-0000-000000028402', array['server']::public.app_role[], true);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900004, '00000000-0000-0000-0000-000000028411', '00000000-0000-0000-0000-000000028421', current_date, 'service', 'active');

insert into public.tip_pools (id, organization_id, location_id, service_date, status, finalized_at, finalized_by)
overriding system value
values (900004, '00000000-0000-0000-0000-000000028411', '00000000-0000-0000-0000-000000028421', current_date, 'finalized', now(), '00000000-0000-0000-0000-000000028401');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900004, '00000000-0000-0000-0000-000000028411', 900004, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900004, '00000000-0000-0000-0000-000000028411', 900004, '00000000-0000-0000-0000-000000028402', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028402', true);

select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000028411'::uuid, '00000000-0000-0000-0000-000000028421'::uuid, current_date, 900004, 900004, '5') $$,
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'a plain server calling board_assign on a finalized day is now correctly blocked -- was previously silent'
);

select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028411'::uuid, 900004, 900004, 900004) $$,
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'board_clear_cell is blocked too, now that the shared helper is fixed'
);

reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900004 and rotation_member_id = 900004),
  0,
  'nothing was actually written -- the blocked board_assign call did not leave a row behind'
);

select * from finish();
rollback;
