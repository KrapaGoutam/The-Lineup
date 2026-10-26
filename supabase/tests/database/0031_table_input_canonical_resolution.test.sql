begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

-- ---------------------------------------------------------------------
-- Canonical table input resolution (#157): "1" is T1 when T1 is registered.
--
-- Cast: owner (acts as everyone via the trusted RPCs), outsider (other org),
-- servers Ann and Bea.
-- Location L1 registers T1, T2, T6, T19, T01, B1 and a table literally named
-- "5" next to "T5". Location L2 (same organization) registers only T1 and T01
-- is NOT registered there. Another organization's location L3 registers T99.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000031001', '0311-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031003', '0311-ann@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031004', '0311-bea@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000031005', '0311-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000031001', 'PGTAP 0311 Owner'),
  ('00000000-0000-0000-0000-000000031003', 'PGTAP 0311 Ann'),
  ('00000000-0000-0000-0000-000000031004', 'PGTAP 0311 Bea'),
  ('00000000-0000-0000-0000-000000031005', 'PGTAP 0311 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000031011', 'PGTAP 0311 Org', 'pgtap-0311-org', '00000000-0000-0000-0000-000000031001'),
  ('00000000-0000-0000-0000-000000031012', 'PGTAP 0311 Other Org', 'pgtap-0311-other', '00000000-0000-0000-0000-000000031005');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000031021', '00000000-0000-0000-0000-000000031011', 'PGTAP 0311 L1', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000031022', '00000000-0000-0000-0000-000000031011', 'PGTAP 0311 L2', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000031023', '00000000-0000-0000-0000-000000031012', 'PGTAP 0311 L3', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000031012', '00000000-0000-0000-0000-000000031005', array['owner']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values
  (900051, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 'PGTAP 0311 A1', 1),
  (900052, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031022', 'PGTAP 0311 A2', 1),
  (900053, '00000000-0000-0000-0000-000000031012', '00000000-0000-0000-0000-000000031023', 'PGTAP 0311 A3', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence, active)
overriding system value
values
  (900051, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T1', 4, 1, true),
  (900052, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T2', 4, 2, true),
  (900053, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T6', 4, 3, true),
  (900054, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T19', 4, 4, true),
  (900055, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T01', 4, 5, true),
  (900056, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'B1', 4, 6, true),
  (900057, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, '5', 4, 7, true),
  (900058, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T5', 4, 8, true),
  (900059, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', 900051, 'T7', 4, 9, false),
  (900060, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031022', 900052, 'T1', 4, 1, true),
  (900061, '00000000-0000-0000-0000-000000031012', '00000000-0000-0000-0000-000000031023', 900053, 'T99', 4, 1, true);

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900051, '00000000-0000-0000-0000-000000031011', '00000000-0000-0000-0000-000000031021', (now() at time zone 'America/Chicago')::date, 'service', 'active');
insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values
  (900051, '00000000-0000-0000-0000-000000031011', 900051, 1),
  (900052, '00000000-0000-0000-0000-000000031011', 900051, 2),
  (900053, '00000000-0000-0000-0000-000000031011', 900051, 3),
  (900054, '00000000-0000-0000-0000-000000031011', 900051, 4),
  (900055, '00000000-0000-0000-0000-000000031011', 900051, 5),
  (900056, '00000000-0000-0000-0000-000000031011', 900051, 6);
-- Ann = 900051, Bea = 900052.
insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900051, '00000000-0000-0000-0000-000000031011', 900051, '00000000-0000-0000-0000-000000031003', 1),
  (900052, '00000000-0000-0000-0000-000000031011', 900051, '00000000-0000-0000-0000-000000031004', 2);

create temp table cap (tag text, detail text);
grant all on cap to authenticated;

-- ---------------------------------------------------------------------
-- 1. The resolver (R2): precedence, shorthand, free text, location scope.
-- ---------------------------------------------------------------------
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '1')),
  'T1',
  '"1" resolves to T1 when T1 is registered'
);
select is(
  (select dining_table_id from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '1')),
  900051::bigint,
  '"1" carries the registered dining_tables id of T1'
);
select is(
  (select registered from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '1')),
  true,
  '"1" is flagged registered'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', 'T1')),
  'T1',
  '"T1" resolves to T1'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '  T1  ')),
  'T1',
  'input is trimmed'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '6')),
  'T6',
  '"6" resolves to T6'
);
select is(
  (select dining_table_id from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '19')),
  900054::bigint,
  '"19" resolves to the T19 id'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '99')),
  '99',
  '"99" stays free text when this location has no T99 (another organization''s T99 is not used)'
);
select is(
  (select registered from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '99')),
  false,
  'free text is not registered'
);
select is(
  (select dining_table_id from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '99')),
  null::bigint,
  'free text has no dining_table_id'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', 'Patio A')),
  'Patio A',
  '"Patio A" stays free text'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', 't1')),
  't1',
  'no case folding: "t1" is free text'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '01')),
  'T01',
  '"01" resolves to T01 when T01 is registered (the literal digit string, no collapse to T1)'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031022', '01')),
  '01',
  '"01" stays free text when only T1 is registered (never guessed as T1)'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031022', '1')),
  'T1',
  'location L2 resolves "1" to its own T1'
);
select is(
  (select dining_table_id from private.resolve_table_input('00000000-0000-0000-0000-000000031022', '1')),
  900060::bigint,
  'and to L2''s own dining_tables row, never L1''s'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '5')),
  '5',
  'an exact registered label "5" wins over the numeric shorthand T5'
);
select is(
  (select dining_table_id from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '5')),
  900057::bigint,
  'and carries the id of the table registered as "5"'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', '7')),
  '7',
  'an inactive T7 is not a registered table: "7" stays free text'
);
select is(
  (select canonical_label from private.resolve_table_input('00000000-0000-0000-0000-000000031021', null)),
  null::text,
  'NULL input has no label'
);
select is(
  private.canonical_table_label('00000000-0000-0000-0000-000000031021', '1 + 2'),
  'T1 + T2',
  'a combined label resolves every part: "1 + 2" -> "T1 + T2"'
);
select is(
  private.canonical_table_label('00000000-0000-0000-0000-000000031021', '1 + Patio A'),
  'T1 + Patio A',
  '"1 + Patio A" -> "T1 + Patio A"'
);
select is(
  private.canonical_table_label('00000000-0000-0000-0000-000000031021', '1+T1 + 2'),
  'T1 + T2',
  'a table named twice collapses to one'
);
select ok(
  not has_function_privilege('authenticated', 'private.resolve_table_input(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.resolve_table_input(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.canonical_label_parts(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.canonical_table_label(uuid,text)', 'EXECUTE'),
  'the resolver helpers are not executable by anon or authenticated'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in ('resolve_table_input', 'canonical_label_parts', 'canonical_table_label')),
  'the resolver helpers are SECURITY DEFINER with an empty fixed search_path'
);

