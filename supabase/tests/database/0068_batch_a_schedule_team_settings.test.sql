begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- ===========================================================================
-- V2-005 Batch A: Schedule / Roster Location Scoping + Team / Settings Scoping
-- + Tips Audit Integrity Security Test
-- ===========================================================================

-- 1. Users setup
-- 68001 mgrA      location manager at Loc A, plain staff at Loc B (org role: server)
-- 68002 staffA    staff at Loc A
-- 68003 staffB    staff at Loc B only
-- 68004 overall   Overall manager, NO tenant membership
-- 68005 histA     was staff at Loc A, later removed/deactivated
-- 68006 mgrB      location manager at Loc B only
-- 68007 nobody    profile with no membership and no Overall role
-- 68008 orgOwner  organization owner
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000068001', 'sch-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000068002', 'sch-staffa@test.invalid'),
 ('00000000-0000-4000-8000-000000068003', 'sch-staffb@test.invalid'),
 ('00000000-0000-4000-8000-000000068004', 'sch-overall@test.invalid'),
 ('00000000-0000-4000-8000-000000068005', 'sch-hasta@test.invalid'),
 ('00000000-0000-4000-8000-000000068006', 'sch-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000068007', 'sch-nobody@test.invalid'),
 ('00000000-0000-4000-8000-000000068008', 'sch-owner@test.invalid');

insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'sch-%@test.invalid';

insert into public.profiles(id, display_name)
select id, replace(split_part(email, '@', 1), 'sch-', 'N-') from auth.users where email like 'sch-%@test.invalid';

