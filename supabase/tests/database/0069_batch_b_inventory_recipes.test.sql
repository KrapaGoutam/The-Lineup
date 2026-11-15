begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ===========================================================================
-- V2-005 Batch B: Bar Inventory + Recipes Location Scoping & Catalog Sharing
-- ===========================================================================

-- 1. Setup Users & Organizations
-- 69001 mgrA        Location manager at Loc A, staff at Loc B
-- 69002 mgrB        Location manager at Loc B only
-- 69003 staffA      Staff at Loc A only
-- 69004 overallMgr  Overall manager, NO memberships row
-- 69005 orgOwner    Org owner
-- 69006 outsider    Member of Other Org only

insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000069001', 'bb-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000069002', 'bb-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000069003', 'bb-staffa@test.invalid'),
 ('00000000-0000-4000-8000-000000069004', 'bb-overall@test.invalid'),
 ('00000000-0000-4000-8000-000000069005', 'bb-owner@test.invalid'),
 ('00000000-0000-4000-8000-000000069006', 'bb-outsider@test.invalid');

insert into auth.sessions(id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'bb-%@test.invalid';

insert into public.profiles(id, display_name)
select id, replace(split_part(email, '@', 1), 'bb-', 'P-') from auth.users where email like 'bb-%@test.invalid';

-- Orgs & Locations
insert into public.organizations(id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000069010', 'Batch B Org', 'bb-org', '00000000-0000-4000-8000-000000069005'),
 ('00000000-0000-4000-8000-000000069020', 'Other Org', 'other-org', '00000000-0000-4000-8000-000000069006');

insert into public.locations(id, organization_id, name) values
 ('00000000-0000-4000-8000-000000069011', '00000000-0000-4000-8000-000000069010', 'Loc A'),
 ('00000000-0000-4000-8000-000000069012', '00000000-0000-4000-8000-000000069010', 'Loc B'),
 ('00000000-0000-4000-8000-000000069021', '00000000-0000-4000-8000-000000069020', 'Loc C');

-- Memberships
insert into public.memberships(organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069005', array['owner']::public.app_role[]),
 ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069001', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000069020', '00000000-0000-4000-8000-000000069006', array['owner']::public.app_role[]);

-- Location Memberships
insert into public.location_memberships(location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000069011', '00000000-0000-4000-8000-000000069001', 'manager'),
 ('00000000-0000-4000-8000-000000069012', '00000000-0000-4000-8000-000000069001', 'staff'),
 ('00000000-0000-4000-8000-000000069012', '00000000-0000-4000-8000-000000069002', 'manager'),
 ('00000000-0000-4000-8000-000000069011', '00000000-0000-4000-8000-000000069003', 'staff'),
 ('00000000-0000-4000-8000-000000069021', '00000000-0000-4000-8000-000000069006', 'manager');

-- Overall Roles (NO membership in 69010)
insert into public.overall_roles(profile_id, role) values
 ('00000000-0000-4000-8000-000000069004', 'manager');

-- Module configs
insert into public.location_module_configs(location_id, module_key, is_enabled) values
 ('00000000-0000-4000-8000-000000069011', 'bar_inventory', true),
 ('00000000-0000-4000-8000-000000069011', 'recipes', true),
 ('00000000-0000-4000-8000-000000069012', 'bar_inventory', true),
 ('00000000-0000-4000-8000-000000069012', 'recipes', true),
 ('00000000-0000-4000-8000-000000069021', 'bar_inventory', true),
 ('00000000-0000-4000-8000-000000069021', 'recipes', true);

-- Catalog setup (Org-wide)
insert into public.inventory_vendors(id, organization_id, name, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069101', '00000000-0000-4000-8000-000000069010', 'Vendor Alpha', '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

insert into public.inventory_categories(id, organization_id, name, sort_order, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069102', '00000000-0000-4000-8000-000000069010', 'Spirits', 1, '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

insert into public.inventory_subcategories(id, organization_id, category_id, name, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069103', '00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069102', 'Bourbon', '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

insert into public.inventory_products(id, organization_id, vendor_id, category_id, subcategory_id, name, unit_type, size, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069104', '00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069101', '00000000-0000-4000-8000-000000069102', '00000000-0000-4000-8000-000000069103', 'Buffalo Trace', 'bottle', '750 mL', '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

-- Recipes Setup (Org-wide)
insert into public.bar_recipe_categories(id, organization_id, name, slug, display_order, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069201', '00000000-0000-4000-8000-000000069010', 'Classics', 'classics', 1, '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

insert into public.bar_recipes(id, organization_id, category_id, recipe_number, name, slug, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000069202', '00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069201', 1, 'Old Fashioned', 'old-fashioned', '00000000-0000-4000-8000-000000069005', '00000000-0000-4000-8000-000000069005');

-- ===========================================================================
-- PART 1: SCHEMA CONTRACT VERIFICATION (Zero location_id on catalogs)
-- ===========================================================================

-- 1-4: Recipe tables MUST NOT have location_id
select hasnt_column('public', 'bar_recipe_categories', 'location_id', 'bar_recipe_categories has NO location_id column');
select hasnt_column('public', 'bar_recipes', 'location_id', 'bar_recipes has NO location_id column');
select hasnt_column('public', 'bar_recipe_ingredients', 'location_id', 'bar_recipe_ingredients has NO location_id column');
select hasnt_column('public', 'bar_recipe_variants', 'location_id', 'bar_recipe_variants has NO location_id column');

-- 5-8: Bar Inventory catalog tables MUST NOT have location_id
select hasnt_column('public', 'inventory_vendors', 'location_id', 'inventory_vendors has NO location_id column');
select hasnt_column('public', 'inventory_categories', 'location_id', 'inventory_categories has NO location_id column');
select hasnt_column('public', 'inventory_subcategories', 'location_id', 'inventory_subcategories has NO location_id column');
select hasnt_column('public', 'inventory_products', 'location_id', 'inventory_products has NO location_id column');

-- 9-12: Bar Inventory operational state MUST have location_id
select has_column('public', 'inventory_stock', 'location_id', 'inventory_stock HAS location_id column');
select has_column('public', 'inventory_adjustments', 'location_id', 'inventory_adjustments HAS location_id column');
select has_column('public', 'inventory_order_drafts', 'location_id', 'inventory_order_drafts HAS location_id column');
select has_column('public', 'inventory_saved_views', 'location_id', 'inventory_saved_views HAS location_id column');

-- ===========================================================================
-- PART 2: AUTHORIZATION HELPERS
-- ===========================================================================

-- Test as mgrA (Manager at Loc A, Staff at Loc B)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069001"}', true);

-- 13: mgrA is authorized for Loc A inventory
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011'), true, 'mgrA authorized for Loc A inventory');

-- 14: mgrA is NOT authorized for Loc B inventory (only staff at Loc B)
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069012'), false, 'mgrA NOT authorized for Loc B inventory');

-- 15: mgrA is authorized for Org recipes
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000069010'), true, 'mgrA authorized for Org recipes');

-- Test as staffA (Staff at Loc A)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069003"}', true);

-- 16: staffA is NOT authorized for Loc A inventory mutations
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011'), false, 'staffA NOT authorized for Loc A inventory management');

-- 17: staffA IS authorized to access Org recipes as a member (read-only)
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000069010'), true, 'staffA authorized for Org recipes read access');

-- Test as overallMgr (Overall manager, NO memberships row)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069004"}', true);

-- 18-20: overallMgr authorized for Loc A, Loc B, and Org recipes
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011'), true, 'overallMgr authorized for Loc A inventory');
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069012'), true, 'overallMgr authorized for Loc B inventory');
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000069010'), true, 'overallMgr authorized for Org recipes');

-- Test as outsider (Other Org only)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069006', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069006"}', true);

-- 21-22: outsider rejected for Org 69010
select is(public.inventory_location_authorized('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011'), false, 'outsider rejected for Loc A inventory');
select is(public.recipes_org_authorized('00000000-0000-4000-8000-000000069010'), false, 'outsider rejected for Org recipes');

-- ===========================================================================
-- PART 3: INVENTORY DIRECT DML DENIAL
-- ===========================================================================

-- Test as mgrA
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069001"}', true);

-- 23: Direct INSERT to inventory_stock rejected (no table privilege)
select throws_ok(
  $$ insert into public.inventory_stock(organization_id, location_id, product_id, on_hand)
     values ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011', '00000000-0000-4000-8000-000000069104', 5) $$,
  '42501', null, 'direct INSERT to inventory_stock blocked by lack of privilege'
);

-- 24: Direct INSERT to inventory_adjustments rejected (no table privilege)
select throws_ok(
  $$ insert into public.inventory_adjustments(organization_id, location_id, product_id, source, reason, prev_on_hand, new_on_hand, prev_backup, new_backup, status_after, actor_profile_id, stock_version_after)
     values ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069011', '00000000-0000-4000-8000-000000069104', 'manual_edit', 'breakage', 0, 5, 0, 0, 'healthy', '00000000-0000-4000-8000-000000069001', 1) $$,
  '42501', null, 'direct INSERT to inventory_adjustments blocked by lack of privilege'
);

-- 25: Direct INSERT to inventory_change_log rejected by RLS
select throws_ok(
  $$ insert into public.inventory_change_log(organization_id, action, entity_type, entity_id, actor_profile_id)
     values ('00000000-0000-4000-8000-000000069010', 'update', 'product', '00000000-0000-4000-8000-000000069104', '00000000-0000-4000-8000-000000069001') $$,
  '42501', null, 'direct INSERT to inventory_change_log blocked by RLS'
);

-- ===========================================================================
-- PART 4: INVENTORY LOCATION ISOLATION VIA RPC & DECOUPLED FKs
-- ===========================================================================

-- 26: mgrA adjusts stock at Loc A -> succeeds
select lives_ok(
  $$ select public.inventory_stock_adjust(
       '00000000-0000-4000-8000-000000069010',
       '00000000-0000-4000-8000-000000069011',
       '00000000-0000-4000-8000-000000069104',
       'set',
       10.0,
       0.0,
       'stock_count',
       'Initial delivery at Loc A',
       1
     ) $$,
  'mgrA stock adjust at Loc A succeeds'
);

-- 27: Verify stock exists at Loc A
select is(
  (select on_hand from public.inventory_stock
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069011'
     and product_id = '00000000-0000-4000-8000-000000069104'),
  10.00,
  'Loc A has 10 bottles on hand'
);

-- 28: mgrA cannot read Loc B stock ledger (RLS filtered to 0 rows)
select is(
  (select count(*)::int from public.inventory_stock
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069012'),
  0,
  'mgrA cannot read Loc B stock ledger (RLS filtered to 0 rows)'
);

-- 29: mgrA attempts stock adjust at Loc B -> FAILS (42501)
select throws_ok(
  $$ select public.inventory_stock_adjust(
       '00000000-0000-4000-8000-000000069010',
       '00000000-0000-4000-8000-000000069012',
       '00000000-0000-4000-8000-000000069104',
       'set',
       5.0,
       0.0,
       'stock_count',
       'Unauthorized delivery attempt by mgrA at Loc B',
       1
     ) $$,
  '42501', null, 'mgrA stock adjust at Loc B fails with 42501 permission denied'
);

-- 30: staffA attempts stock adjust at Loc A -> FAILS (42501)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069003"}', true);
select throws_ok(
  $$ select public.inventory_stock_adjust(
       '00000000-0000-4000-8000-000000069010',
       '00000000-0000-4000-8000-000000069011',
       '00000000-0000-4000-8000-000000069104',
       'set',
       9.0,
       0.0,
       'breakage',
       'Broken bottle report',
       2
     ) $$,
  '42501', null, 'staffA stock adjust rejected with 42501'
);

-- 31: overallMgr (Overall Role, NO membership) adjusts stock at Loc A -> SUCCEEDS (decoupled FK!)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069004"}', true);
select lives_ok(
  $$ select public.inventory_stock_adjust(
       '00000000-0000-4000-8000-000000069010',
       '00000000-0000-4000-8000-000000069011',
       '00000000-0000-4000-8000-000000069104',
       'set',
       12.0,
       0.0,
       'stock_count',
       'Overall manager adjustment without membership row',
       2
     ) $$,
  'overallMgr stock adjust succeeds without membership FK violation'
);

-- 32: Verify adjustments entry actor_profile_id is overallMgr
select is(
  (select actor_profile_id from public.inventory_adjustments
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069011'
   order by id desc limit 1),
  '00000000-0000-4000-8000-000000069004'::uuid,
  'inventory_adjustments records overallMgr profile_id actor directly'
);

-- Test as mgrB (Manager at Loc B, no role at Loc A)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069002', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069002"}', true);

-- 33: mgrB cannot read Loc A stock ledger (RLS filtered to 0 rows)
select is(
  (select count(*)::int from public.inventory_stock
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069011'),
  0,
  'mgrB cannot read Loc A stock ledger (RLS filtered to 0 rows)'
);

-- 34: Loc B starts with 0 on hand for mgrB
select is(
  (select on_hand from public.inventory_stock
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069012'
     and product_id = '00000000-0000-4000-8000-000000069104'),
  0.00,
  'Loc B starts with 0 on hand for mgrB'
);

-- 35: mgrB adjusts stock at Loc B -> SUCCEEDS
select lives_ok(
  $$ select public.inventory_stock_adjust(
       '00000000-0000-4000-8000-000000069010',
       '00000000-0000-4000-8000-000000069012',
       '00000000-0000-4000-8000-000000069104',
       'set',
       15.0,
       0.0,
       'stock_count',
       'Initial delivery at Loc B',
       1
     ) $$,
  'mgrB stock adjust at Loc B succeeds'
);

-- 36: Verify Loc B stock is distinct (15)
select is(
  (select on_hand from public.inventory_stock
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and location_id = '00000000-0000-4000-8000-000000069012'
     and product_id = '00000000-0000-4000-8000-000000069104'),
  15.00,
  'Loc B has distinct 15 bottles on hand'
);

-- ===========================================================================
-- PART 5: RECIPES DIRECT DML DENIAL & RPC MUTATIONS
-- ===========================================================================

-- 37: Direct INSERT to bar_recipes rejected by RLS
select throws_ok(
  $$ insert into public.bar_recipes(organization_id, category_id, recipe_number, name, slug)
     values ('00000000-0000-4000-8000-000000069010', '00000000-0000-4000-8000-000000069201', 99, 'Direct Manhattan', 'direct-manhattan') $$,
  '42501', null, 'direct INSERT to bar_recipes blocked by RLS'
);

-- 38: staffA attempts bar_recipe_save -> rejected
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069003"}', true);
select throws_ok(
  $$ select public.bar_recipe_save(
       '00000000-0000-4000-8000-000000069010',
       null, null,
       jsonb_build_object('recipe_number', 2, 'name', 'Staff Manhattan', 'category_id', '00000000-0000-4000-8000-000000069201'::uuid,
         'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye"}],"steps":[],"garnishes":[]}}'::jsonb)
     ) $$,
  '42501', null, 'staffA bar_recipe_save rejected with 42501'
);

-- 39: E-1 / D-10 Option A. The recipe book is organization-shared and this organization has TWO
-- active locations, so a location manager (mgrA) can no longer write it. Before E-1 this case
-- asserted the opposite (V2-005 contract). The organization owner writes the book instead; the
-- single-location exception and the full actor matrix live in 0080_e1_shared_catalog_authority.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069001', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069001"}', true);
select throws_ok(
  $$ select public.bar_recipe_save(
       '00000000-0000-4000-8000-000000069010',
       null, null,
       jsonb_build_object('recipe_number', 2, 'name', 'Manhattan', 'category_id', '00000000-0000-4000-8000-000000069201'::uuid,
         'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye"}],"steps":[],"garnishes":[]}}'::jsonb)
     ) $$,
  '42501', 'You do not have permission to change recipes',
  'mgrA (location manager, two-location org) bar_recipe_save denied (E-1)'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069005', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069005"}', true);
select lives_ok(
  $$ select public.bar_recipe_save(
       '00000000-0000-4000-8000-000000069010',
       null, null,
       jsonb_build_object('recipe_number', 2, 'name', 'Manhattan', 'category_id', '00000000-0000-4000-8000-000000069201'::uuid,
         'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye","amount":"2 oz"}],"steps":[{"instruction":"Stir with ice"}],"garnishes":[{"name":"Cherry"}]},"house":{"tips":"House notes","ingredients":[{"ingredient_name":"Bourbon"}]}}'::jsonb)
     ) $$,
  'org owner bar_recipe_save succeeds'
);

-- 40: Recipe created by mgrA is visible org-wide to staffA
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069003', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069003"}', true);
select is(
  (select count(*)::int from public.bar_recipes
   where organization_id = '00000000-0000-4000-8000-000000069010'
     and slug = 'manhattan'),
  1,
  'Manhattan recipe is visible org-wide to staffA'
);

-- 41: Perfect and House variants both exist for Manhattan
select is(
  (select count(*)::int from public.bar_recipe_variants v
   join public.bar_recipes r on r.id = v.recipe_id
   where r.organization_id = '00000000-0000-4000-8000-000000069010'
     and r.slug = 'manhattan'),
  2,
  'Perfect and House variants both preserved for Manhattan'
);

-- 42: overallMgr (Overall Role, NO membership) saves recipe -> SUCCEEDS (decoupled FK!)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000069004', true);
select set_config('request.jwt.claims', '{"session_id":"00000000-0000-4000-8000-000000069004"}', true);
select lives_ok(
  $$ select public.bar_recipe_save(
       '00000000-0000-4000-8000-000000069010',
       null, null,
       jsonb_build_object('recipe_number', 3, 'name', 'Negroni', 'category_id', '00000000-0000-4000-8000-000000069201'::uuid,
         'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Gin","amount":"1 oz"}],"steps":[{"instruction":"Stir with ice"}],"garnishes":[{"name":"Orange peel"}]}}'::jsonb)
     ) $$,
  'overallMgr bar_recipe_save succeeds without membership FK violation'
);

-- 43-44: Storage bucket image read/write predicates
select is(private.recipes_can_read_image('00000000-0000-4000-8000-000000069010/00000000-0000-4000-8000-000000069202/00000000-0000-4000-8000-000000069999.webp'), true, 'overallMgr can read recipe image');
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000069010/00000000-0000-4000-8000-000000069202/00000000-0000-4000-8000-000000069999.webp'), true, 'overallMgr can write recipe image');

select * from finish();
rollback;