-- ---------------------------------------------------------------------
-- 2. board_assign canonicalizes before storing, occupying and logging (R3).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900051, 900051, '1');
reset role;
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900051 and rotation_member_id = 900051),
  'T1',
  'typing "1" stores the canonical label T1'
);
select is(
  (select dining_table_id from public.section_assignments where rotation_member_id = 900051 and released_at is null),
  900051::bigint,
  'and the physical ledger claims the registered T1'
);
select is(
  (select payload->>'table_label' from public.board_events where service_session_id = 900051 and event_type = 'assign' order by id desc limit 1),
  'T1',
  'the assign event carries the canonical label'
);

-- Undo / redo of a shorthand assignment.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_undo('00000000-0000-0000-0000-000000031011'::uuid, 900051);
reset role;
select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900051 and released_at is null),
  0,
  'Undo of "1" frees T1'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_redo('00000000-0000-0000-0000-000000031011'::uuid, 900051);
reset role;
select is(
  (select dining_table_id from public.section_assignments where rotation_member_id = 900051 and released_at is null),
  900051::bigint,
  'Redo re-claims T1'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900051 and rotation_member_id = 900051),
  'T1',
  'and the stored label stays canonical after Redo'
);

-- ---------------------------------------------------------------------
-- 3. Same-server duplicate through the shorthand.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900052, 900051, '1', false, false) $$,
  'PT409',
  'Table T1 is already assigned to this server.',
  'Ann owns T1 and enters "1": same-server PT409 naming the canonical table'
);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900052, 900051, '1', true, true) $$,
  'PT409',
  'Table T1 is already assigned to this server.',
  'confirming does not bypass the same-server rule for the shorthand'
);
reset role;
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900051 and status = 'active'),
  1,
  'no duplicate entry was created'
);

-- ---------------------------------------------------------------------
-- 4. Held-table conflict through the shorthand (stale client / direct RPC).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900052, 900052, '1', false, false) $$,
  'PT409',
  'Table T1 is already assigned to another active server on this board.',
  'Bea enters "1" while Ann holds T1: PT409 held, naming T1'
);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900052, 900052, '1', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap values ('held-1', v_detail);
end $$;
reset role;
select is((select detail::jsonb->>'kind' from cap where tag = 'held-1'), 'held', 'the detail says kind = held');
select is((select detail::jsonb->>'label' from cap where tag = 'held-1'), 'T1', 'the detail names the canonical label, not "1"');
select is(
  (select (detail::jsonb->'holders'->0->>'member_id')::bigint from cap where tag = 'held-1'),
  900051::bigint,
  'the detail names Ann as holder'
);
select is(
  (select count(*)::int from public.table_rotation_entries where rotation_member_id = 900052),
  0,
  'the refused assign wrote nothing (no off-map "1" was created)'
);

