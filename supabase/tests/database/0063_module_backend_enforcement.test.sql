begin;

create extension if not exists pgtap with schema extensions;

select plan(59);

-- --------------------------------------------------------------------------
-- V2-004.004 Per-Location Backend Module Enforcement (0063 namespace)
--
-- Actors
--   ...630000 Org A owner         ...630001 Org A server (staff)
--   ...630002 Org B owner         ...630003 Org A general manager, membership REVOKED
-- Organizations: A (locations A1, A2) and B (location B1)
--   A1: tasks / table_allocation / bar_inventory ENABLED; schedule / tips DISABLED
--   A2: schedule / tips ENABLED; tasks / table_allocation / bar_inventory DISABLED
--   B1: no rows at first (the activation gate must refuse), completed later
-- --------------------------------------------------------------------------

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000630' || lpad(n::text, 2, '0'))::uuid, 'u63' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(0, 3) n;

insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000630' || lpad(n::text, 2, '0'))::uuid, 'User 63' || n
from generate_series(0, 3) n;

insert into public.organizations (id, name, slug, created_by, settings)
values
  ('00000000-0000-0000-0000-0000000630a1'::uuid, 'Org A 63', 'org-a-63', '00000000-0000-0000-0000-000000063000'::uuid, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, 'Org B 63', 'org-b-63', '00000000-0000-0000-0000-000000063002'::uuid, '{}'::jsonb);

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063000'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063001'::uuid, array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a2'::uuid, '00000000-0000-0000-0000-000000063002'::uuid, array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000630a1'::uuid, '00000000-0000-0000-0000-000000063003'::uuid, array['general_manager']::public.app_role[], false);

insert into public.locations (id, organization_id, name, time_zone, address)
values
  ('00000000-0000-0000-0000-0000000630b1'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'A1', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000630b2'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'A2', 'America/Chicago', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000630b3'::uuid, '00000000-0000-0000-0000-0000000630a2'::uuid, 'B1', 'America/Chicago', '{}'::jsonb);

-- #306 requires explicit operational assignments independently of module state.
insert into public.location_memberships (location_id, profile_id, role)
values
  ('00000000-0000-0000-0000-0000000630b1', '00000000-0000-0000-0000-000000063000', 'manager'),
  ('00000000-0000-0000-0000-0000000630b2', '00000000-0000-0000-0000-000000063000', 'manager'),
  ('00000000-0000-0000-0000-0000000630b1', '00000000-0000-0000-0000-000000063001', 'staff'),
  ('00000000-0000-0000-0000-0000000630b2', '00000000-0000-0000-0000-000000063001', 'staff'),
  ('00000000-0000-0000-0000-0000000630b3', '00000000-0000-0000-0000-000000063002', 'manager');

-- Explicit per-module decisions (A1 / A2). Every key has a row.
insert into public.location_module_configs (location_id, module_key, is_enabled)
select '00000000-0000-0000-0000-0000000630b1'::uuid, k,
       k in ('tasks', 'table_allocation', 'bar_inventory', 'team', 'payroll', 'recipes')
from unnest(enum_range(null::public.location_module_key)) k;
insert into public.location_module_configs (location_id, module_key, is_enabled)
select '00000000-0000-0000-0000-0000000630b2'::uuid, k,
       k in ('schedule', 'tips', 'team', 'payroll', 'recipes')
from unnest(enum_range(null::public.location_module_key)) k;

insert into public.service_sessions (id, organization_id, location_id, service_date, meal_period, status)
overriding system value
values
  (963101, '00000000-0000-0000-0000-0000000630a1', '00000000-0000-0000-0000-0000000630b1', (now() at time zone 'America/Chicago')::date, 'service', 'active'),
  (963102, '00000000-0000-0000-0000-0000000630a1', '00000000-0000-0000-0000-0000000630b2', (now() at time zone 'America/Chicago')::date, 'service', 'active');

create function pg_temp.affected(p_sql text) returns int
language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end
$f$;
grant execute on function pg_temp.affected(text) to authenticated;

create temp table snap_config as
select count(*)::int as n from public.location_module_configs
where location_id in ('00000000-0000-0000-0000-0000000630b1', '00000000-0000-0000-0000-0000000630b2', '00000000-0000-0000-0000-0000000630b3');
grant select on snap_config to authenticated;

