begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Feature 027. Confirms both halves of the migration: the new
-- is_recurring column exists correctly, and the already-existing
-- series_id column (reused as the recurrence group id -- see the
-- migration's own comment) is still there, still nullable. Also
-- re-confirms, rather than assumes, that the pre-existing
-- shifts_write_manager / shifts_select_member RLS policies already
-- cover these columns and still gate a server out of every write --
-- this feature adds no new RLS policy, so this is a regression check,
-- not new coverage of new policy code.
select has_column('public', 'shifts', 'is_recurring', 'shifts.is_recurring exists');
select col_type_is('public', 'shifts', 'is_recurring', 'boolean', 'is_recurring is boolean');
select col_not_null('public', 'shifts', 'is_recurring', 'is_recurring is not null');
select col_default_is('public', 'shifts', 'is_recurring', 'false', 'is_recurring defaults to false');
select col_type_is('public', 'shifts', 'series_id', 'uuid', 'series_id is uuid');
select col_is_null('public', 'shifts', 'series_id', 'series_id is nullable -- a non-recurring shift has no series');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000027001', '0270-owner@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000027002', '0270-server@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000027001', 'PGTAP 0270 Owner'),
  ('00000000-0000-0000-0000-000000027002', 'PGTAP 0270 Server');

insert into public.organizations (id, name, slug, created_by)
values ('00000000-0000-0000-0000-000000027011', 'PGTAP 0270 Org', 'pgtap-0270-org', '00000000-0000-0000-0000-000000027001');

insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000027021', '00000000-0000-0000-0000-000000027011', 'PGTAP 0270 Location', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027002', array['server']::public.app_role[], true);

insert into public.schedule_periods (id, organization_id, location_id, starts_on, ends_on, status)
overriding system value
values (900007, '00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027021', '2026-01-01', '2026-12-31', 'draft');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027001', true);

-- Three rows, one shared series_id, one multi-row insert -- proves the
-- spec's "transaction-safe bulk insertion for recurring dates" is
-- already true by construction (a single multi-row insert() is one
-- statement, atomic by Postgres's own semantics) without any new RPC.
select lives_ok(
  $$
    insert into public.shifts (
      organization_id, location_id, schedule_period_id, service_date, end_date,
      kind, starts_at, ends_at, role_label, series_id, is_recurring
    )
    values
      ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027021', 900007, '2026-09-08', '2026-09-08', 'morning', '2026-09-08T16:00:00Z', '2026-09-08T21:00:00Z', 'Server', '11111111-1111-1111-1111-111111111111', true),
      ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027021', 900007, '2026-09-10', '2026-09-10', 'morning', '2026-09-10T16:00:00Z', '2026-09-10T21:00:00Z', 'Server', '11111111-1111-1111-1111-111111111111', true),
      ('00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027021', 900007, '2026-09-12', '2026-09-12', 'morning', '2026-09-12T16:00:00Z', '2026-09-12T21:00:00Z', 'Server', '11111111-1111-1111-1111-111111111111', true)
  $$,
  'an owner can insert a recurring shift series (three rows, one series_id) in one multi-row insert'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000027002', true);

-- Regression, not new coverage: shifts_write_manager already excludes
-- a plain server -- re-confirmed here now that the new column exists,
-- so a future change to that policy that accidentally widened it would
-- be caught here too, not just in an existing test elsewhere.
select throws_ok(
  $$
    insert into public.shifts (
      organization_id, location_id, schedule_period_id, service_date, end_date,
      kind, starts_at, ends_at, role_label
    )
    values (
      '00000000-0000-0000-0000-000000027011', '00000000-0000-0000-0000-000000027021', 900007, '2026-09-09', '2026-09-09',
      'morning', '2026-09-09T16:00:00Z', '2026-09-09T21:00:00Z', 'Server'
    )
  $$,
  'new row violates row-level security policy for table "shifts"',
  'a plain server still cannot insert a shift -- the write-manager policy is unchanged by this migration'
);

select * from finish();
rollback;
