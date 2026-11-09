begin;
create extension if not exists pgtap with schema extensions;
select plan(95);

-- ===========================================================================
-- V2-005.006-E: Physical Storage Areas, Shelves & Placements (Option A: placement only)
-- Stage E6 review: versioned writes, audit, duplicates, shelf deletion, actor matrix.
-- ===========================================================================

-- 1. Schema structure ---------------------------------------------------------
select has_table('public', 'inventory_storage_areas', 'Table inventory_storage_areas exists');
select has_table('public', 'inventory_storage_shelves', 'Table inventory_storage_shelves exists');
select has_table('public', 'inventory_storage_placements', 'Table inventory_storage_placements exists');

select hasnt_column('public', 'inventory_storage_placements', 'quantity', 'OPTION A: placements have no quantity column');
select hasnt_column('public', 'inventory_storage_placements', 'on_hand', 'OPTION A: placements have no on_hand column');
select hasnt_column('public', 'inventory_storage_placements', 'stock', 'OPTION A: placements have no stock column');
select has_column('public', 'inventory_storage_placements', 'slot_number', 'Placements have slot_number');
select has_column('public', 'inventory_storage_placements', 'slot_label', 'Placements have slot_label');
select has_column('public', 'inventory_storage_shelves', 'version', 'Shelves carry a version (stale-write protection)');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.inventory_storage_areas'::regclass, 'public.inventory_storage_shelves'::regclass,
                 'public.inventory_storage_placements'::regclass, 'public.inventory_date_group_imports'::regclass)),
  'RLS is enabled on every new table'
);
select ok(
  not has_table_privilege('anon', 'public.inventory_storage_areas', 'SELECT')
  and not has_table_privilege('anon', 'public.inventory_storage_shelves', 'SELECT')
  and not has_table_privilege('anon', 'public.inventory_storage_placements', 'SELECT')
  and not has_table_privilege('anon', 'public.inventory_date_group_imports', 'SELECT'),
  'anon cannot select from any new table'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_storage_areas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_storage_areas', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_storage_areas', 'DELETE')
  and not has_table_privilege('authenticated', 'public.inventory_storage_placements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_storage_placements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.inventory_storage_placements', 'DELETE')
  and not has_table_privilege('authenticated', 'public.inventory_storage_shelves', 'INSERT')
  and not has_table_privilege('authenticated', 'public.inventory_storage_shelves', 'DELETE'),
  'authenticated has SELECT only: every write goes through the SECURITY DEFINER RPCs'
);
select is(
  (select count(*)::int from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname in ('inventory_storage_areas', 'inventory_date_group_imports')
     and c.contype = 'f' and c.confrelid = 'public.locations'::regclass and not c.condeferrable),
  0, 'every new location foreign key is DEFERRABLE (tenant teardown cascades in any order)'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'inventory\_storage\_%'
     and p.prosecdef and p.proconfig @> array['search_path=""']
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')),
  7, 'the seven storage RPCs are SECURITY DEFINER, pin an empty search_path, authenticated-only'
);

-- 2. Fixture ------------------------------------------------------------------
-- 71001 org owner | 71002 Loc1 manager | 71003 Loc2 manager (module disabled there)
-- 71004 other-org owner | 71005 Loc1 staff | 71006 Loc1 assistant manager
-- 71007 overall manager | 71008 org owner of a SECOND org that also owns Loc1? (not used)
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000071001', 'pl-owner@test.invalid'),
 ('00000000-0000-4000-8000-000000071002', 'pl-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000071003', 'pl-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000071004', 'pl-other@test.invalid'),
 ('00000000-0000-4000-8000-000000071005', 'pl-staff@test.invalid'),
 ('00000000-0000-4000-8000-000000071006', 'pl-asst@test.invalid'),
 ('00000000-0000-4000-8000-000000071007', 'pl-overall@test.invalid');

insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'pl-%@test.invalid';

