begin;

create extension if not exists pgtap with schema extensions;

select plan(75);

-- ---------------------------------------------------------------------
-- Same-server repeat table (#166): the DATABASE decides whether a table the
-- same server already holds is (A) the same turn -- an idempotent retry,
-- (B) a LATER turn -- a structured PT409 same_server_repeat that
-- public.board_end_previous_and_assign confirms atomically, or (C) not a later
-- turn -- still blocked. Cross-server conflicts stay as they were.
--
-- Cast: owner, outsider (another organization), servers Ann and Bea.
-- Tables T1..T6 are registered. Turn = board cell (round x member); rounds
-- r1..r9 are sequences 1..9.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000032001', '0321-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000032003', '0321-ann@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000032004', '0321-bea@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000032005', '0321-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000032001', 'PGTAP 0321 Owner'),
  ('00000000-0000-0000-0000-000000032003', 'PGTAP 0321 Ann'),
  ('00000000-0000-0000-0000-000000032004', 'PGTAP 0321 Bea'),
  ('00000000-0000-0000-0000-000000032005', 'PGTAP 0321 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000032011', 'PGTAP 0321 Org', 'pgtap-0321-org', '00000000-0000-0000-0000-000000032001'),
  ('00000000-0000-0000-0000-000000032012', 'PGTAP 0321 Other Org', 'pgtap-0321-other', '00000000-0000-0000-0000-000000032005');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000032021', '00000000-0000-0000-0000-000000032011', 'PGTAP 0321 Location', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000032022', '00000000-0000-0000-0000-000000032012', 'PGTAP 0321 Other Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000032012', '00000000-0000-0000-0000-000000032005', array['owner']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900321, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 'PGTAP 0321 Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900321, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T1', 4, 1),
  (900322, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T2', 4, 2),
  (900323, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T3', 4, 3),
  (900324, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T4', 4, 4),
  (900325, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T5', 4, 5),
  (900326, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', 900321, 'T6', 4, 6);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900321, '00000000-0000-0000-0000-000000032011', '00000000-0000-0000-0000-000000032021', (now() at time zone 'America/Chicago')::date, 'service', 'active');
insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values
  (900321, '00000000-0000-0000-0000-000000032011', 900321, 1),
  (900322, '00000000-0000-0000-0000-000000032011', 900321, 2),
  (900323, '00000000-0000-0000-0000-000000032011', 900321, 3),
  (900324, '00000000-0000-0000-0000-000000032011', 900321, 4),
  (900325, '00000000-0000-0000-0000-000000032011', 900321, 5),
  (900326, '00000000-0000-0000-0000-000000032011', 900321, 6),
  (900327, '00000000-0000-0000-0000-000000032011', 900321, 7),
  (900328, '00000000-0000-0000-0000-000000032011', 900321, 8),
  (900329, '00000000-0000-0000-0000-000000032011', 900321, 9);
-- Ann = 900321, Bea = 900322.
insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900321, '00000000-0000-0000-0000-000000032011', 900321, '00000000-0000-0000-0000-000000032003', 1),
  (900322, '00000000-0000-0000-0000-000000032011', 900321, '00000000-0000-0000-0000-000000032004', 2);

create temp table cap_detail (detail text);
grant all on cap_detail to authenticated;

-- 1. Contract surface.
select ok(not has_function_privilege('anon', 'public.board_end_previous_and_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'), 'anon cannot execute board_end_previous_and_assign');
select ok(has_function_privilege('authenticated', 'public.board_end_previous_and_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'), 'authenticated can execute board_end_previous_and_assign');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'board_end_previous_and_assign'), 'board_end_previous_and_assign is SECURITY DEFINER with an empty fixed search_path');
select ok(not has_function_privilege('authenticated', 'private.assign_table(uuid,uuid,date,bigint,bigint,text,boolean,boolean,boolean)', 'EXECUTE') and not has_function_privilege('anon', 'private.assign_table(uuid,uuid,date,bigint,bigint,text,boolean,boolean,boolean)', 'EXECUTE'), 'the private implementation is not executable by clients');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'board_assign') = 1 and has_function_privilege('authenticated', 'public.board_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'), 'board_assign keeps its single 8-argument signature (no PostgREST overload ambiguity)');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'board_end_previous_and_assign') = 1, 'board_end_previous_and_assign has a single signature');

