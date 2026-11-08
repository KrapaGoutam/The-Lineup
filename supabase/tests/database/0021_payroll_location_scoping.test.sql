begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

-- =============================================================================
-- TEST IDENTITIES & FIXTURES (0021 namespace)
-- =============================================================================

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000021001', 'payroll-overall@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021002', 'payroll-gm@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021003', 'payroll-mgr-a@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021004', 'payroll-asst-a@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021005', 'payroll-mgr-b@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021006', 'payroll-staff-a@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021007', 'payroll-staff-b@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021008', 'payroll-staff-unlinked@test.internal', 'hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021009', 'payroll-attacker-b@test.internal', 'hash', now(), 'authenticated', 'authenticated');

insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'payroll-%@test.internal';

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000021001', 'Overall Manager 21'),
  ('00000000-0000-0000-0000-000000021002', 'Org General Manager 21'),
  ('00000000-0000-0000-0000-000000021003', 'Loc A Manager 21'),
  ('00000000-0000-0000-0000-000000021004', 'Loc A Asst Manager 21'),
  ('00000000-0000-0000-0000-000000021005', 'Loc B Manager 21'),
  ('00000000-0000-0000-0000-000000021006', 'Staff Member A 21'),
  ('00000000-0000-0000-0000-000000021007', 'Staff Member B 21'),
  ('00000000-0000-0000-0000-000000021008', 'Staff Unlinked 21'),
  ('00000000-0000-0000-0000-000000021009', 'Attacker Org B 21');

-- Overall Administrator (no membership rows in tenant orgs)
insert into public.overall_roles (profile_id, role)
values
  ('00000000-0000-0000-0000-000000021001', 'manager');

-- Organizations
insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000021101', 'Payroll Test Org A', 'payroll-org-a', '00000000-0000-0000-0000-000000021002'),
  ('00000000-0000-0000-0000-000000021102', 'Payroll Test Org B', 'payroll-org-b', '00000000-0000-0000-0000-000000021009');

-- Locations
insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000021111', '00000000-0000-0000-0000-000000021101', 'Location A', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000021112', '00000000-0000-0000-0000-000000021101', 'Location B', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000021113', '00000000-0000-0000-0000-000000021102', 'Location C', 'America/Chicago');

-- Organization Memberships
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021005', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021006', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021007', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021008', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021102', '00000000-0000-0000-0000-000000021009', array['owner']::public.app_role[], true);

-- Location Memberships
insert into public.location_memberships (location_id, profile_id, role, active)
values
  ('00000000-0000-0000-0000-000000021111', '00000000-0000-0000-0000-000000021003', 'manager', true),
  ('00000000-0000-0000-0000-000000021111', '00000000-0000-0000-0000-000000021004', 'assistant_manager', true),
  ('00000000-0000-0000-0000-000000021112', '00000000-0000-0000-0000-000000021005', 'manager', true),
  ('00000000-0000-0000-0000-000000021111', '00000000-0000-0000-0000-000000021006', 'staff', true),
  ('00000000-0000-0000-0000-000000021112', '00000000-0000-0000-0000-000000021007', 'staff', true),
  ('00000000-0000-0000-0000-000000021111', '00000000-0000-0000-0000-000000021008', 'staff', true),
  ('00000000-0000-0000-0000-000000021113', '00000000-0000-0000-0000-000000021009', 'manager', true);

-- Attendance Identity Links
insert into public.attendance_identity_links (organization_id, profile_id, neon_user_id, linked_by)
values
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021006', 2101, '00000000-0000-0000-0000-000000021002'),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021007', 2102, '00000000-0000-0000-0000-000000021002');

-- Module configuration defaults for locations
insert into public.location_module_configs (location_id, module_key, is_enabled)
select loc.id, k, true
from public.locations loc
cross join unnest(enum_range(null::public.location_module_key)) k
where loc.id in (
  '00000000-0000-0000-0000-000000021111',
  '00000000-0000-0000-0000-000000021112',
  '00000000-0000-0000-0000-000000021113'
)
on conflict (location_id, module_key) do nothing;

-- Temp storage for cross-statement IDs
create temp table test_period_loc_a (id bigint);
create temp table test_period_loc_b (id bigint);
create temp table test_payment_loc_a (id bigint);
grant all on test_period_loc_a, test_period_loc_b, test_payment_loc_a to authenticated;