-- ======================= STAGED (the migration default) =====================
select is((select count(*)::int from public.module_enforcement_settings), 1, 'BE-DB-01: exactly one activation row exists');
select is((select mode from public.module_enforcement_settings), 'staged', 'BE-DB-02: the migration leaves enforcement STAGED (not active)');
select ok(private.location_module_allows('00000000-0000-0000-0000-0000000630b2', 'tasks'), 'BE-DB-03: staged mode allows an explicitly Disabled module (legacy behaviour preserved)');
select ok(private.location_module_allows('00000000-0000-0000-0000-0000000630b3', 'tasks'), 'BE-DB-04: staged mode allows a Missing module (legacy behaviour preserved)');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Staged at A2',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  'BE-DB-05: staged mode lets the owner create a task at a tasks-Disabled location'
);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Staged at A1',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  'BE-DB-06: staged mode lets the owner create a task at an enabled location'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- ======================= READINESS GATE =====================================
select is(
  (select ready from private.module_enforcement_readiness() where location_id = '00000000-0000-0000-0000-0000000630b3'),
  false, 'BE-DB-07: readiness reports the unconfigured location as NOT ready');
select is(
  (select cardinality(missing_keys) from private.module_enforcement_readiness() where location_id = '00000000-0000-0000-0000-0000000630b3'),
  (select count(*)::int from unnest(enum_range(null::public.location_module_key))),
  'BE-DB-08: every module key is reported missing for the unconfigured location');
select is(
  (select bool_and(ready) from private.module_enforcement_readiness() where location_id in ('00000000-0000-0000-0000-0000000630b1', '00000000-0000-0000-0000-0000000630b2')),
  true, 'BE-DB-09: fully configured locations (enabled OR disabled) are ready');
select is(
  (select cardinality(expected_keys) from private.module_enforcement_readiness() limit 1),
  (select count(*)::int from unnest(enum_range(null::public.location_module_key))),
  'BE-DB-10: expected keys equal the canonical enum (nine configurable modules)');

select throws_ok(
  $$update public.module_enforcement_settings set mode = 'active'$$,
  '55000', null, 'BE-DB-11: activation without an owner-approval reference is refused');
select throws_ok(
  $$update public.module_enforcement_settings set mode = 'active', activation_reference = 'owner-approval-test'$$,
  '55000', null, 'BE-DB-12: activation is refused while an active location is unconfigured');
select is((select mode from public.module_enforcement_settings), 'staged', 'BE-DB-13: a refused activation leaves the switch staged');
select is(
  (select count(*)::int from public.location_module_configs
   where location_id in ('00000000-0000-0000-0000-0000000630b1', '00000000-0000-0000-0000-0000000630b2', '00000000-0000-0000-0000-0000000630b3')),
  (select n from snap_config), 'BE-DB-14: readiness and the refused activation wrote no configuration row (never backfills)');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select throws_ok($$update public.module_enforcement_settings set mode = 'active', activation_reference = 'x'$$, '42501', null, 'BE-DB-15: an authenticated owner cannot flip the switch');
select throws_ok($$delete from public.module_enforcement_settings$$, '42501', null, 'BE-DB-16: an authenticated owner cannot delete the switch');
select is((select count(*)::int from public.module_enforcement_settings), 1, 'BE-DB-17: authenticated users can read the (non-secret) mode');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$delete from public.module_enforcement_settings$$, '55000', null, 'BE-DB-18: even a privileged delete of the switch is refused');

-- Complete the estate: B1 gets explicit rows (tasks enabled, the rest disabled).
insert into public.location_module_configs (location_id, module_key, is_enabled)
select '00000000-0000-0000-0000-0000000630b3'::uuid, k, k = 'tasks'
from unnest(enum_range(null::public.location_module_key)) k;
select is((select count(*)::int from private.module_enforcement_readiness() r where not r.ready), 0, 'BE-DB-19: with every active location configured the estate is ready');

select lives_ok(
  $$update public.module_enforcement_settings set mode = 'active', activation_reference = 'owner-approval-test'$$,
  'BE-DB-20: activation succeeds only once the estate is fully reconciled');
