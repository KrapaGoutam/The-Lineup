begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Feature 028. Behavioral test of the raw RLS layer itself (not a
-- wrapping RPC), run as a plain SERVER specifically -- not an owner or
-- manager. This is the exact case that was silently broken: the
-- finalized-lock subquery joined tip_pools, which tip_pools_select_manager
-- hides from a server entirely, making `not exists(...)` always true
-- regardless of the pool's real status for exactly this role.
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
values (900001, '00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', current_date, 'service', 'active');

insert into public.tip_pools (id, organization_id, location_id, service_date, status)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', '00000000-0000-0000-0000-000000028201', current_date, 'draft');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', 900001, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900001, '00000000-0000-0000-0000-000000028101', 900001, '00000000-0000-0000-0000-000000028002', 1);

-- Confirm the server genuinely cannot read tip_pools directly -- the
-- precondition that made the original bug possible, not just a fact
-- asserted in a comment.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);
select is(
  (select count(*)::int from public.tip_pools where id = 900001),
  0,
  'a server cannot see this org''s tip_pools row directly -- confirms the precondition for the bug this migration fixes'
);

-- INSERT, not-finalized: succeeds.
select lives_ok(
  $$ insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
     values ('00000000-0000-0000-0000-000000028101', 900001, 900001, '12', '00000000-0000-0000-0000-000000028002') $$,
  'a server can insert a table entry while the day''s tip pool is still draft'
);

-- UPDATE, not-finalized: succeeds (this is the exact path
-- board_assign's upsert relies on for editing an already-assigned cell).
select lives_ok(
  $$ update public.table_rotation_entries set table_label = '14'
     where rotation_round_id = 900001 and rotation_member_id = 900001 $$,
  'a server can update that entry while still draft'
);

-- DELETE, not-finalized: succeeds.
select lives_ok(
  $$ delete from public.table_rotation_entries where rotation_round_id = 900001 and rotation_member_id = 900001 $$,
  'a server can delete that entry while still draft'
);

-- Finalize tips for the date, seeded fresh as postgres (not the RLS-bound
-- role, so the write itself isn't the thing under test).
reset role;
update public.tip_pools
set status = 'finalized', finalized_at = now(), finalized_by = '00000000-0000-0000-0000-000000028001'
where id = 900001;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);

-- INSERT, finalized: the real bug -- must now be blocked for a server.
select throws_ok(
  $$ insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
     values ('00000000-0000-0000-0000-000000028101', 900001, 900001, '12', '00000000-0000-0000-0000-000000028002') $$,
  'new row violates row-level security policy for table "table_rotation_entries"',
  'a server is blocked from inserting once tips are finalized -- the actual bug this migration fixes'
);

reset role;
insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
values ('00000000-0000-0000-0000-000000028101', 900001, 900001, '12', '00000000-0000-0000-0000-000000028002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028002', true);

-- UPDATE, finalized: blocked.
select results_eq(
  $$ update public.table_rotation_entries set table_label = '99'
     where rotation_round_id = 900001 and rotation_member_id = 900001 returning 1 $$,
  $$ select 1 where false $$,
  'a server''s update is blocked once tips are finalized'
);

-- DELETE, finalized: blocked (the gap this file originally targeted).
select results_eq(
  $$ delete from public.table_rotation_entries where rotation_round_id = 900001 and rotation_member_id = 900001 returning 1 $$,
  $$ select 1 where false $$,
  'a server''s delete is blocked once tips are finalized'
);

reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900001 and rotation_member_id = 900001),
  1,
  'the entry is still there after the blocked update/delete attempts -- confirmed as postgres, not just "returned nothing"'
);

select * from finish();
rollback;
