begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- ---------------------------------------------------------------------
-- Table Rotation V2 Part 1 -- the trusted mutation boundary, structural
-- session integrity, atomic reassignment and complete Undo/Redo.
-- Companion to the hosted-DEV real-mode suite
-- (tests/real/table-rotation-v2.db.real.test.ts); this file keeps the same
-- guarantees pinned in CI against a local database.
--
-- Cast: owner + general_manager (Mona) + two servers (Ann, Bea) in org A;
-- an outsider who owns a different organization.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000025001', '0251-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000025002', '0251-mona@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000025003', '0251-ann@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000025004', '0251-bea@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000025005', '0251-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000025001', 'PGTAP 0251 Owner'),
  ('00000000-0000-0000-0000-000000025002', 'PGTAP 0251 Mona'),
  ('00000000-0000-0000-0000-000000025003', 'PGTAP 0251 Ann'),
  ('00000000-0000-0000-0000-000000025004', 'PGTAP 0251 Bea'),
  ('00000000-0000-0000-0000-000000025005', 'PGTAP 0251 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000025011', 'PGTAP 0251 Org', 'pgtap-0251-org', '00000000-0000-0000-0000-000000025001'),
  ('00000000-0000-0000-0000-000000025012', 'PGTAP 0251 Other Org', 'pgtap-0251-other', '00000000-0000-0000-0000-000000025005');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000025021', '00000000-0000-0000-0000-000000025011', 'PGTAP 0251 Location', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000025022', '00000000-0000-0000-0000-000000025012', 'PGTAP 0251 Other Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000025012', '00000000-0000-0000-0000-000000025005', array['owner']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900031, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', 'PGTAP 0251 Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900031, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', 900031, 'T1', 4, 1),
  (900032, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', 900031, 'T2', 4, 2),
  (900033, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', 900031, 'T3', 4, 3);

-- Today's board: round 900031 + 900032, members Ann (900031) and Bea (900032).
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900031, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', (now() at time zone 'America/Chicago')::date, 'service', 'active');
insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values
  (900031, '00000000-0000-0000-0000-000000025011', 900031, 1),
  (900032, '00000000-0000-0000-0000-000000025011', 900031, 2),
  (900033, '00000000-0000-0000-0000-000000025011', 900031, 3);
insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900031, '00000000-0000-0000-0000-000000025011', 900031, '00000000-0000-0000-0000-000000025003', 1),
  (900032, '00000000-0000-0000-0000-000000025011', 900031, '00000000-0000-0000-0000-000000025004', 2);

-- Yesterday's board with one ACTIVE entry (a different, historical session).
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900032, '00000000-0000-0000-0000-000000025011', '00000000-0000-0000-0000-000000025021', (now() at time zone 'America/Chicago')::date - 1, 'service', 'active');
insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900034, '00000000-0000-0000-0000-000000025011', 900032, 1);
insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900033, '00000000-0000-0000-0000-000000025011', 900032, '00000000-0000-0000-0000-000000025003', 1);
insert into public.table_rotation_entries (id, organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
overriding system value
values (900031, '00000000-0000-0000-0000-000000025011', 900034, 900033, 'T3', '00000000-0000-0000-0000-000000025001');

-- ---------------------------------------------------------------------
-- 1. Grants: no client write path remains; reads do.
-- ---------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.table_rotation_entries', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on table_rotation_entries');
select ok(not has_table_privilege('authenticated', 'public.rotation_rounds', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on rotation_rounds');
select ok(not has_table_privilege('authenticated', 'public.rotation_members', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on rotation_members');
select ok(not has_table_privilege('authenticated', 'public.section_assignments', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on section_assignments');
select ok(not has_table_privilege('authenticated', 'public.service_sessions', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on service_sessions');
select ok(not has_table_privilege('authenticated', 'public.board_events', 'INSERT,UPDATE,DELETE'), 'authenticated has no write grant on board_events');
select ok(has_table_privilege('authenticated', 'public.board_events', 'SELECT'), 'authenticated can still read board_events (Realtime + hydration)');
select ok(not has_function_privilege('anon', 'public.board_end_table(uuid,bigint,bigint,bigint)', 'EXECUTE'), 'anon cannot execute board_end_table');
select ok(has_function_privilege('authenticated', 'public.board_end_table(uuid,bigint,bigint,bigint)', 'EXECUTE'), 'authenticated can execute board_end_table');

-- ---------------------------------------------------------------------
-- 2. D-01: the owner assigns, a different manager Ends / Undoes / Redoes.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025001', true);
select public.board_assign('00000000-0000-0000-0000-000000025011'::uuid, '00000000-0000-0000-0000-000000025021'::uuid, (now() at time zone 'America/Chicago')::date, 900031, 900031, 'T1');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select lives_ok(
  $$ select public.board_end_table('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900031, 900031) $$,
  'D-01: a manager can End a table the owner assigned'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900031),
  'ended',
  'the entry is ended (kept as history)'
);
select is(
  (select assigned_by from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900031),
  '00000000-0000-0000-0000-000000025001'::uuid,
  'assigned_by stays the original assigner'
);
select is(
  (select ended_by from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900031),
  '00000000-0000-0000-0000-000000025002'::uuid,
  'ended_by records the manager who closed it'
);
select is(
  (select actor_profile_id from public.board_events where service_session_id = 900031 and event_type = 'end'),
  '00000000-0000-0000-0000-000000025002'::uuid,
  'the end event is attributed to the manager (derived from the authenticated context)'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025004', true);
select lives_ok(
  $$ select public.board_undo('00000000-0000-0000-0000-000000025011'::uuid, 900031) $$,
  'a third actor (server Bea) can Undo the manager''s End'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900031),
  'active',
  'Undo of End reactivates the entry'
);
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  1,
  'and the physical claim is restored'
);

-- ---------------------------------------------------------------------
-- 3. Atomic reassign: Bea takes T1 from Ann; refused without confirmation.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000025011'::uuid, '00000000-0000-0000-0000-000000025021'::uuid, (now() at time zone 'America/Chicago')::date, 900031, 900032, 'T1', false) $$,
  'Table T1 is already assigned to another active server on this board.',
  'without confirmation a held table is refused'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000025011'::uuid, '00000000-0000-0000-0000-000000025021'::uuid, (now() at time zone 'America/Chicago')::date, 900031, 900032, 'T1', true) $$,
  'with confirmation the table is reassigned atomically'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900031),
  'ended',
  'the previous owner''s entry is ENDED, not deleted and not left active'
);
select is(
  (select rotation_member_id from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  900032::bigint,
  'exactly one active claim, owned by the new server'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025003', true);
select public.board_undo('00000000-0000-0000-0000-000000025011'::uuid, 900031);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  900031::bigint,
  'Undo of the reassign returns the table to the displaced owner'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025003', true);
select public.board_redo('00000000-0000-0000-0000-000000025011'::uuid, 900031);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  900032::bigint,
  'Redo of the reassign gives it to the new owner again'
);

-- ---------------------------------------------------------------------
-- 4. D-02: structural session integrity + derived historical lock.
-- ---------------------------------------------------------------------
-- The FK / identity checks hold even for a trusted context with no user JWT,
-- so clear the simulated user first (otherwise the row guard fires earlier).
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, assigned_by)
     values ('00000000-0000-0000-0000-000000025011', 900034, 900032, 'T2', '00000000-0000-0000-0000-000000025001') $$,
  '23503',
  null,
  'an entry cannot pair yesterday''s round with today''s member (composite session FK)'
);
select throws_ok(
  $$ update public.table_rotation_entries set rotation_round_id = 900032 where id = 900031 $$,
  '23514',
  null,
  'an entry cannot be moved to another round / session'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025001', true);
select throws_ok(
  $$ select public.board_end_table('00000000-0000-0000-0000-000000025011'::uuid, 900032, 900034, 900033) $$,
  'P0001',
  'This board is read-only -- it is a previous day''s service.',
  'a previous day''s board is read-only through its own session id'
);
select throws_ok(
  $$ select public.board_end_table('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900034, 900033) $$,
  'P0001',
  'That row is not on this board.',
  'passing today''s session against yesterday''s round is rejected (the lock cannot be dodged by lying about the session)'
);
select throws_ok(
  $$ select public.board_clear_cell('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900034, 900033) $$,
  'P0001',
  'That row is not on this board.',
  'the same holds for Clear Cell'
);
reset role;
select is(
  (select status from public.table_rotation_entries where id = 900031),
  'active',
  'yesterday''s entry was never touched'
);

-- ---------------------------------------------------------------------
-- 5. D-08: board_events is append-only for clients.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025003', true);
select throws_ok(
  $$ insert into public.board_events (organization_id, service_session_id, actor_profile_id, event_type, payload, inverse_payload)
     values ('00000000-0000-0000-0000-000000025011', 900031, '00000000-0000-0000-0000-000000025001', 'assign', '{}', '{}') $$,
  '42501',
  null,
  'a server cannot forge a board event as someone else'
);
select throws_ok(
  $$ update public.board_events set payload = '{"tampered": true}' where service_session_id = 900031 $$,
  '42501',
  null,
  'a server cannot rewrite a board event'
);
select throws_ok(
  $$ delete from public.board_events where service_session_id = 900031 $$,
  '42501',
  null,
  'a server cannot delete board events'
);
reset role;
select ok(
  not exists (select 1 from public.board_events where service_session_id = 900031 and payload ? 'tampered'),
  'no board event was altered'
);

-- ---------------------------------------------------------------------
-- 6. Roles: outsider / anon rejected.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025005', true);
select throws_ok(
  $$ select public.board_add_row('00000000-0000-0000-0000-000000025011'::uuid, 900031) $$,
  '42501',
  'Only an active floor team member can do that.',
  'a member of another organization cannot touch this board'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.board_add_row('00000000-0000-0000-0000-000000025011'::uuid, 900031) $$,
  '42501',
  null,
  'anon cannot execute board RPCs'
);
reset role;

-- ---------------------------------------------------------------------
-- 7. Remove-server guard, Transfer (history kept) + Undo.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select throws_ok(
  $$ select public.board_set_column_status('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900032, 'removed') $$,
  'P0001',
  'This server still has active tables -- end or transfer them before removing the server.',
  'a server with an active table cannot be removed'
);
select lives_ok(
  $$ select public.board_set_column_status('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900032, 'paused') $$,
  'pausing is allowed and does not touch ownership'
);
select public.board_set_column_status('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900032, 'active');
select public.board_transfer('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900031, 900032, 900031);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  900031::bigint,
  'Transfer moves the physical claim to the destination'
);
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900031 and rotation_member_id = 900032),
  'ended',
  'Transfer keeps the source entry as ended history'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select public.board_undo('00000000-0000-0000-0000-000000025011'::uuid, 900031);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where service_session_id = 900031 and dining_table_id = 900031 and released_at is null),
  900032::bigint,
  'Undo of Transfer restores the source owner'
);

-- ---------------------------------------------------------------------
-- 8. D-06 / D-05: Clear Cell Undo; Clear Board Undo (no duplicate sequence).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select public.board_assign('00000000-0000-0000-0000-000000025011'::uuid, '00000000-0000-0000-0000-000000025021'::uuid, (now() at time zone 'America/Chicago')::date, 900032, 900031, 'T2');
select public.board_clear_cell('00000000-0000-0000-0000-000000025011'::uuid, 900031, 900032, 900031);
select lives_ok(
  $$ select public.board_undo('00000000-0000-0000-0000-000000025011'::uuid, 900031) $$,
  'D-06: Clear Cell can be undone'
);
reset role;
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900032 and rotation_member_id = 900031),
  'T2',
  'the cleared cell is restored exactly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select public.board_clear_board('00000000-0000-0000-0000-000000025011'::uuid, 900031);
select lives_ok(
  $$ select public.board_undo('00000000-0000-0000-0000-000000025011'::uuid, 900031) $$,
  'D-05: Clear Board can be undone (no duplicate rotation_rounds.sequence)'
);
reset role;
select is(
  (select count(*)::int from (select sequence from public.rotation_rounds where service_session_id = 900031 group by sequence having count(*) > 1) d),
  0,
  'no duplicate round sequence after the restore'
);
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900031 and released_at is null),
  2,
  'both active claims (T1, T2) are back after Undo of Clear Board'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000025002', true);
select public.board_redo('00000000-0000-0000-0000-000000025011'::uuid, 900031);
reset role;
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900031 and released_at is null),
  0,
  'Redo of Clear Board clears the claims again'
);

select * from finish();
rollback;
