begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ===========================================================================
-- V2-005.006-E Phase E3: Physical Storage Areas, Shelves & Placements (Option A)
-- ===========================================================================

-- 1. Schema Structure Tests
select has_table('public', 'inventory_storage_areas', 'Table inventory_storage_areas exists');
select has_table('public', 'inventory_storage_shelves', 'Table inventory_storage_shelves exists');
select has_table('public', 'inventory_storage_placements', 'Table inventory_storage_placements exists');

-- Strict Option A Verification: Zero Quantity Columns on Placements
select hasnt_column('public', 'inventory_storage_placements', 'quantity', 'Placements must NOT have quantity column (Option A)');
select hasnt_column('public', 'inventory_storage_placements', 'on_hand', 'Placements must NOT have on_hand column (Option A)');
select hasnt_column('public', 'inventory_storage_placements', 'stock', 'Placements must NOT have stock column (Option A)');
select has_column('public', 'inventory_storage_placements', 'slot_number', 'Placements has slot_number');
select has_column('public', 'inventory_storage_placements', 'slot_label', 'Placements has slot_label');
select has_column('public', 'inventory_storage_placements', 'display_order', 'Placements has display_order');

-- RLS & Privileges
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in (
     'public.inventory_storage_areas'::regclass,
     'public.inventory_storage_shelves'::regclass,
     'public.inventory_storage_placements'::regclass
   )),
  'RLS is enabled on all three storage tables'
);

select ok(
  not has_table_privilege('anon', 'public.inventory_storage_areas', 'SELECT')
  and not has_table_privilege('anon', 'public.inventory_storage_shelves', 'SELECT')
  and not has_table_privilege('anon', 'public.inventory_storage_placements', 'SELECT'),
  'anon role cannot select from storage tables'
);

-- 2. Setup Test Fixture
-- Users:
-- 71001: Org 1 Owner
-- 71002: Org 1 Loc 1 Manager
-- 71003: Org 1 Loc 2 Manager (Module Disabled)
-- 71004: Org 2 Manager (Different Org)
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000071001', 'pl-owner@test.invalid'),
 ('00000000-0000-4000-8000-000000071002', 'pl-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000071003', 'pl-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000071004', 'pl-other@test.invalid');

insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'pl-%@test.invalid';

insert into public.profiles (id, display_name)
select id, replace(split_part(email, '@', 1), 'pl-', 'User-') from auth.users where email like 'pl-%@test.invalid';

-- Organizations & Locations
insert into public.organizations (id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000071010', 'Placement Test Org', 'pl-org', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071020', 'Placement Other Org', 'pl-other-org', '00000000-0000-4000-8000-000000071004');

insert into public.locations (id, organization_id, name) values
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071010', 'Loc 1 (Enabled)'),
 ('00000000-0000-4000-8000-000000071012', '00000000-0000-4000-8000-000000071010', 'Loc 2 (Disabled)'),
 ('00000000-0000-4000-8000-000000071021', '00000000-0000-4000-8000-000000071020', 'Loc Other');

-- Memberships
insert into public.memberships (organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071001', array['owner']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000071020', '00000000-0000-4000-8000-000000071004', array['owner']::public.app_role[]);

-- Location Memberships
insert into public.location_memberships (location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000071011', '00000000-0000-4000-8000-000000071002', 'manager'),
 ('00000000-0000-4000-8000-000000071012', '00000000-0000-4000-8000-000000071003', 'manager'),
 ('00000000-0000-4000-8000-000000071021', '00000000-0000-4000-8000-000000071004', 'manager');

-- Module Configs: Loc 1 enabled, Loc 2 disabled
insert into public.location_module_configs (location_id, module_key, is_enabled) values
 ('00000000-0000-4000-8000-000000071011', 'bar_inventory', true),
 ('00000000-0000-4000-8000-000000071012', 'bar_inventory', false),
 ('00000000-0000-4000-8000-000000071021', 'bar_inventory', true);

-- Catalog setup in Org 1
insert into public.inventory_vendors (id, organization_id, name, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071010', 'Placement Vendor', '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');

insert into public.inventory_categories (id, organization_id, name, sort_order, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071102', '00000000-0000-4000-8000-000000071010', 'Spirits', 1, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');

insert into public.inventory_products (id, organization_id, vendor_id, category_id, name, unit_type, size, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071201', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071102', 'Tequila Blanco', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001'),
 ('00000000-0000-4000-8000-000000071202', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071101', '00000000-0000-4000-8000-000000071102', 'Mezcal Joven', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');

-- Authoritative stock in Loc 1 for Tequila Blanco (units: 12.00, 6.00)
update public.inventory_stock
set on_hand = 12.00, backup = 6.00
where location_id = '00000000-0000-4000-8000-000000071011'::uuid
  and product_id = '00000000-0000-4000-8000-000000071201'::uuid;

update public.inventory_stock
set on_hand = 4.00, backup = 2.00
where location_id = '00000000-0000-4000-8000-000000071011'::uuid
  and product_id = '00000000-0000-4000-8000-000000071202'::uuid;

-- ===========================================================================
-- 3. RPC Execution & Option A Behavior Tests
-- ===========================================================================

-- 3.1 inventory_storage_area_upsert (as 71002 - Loc 1 Manager)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';

select lives_ok(
  $$ select public.inventory_storage_area_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       'Cooler 1',
       'cooler',
       1,
       true
     ) $$,
  'Manager can create storage area'
);

select results_eq(
  $$ select name, kind, display_order, active from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values ('Cooler 1'::text, 'cooler'::text, 1::integer, true::boolean) $$,
  'Storage area was correctly inserted'
);

-- Update storage area
select lives_ok(
  $$ select public.inventory_storage_area_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       'Main Walk-In Cooler',
       'cooler',
       2,
       true
     ) $$,
  'Manager can update storage area'
);

select results_eq(
  $$ select name, display_order from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values ('Main Walk-In Cooler'::text, 2::integer) $$,
  'Storage area name and display order updated'
);

-- Invalid name validation
select throws_ok(
  $$ select public.inventory_storage_area_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       gen_random_uuid(),
       '   ',
       'cooler',
       1,
       true
     ) $$,
  '22023',
  'Enter an area name between 1 and 120 characters.',
  'Rejects whitespace-only area name'
);