insert into public.profiles (id, display_name)
select id, replace(split_part(email, '@', 1), 'pl-', 'User-') from auth.users where email like 'pl-%@test.invalid';

insert into public.organizations (id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000071010', 'Placement Test Org', 'pl-org', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071020', 'Placement Other Org', 'pl-other-org', '00000000-0000-4000-8000-000000071004');

insert into public.locations (id, organization_id, name) values
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071010', 'Loc 1 (Enabled)'),
 ('00000000-0000-4000-8000-000000071012', '00000000-0000-4000-8000-000000071010', 'Loc 2 (Disabled)'),
 ('00000000-0000-4000-8000-000000071021', '00000000-0000-4000-8000-000000071020', 'Loc Other');

insert into public.memberships (organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071001', array['owner']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071005', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071006', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071020', '00000000-0000-4000-8000-000000071004', array['owner']::public.app_role[]);

insert into public.location_memberships (location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071002', 'manager'),
 ('00000000-0000-4000-8000-000000071012', '00000000-0000-4000-8000-000000071003', 'manager'),
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071005', 'staff'),
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071006', 'assistant_manager'),
 ('00000000-0000-4000-8000-000000071021', '00000000-0000-4000-8000-000000071004', 'manager');

insert into public.overall_roles (profile_id, role) values
 ('00000000-0000-4000-8000-000000071007', 'manager');

insert into public.location_module_configs (location_id, module_key, is_enabled) values
 ('00000000-0000-4000-8000-000000071011', 'bar_inventory', true),
 ('00000000-0000-4000-8000-000000071012', 'bar_inventory', false),
 ('00000000-0000-4000-8000-000000071021', 'bar_inventory', true);

insert into public.inventory_vendors (id, organization_id, name, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071010', 'Placement Vendor', '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071111', '00000000-0000-4000-8000-000000071020', 'Other Vendor', '00000000-0000-4000-8000-000000071004', '00000000-0000-4000-8000-000000071004');
insert into public.inventory_categories (id, organization_id, name, sort_order, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071102', '00000000-0000-4000-8000-000000071010', 'Spirits', 1, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');
insert into public.inventory_products (id, organization_id, vendor_id, category_id, name, unit_type, size, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071201', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071102', 'Tequila Blanco', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071202', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071102', 'Mezcal Joven', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071203', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071102', 'Archived Rum', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071291', '00000000-0000-4000-8000-000000071020', '00000000-0000-4000-8000-000000071111', null, 'Foreign Vodka', 'bottle', '1L', true, '00000000-0000-4000-8000-000000071004', '00000000-0000-4000-8000-000000071004');

update public.inventory_products set active = false, archived_at = now() where id = '00000000-0000-4000-8000-000000071203';
update public.inventory_stock set on_hand = 12.00, backup = 6.00
where location_id = '00000000-0000-4000-8000-000000071011' and product_id = '00000000-0000-4000-8000-000000071201';
update public.inventory_stock set on_hand = 4.00, backup = 2.00
where location_id = '00000000-0000-4000-8000-000000071011' and product_id = '00000000-0000-4000-8000-000000071202';

create temp table _pre_stock as
  select product_id, location_id, on_hand, backup, version, last_adjusted_at from public.inventory_stock;
create temp table _pre_adj as select count(*)::int n from public.inventory_adjustments;
grant select on _pre_stock, _pre_adj to authenticated;

-- 3. Manager flow + Option A --------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';

select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071301', 'Cooler 1', 'cooler', 1, true, null) $$,
  'manager creates a storage area (client-supplied id)');
select results_eq(
  $$ select name, kind, display_order, active, version from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values ('Cooler 1'::text, 'cooler'::text, 1, true, 1) $$, 'area stored at version 1');
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071301', 'Main Walk-In Cooler', 'cooler', 2, true, 1) $$,
  'manager updates the area with the version they saw');
select results_eq(
  $$ select name, display_order, version from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values ('Main Walk-In Cooler'::text, 2, 2) $$, 'area update bumped the version');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071301', 'Stale Overwrite', 'cooler', 2, true, 1) $$,
  'PT409', null, 'STALE: a second editor holding version 1 cannot overwrite the newer area');
