begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace and proname = 'seed_canonical_floor_layout'
  ),
  'private.seed_canonical_floor_layout exists'
);
select is(
  has_function_privilege('authenticated', 'private.seed_canonical_floor_layout(text)', 'EXECUTE'),
  false,
  'a plain authenticated client role has no EXECUTE grant on the seed function'
);
select is(
  has_function_privilege('anon', 'private.seed_canonical_floor_layout(text)', 'EXECUTE'),
  false,
  'anon has no EXECUTE grant on the seed function'
);

-- Org A: the target of the backfill in this test, standing in for the
-- real 'the-monks' production org (never touched by this test).
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-000000029301', '0293-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000029301', 'PGTAP 0293 Owner');
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000029311', 'PGTAP 0293 Org A', 'pgtap-0293-org-a', '00000000-0000-0000-0000-000000029301');
insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000029321', '00000000-0000-0000-0000-000000029311', 'PGTAP 0293 Location A', 'America/Chicago');

-- Org B: a second, unrelated tenant -- never passed to the seed
-- function, proving tenant isolation (it must never receive rows meant
-- for org A).
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000029312', 'PGTAP 0293 Org B', 'pgtap-0293-org-b', '00000000-0000-0000-0000-000000029301');
insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000029322', '00000000-0000-0000-0000-000000029312', 'PGTAP 0293 Location B', 'America/Chicago');

-- A manually configured dining_area + table already exists for org A's
-- location, at the same label ('T1') the canonical layout would also
-- use, with a distinctive position_x -- proves the backfill never
-- overwrites something already configured.
insert into public.dining_areas (id, organization_id, location_id, name)
overriding system value
values (900093, '00000000-0000-0000-0000-000000029311', '00000000-0000-0000-0000-000000029321', 'Existing Area');
insert into public.dining_tables (organization_id, location_id, dining_area_id, label, seat_count, sequence, position_x, position_y, active)
values ('00000000-0000-0000-0000-000000029311', '00000000-0000-0000-0000-000000029321', 900093, 'T1', 6, 1, 999, 999, true);

select private.seed_canonical_floor_layout('pgtap-0293-org-a');

select is(
  (select count(*)::int from public.dining_areas where location_id = '00000000-0000-0000-0000-000000029321'),
  3,
  'the pre-existing manual area plus the two canonical areas (Dining Room, Bar) exist for org A'
);
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-000000029321'),
  27,
  'org A ends up with exactly 27 tables (T1-T19 + B1-B8), not 28 -- the pre-existing T1 was not duplicated'
);
select is(
  (select position_x::int from public.dining_tables where location_id = '00000000-0000-0000-0000-000000029321' and label = 'T1'),
  999,
  'the pre-existing, manually configured T1 keeps its own position -- never overwritten by the canonical layout'
);
select is(
  (select (position_x::int, position_y::int) from public.dining_tables where location_id = '00000000-0000-0000-0000-000000029321' and label = 'T13'),
  (34, 34),
  'a freshly backfilled table (T13) matches DEMO_FLOOR_LAYOUT exact coordinates'
);
select is(
  (select da.name from public.dining_tables dt join public.dining_areas da on da.id = dt.dining_area_id
   where dt.location_id = '00000000-0000-0000-0000-000000029321' and dt.label = 'B1'),
  'Bar',
  'B1 is filed under a dining area literally named Bar, so the client infers resourceType: bar_seat'
);
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-000000029322'),
  0,
  'tenant isolation: org B (never passed to the seed function) receives zero rows'
);

-- Idempotency: calling it again for the same org must not duplicate
-- anything.
select private.seed_canonical_floor_layout('pgtap-0293-org-a');

select is(
  (select count(*)::int from public.dining_areas where location_id = '00000000-0000-0000-0000-000000029321'),
  3,
  'calling the seed function again does not duplicate dining_areas'
);
select is(
  (select count(*)::int from public.dining_tables where location_id = '00000000-0000-0000-0000-000000029321'),
  27,
  'calling the seed function again does not duplicate dining_tables'
);

select * from finish();
rollback;
