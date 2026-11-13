begin;
create extension if not exists pgtap with schema extensions;

-- V2-005 Batch B independent-review regressions (Inventory .006 + Recipes .007).
-- Complements 0069 (Antigravity) with the paths it did not exercise: effective role per
-- location, revoked / banned / inactive / dead-session callers, forged org+location pairs,
-- direct-RPC bypass of a second branch, decimal stock isolation with genuine attribution,
-- FK / grant / RLS invariants, Recipes cross-tenant + private-image paths, and ACTIVE
-- module enforcement.
--
-- Actors (org1 has TWO active locations A and B plus one archived location):
--   70001 mgrA        Location Manager A, Staff B          (org role server)
--   70002 mgrB        Location Manager B only
--   70003 staffB      Staff B only
--   70004 ovOwner     Overall Owner, NO tenant membership
--   70005 revoked     Location Manager A but org membership INACTIVE
--   70006 inactiveLm  org member; location manager A row INACTIVE
--   70007 gm          org general_manager (org-wide), no location rows
--   70008 banned      Location Manager A, auth.users.banned_until in the future
--   70010 foreign     owner of org2 only
--   70011 unassigned  org shift_manager in a multi-location org, NO assignment
--   70012 singleShift org shift_manager in a SINGLE-location org (org3), NO assignment
--   70013 ovAsst      Overall Assistant Manager, NO tenant membership
select plan(79);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000070001', 'rv-mgra@test.invalid'),
  ('00000000-0000-4000-8000-000000070002', 'rv-mgrb@test.invalid'),
  ('00000000-0000-4000-8000-000000070003', 'rv-staffb@test.invalid'),
  ('00000000-0000-4000-8000-000000070004', 'rv-ovowner@test.invalid'),
  ('00000000-0000-4000-8000-000000070005', 'rv-revoked@test.invalid'),
  ('00000000-0000-4000-8000-000000070006', 'rv-inactivelm@test.invalid'),
  ('00000000-0000-4000-8000-000000070007', 'rv-gm@test.invalid'),
  ('00000000-0000-4000-8000-000000070008', 'rv-banned@test.invalid'),
  ('00000000-0000-4000-8000-000000070010', 'rv-foreign@test.invalid'),
  ('00000000-0000-4000-8000-000000070011', 'rv-unassigned@test.invalid'),
  ('00000000-0000-4000-8000-000000070012', 'rv-singleshift@test.invalid'),
  ('00000000-0000-4000-8000-000000070013', 'rv-ovasst@test.invalid');

insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'rv-%@test.invalid';

insert into public.profiles (id, display_name)
select id, replace(split_part(email, '@', 1), 'rv-', 'RV-') from auth.users where email like 'rv-%@test.invalid';

insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000070101', 'RV Org 1', 'rv-org-1', '00000000-0000-4000-8000-000000070007'),
  ('00000000-0000-4000-8000-000000070102', 'RV Org 2', 'rv-org-2', '00000000-0000-4000-8000-000000070010'),
  ('00000000-0000-4000-8000-000000070103', 'RV Org 3', 'rv-org-3', '00000000-0000-4000-8000-000000070012');