select results_eq(
  $$ select name from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values ('Main Walk-In Cooler'::text) $$, 'the stale write changed nothing');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '   ', 'cooler', 1, true, null) $$,
  '22023', 'Enter an area name between 1 and 120 characters.', 'rejects whitespace-only area name');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'main walk-in cooler', 'cooler', 1, true, null) $$,
  '22023', null, 'a second ACTIVE area cannot reuse a name (case-insensitive)');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Bad Kind', 'walk_in', 1, true, null) $$,
  '22023', 'Invalid storage area kind.', 'rejects an unknown area kind');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'New With Version', 'cooler', 1, true, 3) $$,
  '22023', null, 'a brand-new area cannot claim an expected version');

-- shelves
select lives_ok(
  $$ select public.inventory_storage_shelf_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', '00000000-0000-4000-8000-000000071301', 'Top Shelf', 'Right Window', 1, null) $$,
  'manager creates a shelf');
select results_eq(
  $$ select name, section_name, display_order, version from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401' $$,
  $$ values ('Top Shelf'::text, 'Right Window'::text, 1, 1) $$, 'shelf stored at version 1');
select lives_ok(
  $$ select public.inventory_storage_shelf_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071402', '00000000-0000-4000-8000-000000071301', 'Middle Shelf', 'Right Window', 2, null) $$,
  'manager creates a second shelf');
select throws_ok(
  $$ select public.inventory_storage_shelf_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', 'top shelf', 'right window', 3, null) $$,
  '22023', null, 'a duplicate shelf (name + section) in the same area is refused');
select throws_ok(
  $$ select public.inventory_storage_shelf_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', '00000000-0000-4000-8000-000000071301', 'Top Shelf', 'Right Window', 1, 7) $$,
  'PT409', null, 'STALE: a shelf edit with a wrong version is refused');
select throws_ok(
  $$ select public.inventory_storage_shelf_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071021', 'Shelf X', null, 1, null) $$,
  '22023', 'Storage area does not exist.', 'a shelf cannot hang off an area of another restaurant');

select lives_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071501', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071201', 1, 'Left', 1, null) $$,
  'manager places a product on a shelf');
select results_eq(
  $$ select product_id, slot_number, slot_label, version from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071501' $$,
  $$ values ('00000000-0000-4000-8000-000000071201'::uuid, 1, 'Left'::text, 1) $$, 'placement stored');

-- OPTION A: stock and the ledger are untouched by a placement
select results_eq(
  $$ select product_id, location_id, on_hand, backup, version from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  $$ select product_id, location_id, on_hand, backup, version from _pre_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  'OPTION A: placement creation leaves every stock row (quantities + versions) unchanged');
select is((select count(*)::int from public.inventory_adjustments), (select n from _pre_adj),
  'OPTION A: placement creation writes no ledger rows');

-- the same product on a second shelf is allowed (one product, two physical places)
select lives_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071503', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071402',
       '00000000-0000-4000-8000-000000071201', null, null, 1, null) $$,
  'the same product can also sit on another shelf (organization only, no second quantity)');
select is((select count(distinct product_id)::int from public.inventory_storage_placements
           where product_id = '00000000-0000-4000-8000-000000071201'), 1,
  'both placements reference the SAME catalog product');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071201', 5, null, 9, null) $$,
  '22023', null, 'the same product cannot be listed twice on one shelf');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071202', 1, null, 2, null) $$,
  '22023', null, 'a slot number is used once per shelf');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071203', null, null, 2, null) $$,
  '22023', 'Product does not exist or is inactive.', 'an archived product cannot be newly placed');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071291', null, null, 2, null) $$,
  '22023', 'Product does not exist or is inactive.', 'a product of ANOTHER organization cannot be placed (cross-tenant)');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071302', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071202', null, null, 2, null) $$,
  '22023', 'Shelf does not exist in this storage area.', 'the shelf must belong to the stated storage area');