select is((select mode from public.module_enforcement_settings), 'active', 'BE-DB-21: switch is now active');
select ok((select activated_at is not null and activation_reference = 'owner-approval-test' from public.module_enforcement_settings), 'BE-DB-22: activation time and approval reference are recorded');

-- ======================= ACTIVE: DECISION HELPERS ===========================
select ok(private.location_module_allows('00000000-0000-0000-0000-0000000630b1', 'tasks'), 'BE-DB-23: explicit Enabled is allowed');
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630b1', 'schedule'), 'BE-DB-24: explicit Disabled is denied');
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630b2', 'tasks'), 'BE-DB-25: another location''s Enabled row grants nothing (A1 tasks on, A2 tasks off)');
select ok(not private.location_module_allows(null, 'tasks'), 'BE-DB-26: a NULL location is denied');
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630ff', 'tasks'), 'BE-DB-27: an unknown location is denied');

-- A location provisioned AFTER activation has no rows: Missing is denied.
insert into public.locations (id, organization_id, name, time_zone, address)
values ('00000000-0000-0000-0000-0000000630b4'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'A4 new', 'America/Chicago', '{}'::jsonb);
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630b4', 'tasks'), 'BE-DB-28: Missing (no row) is denied when active');

-- A fully Enabled location that is then deactivated is denied.
insert into public.locations (id, organization_id, name, time_zone, address)
values ('00000000-0000-0000-0000-0000000630b5'::uuid, '00000000-0000-0000-0000-0000000630a1'::uuid, 'A5 inactive', 'America/Chicago', '{}'::jsonb);
insert into public.location_module_configs (location_id, module_key, is_enabled)
select '00000000-0000-0000-0000-0000000630b5'::uuid, k, true from unnest(enum_range(null::public.location_module_key)) k;
select ok(private.location_module_allows('00000000-0000-0000-0000-0000000630b5', 'tasks'), 'BE-DB-29: an Enabled active location is allowed');
update public.locations set active = false where id = '00000000-0000-0000-0000-0000000630b5';
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630b5', 'tasks'), 'BE-DB-30: an Enabled but inactive location is denied');

-- ======================= ACTIVE: RPC SEAMS ==================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select lives_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Active at A1',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  'BE-DB-31: task RPC works at a tasks-Enabled location');
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Active at A2',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-32: task RPC is denied at a tasks-Disabled location');
select throws_ok(
  $$select public.checklist_generate_daily('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2')$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-33: checklist/recurrence RPCs share the same seam');
select lives_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Vendor A1',null)$$,
  'BE-DB-34: inventory RPC works at a bar_inventory-Enabled location');
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Vendor A2',null)$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-35: inventory RPC is denied at a bar_inventory-Disabled location');
select throws_ok(
  $$select public.board_add_row('00000000-0000-0000-0000-0000000630a1'::uuid, 963102)$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-36: board RPC is denied at a table_allocation-Disabled location');
select throws_ok(
  $$select public.board_clear_board('00000000-0000-0000-0000-0000000630a1'::uuid, 963102)$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-37: every board_* RPC shares the begin_board_write seam');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*)::int from public.tasks where location_id = '00000000-0000-0000-0000-0000000630b2' and title = 'Active at A2'), 0, 'BE-DB-38: a denied task RPC changed nothing');
select is((select count(*)::int from public.inventory_vendors where organization_id = '00000000-0000-0000-0000-0000000630a1' and name = 'Vendor A2'), 0, 'BE-DB-39: a denied inventory RPC changed nothing');

-- Existing authorization is not replaced: Enabled grants no rights, and an
-- unauthorized caller learns nothing about module state.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063001', true);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Staff try',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'Only an owner, manager or assistant manager can do that.', 'BE-DB-40: Enabled does not make staff a manager (role check still decides)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063002', true);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Foreign try',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'You do not have access to tasks for this location.', 'BE-DB-41: a foreign-organization caller gets the access error, not module state');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Authorization is untouched by the module check.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063003', true);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Revoked try',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'You do not have access to tasks for this location.', 'BE-DB-55: a REVOKED membership is denied by the existing check even at an Enabled location');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b3','Wrong location',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'You do not have access to tasks for this location.', 'BE-DB-56: a location of another organization is refused even though that location has tasks Enabled');
select throws_ok(
  $$select public.task_create('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b5','Inactive try',null,'other','normal','all_team','{}',false,null,null,null,null)$$,
  '42501', 'This module is turned off for this location.', 'BE-DB-57: an INACTIVE location is denied operationally even with every module Enabled');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.locations set archived_at = now() where id = '00000000-0000-0000-0000-0000000630b5';