insert into public.locations (id, organization_id, name, time_zone) values
  ('00000000-0000-4000-8000-000000070201', '00000000-0000-4000-8000-000000070101', 'RV Loc A', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000070202', '00000000-0000-4000-8000-000000070101', 'RV Loc B', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000070204', '00000000-0000-4000-8000-000000070102', 'RV Loc C', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000070205', '00000000-0000-4000-8000-000000070103', 'RV Loc D', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070001', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070002', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070003', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070005', array['server']::public.app_role[], false),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070006', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070007', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070008', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070011', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070102', '00000000-0000-4000-8000-000000070010', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000070103', '00000000-0000-4000-8000-000000070012', array['shift_manager']::public.app_role[], true);

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000070201', '00000000-0000-4000-8000-000000070001', 'manager', true),
  ('00000000-0000-4000-8000-000000070202', '00000000-0000-4000-8000-000000070001', 'staff', true),
  ('00000000-0000-4000-8000-000000070202', '00000000-0000-4000-8000-000000070002', 'manager', true),
  ('00000000-0000-4000-8000-000000070202', '00000000-0000-4000-8000-000000070003', 'staff', true),
  ('00000000-0000-4000-8000-000000070201', '00000000-0000-4000-8000-000000070005', 'manager', true),
  ('00000000-0000-4000-8000-000000070201', '00000000-0000-4000-8000-000000070006', 'manager', false),
  ('00000000-0000-4000-8000-000000070201', '00000000-0000-4000-8000-000000070008', 'manager', true),
  ('00000000-0000-4000-8000-000000070204', '00000000-0000-4000-8000-000000070010', 'manager', true);

insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000070004', 'owner'),
  ('00000000-0000-4000-8000-000000070013', 'assistant_manager');

-- An archived location in org1 where mgrA keeps an (active) manager row.
-- (The lifecycle guard refuses memberships on an already-archived location, so the
-- row is created first and the location archived afterwards: the realistic order.)
insert into public.locations (id, organization_id, name, time_zone) values
  ('00000000-0000-4000-8000-000000070203', '00000000-0000-4000-8000-000000070101', 'RV Loc Archived', 'America/Chicago');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000070203', '00000000-0000-4000-8000-000000070001', 'manager', true);
update public.locations set active = false, archived_at = now() where id = '00000000-0000-4000-8000-000000070203';

update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-000000070008';

-- Shared catalog (org1) + the decimal stock scenario: ONE product, two locations.
insert into public.inventory_vendors (id, organization_id, name, created_by) values
  ('00000000-0000-4000-8000-000000070301', '00000000-0000-4000-8000-000000070101', 'RV Vendor', '00000000-0000-4000-8000-000000070007');
insert into public.inventory_products (id, organization_id, vendor_id, name, size, unit_type, created_by) values
  ('00000000-0000-4000-8000-000000070401', '00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070301', 'Tito''s Vodka', '750 mL', 'bottle', '00000000-0000-4000-8000-000000070007');

-- Recipes (org1 book): one active, one archived.
insert into public.bar_recipe_categories (id, organization_id, name, slug, display_order, created_by) values
  ('00000000-0000-4000-8000-000000070501', '00000000-0000-4000-8000-000000070101', 'RV Classics', 'rv-classics', 1, '00000000-0000-4000-8000-000000070007');
insert into public.bar_recipes (id, organization_id, category_id, recipe_number, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000070601', '00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070501', 1, 'RV Daiquiri', 'rv-daiquiri', '00000000-0000-4000-8000-000000070007');
insert into public.bar_recipes (id, organization_id, category_id, recipe_number, name, slug, is_active, archived_at, archived_by, created_by) values
  ('00000000-0000-4000-8000-000000070602', '00000000-0000-4000-8000-000000070101', '00000000-0000-4000-8000-000000070501', 2, 'RV Retired Sour', 'rv-retired-sour', false, now(), '00000000-0000-4000-8000-000000070007', '00000000-0000-4000-8000-000000070007');

-- helpers ------------------------------------------------------------------
create function pg_temp.act(p_user uuid, p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'session_id', coalesce(p_session, p_user))::text, true);
end $$;

create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate || ':' || sqlerrm;
end $$;

create function pg_temp.auth(p_org text, p_loc text) returns boolean language sql as $$
  select public.inventory_location_authorized(p_org::uuid, p_loc::uuid)
$$;

-- ===========================================================================
-- 1. Effective role AT THE TARGET LOCATION (not the highest role anywhere)
-- ===========================================================================
set local role authenticated;

select pg_temp.act('00000000-0000-4000-8000-000000070001');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), true,  'RV-001 Manager A / Staff B: authorized at A');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), false, 'RV-002 Manager A / Staff B: NOT authorized at B (highest role elsewhere is irrelevant)');

select pg_temp.act('00000000-0000-4000-8000-000000070002');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-003 Location Manager B has no authority at A');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), true,  'RV-004 Location Manager B is authorized at B');

select pg_temp.act('00000000-0000-4000-8000-000000070003');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), false, 'RV-005 Staff B is not an inventory manager at B');

select pg_temp.act('00000000-0000-4000-8000-000000070004');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), true, 'RV-006 Overall Owner (no membership row) at A');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), true, 'RV-007 Overall Owner (no membership row) at B');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070102','00000000-0000-4000-8000-000000070204'), true, 'RV-008 Overall Owner reaches another organization (system-wide by design)');

select pg_temp.act('00000000-0000-4000-8000-000000070013');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), true, 'RV-009 Overall Assistant Manager is authorized (tier 2)');