-- move: versioned, keeps product, no stock change
select lives_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071501', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071201', 2, 'Center', 2, 1) $$,
  'manager moves/edits a placement with the version they saw');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071501', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071201', 3, 'Stale', 3, 1) $$,
  'PT409', null, 'STALE: a placement edit from an old version is refused');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071501', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071202', 2, 'Swap', 2, 2) $$,
  '22023', 'A placement cannot be reassigned to another product.', 'a placement cannot be re-pointed at a different product');
select results_eq(
  $$ select product_id, location_id, on_hand, backup, version from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  $$ select product_id, location_id, on_hand, backup, version from _pre_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  'OPTION A: moving placements leaves stock unchanged');

-- reorder
select lives_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071502', '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071401',
       '00000000-0000-4000-8000-000000071202', 3, 'Right', 3, null) $$,
  'manager adds a second product to the first shelf');
select lives_ok(
  $$ select public.inventory_storage_placement_reorder('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401',
       array['00000000-0000-4000-8000-000000071502'::uuid, '00000000-0000-4000-8000-000000071501'::uuid]) $$,
  'manager reorders the shelf');
select results_eq(
  $$ select id, display_order from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401' order by display_order $$,
  $$ values ('00000000-0000-4000-8000-000000071502'::uuid, 1), ('00000000-0000-4000-8000-000000071501'::uuid, 2) $$,
  'display order follows the list');
select throws_ok(
  $$ select public.inventory_storage_placement_reorder('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', array['00000000-0000-4000-8000-000000071503'::uuid]) $$,
  '22023', 'Some placements are not on this shelf.', 'reorder rejects a placement from another shelf');
select throws_ok(
  $$ select public.inventory_storage_placement_reorder('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401',
       array['00000000-0000-4000-8000-000000071501'::uuid, '00000000-0000-4000-8000-000000071501'::uuid]) $$,
  '22023', 'A placement was listed more than once.', 'reorder rejects a duplicated id');
select lives_ok(
  $$ select public.inventory_storage_placement_reorder('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', array['00000000-0000-4000-8000-000000071501'::uuid]) $$,
  'a partial (stale) reorder keeps unlisted placements after the listed ones');
select results_eq(
  $$ select id, display_order from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401' order by display_order $$,
  $$ values ('00000000-0000-4000-8000-000000071501'::uuid, 1), ('00000000-0000-4000-8000-000000071502'::uuid, 2) $$,
  'unlisted placement is not lost or duplicated');

-- delete placement (versioned) -- stock unchanged
select throws_ok(
  $$ select public.inventory_storage_placement_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071502', 99) $$,
  'PT409', null, 'STALE: deleting a placement with the wrong version is refused');
select lives_ok(
  $$ select public.inventory_storage_placement_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071502', (select version from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071502')) $$,
  'manager removes a placement');
select is_empty($$ select 1 from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071502' $$,
  'the removed placement is gone');
select results_eq(
  $$ select product_id, location_id, on_hand, backup, version from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  $$ select product_id, location_id, on_hand, backup, version from _pre_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  'OPTION A: removing a placement leaves stock unchanged');
select is(
  (select count(*)::int from public.inventory_products where id = '00000000-0000-4000-8000-000000071202' and active), 1,
  'the product itself is still in the catalog after its placement was removed');

-- shelf deletion semantics
select throws_ok(
  $$ select public.inventory_storage_shelf_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', (select version from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401'), false) $$,
  '22023', null, 'a shelf that still has placed products is NOT silently deleted');