-- =============================================================================
-- PART 1: SCHEMA & HELPER PRIVILEGES (9 tests)
-- =============================================================================

select has_column('public', 'payroll_periods', 'location_id', '1. payroll_periods.location_id column exists');
select col_is_null('public', 'payroll_periods', 'location_id', '2. payroll_periods.location_id is nullable');
select ok(has_function_privilege('authenticated', 'public.payroll_location_authorized(uuid,uuid)', 'execute'), '3. authenticated granted payroll_location_authorized');
select ok(not has_function_privilege('anon', 'public.payroll_location_authorized(uuid,uuid)', 'execute'), '4. anon denied payroll_location_authorized');
select ok(not has_function_privilege('anon', 'private.payroll_profile_level(uuid,uuid,uuid)', 'execute'), '5. anon denied private.payroll_profile_level');
select ok(not has_function_privilege('anon', 'private.payroll_is_org_manager(uuid)', 'execute'), '6. anon denied private.payroll_is_org_manager');
select ok(not has_function_privilege('anon', 'private.payroll_can_manage_location(uuid,uuid)', 'execute'), '7. anon denied private.payroll_can_manage_location');
select ok(not has_function_privilege('anon', 'private.payroll_can_manage_period(bigint)', 'execute'), '8. anon denied private.payroll_can_manage_period');
select ok(not has_function_privilege('anon', 'private.payroll_can_read_period(bigint)', 'execute'), '9. anon denied private.payroll_can_read_period');

-- =============================================================================
-- PART 2: PUBLIC RPC PAYROLL_LOCATION_AUTHORIZED (13 tests)
-- =============================================================================

set local role authenticated;

-- Overall Manager
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021001', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), true, '10. Overall manager authorized for Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), true, '11. Overall manager authorized for Loc B');

-- Org General Manager
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), true, '12. Org GM authorized for Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), true, '13. Org GM authorized for Loc B');

-- Location Manager at Loc A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), true, '14. Loc A manager authorized for Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), false, '15. Loc A manager unauthorized for Loc B');

-- Location Assistant Manager at Loc A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021004', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), true, '16. Loc A asst manager authorized for Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), false, '17. Loc A asst manager unauthorized for Loc B');

-- Location Manager at Loc B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021005', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), false, '18. Loc B manager unauthorized for Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), true, '19. Loc B manager authorized for Loc B');

-- Staff A (assigned to Loc A)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021006', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), true, '20. Staff A authorized at assigned Loc A');
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112'), false, '21. Staff A unauthorized at foreign Loc B');

-- Cross-tenant Attacker
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021009', true);
select is(public.payroll_location_authorized('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111'), false, '22. Cross-tenant attacker unauthorized for Org A Loc A');

-- =============================================================================
-- PART 3: ORG SCOPE: PAYROLL_SETTINGS & PAYROLL_RATES (12 tests)
-- =============================================================================

-- Overall Manager can write settings and rates
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021001', true);
select lives_ok(
  $$
    insert into public.payroll_settings (organization_id, default_rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 1500, '00000000-0000-0000-0000-000000021001')
  $$,
  '23. Overall manager can insert payroll_settings'
);
select lives_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 2101, 1800, '00000000-0000-0000-0000-000000021001')
  $$,
  '24. Overall manager can insert payroll_rates'
);

-- Org GM can update settings and insert rate override
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select lives_ok(
  $$
    update public.payroll_settings
    set default_rate_cents = 1600, updated_by = '00000000-0000-0000-0000-000000021002'
    where organization_id = '00000000-0000-0000-0000-000000021101'
  $$,
  '25. Org GM can update payroll_settings'
);
select lives_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 2102, 1900, '00000000-0000-0000-0000-000000021002')
  $$,
  '26. Org GM can insert payroll_rates'
);

-- Location Manager CANNOT insert payroll_settings
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select throws_ok(
  $$
    insert into public.payroll_settings (organization_id, default_rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021102', 1700, '00000000-0000-0000-0000-000000021003')
  $$,
  '42501',
  null,
  '27. Location manager cannot insert payroll_settings'
);

-- Location Manager cannot update payroll_settings (under RLS, affects 0 rows)
update public.payroll_settings
set default_rate_cents = 2000, updated_by = '00000000-0000-0000-0000-000000021003'
where organization_id = '00000000-0000-0000-0000-000000021101';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select is(
  (select default_rate_cents from public.payroll_settings where organization_id = '00000000-0000-0000-0000-000000021101'),
  1600,
  '28. Location manager update on payroll_settings was blocked by RLS'
);

-- Location Manager CANNOT insert payroll_rates
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select throws_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 2103, 2000, '00000000-0000-0000-0000-000000021003')
  $$,
  '42501',
  null,
  '29. Location manager cannot insert payroll_rates'
);