select pg_temp.act('00000000-0000-4000-8000-000000070007');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), true, 'RV-010 Org General Manager: org-wide authority at A');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202'), true, 'RV-011 Org General Manager: org-wide authority at B');

-- Shift Manager: only the single-location fallback grants authority.
select pg_temp.act('00000000-0000-4000-8000-000000070011');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-012 unassigned Shift Manager in a multi-location org is denied');
select pg_temp.act('00000000-0000-4000-8000-000000070012');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070103','00000000-0000-4000-8000-000000070205'), true, 'RV-013 Shift Manager in a single-location org keeps the documented fallback');

-- ===========================================================================
-- 2. Live-session / revocation / lifecycle
-- ===========================================================================
select pg_temp.act('00000000-0000-4000-8000-000000070005');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-014 inactive ORG membership is denied despite an active location row');
select pg_temp.act('00000000-0000-4000-8000-000000070006');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-015 inactive LOCATION membership is denied');
select pg_temp.act('00000000-0000-4000-8000-000000070008');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-016 banned user is denied');

-- A JWT whose session row no longer exists (sign-out / revocation) must not authorize.
select pg_temp.act('00000000-0000-4000-8000-000000070001', '00000000-0000-4000-8000-0000000799ff');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-017 a JWT for a revoked/unknown session is denied');
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000070101'), false, 'RV-018 the same dead session is denied for Recipes');
select is(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201','00000000-0000-4000-8000-000000070401','set',1,0,'stock_count','x',1)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-019 a dead session cannot mutate stock through the RPC either');

-- Archived location: even a still-active manager row grants nothing.
select pg_temp.act('00000000-0000-4000-8000-000000070001');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070203'), false, 'RV-020 an archived location is never authorized');

-- Forged organization / location pairs.
select is(pg_temp.auth('00000000-0000-4000-8000-000000070102','00000000-0000-4000-8000-000000070201'), false, 'RV-021 org2 id paired with an org1 location is denied');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070204'), false, 'RV-022 org1 id paired with an org2 location is denied');
select pg_temp.act('00000000-0000-4000-8000-000000070010');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201'), false, 'RV-023 foreign owner is denied in org1');
select is(pg_temp.auth('00000000-0000-4000-8000-000000070102','00000000-0000-4000-8000-000000070201'), false, 'RV-024 foreign owner forging own org id onto an org1 location is denied');
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000070101'), false, 'RV-025 foreign owner is denied org1 Recipes');

