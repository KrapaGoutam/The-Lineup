begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000022001', '0221-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000022002', '0221-mia@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000022001', 'PGTAP 0221 Owner'),
  ('00000000-0000-0000-0000-000000022002', 'PGTAP 0221 Mia');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000022011', 'PGTAP 0221 Org', 'pgtap-0221-org', '00000000-0000-0000-0000-000000022001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000022021', '00000000-0000-0000-0000-000000022011', 'PGTAP 0221 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022002', array['server']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900022, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', 'PGTAP 0221 Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900022, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', 900022, 'T1', 4, 1),
  (900023, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', 900022, 'T3', 4, 2),
  (900024, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', 900022, 'T4', 4, 3),
  (900025, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', 900022, 'T7', 4, 4);

-- ---------------------------------------------------------------------
-- Session 900022: one server, Mia, ends up with multiple simultaneous
-- active tables -- exactly the domain model Upgrade 1.1's multi-table
-- follow-up requires: nothing in the schema limits a member to one
-- active row, since each round is its own independent slot.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900022, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', current_date, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900022, '00000000-0000-0000-0000-000000022011', 900022, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900022, '00000000-0000-0000-0000-000000022011', 900022, '00000000-0000-0000-0000-000000022002', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date, 900022, 900022, 'T1');
reset role;

-- "Assign Also": assigning a second table to the same member, at their
-- own earliest empty round (mirroring findEarliestEmptyRoundForColumn),
-- must never touch the first.
select id as round2_id from public.rotation_rounds
where service_session_id = 900022 and sequence = 2
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date, :round2_id, 900022, 'T4');
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900022 and status = 'active'),
  2,
  'a server can hold two simultaneously active tables -- nothing in the schema limits a member to one'
);
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900022 and released_at is null),
  2,
  'both physical tables are independently claimed'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900022 and rotation_member_id = 900022),
  'T1',
  'the first assignment (T1) is untouched by the second (Assign Also)'
);

-- "Transfer an existing table" (Floor decision dialog): same server,
-- same ongoing turn -- this relabels the chosen existing active row in
-- place via board_assign's own upsert-in-place (unchanged since Feature
-- 028), releasing the old physical table and claiming the new one. This
-- is NOT board_transfer (which moves a table between two *different*
-- servers, keeping the same label) -- Mia's round/entry here doesn't
-- move, only its table_label does.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date, 900022, 900022, 'T3');
reset role;

select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900022 and rotation_member_id = 900022),
  'T3',
  'Transfer relabels the chosen round''s entry from T1 to T3 in place'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900022 and status = 'active'),
  2,
  'Mia still has exactly two active tables after Transfer (T3 and T4) -- Transfer never changes her table count'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900022 and service_session_id = 900022 and released_at is null),
  null::bigint,
  'T1''s physical occupancy was released by the relabel'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900023 and service_session_id = 900022 and released_at is null),
  900022::bigint,
  'T3''s physical occupancy is now claimed by Mia'
);

-- ---------------------------------------------------------------------
-- board_end_and_assign: the Floor decision dialog's "End existing &
-- assign" choice. Mia currently holds T3 and T4 (from above).
-- ---------------------------------------------------------------------
select rotation_round_id as t3_round_id from public.table_rotation_entries
where rotation_member_id = 900022 and status = 'active' and table_label = 'T3'
\gset
select rotation_round_id as t4_round_id from public.table_rotation_entries
where rotation_member_id = 900022 and status = 'active' and table_label = 'T4'
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_end_and_assign('00000000-0000-0000-0000-000000022011'::uuid, 900022, array[:t3_round_id]::bigint[], 900022, 'T1');
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t3_round_id and rotation_member_id = 900022),
  'ended',
  'CASE A (end one): End Existing & Assign ends exactly the chosen round (T3''s), preserving it as history'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t4_round_id and rotation_member_id = 900022),
  'active',
  'End Existing & Assign never touches the server''s other active table (T4)'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900022 and status = 'active' and table_label = 'T1'),
  1,
  'End Existing & Assign creates the new active row (T1)'
);
select is(
  (
    select count(*)::int from public.table_rotation_entries
    where rotation_member_id = 900022 and status = 'active' and table_label = 'T1' and rotation_round_id <> :t3_round_id
  ),
  1,
  'the new row lands on a genuinely different round, never reusing the one just ended'
);
select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900023 and service_session_id = 900022 and released_at is null),
  0,
  'End Existing & Assign released T3''s physical occupancy'
);
select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900022 and service_session_id = 900022 and released_at is null),
  1,
  'End Existing & Assign claimed T1''s physical occupancy'
);

-- board_end_and_assign refuses to end a round that isn't currently
-- active for that member (same guard as CASE G/E below, expressed here
-- as "the only selected round is already ended").
select throws_ok(
  format($$ select public.board_end_and_assign('00000000-0000-0000-0000-000000022011'::uuid, 900022, array[%s]::bigint[], 900022, 'T4') $$, :t3_round_id),
  'One or more selected tables are no longer active for this server -- refresh and try again.',
  'board_end_and_assign refuses to end an already-ended round'
);