-- 3.2 inventory_storage_shelf_upsert
select lives_ok(
  $$ select public.inventory_storage_shelf_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       'Top Shelf',
       'Section Left',
       1
     ) $$,
  'Manager can create shelf under storage area'
);

select results_eq(
  $$ select name, section_name, display_order from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401' $$,
  $$ values ('Top Shelf'::text, 'Section Left'::text, 1::integer) $$,
  'Shelf was correctly inserted'
);

-- Rejects shelf with non-existent storage area
select throws_ok(
  $$ select public.inventory_storage_shelf_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       gen_random_uuid(),
       '00000000-0000-4000-8000-000000071021'::uuid,
       'Shelf X',
       null,
       1
     ) $$,
  '22023',
  'Storage area does not exist.',
  'Rejects shelf if storage area is not found in location'
);

-- 3.3 STRICT OPTION A: inventory_storage_placement_set does NOT touch stock
-- Snapshot stock and adjustments count before placement
create temp table _pre_placement_stock as
  select product_id, on_hand, backup
  from public.inventory_stock
  where location_id = '00000000-0000-4000-8000-000000071011'::uuid;

select lives_ok(
  $$ select public.inventory_storage_placement_set(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071501'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid,
       '00000000-0000-4000-8000-000000071201'::uuid,
       1,
       'Slot A1',
       1
     ) $$,
  'Manager can assign product placement to shelf'
);

select results_eq(
  $$ select product_id, slot_number, slot_label, display_order from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071501' $$,
  $$ values ('00000000-0000-4000-8000-000000071201'::uuid, 1::integer, 'Slot A1'::text, 1::integer) $$,
  'Placement correctly stored slot metadata'
);

-- STRICT OPTION A VERIFICATION 1: Stock is identical after placement insert
select results_eq(
  $$ select product_id, on_hand, backup from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011'::uuid order by product_id $$,
  $$ select product_id, on_hand, backup from _pre_placement_stock order by product_id $$,
  'OPTION A: inventory_stock must NOT be modified by placement creation'
);

-- STRICT OPTION A VERIFICATION 2: No ledger adjustments created
select is_empty(
  $$ select 1 from public.inventory_adjustments where location_id = '00000000-0000-4000-8000-000000071011'::uuid $$,
  'OPTION A: No inventory_adjustments created on placement'
);

-- Update/move placement to another slot
select lives_ok(
  $$ select public.inventory_storage_placement_set(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071501'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid,
       '00000000-0000-4000-8000-000000071201'::uuid,
       2,
       'Slot A2',
       2
     ) $$,
  'Manager can move product placement to new slot'
);

select results_eq(
  $$ select slot_number, slot_label, display_order from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071501' $$,
  $$ values (2::integer, 'Slot A2'::text, 2::integer) $$,
  'Placement updated slot position'
);

-- STRICT OPTION A VERIFICATION 3: Stock is identical after placement move
select results_eq(
  $$ select product_id, on_hand, backup from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011'::uuid order by product_id $$,
  $$ select product_id, on_hand, backup from _pre_placement_stock order by product_id $$,
  'OPTION A: inventory_stock must NOT be modified by moving placement'
);

