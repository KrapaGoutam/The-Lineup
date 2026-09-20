begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000021001', '0211-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021002', '0211-ann@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021003', '0211-bea@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000021001', 'PGTAP 0211 Owner'),
  ('00000000-0000-0000-0000-000000021002', 'PGTAP 0211 Ann'),
  ('00000000-0000-0000-0000-000000021003', 'PGTAP 0211 Bea');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000021011', 'PGTAP 0211 Org', 'pgtap-0211-org', '00000000-0000-0000-0000-000000021001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000021021', '00000000-0000-0000-0000-000000021011', 'PGTAP 0211 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021003', array['server']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900011, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', 'PGTAP 0211 Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900011, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', 900011, 'T1', 4, 1),
  (900012, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', 900011, 'T2', 4, 2);

-- ---------------------------------------------------------------------
-- Session 900013: End Table (history + occupancy release + undo/redo),
-- reassigning the same physical table after it's ended, Unassign (not a
-- Skip), and board_assign's guard against overwriting a non-active row.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900013, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', current_date, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900013, '00000000-0000-0000-0000-000000021011', 900013, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900013, '00000000-0000-0000-0000-000000021011', 900013, '00000000-0000-0000-0000-000000021002', 1),
  (900014, '00000000-0000-0000-0000-000000021011', 900013, '00000000-0000-0000-0000-000000021003', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date, 900013, 900013, 'T1');
select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date, 900013, 900014, 'T2');
reset role;

select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900011 and service_session_id = 900013 and released_at is null),
  1,
  'T1 has an active occupancy claim after Ann is assigned it'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_end_table('00000000-0000-0000-0000-000000021011'::uuid, 900013, 900013, 900013);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900013 and rotation_member_id = 900013),
  'ended',
  'End Table marks the entry ended, not deleted'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900013 and rotation_member_id = 900013),
  'T1',
  'End Table preserves the historical table label'
);
select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900011 and service_session_id = 900013 and released_at is null),
  0,
  'End Table releases the physical table''s occupancy claim'
);

-- Undo/redo of End Table -- checked immediately, before any other action
-- becomes the "most recent event" board_undo/board_redo would target.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_undo('00000000-0000-0000-0000-000000021011'::uuid, 900013);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900013 and rotation_member_id = 900013),
  'active',
  'undoing End Table restores the entry to active'
);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date, 900013, 900014, 'T1') $$,
  'Table T1 is already assigned to another active server on this board.',
  'undoing End Table also re-claims T1''s occupancy, so it conflicts again'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_redo('00000000-0000-0000-0000-000000021011'::uuid, 900013);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900013 and rotation_member_id = 900013),
  'ended',
  'redoing End Table re-ends the entry'
);

-- Reassigning the same physical table, now free, to a fresh active row.
select id as round2_id from public.rotation_rounds
where service_session_id = 900013 and sequence = 2
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date, :round2_id, 900014, 'T1');
reset role;

select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900011 and service_session_id = 900013 and released_at is null),
  900014::bigint,
  'T1 can be reassigned fresh once its prior claim is released -- the new row is active'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900013 and rotation_member_id = 900013),
  'ended',
  'the old ended row for T1 is untouched by the fresh reassignment'
);

-- board_assign refuses to silently overwrite the ended row.
select throws_ok(
  format($$ select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date, 900013, 900013, 'T5') $$),
  'That cell already has a ended entry -- clear it before assigning a new table.',
  'board_assign refuses to overwrite an already-ended cell'
);

-- Unassign: deletes outright, never becomes a Skip.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select public.board_clear_cell('00000000-0000-0000-0000-000000021011'::uuid, 900013, :round2_id, 900014);
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = :round2_id and rotation_member_id = 900014),
  0,
  'Unassign deletes the entry outright -- no row survives, skipped or otherwise'
);
select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900011 and service_session_id = 900013 and released_at is null),
  0,
  'Unassign also releases the physical table''s occupancy claim'
);

-- ---------------------------------------------------------------------
-- Session 900016: Skip Turn -- semantic state, no occupancy, guards
-- against overwriting a non-empty cell, counts as used for auto-row,
-- and undo/redo.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900016, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', current_date + 1, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900016, '00000000-0000-0000-0000-000000021011', 900016, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900016, '00000000-0000-0000-0000-000000021011', 900016, '00000000-0000-0000-0000-000000021002', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_skip_turn('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 1, 900016, 900016);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900016 and rotation_member_id = 900016),
  'skipped',
  'Skip Turn records a semantic skipped state'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900016 and rotation_member_id = 900016),
  null,
  'Skip Turn never stores the literal label "0" -- table_label is null'
);
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900016),
  0,
  'Skip Turn never claims a physical table'
);
select is(
  (select count(*)::int from public.rotation_rounds where service_session_id = 900016),
  3,
  'Skip Turn counts as a used cell -- the trailing two-round buffer still opens'
);