-- Location Manager cannot delete payroll_rates (under RLS, affects 0 rows)
delete from public.payroll_rates
where organization_id = '00000000-0000-0000-0000-000000021101' and neon_user_id = 2101;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select is(
  (select count(*)::int from public.payroll_rates where organization_id = '00000000-0000-0000-0000-000000021101' and neon_user_id = 2101),
  1,
  '30. Location manager delete on payroll_rates was blocked by RLS'
);

-- Location Assistant Manager CANNOT insert payroll_rates
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021004', true);
select throws_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 2104, 2100, '00000000-0000-0000-0000-000000021004')
  $$,
  '42501',
  null,
  '31. Location asst manager cannot insert payroll_rates'
);

-- Staff A CANNOT insert payroll_rates
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021006', true);
select throws_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000021101', 2101, 2500, '00000000-0000-0000-0000-000000021006')
  $$,
  '42501',
  null,
  '32. Staff cannot insert payroll_rates'
);

-- Location Manager CAN read settings and rates
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select is(
  (select count(*)::int from public.payroll_settings where organization_id = '00000000-0000-0000-0000-000000021101'),
  1,
  '33. Location manager can read payroll_settings'
);

-- Staff A CANNOT read settings
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021006', true);
select is(
  (select count(*)::int from public.payroll_settings where organization_id = '00000000-0000-0000-0000-000000021101'),
  0,
  '34. Staff cannot read payroll_settings'
);

-- =============================================================================
-- PART 4: PERIODS GENERATION, LOCATION SCOPING & UNIQUENESS (8 tests)
-- =============================================================================

-- Location Manager at Loc A can generate period for Loc A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select lives_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111',
      2101, '2026-09-01', 100, 1800, 180000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '35. Loc A manager can generate period for Loc A'
);

-- Store Loc A period id
insert into test_period_loc_a
select id from public.payroll_periods
where neon_user_id = 2101 and period_month = '2026-09-01';

-- Location Manager at Loc A CANNOT generate period for foreign Loc B
select throws_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112',
      2102, '2026-09-01', 100, 1800, 180000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '42501',
  null,
  '36. Loc A manager cannot generate period for Loc B'
);

-- Location Manager at Loc A CANNOT generate period with NULL location_id
select throws_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', null,
      2103, '2026-09-01', 100, 1800, 180000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '42501',
  null,
  '37. Loc A manager cannot generate period with null location_id'
);

-- Location Manager at Loc A CANNOT generate period for Org B
select throws_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021102', '00000000-0000-0000-0000-000000021113',
      2104, '2026-09-01', 100, 1800, 180000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '42501',
  null,
  '38. Loc A manager cannot generate period for Org B'
);

-- Org GM can generate period for Loc B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select lives_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112',
      2102, '2026-09-01', 80, 1900, 152000, '00000000-0000-0000-0000-000000021002'
    )
  $$,
  '39. Org GM can generate period for Loc B'
);

-- Store Loc B period id
insert into test_period_loc_b
select id from public.payroll_periods
where neon_user_id = 2102 and period_month = '2026-09-01';

-- Org GM can generate period with NULL location_id (unassigned / multi-branch employee)
select lives_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', null,
      2103, '2026-09-01', 120, 1600, 192000, '00000000-0000-0000-0000-000000021002'
    )
  $$,
  '40. Org GM can generate period with null location_id'
);

-- Overall Manager can generate period for Loc A (for month 2026-10-01)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021001', true);
select lives_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111',
      2101, '2026-10-01', 90, 1800, 162000, '00000000-0000-0000-0000-000000021001'
    )
  $$,
  '41. Overall manager can generate period for Loc A'
);

-- Unique constraint strictly preserved: (organization_id, neon_user_id, period_month)
select throws_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021112',
      2101, '2026-09-01', 50, 1800, 90000, '00000000-0000-0000-0000-000000021001'
    )
  $$,
  '23505',
  null,
  '42. Duplicate (org, neon_user_id, period_month) rejected despite different location_id'
);

