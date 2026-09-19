begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000029001', '0291-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000029002', '0291-server-one@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000029003', '0291-server-two@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000029001', 'PGTAP 0291 Owner'),
  ('00000000-0000-0000-0000-000000029002', 'PGTAP 0291 Server One'),
  ('00000000-0000-0000-0000-000000029003', 'PGTAP 0291 Server Two');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000029011', 'PGTAP 0291 Org', 'pgtap-0291-org', '00000000-0000-0000-0000-000000029001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000029021', '00000000-0000-0000-0000-000000029011', 'PGTAP 0291 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029003', array['server']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (900004, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', 'PGTAP Wall', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, sequence)
overriding system value
values
  (900004, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', 900004, 'T1', 4, 1),
  (900005, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', 900004, 'T2', 4, 2);

-- ---------------------------------------------------------------------
-- Session 900004: permissions smoke only (assign/add-row/clear-column by
-- a plain server) -- deliberately not used for row-count assertions,
-- since add_row/clear_column change round shape in ways not relevant to
-- what's being checked here.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900004, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', current_date, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900004, '00000000-0000-0000-0000-000000029011', 900004, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900004, '00000000-0000-0000-0000-000000029011', 900004, '00000000-0000-0000-0000-000000029002', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);

select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date, 900004, 900004, 'T1') $$,
  'a plain server can assign a table (unchanged behavior)'
);
select lives_ok(
  $$ select public.board_add_row('00000000-0000-0000-0000-000000029011'::uuid, 900004) $$,
  'a plain server can add a row (newly opened)'
);
select lives_ok(
  $$ select public.board_clear_column('00000000-0000-0000-0000-000000029011'::uuid, 900004, 900004) $$,
  'a plain server can clear a column (newly opened)'
);

reset role;

-- ---------------------------------------------------------------------
-- Session 900006: occupancy conflict / transfer / release / combined
-- tables. Fresh session, fresh rounds/members, so occupancy state here
-- is fully predictable.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900006, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', current_date + 1, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900006, '00000000-0000-0000-0000-000000029011', 900006, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values
  (900006, '00000000-0000-0000-0000-000000029011', 900006, '00000000-0000-0000-0000-000000029002', 1),
  (900007, '00000000-0000-0000-0000-000000029011', 900006, '00000000-0000-0000-0000-000000029003', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date + 1, 900006, 900006, 'T1');
reset role;

select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900004 and service_session_id = 900006 and released_at is null),
  1,
  'T1 has exactly one active occupancy claim after server one assigns it'
);
select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900004 and service_session_id = 900006 and released_at is null),
  900006::bigint,
  'the claim is attributed to server one''s column'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029003', true);
select throws_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date + 1, 900006, 900007, 'T1') $$,
  'Table T1 is already assigned to another active server on this board.',
  'server two cannot silently claim T1 while server one still holds it'
);
select lives_ok(
  $$ select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date + 1, 900006, 900007, 'T1', true) $$,
  'server two CAN take T1 via an explicit confirmed transfer'
);
reset role;

select is(
  (select rotation_member_id from public.section_assignments where dining_table_id = 900004 and service_session_id = 900006 and released_at is null),
  900007::bigint,
  'after transfer, T1''s active claim now belongs to server two, and only one active claim exists'
);
select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900004 and service_session_id = 900006 and released_at is null),
  1,
  'the transfer released server one''s claim rather than leaving two active claims'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029003', true);
select public.board_clear_cell('00000000-0000-0000-0000-000000029011'::uuid, 900006, 900006, 900007);
reset role;

select is(
  (select count(*)::int from public.section_assignments where dining_table_id = 900004 and service_session_id = 900006 and released_at is null),
  0,
  'clearing the cell releases the occupancy claim -- T1 is available again'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date + 1, 900006, 900006, 'T1 + T2');
reset role;

select is(
  (select count(*)::int from public.section_assignments where service_session_id = 900006 and dining_table_id in (900004, 900005) and released_at is null),
  2,
  'a combined label ("T1 + T2") reserves both member tables, one section_assignments row each'
);

-- ---------------------------------------------------------------------
-- Session 900008: auto-row rule, isolated to a single assign so the
-- resulting round shape is exactly predictable.
-- ---------------------------------------------------------------------
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (900008, '00000000-0000-0000-0000-000000029011', '00000000-0000-0000-0000-000000029021', current_date + 2, 'service', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (900008, '00000000-0000-0000-0000-000000029011', 900008, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, position)
overriding system value
values (900008, '00000000-0000-0000-0000-000000029011', 900008, '00000000-0000-0000-0000-000000029002', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select public.board_assign('00000000-0000-0000-0000-000000029011'::uuid, '00000000-0000-0000-0000-000000029021'::uuid, current_date + 2, 900008, 900008, 'T1');
reset role;

select is(
  (select count(*)::int from public.rotation_rounds where service_session_id = 900008),
  3,
  'filling the only round creates exactly two more, restoring a two-round trailing buffer'
);
select is(
  (
    select count(*)::int from public.rotation_rounds r
    where r.service_session_id = 900008
      and not exists (select 1 from public.table_rotation_entries e where e.rotation_round_id = r.id)
  ),
  2,
  'exactly two of those three rounds are empty (the reconciled auto-row rule)'
);

-- ---------------------------------------------------------------------
-- board_delete_row: rejected on a non-empty round, allowed on an empty
-- one. Reuses session 900008's trailing empty rounds.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select throws_ok(
  $$ select public.board_delete_row('00000000-0000-0000-0000-000000029011'::uuid, 900008, 900008) $$,
  'Clear this row before deleting it -- it still has assignments.',
  'a plain server cannot delete a round that still has assignments'
);
reset role;

select id as empty_round_id from public.rotation_rounds
where service_session_id = 900008
  and not exists (select 1 from public.table_rotation_entries e where e.rotation_round_id = rotation_rounds.id)
order by sequence desc limit 1
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000029002', true);
select lives_ok(
  format($$ select public.board_delete_row('00000000-0000-0000-0000-000000029011'::uuid, 900008, %s) $$, :empty_round_id),
  'a plain server can delete an empty trailing round (newly opened)'
);
reset role;

select * from finish();
rollback;