reset role;
select is(has_function_privilege('anon', 'public.inventory_location_authorized(uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'public.recipes_org_authorized(uuid)', 'execute'), false, 'RV-026 anon cannot execute the authorization RPCs');
select is(has_function_privilege('authenticated', 'private.inventory_profile_level(uuid, uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'private.inventory_live_session()', 'execute'), false, 'RV-027 role-probing helpers are not client-executable');

-- ===========================================================================
-- 3. Location-owned stock: same shared product, independent decimal quantities
-- ===========================================================================
select is((select count(*)::int from public.inventory_stock where product_id = '00000000-0000-4000-8000-000000070401'), 3,
  'RV-028 one shared product has exactly one stock row per organization location (seeded for all, never shared)');

set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000070001');
select lives_ok($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201','00000000-0000-4000-8000-000000070401','set',12.50,0,'stock_count','A count',1)$q$,
  'RV-029 Manager A sets 12.50 at A');
select pg_temp.act('00000000-0000-4000-8000-000000070002');
select lives_ok($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','00000000-0000-4000-8000-000000070401','set',4.75,0,'stock_count','B count',1)$q$,
  'RV-030 Manager B sets 4.75 at B');
reset role;
select is((select on_hand from public.inventory_stock where product_id = '00000000-0000-4000-8000-000000070401' and location_id = '00000000-0000-4000-8000-000000070201'), 12.50::numeric,
  'RV-031 Tito''s at A stays exactly 12.50 after B changed');
select is((select on_hand from public.inventory_stock where product_id = '00000000-0000-4000-8000-000000070401' and location_id = '00000000-0000-4000-8000-000000070202'), 4.75::numeric,
  'RV-032 Tito''s at B is exactly 4.75');
select is((select array_agg(actor_profile_id order by location_id) from public.inventory_adjustments where product_id = '00000000-0000-4000-8000-000000070401'),
  array['00000000-0000-4000-8000-000000070001','00000000-0000-4000-8000-000000070002']::uuid[],
  'RV-033 each ledger row carries the REAL caller (derived from the session, not a parameter)');
select is((select array_agg(location_id order by location_id) from public.inventory_adjustments where product_id = '00000000-0000-4000-8000-000000070401'),
  array['00000000-0000-4000-8000-000000070201','00000000-0000-4000-8000-000000070202']::uuid[],
  'RV-034 each ledger row is scoped to its own location');
select is((select count(*)::int from public.inventory_adjustments adj where adj.product_id = '00000000-0000-4000-8000-000000070401' and adj.new_on_hand is distinct from
   (select s.on_hand from public.inventory_stock s where s.product_id = adj.product_id and s.location_id = adj.location_id)), 0,
  'RV-035 previous/new values in the ledger match the live stock exactly');

-- Direct RPC bypass: Manager A is only STAFF at B. Every location-bearing RPC family refuses B.
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000070001');
select is(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','00000000-0000-4000-8000-000000070401','set',99,0,'stock_count','forged',2)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-036 forged stock adjust at B refused');
select is(pg_temp.err_of($q$select public.inventory_stock_set_levels('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','00000000-0000-4000-8000-000000070401',1,2,3,2)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-037 forged stock levels at B refused');
select is(pg_temp.err_of($q$select public.inventory_bulk_count('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','[]'::jsonb,'stock_count',null)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-038 forged bulk count at B refused');
select is(pg_temp.err_of($q$select public.inventory_import_stage('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','10000000-0000-4000-8000-000000070001','a.csv','csv',null,'stock_count','{}'::jsonb)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-039 forged import staging at B refused');
select is(pg_temp.err_of($q$select public.inventory_order_draft_open('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','00000000-0000-4000-8000-000000070301')$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-040 forged order draft at B refused');
select is(pg_temp.err_of($q$select public.inventory_saved_view_save('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202',null,'v','{}'::jsonb,false,null)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-041 forged saved view at B refused');
select is(pg_temp.err_of($q$select public.inventory_date_lot_save('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202',null,'00000000-0000-4000-8000-000000070401',1,null,null,null,null,null,true,null)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-042 forged freshness lot at B refused');
select is(pg_temp.err_of($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','Forged Vendor',null)$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-043 catalog write routed through B refused (catalog writes need an authorized location)');
select is(pg_temp.err_of($q$select public.inventory_bootstrap('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202')$q$),
  '42501:You do not have access to Bar Inventory for this location.', 'RV-044 bootstrap read for B refused');
select is((select count(*)::int from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000070202'), 0, 'RV-045 RLS: Manager A reads zero stock rows for B');
select is((select count(*)::int from public.inventory_adjustments where location_id = '00000000-0000-4000-8000-000000070202'), 0, 'RV-046 RLS: Manager A reads zero ledger rows for B');
reset role;
select is((select on_hand from public.inventory_stock where product_id = '00000000-0000-4000-8000-000000070401' and location_id = '00000000-0000-4000-8000-000000070202'), 4.75::numeric,
  'RV-047 after every forged attempt B is still exactly 4.75 (no partial state)');

-- ===========================================================================
-- 4. Structural invariants: grants, RLS, FKs, parameters
-- ===========================================================================
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   and (c.relname ~ '^inventory_' or c.relname ~ '^bar_recipe')
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('anon', c.oid, 'select'))), 0,
  'RV-048 no client write privilege (and no anon read) on any Inventory/Recipes table');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   and (c.relname ~ '^inventory_' or c.relname ~ '^bar_recipe') and not c.relrowsecurity), 0,
  'RV-049 RLS is enabled on every Inventory/Recipes table');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
   and (p.proname ~ '^inventory_' or p.proname ~ '^bar_recipe' or p.proname ~ '^recipes_')
   and has_function_privilege('authenticated', p.oid, 'execute')
   and exists (select 1 from unnest(coalesce(p.proargnames, '{}')) n where n ~ '(actor|created_by|updated_by|archived_by|sent_by|profile)')), 0,
  'RV-050 no client-callable RPC accepts an actor/attribution parameter (attribution cannot be forged)');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'bar_recipes_import'
   and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), 0,
  'RV-051 the actor-parameter recipe importer is not client-callable');
select is((select count(*)::int from pg_constraint c where c.contype = 'f'
   and (c.conrelid::regclass::text ~ '^(inventory_|bar_recipe)') and pg_get_constraintdef(c.oid) ~ 'REFERENCES (public\.)?memberships'), 0,
  'RV-052 no Inventory/Recipes actor column still references memberships (Overall actors need no synthetic membership)');
select is((select count(*)::int from pg_constraint c where c.contype = 'f' and c.conrelid::regclass::text ~ '^inventory_'
   and pg_get_constraintdef(c.oid) ~ 'REFERENCES (public\.)?profiles\(id\)' and not (c.condeferrable and c.condeferred)), 0,
  'RV-053 every Inventory actor FK keeps its original DEFERRABLE INITIALLY DEFERRED behaviour (tenant teardown in any order)');
select is((select count(*)::int from pg_constraint c where c.contype = 'f' and c.conrelid::regclass::text ~ '^bar_recipe'
   and pg_get_constraintdef(c.oid) ~ 'REFERENCES (public\.)?profiles\(id\)' and c.condeferrable), 0,
  'RV-054 Recipes actor FKs stay non-deferrable, exactly as before');
select is((select count(*)::int from pg_constraint c where c.contype = 'f'
   and c.conname in ('inventory_import_batches_actor_fk','inventory_adjustments_actor_fk','inventory_stock_updater_fk','inventory_change_log_actor_fk',
     'inventory_products_creator_fk','inventory_order_drafts_sender_fk','bar_recipes_archiver_fk')), 7,
  'RV-055 original constraint names are preserved (error mapping and tests keep working)');

-- ===========================================================================
-- 5. Recipes: one organization-wide book, tenant isolation, private images
-- ===========================================================================
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000070003');
select is((select count(*)::int from public.bar_recipes where organization_id = '00000000-0000-4000-8000-000000070101'), 1, 'RV-056 Staff B (any location) reads the org1 book: active recipes only');
select is((select count(*)::int from public.bar_recipes where slug = 'rv-retired-sour'), 0, 'RV-057 Staff cannot read an archived recipe');
select is(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,'{}'::jsonb)$q$), '42501:You do not have permission to change recipes', 'RV-058 Staff cannot write recipes');

select pg_temp.act('00000000-0000-4000-8000-000000070001');
select is((select count(*)::int from public.bar_recipes where slug = 'rv-retired-sour'), 1, 'RV-059 a manager sees the archived recipe');
-- RV-060 (E-1 / D-10 Option A): the book is organization-shared and org1 has TWO active
-- locations, so a location manager no longer edits it (V2-005 asserted the opposite). The
-- organization general manager edits it instead; the full matrix is 0080.
select is(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,'{}'::jsonb)$q$), '42501:You do not have permission to change recipes',
  'RV-060 Manager A (a location manager, two-location org) can no longer edit the shared org book (E-1)');
select pg_temp.act('00000000-0000-4000-8000-000000070007');
select lives_ok($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,
  jsonb_build_object('recipe_number', 3, 'name', 'RV Manhattan', 'category_id', '00000000-0000-4000-8000-000000070501'::uuid,
    'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye","amount":"2 oz"}],"steps":[{"instruction":"Stir"}],"garnishes":[{"name":"Cherry"}]}}'::jsonb))$q$,
  'RV-060b the organization general manager edits the shared org book');

select pg_temp.act('00000000-0000-4000-8000-000000070010');
select is((select count(*)::int from public.bar_recipes), 0, 'RV-061 foreign owner sees none of org1''s recipes (nor any other)');
select is(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,'{}'::jsonb)$q$), '42501:You do not have permission to change recipes', 'RV-062 foreign owner cannot write into org1''s book');

select pg_temp.act('00000000-0000-4000-8000-000000070005');
select is((select count(*)::int from public.bar_recipes), 0, 'RV-063 a revoked member reads no recipes');
select is(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,'{}'::jsonb)$q$), '42501:You do not have permission to change recipes', 'RV-064 a revoked member cannot write recipes');

select pg_temp.act('00000000-0000-4000-8000-000000070004');
select lives_ok($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000070101',null,null,
  jsonb_build_object('recipe_number', 4, 'name', 'RV Overall Negroni', 'category_id', '00000000-0000-4000-8000-000000070501'::uuid,
    'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Gin","amount":"1 oz"}],"steps":[{"instruction":"Stir"}],"garnishes":[{"name":"Peel"}]}}'::jsonb))$q$,
  'RV-065 Overall Owner (no membership) edits the book');