-- Undo/redo of end_and_assign.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_undo('00000000-0000-0000-0000-000000022011'::uuid, 900022);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t3_round_id and rotation_member_id = 900022),
  'active',
  'undoing End Existing & Assign restores the ended round to active'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900022 and status = 'active' and table_label = 'T1'),
  0,
  'undoing End Existing & Assign removes the new row it created'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_redo('00000000-0000-0000-0000-000000022011'::uuid, 900022);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t3_round_id and rotation_member_id = 900022),
  'ended',
  'redoing End Existing & Assign re-ends the round'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900022 and status = 'active' and table_label = 'T1'),
  1,
  'redoing End Existing & Assign restores the new row'
);

-- "Undo must not silently steal a table from a newer valid assignment":
-- end_and_assign's undo restores the ended round via the exact same
-- `update ... set status = 'active'` path board_end_table's undo
-- already uses, firing the same private.sync_table_occupancy trigger
-- and getting the identical typed-conflict behavior -- proven
-- generically in 0021_table_rotation_upgrade_1_1.test.sql ("undoing End
-- Table also re-claims T1's occupancy, so it conflicts again").
-- end_and_assign introduces no new occupancy-reclaim code path that
-- needs its own separate proof. (A repro specific to end_and_assign
-- isn't constructible here: this session's single global LIFO undo
-- stack means any newer valid claim on the freed table necessarily
-- becomes a more recent event than the end_and_assign itself, so undo
-- targets -- and, per board_redo's invalidation rule, correctly
-- excludes from ever being redone -- that newer event first. It can
-- never reach back far enough to attempt stealing in the first place.)

-- ---------------------------------------------------------------------
-- Session 900026: "End one or more" -- CASE B (end multiple, leave one
-- active), CASE E (no selection), CASE F (concurrent new-table
-- conflict). Mia ends up with three simultaneously active tables: T1,
-- T4, T7.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900026, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', current_date + 1, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900026, '00000000-0000-0000-0000-000000022011', 900026, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900026, '00000000-0000-0000-0000-000000022011', 900026, '00000000-0000-0000-0000-000000022002', 1),
  (900027, '00000000-0000-0000-0000-000000022011', 900026, '00000000-0000-0000-0000-000000022001', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 1, 900026, 900026, 'T1');
reset role;

select id as t4_round_id from public.rotation_rounds
where service_session_id = 900026 and sequence = 2
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 1, :t4_round_id, 900026, 'T4');
reset role;

select r.id as t7_round_id
from public.rotation_rounds r
where r.service_session_id = 900026
  and not exists (select 1 from public.table_rotation_entries e where e.rotation_round_id = r.id and e.rotation_member_id = 900026)
order by r.sequence asc
limit 1
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 1, :t7_round_id, 900026, 'T7');
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900026 and status = 'active'),
  3,
  'Mia holds three simultaneously active tables (T1, T4, T7) going into the multi-end scenarios'
);

-- CASE E: no selection at all is rejected up front, before touching
-- anything.
select throws_ok(
  $$ select public.board_end_and_assign('00000000-0000-0000-0000-000000022011'::uuid, 900026, array[]::bigint[], 900026, 'T3') $$,
  'Select at least one table to end.',
  'CASE E (no selection): board_end_and_assign refuses an empty selection'
);

-- CASE F: the newly selected table (T3) gets taken by someone else while
-- the decision dialog is (hypothetically) still open. The whole
-- operation must fail without ending anything -- no partial state where
-- T1/T4 are ended but T3 was never actually assigned.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022001', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 1, 900026, 900027, 'T3');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select throws_ok(
  format(
    $$ select public.board_end_and_assign('00000000-0000-0000-0000-000000022011'::uuid, 900026, array[%s, %s]::bigint[], 900026, 'T3') $$,
    :t4_round_id, :t7_round_id
  ),
  'Table T3 is already assigned to another active server on this board.',
  'CASE F (concurrent new-table conflict): board_end_and_assign fails without ending anything if the new table was taken first'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900026 and status = 'active'),
  3,
  'CASE F: no partial failure -- T1/T4/T7 are all still active, nothing was ended'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022001', true);
select public.board_clear_cell('00000000-0000-0000-0000-000000022011'::uuid, 900026, 900026, 900027);
reset role;