-- =============================================================================
-- PART 5: PERIOD VISIBILITY & STAFF SELF-SCOPING (7 tests)
-- =============================================================================

-- Location Manager at Loc A sees Loc A periods but not Loc B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2101 and period_month = '2026-09-01'),
  1,
  '43. Loc A manager can select Loc A period'
);
select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2102 and period_month = '2026-09-01'),
  0,
  '44. Loc A manager cannot select Loc B period'
);

-- Org GM can select all periods across locations
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select is(
  (select count(*)::int from public.payroll_periods where period_month = '2026-09-01'),
  3,
  '45. Org GM can select periods across all locations and unassigned'
);

-- Staff Member A: cannot see draft period
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021006', true);
select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2101 and period_month = '2026-09-01'),
  0,
  '46. Staff A cannot see draft period'
);

-- Loc A manager locks period for 2101
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
update public.payroll_periods
set status = 'locked', locked_at = now(), locked_by = '00000000-0000-0000-0000-000000021003'
where neon_user_id = 2101 and period_month = '2026-09-01';

-- Staff Member A: CAN see locked own period
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021006', true);
select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2101 and period_month = '2026-09-01'),
  1,
  '47. Staff A can see locked own period'
);

-- Staff Member A: CANNOT see Staff B's period
select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2102 and period_month = '2026-09-01'),
  0,
  '48. Staff A cannot see Staff B period'
);

-- Staff Unlinked: CANNOT see any periods
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021008', true);
select is(
  (select count(*)::int from public.payroll_periods where organization_id = '00000000-0000-0000-0000-000000021101'),
  0,
  '49. Unlinked staff cannot see any payroll periods'
);

-- =============================================================================
-- PART 6: PAYMENTS, CONFIRMATIONS & IMMUTABILITY (9 tests)
-- =============================================================================

-- Loc A manager can record draft payment on Loc A period
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select lives_ok(
  $$
    insert into public.payroll_payments (
      organization_id, payroll_period_id, amount_cents, payment_date, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', (select id from test_period_loc_a), 80000, '2026-09-15',
      '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '50. Loc A manager can record draft payment on Loc A period'
);

-- Store payment id
insert into test_payment_loc_a
select id from public.payroll_payments
where payroll_period_id = (select id from test_period_loc_a);

-- Loc A manager CANNOT record payment on Loc B period (throws 42501 when foreign period id is provided)
select throws_ok(
  format($$
    insert into public.payroll_payments (
      organization_id, payroll_period_id, amount_cents, payment_date, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', %s, 50000, '2026-09-15', '00000000-0000-0000-0000-000000021003'
    )
  $$, (select id from test_period_loc_b)),
  '42501',
  null,
  '51. Loc A manager cannot record payment on Loc B period'
);

-- Loc A manager confirms payment on 2101's period
update public.payroll_payments
set status = 'confirmed', confirmed_at = now(), confirmed_by = '00000000-0000-0000-0000-000000021003'
where id = (select id from test_payment_loc_a);

-- Confirmed payment direct update blocked by trigger
select throws_ok(
  format($$
    update public.payroll_payments
    set amount_cents = 90000
    where id = %s
  $$, (select id from test_payment_loc_a)),
  'P0001',
  'Cannot edit a confirmed payment; record a correction instead.',
  '52. Direct update of confirmed payment amount blocked by trigger'
);

-- Confirmed payment direct delete blocked by trigger (tested via superuser/postgres)
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format($$
    delete from public.payroll_payments
    where id = %s
  $$, (select id from test_payment_loc_a)),
  'P0001',
  'Cannot delete a confirmed payment; record a correction instead.',
  '53. Direct delete of confirmed payment blocked by trigger'
);

-- Loc B manager attempts to unconfirm Loc A payment -> rejected
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021005', true);
select throws_ok(
  format($$
    select public.unconfirm_payroll_payment(%s, 'Unauthorized attempt')
  $$, (select id from test_payment_loc_a)),
  'P0001',
  'You do not have permission to unconfirm this payment.',
  '54. Loc B manager cannot unconfirm Loc A payment'
);

-- Loc A manager unconfirm with short reason -> rejected
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select throws_ok(
  format($$
    select public.unconfirm_payroll_payment(%s, 'no')
  $$, (select id from test_payment_loc_a)),
  'P0001',
  'A reason of at least 3 characters is required to unconfirm a payment.',
  '55. Short reason rejected for unconfirm'
);