-- 3.4 inventory_storage_placement_reorder
-- Create second placement for Mezcal Joven
select lives_ok(
  $$ select public.inventory_storage_placement_set(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071502'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid,
       '00000000-0000-4000-8000-000000071202'::uuid,
       3,
       'Slot A3',
       3
     ) $$,
  'Manager can create second placement'
);

-- Reorder: place placement 71502 first, then 71501
select lives_ok(
  $$ select public.inventory_storage_placement_reorder(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid,
       array['00000000-0000-4000-8000-000000071502'::uuid, '00000000-0000-4000-8000-000000071501'::uuid]
     ) $$,
  'Manager can reorder placements on shelf'
);

select results_eq(
  $$ select id, display_order from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401'::uuid order by display_order $$,
  $$ values
       ('00000000-0000-4000-8000-000000071502'::uuid, 1::integer),
       ('00000000-0000-4000-8000-000000071501'::uuid, 2::integer) $$,
  'Placements display_order reordered properly'
);

-- 3.5 inventory_storage_placement_delete
select lives_ok(
  $$ select public.inventory_storage_placement_delete(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071502'::uuid
     ) $$,
  'Manager can delete placement'
);

select is_empty(
  $$ select 1 from public.inventory_storage_placements where id = '00000000-0000-4000-8000-000000071502' $$,
  'Deleted placement is gone'
);

-- STRICT OPTION A VERIFICATION 4: Stock is identical after placement deletion
select results_eq(
  $$ select product_id, on_hand, backup from public.inventory_stock where location_id = '00000000-0000-4000-8000-000000071011'::uuid order by product_id $$,
  $$ select product_id, on_hand, backup from _pre_placement_stock order by product_id $$,
  'OPTION A: inventory_stock must NOT be modified by deleting placement'
);

-- 3.6 inventory_storage_shelf_delete (cascades to remaining placement 71501)
select lives_ok(
  $$ select public.inventory_storage_shelf_delete(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071401'::uuid
     ) $$,
  'Manager can delete shelf'
);

select is_empty(
  $$ select 1 from public.inventory_storage_shelves where id = '00000000-0000-4000-8000-000000071401' $$,
  'Shelf is deleted'
);

select is_empty(
  $$ select 1 from public.inventory_storage_placements where shelf_id = '00000000-0000-4000-8000-000000071401' $$,
  'Placements cascaded on shelf deletion'
);

-- 3.7 inventory_storage_area_archive
select lives_ok(
  $$ select public.inventory_storage_area_archive(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       '00000000-0000-4000-8000-000000071301'::uuid
     ) $$,
  'Manager can archive storage area'
);

select results_eq(
  $$ select active from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071301' $$,
  $$ values (false::boolean) $$,
  'Storage area is deactivated/archived'
);

-- ===========================================================================
-- 4. RLS & Tenant Isolation Tests
-- ===========================================================================

-- Create a fresh active area for read testing
reset role;
insert into public.inventory_storage_areas (id, organization_id, location_id, name, kind, display_order, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000071399', '00000000-0000-4000-8000-000000071010', '00000000-0000-4000-8000-000000071011', 'Back Bar', 'back_bar', 1, true, '00000000-0000-4000-8000-000000071001', '00000000-0000-4000-8000-000000071001');

-- Anonymous user cannot see anything (permission denied due to table grant revocation)
set local role anon;
select throws_ok(
  $$ select 1 from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071399' $$,
  '42501',
  null,
  'Anonymous role cannot read storage areas'
);

-- Outsider from Org 2 cannot see Org 1 storage areas
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071004"}';
select is_empty(
  $$ select 1 from public.inventory_storage_areas where organization_id = '00000000-0000-4000-8000-000000071010' $$,
  'Outsider cannot read other org storage areas'
);

-- User at Loc 2 (where bar_inventory is disabled) cannot read storage areas
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071003"}';
select is_empty(
  $$ select 1 from public.inventory_storage_areas where location_id = '00000000-0000-4000-8000-000000071012' $$,
  'Location with disabled bar_inventory cannot read storage areas'
);

-- User at Loc 1 (where bar_inventory is enabled and user is manager) CAN read
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071002"}';
select results_eq(
  $$ select name from public.inventory_storage_areas where id = '00000000-0000-4000-8000-000000071399' $$,
  $$ values ('Back Bar'::text) $$,
  'Authorized manager can read storage areas'
);

-- Outsider cannot call upsert RPC on Org 1
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000071004"}';
select throws_ok(
  $$ select public.inventory_storage_area_upsert(
       '00000000-0000-4000-8000-000000071010'::uuid,
       '00000000-0000-4000-8000-000000071011'::uuid,
       gen_random_uuid(),
       'Hacked Cooler',
       'cooler',
       1,
       true
     ) $$,
  '42501',
  null,
  'Outsider cannot create storage areas in Org 1'
);

rollback;