-- ---------------------------------------------------------------------
-- 2. SS-001: the SAME turn (same cell) is an idempotent retry -- no write, no
--    event, no new Undo step -- whether typed "T2" or "2".
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900321, 'T2', false, false);
reset role;
create temp table before_retry as select (select count(*) from public.board_events where service_session_id = 900321) as events, (select assigned_at from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321) as at;
grant all on before_retry to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900321, 'T2', false, false) $$, 'SS-001 retrying the same cell with the same table is accepted');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900321, '2', false, false) $$, 'SS-001 numeric 2 for the same cell is the same retry');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900321, 'T2', false, false) $$, 'SS-001 the confirmed call on the same cell is the same retry');
reset role;
select is((select count(*)::int from public.board_events where service_session_id = 900321), (select events::int from before_retry), 'SS-001 a same-turn retry emits no event');
select is((select assigned_at from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), (select at from before_retry), 'SS-001 a same-turn retry rewrites nothing');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-001 exactly one active claim on T2');

-- ---------------------------------------------------------------------
-- 3. SS-002 / SS-003: a LATER turn of the same server -> structured
--    same_server_repeat (PT409), exact or numeric; nothing is written.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, 'T2', false, false) $$, 'PT409', 'Table T2 is already assigned to this server.', 'SS-002 exact T2 on a later turn is refused until confirmed (PT409)');
reset role;
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, 'T2', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'same_server_repeat', 'SS-002 the detail says kind = same_server_repeat');
select is((select (detail::jsonb->'holders'->0->>'round_id')::bigint from cap_detail), 900321::bigint, 'SS-002 the detail names the previous assignment''s turn (round)');
select is((select (detail::jsonb->'holders'->0->>'member_id')::bigint from cap_detail), 900321::bigint, 'SS-002 the detail names the same server');
select is((select detail::jsonb->'holders'->0->>'assignment_label' from cap_detail), 'T2', 'SS-002 the detail carries the whole previous assignment label');
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, '2', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'same_server_repeat', 'SS-003 numeric 2 is the same canonical T2 -> same_server_repeat');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, 'T2', true, true) $$, 'PT409', 'Table T2 is already assigned to this server.', 'SS-002 confirm_transfer / end_whole_assignment do not bypass the same-server rule');
reset role;
select is((select count(*)::int from public.table_rotation_entries where rotation_member_id = 900321 and rotation_round_id = 900322), 0, 'SS-005 nothing was written by the refused calls (Cancel = no call = no mutation)');
select is((select status from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'active', 'SS-005 the previous assignment is still active');
select is((select count(*)::int from public.board_events where service_session_id = 900321), (select events::int from before_retry), 'SS-005 no lifecycle event was recorded');

-- ---------------------------------------------------------------------
-- 4. Not a later turn -> blocked (kind same_server), even when confirmed.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900325, 900321, 'T3', false, false);
reset role;
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900323, 900321, 'T3', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'same_server', 'SS-001 a table held in a LATER turn is blocked (kind = same_server)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900323, 900321, 'T3', false, false) $$, 'PT409', 'Table T3 is already assigned to this server.', 'SS-001 the confirmed call is blocked too when the held turn is not earlier');
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900325 and rotation_member_id = 900321), 'active', 'SS-001 the held assignment is untouched');
select is((select count(*)::int from public.table_rotation_entries where rotation_member_id = 900321 and rotation_round_id = 900323), 0, 'SS-001 nothing was written for the earlier turn');