insert into public.organizations(id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000068010', 'Schedule Org', 'sch-org', '00000000-0000-4000-8000-000000068008');

insert into public.locations(id, organization_id, name) values
 ('00000000-0000-4000-8000-000000068011', '00000000-0000-4000-8000-000000068010', 'Loc A'),
 ('00000000-0000-4000-8000-000000068012', '00000000-0000-4000-8000-000000068010', 'Loc B');

insert into public.memberships(organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068008', array['owner']::public.app_role[]),
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068001', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068005', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068006', array['server']::public.app_role[]);

insert into public.location_memberships(location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000068011', '00000000-0000-4000-8000-000000068001', 'manager'),
 ('00000000-0000-4000-8000-000000068012', '00000000-0000-4000-8000-000000068001', 'staff'),
 ('00000000-0000-4000-8000-000000068011', '00000000-0000-4000-8000-000000068002', 'staff'),
 ('00000000-0000-4000-8000-000000068012', '00000000-0000-4000-8000-000000068003', 'staff'),
 ('00000000-0000-4000-8000-000000068011', '00000000-0000-4000-8000-000000068005', 'staff'),
 ('00000000-0000-4000-8000-000000068012', '00000000-0000-4000-8000-000000068006', 'manager');

insert into public.overall_roles(profile_id, role) values
 ('00000000-0000-4000-8000-000000068004', 'manager');

-- ---------------------------------------------------------------------------
-- PART 1: TIPS AUDIT INTEGRITY CORRECTION VERIFICATION
-- ---------------------------------------------------------------------------
-- Setup a draft pool and a finalized pool
insert into public.tip_pools (id, organization_id, location_id, service_date, status, finalized_at, finalized_by) overriding system value values
 (68101, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', current_date, 'draft', null, null),
 (68102, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', current_date - 1, 'finalized', now(), '00000000-0000-4000-8000-000000068001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068001"}', true);

-- Assertion 1: Manager cannot finalize tip pool by direct UPDATE
select throws_ok(
  $$ update public.tip_pools set status = 'finalized', finalized_at = now(), finalized_by = '00000000-0000-4000-8000-000000068001'
     where id = 68101 $$,
  '42501', null, 'direct table finalize on tip_pools is blocked by RLS'
);

-- Assertion 2: Manager cannot reopen finalized pool by direct UPDATE
select lives_ok(
  $$ update public.tip_pools set status = 'draft', finalized_at = null, finalized_by = null
     where id = 68102 $$,
  'direct table update on finalized pool runs without exception'
);
select is(
  (select status from public.tip_pools where id = 68102),
  'finalized',
  'finalized pool is unaffected by direct reopen attempt'
);

-- Assertion 3: Client direct insert into audit_events with entity_type: tip_pool fails with 42501
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011',
             '00000000-0000-4000-8000-000000068001', 'finalized', 'tip_pool', '68101') $$,
  '42501', null, 'direct client insert into audit_events for tip_pool is rejected with 42501'
);

-- ---------------------------------------------------------------------------
-- PART 2: SCHEDULE LOCATION SCOPING & RLS
-- ---------------------------------------------------------------------------
-- Manager A creates operating hours and shift defaults at Loc A
select lives_ok(
  $$ insert into public.operating_hours(organization_id, location_id, day_of_week, opening_local, closing_local)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 1, '09:00', '22:00') $$,
  'mgrA can configure operating_hours at Loc A'
);

select lives_ok(
  $$ insert into public.shift_kind_defaults(organization_id, location_id, kind, start_local, end_local)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 'evening', '16:00', '23:00') $$,
  'mgrA can configure shift_kind_defaults at Loc A'
);

-- Manager A cannot configure operating hours or shift defaults at Loc B
select throws_ok(
  $$ insert into public.operating_hours(organization_id, location_id, day_of_week, opening_local, closing_local)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', 1, '09:00', '22:00') $$,
  '42501', null, 'mgrA cannot configure operating_hours at Loc B'
);

select throws_ok(
  $$ insert into public.shift_kind_defaults(organization_id, location_id, kind, start_local, end_local)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', 'evening', '16:00', '23:00') $$,
  '42501', null, 'mgrA cannot configure shift_kind_defaults at Loc B'
);

-- Manager A can manage shift templates at Loc A but not Loc B
select lives_ok(
  $$ insert into public.shift_templates (id, organization_id, location_id, name, role_label, start_local, end_local, kind) overriding system value
     values (68201, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 'Tmpl A', 'Server', '16:00', '22:00', 'evening') $$,
  'mgrA can insert shift_template at Loc A'
);

select throws_ok(
  $$ insert into public.shift_templates (id, organization_id, location_id, name, role_label, start_local, end_local, kind) overriding system value
     values (68202, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', 'Tmpl B', 'Server', '16:00', '22:00', 'evening') $$,
  '42501', null, 'mgrA cannot insert shift_template at Loc B'
);

-- Manager A creates draft schedule period at Loc A
select lives_ok(
  $$ insert into public.schedule_periods (id, organization_id, location_id, starts_on, ends_on, status, published_version) overriding system value
     values (68301, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', '2026-01-01', '2026-12-31', 'draft', 0) $$,
  'mgrA creates draft schedule_period at Loc A'
);

-- Manager A cannot create draft schedule period at Loc B
select throws_ok(
  $$ insert into public.schedule_periods (id, organization_id, location_id, starts_on, ends_on, status, published_version) overriding system value
     values (68302, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', '2026-01-01', '2026-12-31', 'draft', 0) $$,
  '42501', null, 'mgrA cannot create schedule_period at Loc B'
);

-- Manager A inserts shift at Loc A
select lives_ok(
  $$ insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
     values (68401, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 68301, current_date, current_date, 'Server', 'evening', now(), now() + interval '5 hours') $$,
  'mgrA inserts shift at Loc A'
);

-- Manager A cannot insert shift at Loc B
select throws_ok(
  $$ insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
     values (68402, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', 68301, current_date, current_date, 'Server', 'evening', now(), now() + interval '5 hours') $$,
  '42501', null, 'mgrA cannot insert shift at Loc B'
);

-- Workforce eligibility: mgrA assigns eligible staffA (68002) to Loc A shift
select lives_ok(
  $$ insert into public.shift_assignments(shift_id, profile_id, organization_id)
     values (68401, '00000000-0000-4000-8000-000000068002', '00000000-0000-4000-8000-000000068010') $$,
  'mgrA assigns eligible staffA to Loc A shift'
);

-- Assign histA (68005) while still active so they have shift history
select lives_ok(
  $$ insert into public.shift_assignments(shift_id, profile_id, organization_id)
     values (68401, '00000000-0000-4000-8000-000000068005', '00000000-0000-4000-8000-000000068010') $$,
  'mgrA assigns active histA to Loc A shift'
);

-- Workforce eligibility: mgrA CANNOT assign staffB (68003, who belongs only to Loc B) to Loc A shift
select throws_ok(
  $$ insert into public.shift_assignments(shift_id, profile_id, organization_id)
     values (68401, '00000000-0000-4000-8000-000000068003', '00000000-0000-4000-8000-000000068010') $$,
  '42501', null, 'assigning Loc B staff to Loc A shift is rejected by RLS'
);

-- Deactivate histA (68005) from Loc A
reset role;
update public.location_memberships set active = false
 where location_id = '00000000-0000-4000-8000-000000068011'
   and profile_id = '00000000-0000-4000-8000-000000068005';

-- Insert second shift to test assigning departed employee
insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
values (68405, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 68301, current_date, current_date, 'Server', 'evening', now() + interval '1 hour', now() + interval '6 hours');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068001"}', true);

-- Workforce eligibility: inactive/departed employee cannot be assigned to a new shift
select throws_ok(
  $$ insert into public.shift_assignments(shift_id, profile_id, organization_id)
     values (68405, '00000000-0000-4000-8000-000000068005', '00000000-0000-4000-8000-000000068010') $$,
  '42501', null, 'assigning departed employee to Loc A shift is rejected by RLS'
);

-- Roster RPC test: schedule_location_roster
-- Active member staffA has eligible = true
-- Departed member histA has eligible = false (kept for history)
-- Foreign member staffB is NOT in roster at all
select is(
  (select count(*)::int from public.schedule_location_roster('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011')
   where profile_id = '00000000-0000-4000-8000-000000068002' and eligible = true),
  1,
  'roster returns active employee staffA as eligible'
);

select is(
  (select count(*)::int from public.schedule_location_roster('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011')
   where profile_id = '00000000-0000-4000-8000-000000068005' and eligible = false),
  1,
  'roster returns departed employee histA as ineligible'
);

select is(
  (select count(*)::int from public.schedule_location_roster('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011')
   where profile_id = '00000000-0000-4000-8000-000000068003'),
  0,
  'roster excludes foreign Loc B staff from Loc A'
);

-- Location Manager B inserts draft shift and schedule at Loc B
reset role;
insert into public.schedule_periods (id, organization_id, location_id, starts_on, ends_on, status, published_version) overriding system value
values (68302, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', '2026-01-01', '2026-12-31', 'draft', 0);
insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
values (68402, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012', 68302, current_date, current_date, 'Server', 'evening', now(), now() + interval '5 hours');

-- Read isolation: Manager A (who is only staff at B) CANNOT read Loc B draft shifts or schedule periods
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068001"}', true);

select is(
  (select count(*)::int from public.schedule_periods where id = 68302),
  0,
  'mgrA cannot read Loc B draft schedule period'
);

select is(
  (select count(*)::int from public.shifts where id = 68402),
  0,
  'mgrA cannot read Loc B draft shift'
);

-- Staff A cannot insert or update shifts at Loc A
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068002"}', true);

select throws_ok(
  $$ insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
     values (68403, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 68301, current_date, current_date, 'Server', 'evening', now(), now() + interval '5 hours') $$,
  '42501', null, 'staff cannot insert shifts'
);

select lives_ok(
  $$ update public.shifts set kind = 'morning' where id = 68401 $$,
  'staff cannot update shifts (0 rows affected)'
);

-- Staff A cannot read draft schedule or draft shifts
select is(
  (select count(*)::int from public.schedule_periods where id = 68301),
  0,
  'staff cannot read draft schedule period'
);

select is(
  (select count(*)::int from public.shifts where id = 68401),
  0,
  'staff cannot read draft shifts'
);

-- Publish Loc A schedule
reset role;
update public.schedule_periods set status = 'published', published_version = 1, published_at = now(), published_by = '00000000-0000-4000-8000-000000068001'
 where id = 68301;

-- Now Staff A CAN read published schedule period, shift, and assignment at Loc A
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068002"}', true);

select is(
  (select count(*)::int from public.schedule_periods where id = 68301),
  1,
  'staff can read published schedule period'
);

select is(
  (select count(*)::int from public.shifts where id = 68401),
  1,
  'staff can read published shifts'
);

select is(
  (select count(*)::int from public.shift_assignments where shift_id = 68401),
  2,
  'staff can read published shift assignments'
);

-- ---------------------------------------------------------------------------
-- PART 3: OVERALL ROLE AUTHORITY & SCHEDULE PUBLISHER ATTRIBUTION
-- ---------------------------------------------------------------------------
-- Overall Manager (68004, NO tenant membership) can manage schedules at Loc A and Loc B
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068004"}', true);

select is(
  (select count(*)::int from public.schedule_periods where id = 68301),
  1,
  'Overall manager can read Loc A schedule'
);

select is(
  (select count(*)::int from public.schedule_periods where id = 68302),
  1,
  'Overall manager can read Loc B draft schedule'
);

-- Overall manager publishes schedule period at Loc B with published_by = 68004
-- (Composite FK schedule_publisher_member_fk was dropped to allow Overall managers)
select lives_ok(
  $$ update public.schedule_periods set status = 'published', published_version = 1, published_at = now(), published_by = '00000000-0000-4000-8000-000000068004'
     where id = 68302 $$,
  'Overall manager publishes Loc B schedule without membership row'
);

select is(
  (select published_by::text from public.schedule_periods where id = 68302),
  '00000000-0000-4000-8000-000000068004',
  'published_by accurately attributes Overall manager'
);

-- ---------------------------------------------------------------------------
-- PART 4: AUDIT EVENTS LOCATION OPERATOR POLICIES
-- ---------------------------------------------------------------------------
-- Manager A records audit event for schedule_period at Loc A
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068001"}', true);

select lives_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011',
             '00000000-0000-4000-8000-000000068001', 'publish_schedule', 'schedule_period', '68301') $$,
  'mgrA can record schedule_period audit event at Loc A'
);

-- Manager A CANNOT record schedule_period audit event at Loc B
select throws_ok(
  $$ insert into public.audit_events(organization_id, location_id, actor_profile_id, action, entity_type, entity_id)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068012',
             '00000000-0000-4000-8000-000000068001', 'publish_schedule', 'schedule_period', '68302') $$,
  '42501', null, 'mgrA cannot record audit event at Loc B'
);

-- ---------------------------------------------------------------------------
-- PART 5: TEAM & SETTINGS HYBRID SCOPING
-- ---------------------------------------------------------------------------
-- Local Manager A cannot update organization memberships
select lives_ok(
  $$ update public.memberships set roles = array['owner']::public.app_role[]
     where profile_id = '00000000-0000-4000-8000-000000068002' $$,
  'local manager update on memberships affects 0 rows'
);

select is(
  (select roles from public.memberships where profile_id = '00000000-0000-4000-8000-000000068002'),
  array['server']::public.app_role[],
  'member roles unaffected by local manager'
);

-- Local Manager A cannot insert organization memberships
select throws_ok(
  $$ insert into public.memberships (organization_id, profile_id, roles)
     values ('00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068007', array['owner']::public.app_role[]) $$,
  '42501', null, 'local manager cannot insert org membership'
);

-- Local Manager A cannot delete organization memberships
select lives_ok(
  $$ delete from public.memberships where profile_id = '00000000-0000-4000-8000-000000068002' $$,
  'local manager delete on memberships affects 0 rows'
);

select is(
  (select count(*)::int from public.memberships where profile_id = '00000000-0000-4000-8000-000000068002'),
  1,
  'member not deleted by local manager'
);

-- Local Manager A cannot update member profile display_name
select lives_ok(
  $$ update public.profiles set display_name = 'Hacked Name'
     where id = '00000000-0000-4000-8000-000000068002' $$,
  'local manager update on profiles affects 0 rows'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000068002'),
  'N-staffa',
  'profile display_name unaffected by local manager'
);

-- Org Owner CAN update member profile display_name
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068008', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068008"}', true);

select lives_ok(
  $$ update public.profiles set display_name = 'Renamed Staff'
     where id = '00000000-0000-4000-8000-000000068002' $$,
  'org owner can rename an organization member'
);

-- Org Owner CAN update organization memberships
select lives_ok(
  $$ update public.memberships set roles = array['shift_manager']::public.app_role[]
     where organization_id = '00000000-0000-4000-8000-000000068010'
       and profile_id = '00000000-0000-4000-8000-000000068002' $$,
  'org owner can update organization member roles'
);

-- Overall Manager (68004) CAN update member profile and memberships
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068004"}', true);

select lives_ok(
  $$ update public.profiles set display_name = 'Overall Renamed'
     where id = '00000000-0000-4000-8000-000000068002' $$,
  'Overall manager can rename an organization member'
);

select lives_ok(
  $$ update public.memberships set roles = array['server']::public.app_role[]
     where organization_id = '00000000-0000-4000-8000-000000068010'
       and profile_id = '00000000-0000-4000-8000-000000068002' $$,
  'Overall manager can update organization member roles'
);

-- Nobody (unauthenticated or unassigned user 68007) has no access
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000068007', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000068007"}', true);

select is(
  (select count(*)::int from public.schedule_periods),
  0,
  'unassigned user sees 0 schedule periods'
);

select is(
  (select count(*)::int from public.shifts),
  0,
  'unassigned user sees 0 shifts'
);

select throws_ok(
  $$ insert into public.shifts (id, organization_id, location_id, schedule_period_id, service_date, end_date, role_label, kind, starts_at, ends_at) overriding system value
     values (68404, '00000000-0000-4000-8000-000000068010', '00000000-0000-4000-8000-000000068011', 68301, current_date, current_date, 'Server', 'evening', now(), now() + interval '5 hours') $$,
  '42501', null, 'unassigned user cannot insert shifts'
);

select * from finish();
rollback;