-- Loc A manager unconfirm with valid reason -> succeeds
select lives_ok(
  format($$
    select public.unconfirm_payroll_payment(%s, 'Correction needed for amount')
  $$, (select id from test_payment_loc_a)),
  '56. Loc A manager successfully unconfirms payment with valid reason'
);

select is(
  (select p.status from public.payroll_payments p where p.id = (select id from test_payment_loc_a)),
  'draft',
  '57. Payment status reverted to draft'
);

select is(
  (select count(*)::int from public.audit_events
   where entity_type = 'payroll_payment'
     and action = 'payroll_payment_unconfirmed'
     and entity_id = (select id::text from test_payment_loc_a)
     and location_id = '00000000-0000-0000-0000-000000021111'),
  1,
  '58. Audit event logged for unconfirm with Loc A attribution'
);

-- =============================================================================
-- PART 7: ADJUSTMENTS (4 tests)
-- =============================================================================

-- Loc A manager can record positive adjustment on Loc A period
select lives_ok(
  $$
    insert into public.payroll_adjustments (
      organization_id, payroll_period_id, delta_cents, reason, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', (select id from test_period_loc_a), 2000,
      'Bonus tip adjustment', '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '59. Loc A manager can record positive adjustment on Loc A period'
);

-- Loc A manager can record negative adjustment on Loc A period
select lives_ok(
  $$
    insert into public.payroll_adjustments (
      organization_id, payroll_period_id, delta_cents, reason, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', (select id from test_period_loc_a), -1000,
      'Advance deduction', '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '60. Loc A manager can record negative adjustment on Loc A period'
);

-- Loc A manager CANNOT record adjustment on Loc B period
select throws_ok(
  format($$
    insert into public.payroll_adjustments (
      organization_id, payroll_period_id, delta_cents, reason, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', %s, 1000, 'Cross branch adjustment attempt',
      '00000000-0000-0000-0000-000000021003'
    )
  $$, (select id from test_period_loc_b)),
  '42501',
  null,
  '61. Loc A manager cannot record adjustment on Loc B period'
);

-- Zero delta adjustment rejected by check constraint
select throws_ok(
  $$
    insert into public.payroll_adjustments (
      organization_id, payroll_period_id, delta_cents, reason, created_by
    ) values (
      '00000000-0000-0000-0000-000000021101', (select id from test_period_loc_a), 0,
      'Zero delta test', '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '23514',
  null,
  '62. Zero delta adjustment rejected by check constraint'
);

-- =============================================================================
-- PART 8: BACKEND MODULE ENFORCEMENT (3 tests)
-- =============================================================================

-- Reset role to postgres and clear claim to act as platform operator
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Reconcile any missing modules across all locations for readiness
insert into public.location_module_configs (location_id, module_key, is_enabled)
select loc.id, k, true
from public.locations loc
cross join unnest(enum_range(null::public.location_module_key)) k
where loc.active and loc.archived_at is null
on conflict (location_id, module_key) do nothing;

-- Set enforcement mode to active
update public.module_enforcement_settings
set mode = 'active', activation_reference = 'owner-approval-test-payroll';

-- Disable payroll on Loc A
update public.location_module_configs
set is_enabled = false
where location_id = '00000000-0000-0000-0000-000000021111'
  and module_key = 'payroll';

-- Loc A manager attempts to insert period on Loc A -> blocked by module enforcement
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select throws_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111',
      2108, '2026-11-01', 50, 1600, 80000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '42501',
  null,
  '63. Module enforcement blocks period insert when payroll is disabled'
);

-- Re-enable payroll on Loc A
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.location_module_configs
set is_enabled = true
where location_id = '00000000-0000-0000-0000-000000021111'
  and module_key = 'payroll';

-- Loc A manager inserts period on Loc A -> succeeds
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select lives_ok(
  $$
    insert into public.payroll_periods (
      organization_id, location_id, neon_user_id, period_month,
      hours_snapshot, rate_cents_snapshot, gross_cents, generated_by
    ) values (
      '00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021111',
      2108, '2026-11-01', 50, 1600, 80000, '00000000-0000-0000-0000-000000021003'
    )
  $$,
  '64. Period insert succeeds when payroll module is enabled'
);

select is(
  (select count(*)::int from public.payroll_periods where neon_user_id = 2108 and period_month = '2026-11-01'),
  1,
  '65. Period successfully persisted in database'
);

rollback;