select throws_ok(
  $$ select public.board_skip_turn('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 1, 900016, 900016) $$,
  'That cell already has a skipped entry -- clear it before marking it skipped.',
  'Skip Turn refuses to overwrite an already-skipped cell'
);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 1, 900016, 900016, 'T1') $$,
  'That cell already has a skipped entry -- clear it before assigning a new table.',
  'board_assign refuses to overwrite an already-skipped cell'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_undo('00000000-0000-0000-0000-000000021011'::uuid, 900016);
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900016 and rotation_member_id = 900016),
  0,
  'undoing Skip Turn deletes the entry back to genuinely empty'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_redo('00000000-0000-0000-0000-000000021011'::uuid, 900016);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900016 and rotation_member_id = 900016),
  'skipped',
  'redoing Skip Turn re-records it as skipped'
);

-- ---------------------------------------------------------------------
-- Session 900017: Transfer -- moves the same assignment, no gap at the
-- source, never overwrites an ended/skipped destination cell, and
-- undo/redo.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900017, '00000000-0000-0000-0000-000000021011', '00000000-0000-0000-0000-000000021021', current_date + 2, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900017, '00000000-0000-0000-0000-000000021011', 900017, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900017, '00000000-0000-0000-0000-000000021011', 900017, '00000000-0000-0000-0000-000000021002', 1),
  (900018, '00000000-0000-0000-0000-000000021011', 900017, '00000000-0000-0000-0000-000000021003', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 2, 900017, 900017, 'T1');
select public.board_transfer('00000000-0000-0000-0000-000000021011'::uuid, 900017, 900017, 900017, 900018);
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900017),
  0,
  'Transfer leaves no gap at the source -- the source entry is gone entirely, not emptied in place'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900018),
  'active',
  'Transfer creates an active entry for the destination'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900018),
  'T1',
  'Transfer preserves the same table label at the destination'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900011 and service_session_id = 900017 and released_at is null),
  900018::bigint,
  'Transfer moves T1''s occupancy claim to the destination column'
);

-- Undo/redo of Transfer.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_undo('00000000-0000-0000-0000-000000021011'::uuid, 900017);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900017),
  'active',
  'undoing Transfer restores the source entry'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900018),
  0,
  'undoing Transfer removes the destination entry'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select public.board_redo('00000000-0000-0000-0000-000000021011'::uuid, 900017);
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900017),
  0,
  'redoing Transfer removes the source entry again'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900018),
  'T1',
  'redoing Transfer restores the destination entry'
);

-- Transfer must never overwrite an ended or skipped destination cell --
-- it lands on the destination's earliest genuinely empty round instead.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
-- Bea (900018) already holds T1 in round 1 (active, from the redo above).
-- End it, then skip her next round, so both are real, non-empty rows a
-- transfer must skip past.
select public.board_end_table('00000000-0000-0000-0000-000000021011'::uuid, 900017, 900017, 900018);
select id as round2_id from public.rotation_rounds where service_session_id = 900017 and sequence = 2 \gset
select public.board_skip_turn('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 2, :round2_id, 900018);
-- Ann assigns a fresh table and transfers it to Bea.
select public.board_assign('00000000-0000-0000-0000-000000021011'::uuid, '00000000-0000-0000-0000-000000021021'::uuid, current_date + 2, 900017, 900017, 'T2');
select public.board_transfer('00000000-0000-0000-0000-000000021011'::uuid, 900017, 900017, 900017, 900018);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900017 and rotation_member_id = 900018),
  'ended',
  'Transfer left Bea''s ended row in round 1 untouched'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :round2_id and rotation_member_id = 900018),
  'skipped',
  'Transfer left Bea''s skipped row in round 2 untouched'
);
select is(
  (
    select count(*)::int from public.table_rotation_entries e
    join public.rotation_rounds r on r.id = e.rotation_round_id
    where e.rotation_member_id = 900018
      and e.status = 'active'
      and e.table_label = 'T2'
      and r.sequence > 2
  ),
  1,
  'the transferred table landed on Bea''s first genuinely empty round instead of overwriting history'
);

select * from finish();
rollback;
