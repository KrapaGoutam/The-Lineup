begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- ---------------------------------------------------------------------
-- Table Allocation cross-view integrity (X2): server-authoritative
-- occupied-table conflicts (PT409), same-server duplicates, and atomic
-- whole-assignment End + Assign through public.board_assign.
--
-- Cast: owner, outsider (another organization), servers Ann and Bea.
-- Tables T1..T5 are registered; "9" is a free-text board label with no
-- dining_tables row. (#157 supersedes the original "1 is a free-text label"
-- contract: "1" now resolves to the registered T1 -- see 0031.)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000030001', '0301-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000030003', '0301-ann@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000030004', '0301-bea@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000030005', '0301-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000030001', 'PGTAP 0301 Owner'),
  ('00000000-0000-0000-0000-000000030003', 'PGTAP 0301 Ann'),
  ('00000000-0000-0000-0000-000000030004', 'PGTAP 0301 Bea'),
  ('00000000-0000-0000-0000-000000030005', 'PGTAP 0301 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000030011', 'PGTAP 0301 Org', 'pgtap-0301-org', '00000000-0000-0000-0000-000000030001'),
  ('00000000-0000-0000-0000-000000030012', 'PGTAP 0301 Other Org', 'pgtap-0301-other', '00000000-0000-0000-0000-000000030005');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000030021', '00000000-0000-0000-0000-000000030011', 'PGTAP 0301 Location', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000030022', '00000000-0000-0000-0000-000000030012', 'PGTAP 0301 Other Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000030012', '00000000-0000-0000-0000-000000030005', array['owner']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900041, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 'PGTAP 0301 Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900041, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 900041, 'T1', 4, 1),
  (900042, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 900041, 'T2', 4, 2),
  (900043, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 900041, 'T3', 4, 3),
  (900044, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 900041, 'T4', 4, 4),
  (900045, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', 900041, 'T5', 4, 5);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900041, '00000000-0000-0000-0000-000000030011', '00000000-0000-0000-0000-000000030021', (now() at time zone 'America/Chicago')::date, 'service', 'active');
insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values
  (900041, '00000000-0000-0000-0000-000000030011', 900041, 1),
  (900042, '00000000-0000-0000-0000-000000030011', 900041, 2),
  (900043, '00000000-0000-0000-0000-000000030011', 900041, 3),
  (900044, '00000000-0000-0000-0000-000000030011', 900041, 4),
  (900045, '00000000-0000-0000-0000-000000030011', 900041, 5);
-- Ann = 900041, Bea = 900042.
insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900041, '00000000-0000-0000-0000-000000030011', 900041, '00000000-0000-0000-0000-000000030003', 1),
  (900042, '00000000-0000-0000-0000-000000030011', 900041, '00000000-0000-0000-0000-000000030004', 2);

create temp table cap (detail text);
grant all on cap to authenticated;

-- ---------------------------------------------------------------------
-- 1. Contract surface.
-- ---------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.board_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'),
  'anon cannot execute board_assign'
);
select ok(
  has_function_privilege('authenticated', 'public.board_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'),
  'authenticated can execute board_assign'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'board_assign' and p.pronargs = 7
  ),
  'the 7-argument board_assign overload is gone (no PostgREST ambiguity)'
);
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'board_assign'),
  true,
  'board_assign is SECURITY DEFINER'
);
select ok(
  (select p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'board_assign'),
  'board_assign has an empty fixed search_path'
);
select is(
  private.label_parts(' T4 + T5 +  '),
  array['T4','T5']::text[],
  'label_parts trims and drops empty parts'
);
select isnt(
  private.label_parts('1'),
  private.label_parts('T1'),
  'label_parts is purely textual (no prefix or normalization); "1" -> T1 is private.resolve_table_input''s job (0031)'
);

-- ---------------------------------------------------------------------
-- 2. Same-server duplicate and in-place edit.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900041, 900041, 'T1');

select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900042, 900041, 'T1', false, false) $$,
  'PT409',
  'Table T1 is already assigned to this server.',
  'a server cannot hold the same table twice (PT409)'
);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900042, 900041, 'T1', true, true) $$,
  'PT409',
  'Table T1 is already assigned to this server.',
  'confirming does not bypass the same-server rule'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900041, 900041, 'T1 + T2', false, false) $$,
  'editing the server''s own cell in place (T1 -> T1 + T2) is not a conflict with itself'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900041, 900041, 'T1', false, false) $$,
  'and back'
);
reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900041 and status = 'active'),
  1,
  'no duplicate active entry was created'
);