select ok(not private.location_module_allows('00000000-0000-0000-0000-0000000630b5', 'tasks'), 'BE-DB-58: an ARCHIVED location is denied operationally even with every module Enabled');

-- ======================= ACTIVE: DIRECT TABLE ACCESS ========================
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000063000', true);
select lives_ok(
  $$insert into public.dining_areas (organization_id, location_id, name) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Patio A1')$$,
  'BE-DB-42: direct PostgREST write works where table_allocation is Enabled');
select throws_ok(
  $$insert into public.dining_areas (organization_id, location_id, name) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Patio A2')$$,
  '42501', null, 'BE-DB-43: direct PostgREST write is denied where table_allocation is Disabled');
select lives_ok(
  $$insert into public.shift_templates (organization_id, location_id, name, role_label, start_local, end_local) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2','Dinner','server','17:00','22:00')$$,
  'BE-DB-44: direct schedule write works where schedule is Enabled');
select throws_ok(
  $$insert into public.shift_templates (organization_id, location_id, name, role_label, start_local, end_local) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1','Dinner','server','17:00','22:00')$$,
  '42501', null, 'BE-DB-45: direct schedule write is denied where schedule is Disabled');
select lives_ok(
  $$insert into public.tip_pools (organization_id, location_id, service_date) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b2', current_date)$$,
  'BE-DB-46: direct tips write works where tips is Enabled');
select throws_ok(
  $$insert into public.tip_pools (organization_id, location_id, service_date) values ('00000000-0000-0000-0000-0000000630a1','00000000-0000-0000-0000-0000000630b1', current_date + 1)$$,
  '42501', null, 'BE-DB-47: direct tips write is denied where tips is Disabled');

select is((select count(*)::int from public.tasks where location_id = '00000000-0000-0000-0000-0000000630b2'), 0, 'BE-DB-48: protected reads hide a Disabled location''s tasks (the staged-era row is invisible)');
select ok((select count(*)::int from public.tasks where location_id = '00000000-0000-0000-0000-0000000630b1') >= 2, 'BE-DB-49: the Enabled location''s tasks stay visible');
select is(pg_temp.affected($$update public.location_module_configs set is_enabled = true where location_id = '00000000-0000-0000-0000-0000000630b2' and module_key = 'tasks'$$), 1, 'BE-DB-50: module settings stay manageable while the module is Disabled (system path not gated)');
select is((select count(*)::int from public.location_module_configs where location_id = '00000000-0000-0000-0000-0000000630b2'), 9, 'BE-DB-51: configuration remains readable at a location whose modules are Disabled');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Shared organization data is neither gated nor deleted by a module toggle.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and policyname like '%_module_enforcement'
     and (tablename like 'bar_recipe%' or tablename in ('inventory_vendors', 'inventory_products', 'inventory_categories', 'inventory_subcategories', 'organizations', 'memberships', 'profiles', 'locations', 'location_module_configs', 'operating_hours'))),
  0, 'BE-DB-59: the recipe book, the inventory catalog and Settings/identity tables carry no module policy');

-- ======================= REVERSIBILITY ======================================
update public.module_enforcement_settings set mode = 'staged';
select is((select mode from public.module_enforcement_settings), 'staged', 'BE-DB-52: the switch can be returned to staged (reversible)');
select is((select activated_at is null and activation_reference is null from public.module_enforcement_settings), true, 'BE-DB-53: returning to staged clears the activation evidence');
-- A4 (provisioned after activation) was never configured: re-activation must refuse again.
select throws_ok(
  $$update public.module_enforcement_settings set mode = 'active', activation_reference = 'owner-approval-test-2'$$,
  '55000', null, 'BE-DB-54: re-activation is refused while a newly provisioned location is unconfigured');

select * from finish();
rollback;