select is((select count(*)::int from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401'), 1,
  'the refused delete left the placement in place');
select throws_ok(
  $$ select public.inventory_storage_shelf_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071401', 42, true) $$,
  'PT409', null, 'STALE: shelf delete with a wrong version is refused even when confirmed');
select is(
  (select public.inventory_storage_shelf_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
     '00000000-0000-4000-8000-000000071401', (select version from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401'), true)),
  1, 'an explicitly confirmed shelf delete reports how many placements it removed');
select is_empty($$ select 1 from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401' $$, 'the shelf is deleted');
select is_empty($$ select 1 from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401' $$,
  'its placements went with it');

reset role;
select is(
  (select count(*)::int from public.inventory_change_log
   where entity_type = 'storage_placement' and action = 'delete'
     and diff ->> 'reason' = 'shelf deleted' and actor_profile_id = '00000000-0000-4000-8000-000000071002'),
  1, 'AUDIT: the placement removed with the shelf is logged against the real actor');
select cmp_ok(
  (select count(*)::int from public.inventory_change_log
   where entity_type in ('storage_area', 'storage_shelf', 'storage_placement')
     and actor_profile_id = '00000000-0000-4000-8000-000000071002'),
  '>=', 8, 'AUDIT: storage mutations are written to the change log with the authenticated actor');
select results_eq(
  $$ select product_id, location_id, on_hand, backup, version from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  $$ select product_id, location_id, on_hand, backup, version from _pre_stock where location_id = '00000000-0000-4000-8000-000000071011' order by product_id, location_id $$,
  'OPTION A: after the entire shelf lifecycle every stock row is identical');
select is((select count(*)::int from public.inventory_adjustments), (select n from _pre_adj),
  'OPTION A: the whole storage lifecycle wrote zero ledger rows');

-- archive area keeps placements; restore via upsert
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';
select lives_ok(
  $$ select public.inventory_storage_area_archive('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071301', (select version from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301')) $$,
  'manager archives a storage area');
select is((select active from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301'), false, 'the area is archived');
select is((select count(*)::int from public.inventory_storage_placements where storage_area_id = '00000000-0000-4000-8000-000000071301'), 1,
  'archiving an area KEEPS its placements (the UI surfaces them as "in archived area")');
select throws_ok(
  $$ select public.inventory_storage_placement_set('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), '00000000-0000-4000-8000-000000071301', '00000000-0000-4000-8000-000000071402',
       '00000000-0000-4000-8000-000000071202', null, null, 1, null) $$,
  '22023', 'Restore the archived storage area before placing products in it.', 'nothing new can be placed into an archived area');
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071301', 'Main Walk-In Cooler', 'cooler', 2, true,
       (select version from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301')) $$,
  'manager restores the archived area');
select is((select active from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301'), true, 'the area is active again');

-- 4. Actor matrix (direct RPC; SQL-role simulation, see the real-JWT suite for live sessions) --
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Dry Storage', 'dry_storage', 5, true, null) $$,
  'MATRIX: Location Manager A may write at Loc 1');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071006"}';
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Back Bar', 'back_bar', 6, true, null) $$,
  'MATRIX: Location Assistant Manager A may write at Loc 1');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071001"}';
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Owner Area', 'other', 7, true, null) $$,
  'MATRIX: Organization Owner may write at Loc 1');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071007"}';
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Overall Area', 'other', 8, true, null) $$,
  'MATRIX: Overall Manager may write at Loc 1');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071005"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Staff Area', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: ordinary Location Staff cannot write');
select throws_ok(
  $$ select public.inventory_storage_placement_delete('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       '00000000-0000-4000-8000-000000071501', 1) $$,
  '42501', null, 'MATRIX: ordinary Location Staff cannot remove a placement');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071003"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Branch B Intruder', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: Location Manager B (other branch) cannot write at Loc 1');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071004"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Foreign Org', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: a foreign-organization owner cannot write into this organization');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071020', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Forged Org', 'other', 9, true, null) $$,
  '42501', null, 'FORGERY: an own-organization id paired with another organization''s location is refused');
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071020', '00000000-0000-4000-8000-000000071021',
       '00000000-0000-4000-8000-000000071301', 'Hijack', 'other', 9, true, null) $$,
  '22023', null, 'FORGERY: an area id from another organization cannot be hijacked through an own-scope upsert');
select is_empty($$ select 1 from public.inventory_storage_areas where organization_id = '00000000-0000-4000-8000-000000071010' $$,
  'RLS: a foreign-organization owner reads none of this organization''s areas');
select is_empty($$ select 1 from public.inventory_storage_placements where organization_id = '00000000-0000-4000-8000-000000071010' $$,
  'RLS: nor its placements');

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071003"}';
select is_empty($$ select 1 from public.inventory_storage_areas where location_id = '00000000-0000-4000-8000-000000071011' $$,
  'RLS: Location Manager B reads none of Loc 1''s areas');

-- A banned account and a revoked session are refused even with a valid-looking sub.
reset role;
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-000000071002';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Banned Area', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: a banned employee is refused');
reset role;
update auth.users set banned_until = null where id = '00000000-0000-4000-8000-000000071002';
update public.location_memberships set active = false
 where profile_id = '00000000-0000-4000-8000-000000071002' and location_id = '00000000-0000-4000-8000-000000071011';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Revoked Area', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: an employee whose location access was revoked is refused');
reset role;
update public.location_memberships set active = true
 where profile_id = '00000000-0000-4000-8000-000000071002' and location_id = '00000000-0000-4000-8000-000000071011';
update public.locations set active = false where id = '00000000-0000-4000-8000-000000071011';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071001"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Inactive Loc Area', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: an inactive location refuses even the organization owner');
reset role;
update public.locations set active = true where id = '00000000-0000-4000-8000-000000071011';

-- 5. Backend module enforcement ACTIVE: Bar Inventory disabled/enabled per location ------------
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.location_module_configs (location_id, module_key, is_enabled)
select l.id, k, false from public.locations l cross join unnest(enum_range(null::public.location_module_key)) k
on conflict (location_id, module_key) do nothing;
update public.module_enforcement_settings set mode = 'active', activation_reference = 'pl-storage-test';
insert into public.inventory_storage_areas (id, organization_id, location_id, name, kind, display_order, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071392', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071012', 'Loc2 Cooler', 'cooler', 1, true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071003"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071012',
       gen_random_uuid(), 'Disabled Module', 'other', 9, true, null) $$,
  '42501', null, 'MODULE: with enforcement active, a manager at a location whose Bar Inventory is disabled is refused');