-- ---------------------------------------------------------------------
-- 3. "1" IS "T1" (#157, replaces the original distinct-labels contract):
--    the shorthand resolves to the registered table, so it collides with it.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900041, 900042, '1', false, false) $$,
  'PT409',
  'Table T1 is already assigned to another active server on this board.',
  'Bea cannot take "1" while Ann holds T1: it resolves to the same table'
);
reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900042),
  0,
  'no separate free-text "1" entry was created'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900041 and released_at is null),
  900041::bigint,
  'T1 stays Ann''s'
);

-- ---------------------------------------------------------------------
-- 4. Stale client: a non-confirmed assign of a held table is a
--    server-authoritative PT409 whose detail names the holder.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900042, 900042, 'T1', false, false) $$,
  'PT409',
  'Table T1 is already assigned to another active server on this board.',
  'a held table is refused without confirmation (PT409)'
);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900042, 900042, 'T1', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap values (v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap), 'held', 'the conflict detail says kind = held');
select is(
  (select (detail::jsonb->'holders'->0->>'member_id')::bigint from cap),
  900041::bigint,
  'the conflict detail names the holder''s member id'
);
select is(
  (select detail::jsonb->'holders'->0->>'assignment_label' from cap),
  'T1',
  'and the whole assignment label'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900042 and rotation_round_id = 900042),
  0,
  'nothing was written by the refused assign'
);

-- ---------------------------------------------------------------------
-- 5. End + Assign: one atomic call; the holder is ENDED, history kept.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900042, 900042, 'T1', true, false) $$,
  'End + Assign of a held table succeeds'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900041 and rotation_member_id = 900041),
  'ended',
  'the previous owner''s entry is ENDED, not overwritten or deleted'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900042 and rotation_member_id = 900042),
  'T1',
  'the new owner has a separate ACTIVE entry'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900041 and released_at is null),
  900042::bigint,
  'exactly one active claim, owned by the new server'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030003', true);
select public.board_undo('00000000-0000-0000-0000-000000030011'::uuid, 900041);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900041 and released_at is null),
  900041::bigint,
  'Undo of End + Assign gives the table back to the displaced owner'
);

-- ---------------------------------------------------------------------
-- 6. Combined holder: End + Assign of ONE table ends the WHOLE assignment.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900043, 900041, 'T4 + T5', false, false);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900043, 900042, 'T4', true, false) $$,
  'Table T4 is part of a combined assignment (T4 + T5) held by another server -- end or transfer that whole assignment first.',
  'without the explicit whole-assignment flag a wider combined holder is still refused'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900043, 900042, 'T4', true, true) $$,
  'with p_end_whole_assignment the whole T4 + T5 assignment is ended and T4 assigned'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900043 and rotation_member_id = 900041),
  'ended',
  'the combined assignment is ended as a whole (history kept)'
);
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900042 and released_at is null and dining_table_id in (900044, 900045)),
  '{900044}',
  'only T4 is claimed afterwards; T5 is released (no partial active release of the old assignment)'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030003', true);
select public.board_undo('00000000-0000-0000-0000-000000030011'::uuid, 900041);
reset role;
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900041 and released_at is null and dining_table_id in (900044, 900045)),
  '{900044,900045}',
  'Undo restores the whole combined assignment to its owner'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030003', true);
select public.board_redo('00000000-0000-0000-0000-000000030011'::uuid, 900041);
reset role;
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900042 and released_at is null and dining_table_id in (900044, 900045)),
  '{900044}',
  'Redo re-applies End + Assign'
);

-- ---------------------------------------------------------------------
-- 7. Free-text labels are guarded by exact label too.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030001', true);
select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900044, 900041, '9', false, false);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900044, 900042, '9', false, false) $$,
  'PT409',
  'Table 9 is already assigned to another active server on this board.',
  'two servers cannot both hold the same free-text label'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900044, 900042, '9', true, true) $$,
  'End + Assign works for a free-text label'
);
reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 900041 and table_label = '9' and status = 'active'),
  1,
  'exactly one active holder of "9"'
);

-- ---------------------------------------------------------------------
-- 8. Authorization is unchanged: an outsider cannot touch this board.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000030005', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000030011'::uuid, '00000000-0000-0000-0000-000000030021'::uuid, (now() at time zone 'America/Chicago')::date, 900045, 900042, 'T2', true, true) $$,
  '42501',
  'Only an active floor team member can do that.',
  'a user outside the organization cannot End + Assign here'
);
reset role;

select * from finish();
rollback;
