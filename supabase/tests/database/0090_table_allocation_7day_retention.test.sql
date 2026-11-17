begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- 1. Existence and security checks
select ok(
  exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace and proname = 'cleanup_stale_table_allocation_records'
  ),
  'private.cleanup_stale_table_allocation_records exists'
);

select ok(
  (select prosecdef from pg_proc where pronamespace = 'private'::regnamespace and proname = 'cleanup_stale_table_allocation_records'),
  'cleanup_stale_table_allocation_records is SECURITY DEFINER'
);

select is(
  has_function_privilege('authenticated', 'private.cleanup_stale_table_allocation_records()', 'EXECUTE'),
  false,
  'a plain authenticated client role has no EXECUTE grant on cleanup_stale_table_allocation_records'
);

select is(
  has_function_privilege('anon', 'private.cleanup_stale_table_allocation_records()', 'EXECUTE'),
  false,
  'anon role has no EXECUTE grant on cleanup_stale_table_allocation_records'
);

-- 2. Fixture setup
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-000000009001', '0090-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000009001', 'PGTAP 0090 Owner');
insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000009011', 'PGTAP 0090 Org', 'pgtap-0090-org', '00000000-0000-0000-0000-000000009001');
insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000009021', '00000000-0000-0000-0000-000000009011', 'PGTAP 0090 Location', 'America/Chicago');
insert into public.memberships (organization_id, profile_id, roles, active)
values ('00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009001', array['owner']::public.app_role[], true);

insert into public.dining_areas (id, organization_id, location_id, name, area_order)
overriding system value
values (9001, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', 'Main Area', 1);

insert into public.dining_tables (id, organization_id, location_id, dining_area_id, label, seat_count, active)
overriding system value
values (9011, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', 9001, 'T1', 4, true);

-- Session A: Stale closed session (> 7 days old, e.g. 10 days ago)
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (9051, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', (now() at time zone 'America/Chicago')::date - 10, 'dinner', 'closed');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (9061, '00000000-0000-0000-0000-000000009011', 9051, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, status, position)
overriding system value
values (9071, '00000000-0000-0000-0000-000000009011', 9051, '00000000-0000-0000-0000-000000009001', 'active', 0);

insert into public.table_rotation_entries (id, organization_id, service_session_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
overriding system value
values (9081, '00000000-0000-0000-0000-000000009011', 9051, 9061, 9071, 'T1', 'active', '00000000-0000-0000-0000-000000009001');

insert into public.seatings (id, organization_id, location_id, service_session_id, server_profile_id, party_size, status, decided_by, idempotency_key)
overriding system value
values (9095, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', 9051, '00000000-0000-0000-0000-000000009001', 2, 'closed', '00000000-0000-0000-0000-000000009001', gen_random_uuid());

-- Session B: Recent closed session (<= 7 days old, e.g. 3 days ago)
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (9052, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', (now() at time zone 'America/Chicago')::date - 3, 'dinner', 'closed');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (9062, '00000000-0000-0000-0000-000000009011', 9052, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, status, position)
overriding system value
values (9072, '00000000-0000-0000-0000-000000009011', 9052, '00000000-0000-0000-0000-000000009001', 'active', 0);

insert into public.table_rotation_entries (id, organization_id, service_session_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
overriding system value
values (9082, '00000000-0000-0000-0000-000000009011', 9052, 9062, 9072, 'T1', 'active', '00000000-0000-0000-0000-000000009001');

-- Session C: Old active session (> 7 days old, but status = 'active' - must NEVER be purged)
insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values (9053, '00000000-0000-0000-0000-000000009011', '00000000-0000-0000-0000-000000009021', (now() at time zone 'America/Chicago')::date - 12, 'dinner', 'active');

insert into public.rotation_rounds (id, organization_id, service_session_id, sequence)
overriding system value
values (9063, '00000000-0000-0000-0000-000000009011', 9053, 1);

insert into public.rotation_members (id, organization_id, service_session_id, server_profile_id, status, position)
overriding system value
values (9073, '00000000-0000-0000-0000-000000009011', 9053, '00000000-0000-0000-0000-000000009001', 'active', 0);

insert into public.table_rotation_entries (id, organization_id, service_session_id, rotation_round_id, rotation_member_id, table_label, status, assigned_by)
overriding system value
values (9083, '00000000-0000-0000-0000-000000009011', 9053, 9063, 9073, 'T1', 'active', '00000000-0000-0000-0000-000000009001');

-- Execute cleanup
select private.cleanup_stale_table_allocation_records();

-- 3. Assertions
-- Stale closed session (9051) child records are purged:
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 9051),
  0,
  'table_rotation_entries for stale closed session older than 7 days are deleted'
);

select is(
  (select count(*)::int from public.section_assignments where service_session_id = 9051),
  0,
  'section_assignments for stale closed session older than 7 days are deleted'
);

-- Stale closed session itself (9051) and seatings are PRESERVED:
select is(
  (select count(*)::int from public.service_sessions where id = 9051),
  1,
  'service_sessions row is intentionally PRESERVED for location lifecycle integrity'
);

select is(
  (select count(*)::int from public.seatings where service_session_id = 9051),
  1,
  'seatings row is intentionally PRESERVED for audit and reporting integrity'
);

-- Recent closed session (9052) child records are untouched:
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 9052),
  1,
  'table_rotation_entries for recent closed session within 7-day window are untouched'
);

-- Old active session (9053) child records are untouched:
select is(
  (select count(*)::int from public.table_rotation_entries where service_session_id = 9053),
  1,
  'table_rotation_entries for active (non-closed) session are untouched regardless of date'
);

select * from finish();
rollback;