-- CASE B: end T4 and T7 (two of Mia's three), leaving T1 active, and
-- assign T3.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_end_and_assign(
  '00000000-0000-0000-0000-000000022011'::uuid, 900026,
  array[:t4_round_id, :t7_round_id]::bigint[], 900026, 'T3'
);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t4_round_id and rotation_member_id = 900026),
  'ended',
  'CASE B (end multiple): T4''s round is ended'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t7_round_id and rotation_member_id = 900026),
  'ended',
  'CASE B: T7''s round is also ended'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900026 and rotation_member_id = 900026),
  'active',
  'CASE B: T1''s round (not selected) remains active, untouched'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900026 and status = 'active' and table_label = 'T3'),
  1,
  'CASE B: T3 is now active under Mia'
);
select is(
  (
    select count(*)::int from public.section_assignments
    where service_session_id = 900026 and released_at is null
      and dining_table_id in (900024, 900025) -- T4, T7
  ),
  0,
  'CASE B: T4 and T7''s physical occupancy were both released'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900023 and service_session_id = 900026 and released_at is null),
  900026::bigint,
  'CASE B: T3''s physical occupancy is claimed by Mia'
);

-- ---------------------------------------------------------------------
-- Session 900028: CASE G (a selected table went stale -- already
-- ended/reassigned by someone else before the composite call lands) and
-- CASE C (End All) + CASE H/I (undo/redo of a multi-end).
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900028, '00000000-0000-0000-0000-000000022011', '00000000-0000-0000-0000-000000022021', current_date + 2, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900028, '00000000-0000-0000-0000-000000022011', 900028, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900028, '00000000-0000-0000-0000-000000022011', 900028, '00000000-0000-0000-0000-000000022002', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 2, 900028, 900028, 'T1');
reset role;

select id as t4_round2_id from public.rotation_rounds
where service_session_id = 900028 and sequence = 2
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 2, :t4_round2_id, 900028, 'T4');
reset role;

select r.id as t7_round2_id
from public.rotation_rounds r
where r.service_session_id = 900028
  and not exists (select 1 from public.table_rotation_entries e where e.rotation_round_id = r.id and e.rotation_member_id = 900028)
order by r.sequence asc
limit 1
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_assign('00000000-0000-0000-0000-000000022011'::uuid, '00000000-0000-0000-0000-000000022021'::uuid, current_date + 2, :t7_round2_id, 900028, 'T7');
reset role;

-- Simulate "another client already ended T4" while this dialog was open.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_end_table('00000000-0000-0000-0000-000000022011'::uuid, 900028, :t4_round2_id, 900028);
reset role;

-- CASE G: selecting T4's now-stale round alongside the still-genuinely-
-- active T1 and T7 must reject the whole action -- T1 and T7 stay
-- active, nothing partially ends.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select throws_ok(
  format(
    $$ select public.board_end_and_assign('00000000-0000-0000-0000-000000022011'::uuid, 900028, array[900028, %s, %s]::bigint[], 900028, 'T3') $$,
    :t4_round2_id, :t7_round2_id
  ),
  'One or more selected tables are no longer active for this server -- refresh and try again.',
  'CASE G (stale existing table): board_end_and_assign rejects a selection containing an already-ended round'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900028 and rotation_member_id = 900028),
  'active',
  'CASE G: T1''s round is untouched by the rejected attempt'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t7_round2_id and rotation_member_id = 900028),
  'active',
  'CASE G: T7''s round is untouched by the rejected attempt'
);

-- CASE C: End All of the genuinely active set (T1 + T7 -- T4 is already
-- ended from the CASE G setup above) and assign T3.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_end_and_assign(
  '00000000-0000-0000-0000-000000022011'::uuid, 900028,
  array[900028, :t7_round2_id]::bigint[], 900028, 'T3'
);
reset role;

select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900028 and status = 'active' and table_label not in ('T3')),
  0,
  'CASE C (End All): every previously active table (T1, T7) is now ended -- only the newly assigned T3 remains active'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900028 and status = 'active'),
  1,
  'CASE C: exactly one active table remains (T3)'
);
select is(
  (
    select count(*)::int from public.section_assignments
    where service_session_id = 900028 and released_at is null
      and dining_table_id in (900022, 900025) -- T1, T7
  ),
  0,
  'CASE C: T1 and T7''s physical occupancy are both released'
);

-- CASE H: undo the End All + assign.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_undo('00000000-0000-0000-0000-000000022011'::uuid, 900028);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900028 and rotation_member_id = 900028),
  'active',
  'CASE H (undo): T1''s round is restored to active'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t7_round2_id and rotation_member_id = 900028),
  'active',
  'CASE H: T7''s round is restored to active'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900028 and status = 'active' and table_label = 'T3'),
  0,
  'CASE H: the T3 row created by the End All is removed'
);

-- CASE I: redo restores the End All + assign.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select public.board_redo('00000000-0000-0000-0000-000000022011'::uuid, 900028);
reset role;

select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900028 and rotation_member_id = 900028),
  'ended',
  'CASE I (redo): T1''s round is ended again'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = :t7_round2_id and rotation_member_id = 900028),
  'ended',
  'CASE I: T7''s round is ended again'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900028 and status = 'active' and table_label = 'T3'),
  1,
  'CASE I: T3 is active again'
);

select * from finish();
rollback;
