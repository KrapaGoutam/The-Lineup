begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_clear_cell'
  ),
  'board_clear_cell exists'
);
select ok(
  not (
    select prosecdef from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'board_clear_cell'
  ),
  'board_clear_cell is SECURITY INVOKER, not DEFINER, matching every other public board_* RPC'
);

-- Feature 028. Two servers, neither a manager -- server_one clears an
-- entry in server_two's column, proving this is genuinely open to any
-- active member, not just the actor's own column (Reconciliation 1),
-- and not manager-restricted the way clear-row/clear-column/clear-board
-- deliberately still are.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000028301', '0283-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028302', '0283-server-one@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000028303', '0283-server-two@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000028301', 'PGTAP 0283 Owner'),
  ('00000000-0000-0000-0000-000000028302', 'PGTAP 0283 Server One'),
  ('00000000-0000-0000-0000-000000028303', 'PGTAP 0283 Server Two');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000028311', 'PGTAP 0283 Org', 'pgtap-0283-org', '00000000-0000-0000-0000-000000028301');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000028321', '00000000-0000-0000-0000-000000028311', 'PGTAP 0283 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000028311', '00000000-0000-0000-0000-000000028301', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028311', '00000000-0000-0000-0000-000000028302', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000028311', '00000000-0000-0000-0000-000000028303', array['server']::public.app_role[], true);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900002, '00000000-0000-0000-0000-000000028311', '00000000-0000-0000-0000-000000028321', current_date, 'service', 'active');

insert into public.tip_pools (id, organization_id, location_id, service_date, status)
overriding system value
values (900002, '00000000-0000-0000-0000-000000028311', '00000000-0000-0000-0000-000000028321', current_date, 'draft');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900002, '00000000-0000-0000-0000-000000028311', 900002, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900002, '00000000-0000-0000-0000-000000028311', 900002, '00000000-0000-0000-0000-000000028302', 1),
  (900003, '00000000-0000-0000-0000-000000028311', 900002, '00000000-0000-0000-0000-000000028303', 2);

insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
values ('00000000-0000-0000-0000-000000028311', 900002, 900003, '21', '00000000-0000-0000-0000-000000028303');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028302', true);

select lives_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028311'::uuid, 900002, 900002, 900003) $$,
  'server_one can clear server_two''s cell -- any active member, not just the column owner or a manager'
);

reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900002 and rotation_member_id = 900003),
  0,
  'the entry is actually gone'
);
select ok(
  exists (
    select 1 from public.board_events
    where service_session_id = 900002
      and event_type = 'clear_cell'
      and actor_profile_id = '00000000-0000-0000-0000-000000028302'
  ),
  'the clear is attributed to server_one, the true actor, not server_two whose column it was'
);

-- Finalize tips, re-seed the entry, then confirm a plain server is
-- blocked -- board_clear_cell's own assert_board_not_locked call, on
-- top of the (now-fixed) RLS delete policy underneath it.
update public.tip_pools
set status = 'finalized', finalized_at = now(), finalized_by = '00000000-0000-0000-0000-000000028301'
where id = 900002;
insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
values ('00000000-0000-0000-0000-000000028311', 900002, 900003, '21', '00000000-0000-0000-0000-000000028303');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000028302', true);
select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000028311'::uuid, 900002, 900002, 900003) $$,
  'Tips are finalized for today -- the board is locked until a manager or owner reopens it.',
  'a finalized board blocks clear-cell for a plain server too'
);

select * from finish();
rollback;