select is_empty($$ select 1 from public.inventory_storage_areas where location_id = '00000000-0000-4000-8000-000000071012' $$,
  'MODULE: and reads none of that location''s storage areas');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071001"}';
select lives_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Enabled Module Area', 'other', 10, true, null) $$,
  'MODULE: the same owner can still write where Bar Inventory is enabled');
reset role;
select set_config('request.jwt.claims', '', true);
update public.module_enforcement_settings set mode = 'staged';

-- anon
set local role anon;
select throws_ok(
  $$ select public.inventory_storage_area_upsert('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
       gen_random_uuid(), 'Anon Area', 'other', 9, true, null) $$,
  '42501', null, 'MATRIX: anonymous callers cannot execute the RPC');
select throws_ok($$ select 1 from public.inventory_storage_areas $$, '42501', null, 'anonymous callers cannot read areas');

-- direct table writes are impossible for clients
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071001"}';
select throws_ok(
  $$ insert into public.inventory_storage_placements (organization_id, location_id, storage_area_id, shelf_id, product_id)
     values ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011',
             '00000000-0000-4000-8000-000000071301', gen_random_uuid(), '00000000-0000-4000-8000-000000071201') $$,
  '42501', null, 'direct INSERT into placements is refused for every client role');

select * from finish();
rollback;