-- ---------------------------------------------------------------------
-- 5. End + Assign through the shorthand: atomic, history kept.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900051, 900052, '1', true, true) $$,
  'End + Assign using "1" succeeds'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900051 and rotation_member_id = 900051),
  'ended',
  'Ann''s T1 is ENDED (history kept)'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900051 and rotation_member_id = 900052),
  'T1',
  'Bea''s new entry is the canonical T1'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900051 and released_at is null),
  900052::bigint,
  'exactly one active claim on T1, owned by Bea'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_undo('00000000-0000-0000-0000-000000031011'::uuid, 900051);
reset role;
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900051 and released_at is null),
  900051::bigint,
  'Undo of the shorthand End + Assign gives T1 back to Ann'
);

-- ---------------------------------------------------------------------
-- 6. Combined assignment: whole-assignment semantics on canonical identity.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900053, 900051, '2 + 6');
reset role;
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900053 and rotation_member_id = 900051),
  'T2 + T6',
  '"2 + 6" is stored as "T2 + T6"'
);
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900051 and released_at is null and dining_table_id in (900052, 900053)),
  '{900052,900053}',
  'both physical tables are claimed'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
do $$
declare
  v_detail text;
begin
  perform public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900053, 900052, '6', false, false);
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  insert into cap values ('held-6', v_detail);
end $$;
reset role;
select is(
  (select detail::jsonb->'holders'->0->>'assignment_label' from cap where tag = 'held-6'),
  'T2 + T6',
  'entering "6" against a combined holder reports the whole T2 + T6 assignment'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900053, 900052, '6', true, false) $$,
  'Table T6 is part of a combined assignment (T2 + T6) held by another server -- end or transfer that whole assignment first.',
  'without the whole-assignment flag a wider combined holder is refused'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900053, 900052, '6', true, true) $$,
  'End + Assign of "6" with the whole-assignment flag ends the whole T2 + T6 assignment'
);
reset role;
select is(
  (select status from public.table_rotation_entries where rotation_round_id = 900053 and rotation_member_id = 900051),
  'ended',
  'the combined holder is ended as a whole'
);
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900052 and released_at is null and dining_table_id in (900052, 900053)),
  '{900053}',
  'Bea holds only T6; T2 is released'
);

-- ---------------------------------------------------------------------
-- 7. Free text and mixed labels (R3 / R5).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900054, 900051, '99');
select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900055, 900051, '19 + Patio A');
reset role;
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900054 and rotation_member_id = 900051),
  '99',
  '"99" without a T99 stays the free-text label "99"'
);
select is(
  (select table_label from public.table_rotation_entries where rotation_round_id = 900055 and rotation_member_id = 900051),
  'T19 + Patio A',
  '"19 + Patio A" is stored as "T19 + Patio A"'
);
select is(
  (select array_agg(dining_table_id order by dining_table_id)::text from public.section_assignments where rotation_member_id = 900051 and released_at is null and dining_table_id in (900054)),
  '{900054}',
  'T19 is a physical claim; "Patio A" and "99" take none'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031001', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900054, 900052, '99', false, false) $$,
  'PT409',
  'Table 99 is already assigned to another active server on this board.',
  'two servers still cannot hold the same free-text label'
);
reset role;

-- ---------------------------------------------------------------------
-- 8. The occupancy trigger uses the SAME resolver (no second implementation).
-- ---------------------------------------------------------------------
insert into public.table_rotation_entries (organization_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
values ('00000000-0000-0000-0000-000000031011', 900056, 900052, '2', 'active', '00000000-0000-0000-0000-000000031001');
select is(
  (select dining_table_id from public.section_assignments where table_rotation_entry_id = (select id from public.table_rotation_entries where rotation_round_id = 900056 and rotation_member_id = 900052) and released_at is null),
  900052::bigint,
  'a raw "2" written straight to the entries table still claims the registered T2 (trigger shares the resolver)'
);

-- ---------------------------------------------------------------------
-- 9. Authorization is unchanged.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000031005', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000031011'::uuid, '00000000-0000-0000-0000-000000031021'::uuid, (now() at time zone 'America/Chicago')::date, 900052, 900052, '1', true, true) $$,
  '42501',
  'Only an active floor team member can do that.',
  'a user outside the organization cannot assign "1" here'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.board_assign(uuid,uuid,date,bigint,bigint,text,boolean,boolean)', 'EXECUTE'),
  'anon still cannot execute board_assign'
);

select * from finish();
rollback;