reset role;
select is((select array_agg(created_by order by recipe_number) from public.bar_recipes where recipe_number in (3,4) and organization_id = '00000000-0000-4000-8000-000000070101'),
  array['00000000-0000-4000-8000-000000070007','00000000-0000-4000-8000-000000070004']::uuid[],
  'RV-066 recipe authorship is the real caller (general manager, Overall owner)');
select is((select count(*)::int from public.bar_recipes where organization_id = '00000000-0000-4000-8000-000000070101'), 4,
  'RV-067 exactly the four org1 recipes exist: nothing duplicated, nothing added to org2');
select is((select count(*)::int from public.bar_recipes where organization_id = '00000000-0000-4000-8000-000000070102'), 0, 'RV-068 org2 book untouched');

-- Private image paths: <org>/<recipe>/<uuid>.webp
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000070003');
select is(private.recipes_can_read_image('00000000-0000-4000-8000-000000070101/00000000-0000-4000-8000-000000070601/00000000-0000-4000-8000-0000000709a1.webp'), true, 'RV-069 staff may read an active recipe image');
select is(private.recipes_can_read_image('00000000-0000-4000-8000-000000070101/00000000-0000-4000-8000-000000070602/00000000-0000-4000-8000-0000000709a2.webp'), false, 'RV-070 staff may NOT read an archived recipe image');
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000070101/00000000-0000-4000-8000-000000070601/00000000-0000-4000-8000-0000000709a1.webp'), false, 'RV-071 staff may not write recipe images');
select pg_temp.act('00000000-0000-4000-8000-000000070010');
select is(private.recipes_can_read_image('00000000-0000-4000-8000-000000070101/00000000-0000-4000-8000-000000070601/00000000-0000-4000-8000-0000000709a1.webp'), false, 'RV-072 foreign owner cannot read org1 images');
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000070102/00000000-0000-4000-8000-000000070601/00000000-0000-4000-8000-0000000709a1.webp'), false, 'RV-073 a forged org2/<org1-recipe> path is rejected (path org must own the recipe)');
select pg_temp.act('00000000-0000-4000-8000-000000070005');
select is(private.recipes_can_read_image('00000000-0000-4000-8000-000000070101/00000000-0000-4000-8000-000000070601/00000000-0000-4000-8000-0000000709a1.webp'), false, 'RV-074 a revoked member loses image access');
reset role;
select is((select public from storage.buckets where id = 'recipe-images'), false, 'RV-075 the recipe-images bucket is private');