-- ---------------------------------------------------------------------
-- 5. SS-004: End Previous + Assign is ONE atomic call (numeric input too).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, '2', false, false) $$, 'SS-004 End Previous + Assign (typed 2) succeeds');
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'ended', 'SS-004 the previous lifecycle is ENDED, not deleted');
select is((select ended_by from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), '00000000-0000-0000-0000-000000032001'::uuid, 'SS-004 who ended it is recorded');
select is((select table_label from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'T2', 'SS-004 the old lifecycle keeps its label (history)');
select is((select table_label || ':' || status from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 'T2:active', 'SS-004 the new lifecycle is a separate ACTIVE entry holding canonical T2');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-004 exactly one active physical claim on T2');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900322 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 'SS-004 and it belongs to the NEW entry');
select is((select count(*)::int from public.table_rotation_entries where service_session_id = 900321 and status = 'active' and table_label = 'T2'), 1, 'SS-004 exactly one active T2 entry on the board');
select is((select payload->>'repeat' || ':' || jsonb_array_length(payload->'displaced') from public.board_events where service_session_id = 900321 order by id desc limit 1), 'true:1', 'SS-004 the audit event says repeat and lists the ended previous entry');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900321, 'T2', false, false) $$, 'SS-004 retrying the confirmed call is idempotent');
reset role;
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-004 still exactly one claim after the retry');

-- ---------------------------------------------------------------------
-- 6. SS-009 / SS-010: Undo and Redo through the unchanged board_undo/redo.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032003', true);
select public.board_undo('00000000-0000-0000-0000-000000032011'::uuid, 900321);
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'active', 'SS-009 Undo reactivates the previous lifecycle');
select is((select count(*)::int from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 0, 'SS-009 Undo removes the new lifecycle');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-009 never two active claims on T2');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900322 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'SS-009 the claim is back on the previous entry');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032003', true);
select public.board_redo('00000000-0000-0000-0000-000000032011'::uuid, 900321);
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900321), 'ended', 'SS-010 Redo ends the previous lifecycle again');
select is((select status from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 'active', 'SS-010 Redo re-creates the new lifecycle');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-010 never two active claims on T2');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900322 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 'SS-010 the claim is on the new entry');

-- ---------------------------------------------------------------------
-- 7. SS-007: a combined previous assignment is ONE lifecycle unit.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900326, 900321, 'T4 + T5', false, false);
reset role;
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900327, 900321, 'T4', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'same_server_repeat', 'SS-007 one part of a combined assignment on a later turn is a repeat');
select is((select detail::jsonb->'holders'->0->>'assignment_label' from cap_detail), 'T4 + T5', 'SS-007 the detail names the WHOLE combined assignment');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900327, 900321, 'T4', false, false) $$, 'SS-007 End Previous + Assign ends the whole combined assignment');
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900326 and rotation_member_id = 900321), 'ended', 'SS-007 the combined assignment is ended as a whole (history kept)');
select is((select table_label from public.table_rotation_entries where rotation_round_id = 900326 and rotation_member_id = 900321), 'T4 + T5', 'SS-007 its label is preserved');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900324 and released_at is null), 1, 'SS-007 T4 has exactly one claim');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900324 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900327 and rotation_member_id = 900321), 'SS-007 owned by the new T4 entry');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900325 and released_at is null), 0, 'SS-007 T5 is released (the lifecycle unit ended)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032003', true);
select public.board_undo('00000000-0000-0000-0000-000000032011'::uuid, 900321);
reset role;
select is((select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where table_rotation_entry_id = (select id from public.table_rotation_entries where rotation_round_id = 900326 and rotation_member_id = 900321) and released_at is null), '{900324,900325}', 'SS-007 Undo restores the whole combined assignment');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900324 and released_at is null), 1, 'SS-007 Undo leaves exactly one claim on T4');

