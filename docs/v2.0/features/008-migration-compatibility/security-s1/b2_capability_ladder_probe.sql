-- V2-008 Batch B2: measured capability of the D-2 role ladder, BEFORE vs AFTER the location row.
-- Read-only in effect: everything happens inside a transaction that is rolled back.
--
--   docker exec -i <db container> psql -U postgres -X -q -At -F '|' < b2_capability_ladder_probe.sql
--
-- One organization with exactly ONE active location. Five members with one legacy role each.
-- "before" = no location_memberships row exists in the organization (legacy fallback state).
-- "after"  = the complete, atomic ladder backfill (owner/GM -> manager, shift -> assistant_manager,
--            host/server -> staff). Also measured: the PARTIAL state (only the owner has a row) to
--            show the fallback cliff the atomic rule exists to prevent.
-- Output columns: state | legacy_role | function | level
begin;

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

create function pg_temp.levels(p_state text) returns table (state text, legacy_role text, fn text, lvl int)
language sql as $$
  select p_state, m.roles[1]::text, f.name,
    case f.name
      when 'schedule'   then private.schedule_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
      when 'tasks'      then private.tasks_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
      when 'tips'       then private.tips_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
      when 'attendance' then private.attendance_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
      when 'payroll'    then private.payroll_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
      when 'inventory'  then private.inventory_profile_level(m.organization_id, '00000000-0000-4000-8000-0000000b2201', m.profile_id)
    end
  from public.memberships m
  cross join (values ('schedule'),('tasks'),('tips'),('attendance'),('payroll'),('inventory')) as f(name)
  where m.organization_id = '00000000-0000-4000-8000-0000000b2101'
$$;

-- The functions read auth.uid()-independent inputs (org, location, profile), so no JWT is needed.
select * from pg_temp.levels('before') order by 2, 3;

-- PARTIAL state: only the owner gets a row (the first row removes the fallback for everyone else).
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2001', 'manager', true);
select * from pg_temp.levels('partial') order by 2, 3;

-- COMPLETE ladder.
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2002', 'manager', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2003', 'assistant_manager', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2004', 'staff', true),
  ('00000000-0000-4000-8000-0000000b2201', '00000000-0000-4000-8000-0000000b2005', 'staff', true);
select * from pg_temp.levels('after') order by 2, 3;

rollback;