-- ===========================================================================
-- 6. ACTIVE module enforcement (isolated to this transaction)
-- ===========================================================================
-- Act as the platform operator: no caller identity, and every active location needs explicit rows.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
insert into public.location_module_configs (location_id, module_key, is_enabled) values
  ('00000000-0000-4000-8000-000000070201', 'bar_inventory', false),
  ('00000000-0000-4000-8000-000000070202', 'bar_inventory', true);
insert into public.location_module_configs (location_id, module_key, is_enabled)
select loc.id, k, true
from public.locations loc
cross join unnest(enum_range(null::public.location_module_key)) k
where loc.active and loc.archived_at is null
on conflict (location_id, module_key) do nothing;
update public.module_enforcement_settings set mode = 'active', activation_reference = 'owner-approval-test-batch-b-review';
set local role authenticated;
select pg_temp.act('00000000-0000-4000-8000-000000070001');
select is(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070201','00000000-0000-4000-8000-000000070401','set',1,0,'stock_count','x',2)$q$),
  '42501:This module is turned off for this location.', 'RV-076 ACTIVE + disabled at A: even an authorized manager is refused at the database');
select is((select count(*)::int from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000070201'), 0, 'RV-077 ACTIVE + disabled: the location''s stock is also hidden by the restrictive policy');
select pg_temp.act('00000000-0000-4000-8000-000000070002');
select is(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000070101','00000000-0000-4000-8000-000000070202','00000000-0000-4000-8000-000000070401','set',5.25,0,'stock_count','enabled',2)$q$),
  'OK', 'RV-078 ACTIVE + enabled at B: the same operation succeeds (and a missing config row would refuse, per the module contract)');

select * from finish();
rollback;