-- ---------------------------------------------------------------------
-- 8. SS-006: cross-server conflicts are unchanged.
-- ---------------------------------------------------------------------
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900322, 'T2', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'held', 'SS-006 another server''s table is still kind = held');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900322, '2', false, false) $$, 'PT409', 'Table T2 is already assigned to another active server on this board.', 'SS-006 numeric 2 is still the same held conflict');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900322, 'T2', false, false) $$, 'PT409', 'Table T2 is already assigned to another active server on this board.', 'SS-006 End Previous does not take ANOTHER server''s table');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900321, 900322, 'T2', true, false) $$, 'SS-006 End + Assign still works for the other server');
reset role;
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-006 exactly one claim on T2');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900322 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900321 and rotation_member_id = 900322), 'SS-006 owned by Bea now');
select is((select status from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900321), 'ended', 'SS-006 Ann''s assignment was ended (history kept)');

-- ---------------------------------------------------------------------
-- 9. Mixed: a repeat that also needs another server's table is atomic.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900328, 900321, 'T1', false, false);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900322, 900322, 'T6', false, false);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select throws_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900329, 900321, 'T1 + T6', false, false) $$, 'PT409', 'Table T6 is already assigned to another active server on this board.', 'the repeat is refused while another server holds T6 and no transfer was confirmed');
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900328 and rotation_member_id = 900321), 'active', 'the refused mixed repeat left Ann''s previous T1 active (atomic rollback)');
select is((select count(*)::int from public.section_assignments where dining_table_id = 900321 and released_at is null), 1, 'and T1 still has its single claim');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900329, 900321, 'T1 + T6', true, true) $$, 'confirmed End Previous + End + Assign succeeds in one call');
reset role;
select is((select status from public.table_rotation_entries where rotation_round_id = 900328 and rotation_member_id = 900321), 'ended', 'Ann''s previous T1 is ended');
select is((select status from public.table_rotation_entries where rotation_round_id = 900322 and rotation_member_id = 900322), 'ended', 'Bea''s T6 is ended');
select is((select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where table_rotation_entry_id = (select id from public.table_rotation_entries where rotation_round_id = 900329 and rotation_member_id = 900321) and released_at is null), '{900321,900326}', 'the new T1 + T6 assignment holds exactly those two claims');

-- ---------------------------------------------------------------------
-- 10. SS-008: stale clients. The database decides, not the client.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select public.board_end_table('00000000-0000-0000-0000-000000032011'::uuid, 900321, 900321, 900322);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
select lives_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900323, 900321, 'T2', false, false) $$, 'SS-008 a stale confirmed repeat with nothing left to end just assigns (no error, no loop)');
reset role;
select is((select count(*)::int from public.section_assignments where dining_table_id = 900322 and released_at is null), 1, 'SS-008 exactly one claim on T2');
select is((select table_rotation_entry_id from public.section_assignments where dining_table_id = 900322 and released_at is null), (select id from public.table_rotation_entries where rotation_round_id = 900323 and rotation_member_id = 900321), 'SS-008 owned by the entry the database just created');
truncate cap_detail;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900324, 900321, 'T2', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap_detail values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap_detail), 'same_server_repeat', 'SS-008 a stale plain assign gets the structured same_server_repeat from the database');

-- ---------------------------------------------------------------------
-- 11. Authorization is unchanged.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000032005', true);
select throws_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900329, 900321, 'T2', false, false) $$, '42501', 'Only an active floor team member can do that.', 'a user outside the organization cannot End Previous + Assign');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.board_end_previous_and_assign('00000000-0000-0000-0000-000000032011'::uuid, '00000000-0000-0000-0000-000000032021'::uuid, (now() at time zone 'America/Chicago')::date, 900329, 900321, 'T2', false, false) $$, '42501', 'You need to sign in to do that.', 'no signed-in user cannot End Previous + Assign');
reset role;

select * from finish();
rollback;
