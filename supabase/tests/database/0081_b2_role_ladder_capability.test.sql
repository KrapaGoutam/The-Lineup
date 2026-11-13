begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ===========================================================================
-- V2-008 Batch B2: the D-2 role ladder preserves effective capability, and the PARTIAL state
-- (the P0 fallback cliff) does not. These rows are MEASURED from the deployed *_profile_level
-- functions; src/features/migration-compat (scripts/migration-compat/capability-model.mjs) is a
-- model of them and is pinned to exactly these strings by a Vitest, so a change in either the
-- database or the model fails one of the two.
--
-- One organization, exactly ONE active location, five members with one legacy role each.
--   before  = no location_memberships row in the organization (legacy fallback state)
--   partial = only the owner has a row (what a half-finished backfill looks like)
--   after   = the complete atomic ladder (owner/GM -> manager, shift_manager -> assistant_manager,
--             host/server -> staff)
-- A level string is  att:inv:pay:sch:tas:tip  (attendance, inventory, payroll, schedule, tasks, tips).
-- ===========================================================================

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000b2001', 'b2-owner@test.invalid'),
  ('00000000-0000-4000-8000-0000000b2002', 'b2-gm@test.invalid'),
  ('00000000-0000-4000-8000-0000000b2003', 'b2-shift@test.invalid'),
  ('00000000-0000-4000-8000-0000000b2004', 'b2-host@test.invalid'),
  ('00000000-0000-4000-8000-0000000b2005', 'b2-server@test.invalid');
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users where email like 'b2-%@test.invalid';
insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-0000000b2101', 'B2 Org', 'b2-org', '00000000-0000-4000-8000-0000000b2001');
insert into public.locations (id, organization_id, name, time_zone) values
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2101', 'B2 Loc', 'America/Chicago');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-0000000b2101', '00000000-0000-4000-8000-0000000b2001', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-0000000b2101', '00000000-0000-4000-8000-0000000b2002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-0000000b2101', '00000000-0000-4000-8000-0000000b2003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-0000000b2101', '00000000-0000-4000-8000-0000000b2004', array['host']::public.app_role[], true),
  ('00000000-0000-4000-8000-0000000b2101', '00000000-0000-4000-8000-0000000b2005', array['server']::public.app_role[], true);

create function pg_temp.lv(p_role text) returns text language sql as $$
  select concat_ws(':',
    private.attendance_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id),
    private.inventory_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id),
    private.payroll_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id),
    private.schedule_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id),
    private.tasks_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id),
    private.tips_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id))
  from public.memberships m
  where m.organization_id = '00000000-0000-4000-8000-0000000b2101' and m.roles[1]::text = p_role
$$;

-- ---- before: legacy fallback state --------------------------------------------------------
select is(pg_temp.lv('owner'),           '4:4:4:4:4:4', 'LAD-01 before: owner');
select is(pg_temp.lv('general_manager'), '3:3:3:3:3:3', 'LAD-02 before: general_manager');
select is(pg_temp.lv('shift_manager'),   '2:2:2:2:2:2', 'LAD-03 before: shift_manager');
select is(pg_temp.lv('host'),            '1:1:1:1:1:1', 'LAD-04 before: host');
select is(pg_temp.lv('server'),          '1:1:1:1:1:1', 'LAD-05 before: server');

-- ---- partial: only the owner has a row => the cliff --------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2001', 'manager', true);
select is(pg_temp.lv('owner'),           '4:4:4:3:3:3', 'LAD-06 partial: owner keeps access (its own row)');
select is(pg_temp.lv('general_manager'), '3:3:3:3:0:0', 'LAD-07 partial: general_manager LOSES Tasks and Tips (the cliff)');
select is(pg_temp.lv('shift_manager'),   '2:2:2:0:0:0', 'LAD-08 partial: shift_manager loses Schedule, Tasks and Tips');
select is(pg_temp.lv('host'),            '1:1:1:0:0:0', 'LAD-09 partial: host loses Schedule, Tasks and Tips');
select is(pg_temp.lv('server'),          '1:1:1:0:0:0', 'LAD-10 partial: server loses Schedule, Tasks and Tips');

-- ---- after: the complete atomic ladder ---------------------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2002', 'manager', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2003', 'assistant_manager', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2004', 'staff', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2005', 'staff', true);
select is(pg_temp.lv('owner'),           '4:4:4:3:3:3', 'LAD-11 after: owner (Schedule/Tasks/Tips 4->3: no threshold in the product distinguishes 3 from 4)');
select is(pg_temp.lv('general_manager'), '3:3:3:3:3:3', 'LAD-12 after: general_manager identical to before');
select is(pg_temp.lv('shift_manager'),   '2:2:2:2:2:2', 'LAD-13 after: shift_manager identical to before');
select is(pg_temp.lv('host'),            '1:1:1:1:1:1', 'LAD-14 after: host identical to before');
select is(pg_temp.lv('server'),          '1:1:1:1:1:1', 'LAD-15 after: server identical to before');

-- ---- the complete ladder does not touch anything else -----------------------------------
select is((select count(*)::int from public.overall_roles), 0, 'LAD-16 the ladder creates no Overall role');
select is((select string_agg(distinct roles[1]::text, ',' order by roles[1]::text) from public.memberships where organization_id = '00000000-0000-4000-8000-0000000b2101'),
  'general_manager,host,owner,server,shift_manager', 'LAD-17 organization-level roles are untouched by the location rows');
select is((select count(*)::int from public.location_memberships lm join public.locations l on l.id = lm.location_id where l.organization_id = '00000000-0000-4000-8000-0000000b2101' and lm.active), 5, 'LAD-18 exactly one active row per member after the complete backfill');

select * from finish();
rollback;
