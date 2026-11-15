begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ===========================================================================
-- V2-005.006-E: transactional Date Group import (inventory_date_group_import_commit)
-- All-or-nothing, durable request idempotency, no stock/ledger side effects.
-- ===========================================================================

-- 72001 Loc A manager | 72002 Loc B manager | 72003 Loc A staff | 72004 foreign-org owner
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000072001', 'dg-mgra@test.invalid'),
 ('00000000-0000-4000-8000-000000072002', 'dg-mgrb@test.invalid'),
 ('00000000-0000-4000-8000-000000072003', 'dg-staff@test.invalid'),
 ('00000000-0000-4000-8000-000000072004', 'dg-other@test.invalid');
insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'dg-%@test.invalid';
insert into public.profiles (id, display_name)
select id, replace(split_part(email, '@', 1), 'dg-', 'DG-') from auth.users where email like 'dg-%@test.invalid';

insert into public.organizations (id, name, slug, created_by) values
 ('00000000-0000-4000-8000-000000072010', 'DG Org', 'dg-org', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072020', 'DG Other Org', 'dg-other-org', '00000000-0000-4000-8000-000000072004');
insert into public.locations (id, organization_id, name) values
 ('00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072010', 'DG Loc A'),
 ('00000000-0000-4000-8000-000000072012', '00000000-0000-4000-8000-000000072010', 'DG Loc B'),
 ('00000000-0000-4000-8000-000000072021', '00000000-0000-4000-8000-000000072020', 'DG Loc Other');
insert into public.memberships (organization_id, profile_id, roles) values
 ('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072001', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072002', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072003', array['server']::public.app_role[]),
 ('00000000-0000-4000-8000-000000072020', '00000000-0000-4000-8000-000000072004', array['owner']::public.app_role[]);
insert into public.location_memberships (location_id, profile_id, role) values
 ('00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072001', 'manager'),
 ('00000000-0000-4000-8000-000000072012', '00000000-0000-4000-8000-000000072002', 'manager'),
 ('00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072003', 'staff'),
 ('00000000-0000-4000-8000-000000072021', '00000000-0000-4000-8000-000000072004', 'manager');

insert into public.inventory_vendors (id, organization_id, name, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000072101', '00000000-0000-4000-8000-000000072010', 'DG Vendor', '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072111', '00000000-0000-4000-8000-000000072020', 'DG Other Vendor', '00000000-0000-4000-8000-000000072004', '00000000-0000-4000-8000-000000072004');
insert into public.inventory_products (id, organization_id, vendor_id, name, unit_type, size, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000072201', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072101', 'Whiskey', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072202', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072101', 'Gin', 'bottle', '750ml', true, '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072291', '00000000-0000-4000-8000-000000072020', '00000000-0000-4000-8000-000000072111', 'Foreign Vodka', 'bottle', '1L', true, '00000000-0000-4000-8000-000000072004', '00000000-0000-4000-8000-000000072004');
update public.inventory_stock set on_hand = 9.00, backup = 3.00
 where location_id = '00000000-0000-4000-8000-000000072011' and product_id = '00000000-0000-4000-8000-000000072201';

-- Existing groups: A1 + A2 active at Loc A, B1 at Loc B, A3 archived at Loc A.
insert into public.inventory_date_lots (id, organization_id, location_id, product_id, quantity, manufacture_date, manufacture_precision,
  expiration_date, expiration_precision, notes, active, created_by, updated_by) values
 ('00000000-0000-4000-8000-000000072301', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072201', 2.00, '2026-01-15', 'day', '2026-06-30', 'month', 'orig A1', true, '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072302', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072201', 1.50, '2026-02-01', 'month', '2026-08-31', 'month', null, true, '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072303', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011', '00000000-0000-4000-8000-000000072202', 1.00, '2026-03-01', 'day', '2026-09-30', 'month', null, false, '00000000-0000-4000-8000-000000072001', '00000000-0000-4000-8000-000000072001'),
 ('00000000-0000-4000-8000-000000072311', '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072012', '00000000-0000-4000-8000-000000072201', 4.00, '2026-01-01', 'day', '2026-12-31', 'month', 'loc B', true, '00000000-0000-4000-8000-000000072002', '00000000-0000-4000-8000-000000072002');

create temp table _pre as
  select (select count(*)::int from public.inventory_date_lots where location_id = '00000000-0000-4000-8000-000000072011') lots,
         (select count(*)::int from public.inventory_adjustments) adj,
         (select count(*)::int from public.inventory_change_log where entity_type = 'stock_levels') stock_log,
         (select md5(string_agg(product_id::text || location_id::text || on_hand || backup || version, ',' order by product_id, location_id)) from public.inventory_stock) stock_digest,
         (select md5(string_agg(id::text || version, ',' order by id)) from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072311') b1_digest;
grant select on _pre to authenticated;

-- Structure ---------------------------------------------------------------
select has_table('public', 'inventory_date_group_imports', 'the import receipt table exists');
select col_is_unique('public', 'inventory_date_group_imports', array['organization_id', 'request_id'],
  'a request id is unique per organization (the idempotency key)');
select ok(
  has_function_privilege('authenticated', 'public.inventory_date_group_import_commit(uuid,uuid,uuid,text,text,integer,integer,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.inventory_date_group_import_commit(uuid,uuid,uuid,text,text,integer,integer,jsonb)', 'execute'),
  'the atomic commit RPC is authenticated-only');

-- 1. Happy path: update + create in ONE call ---------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000072001"}';

select is(
  (select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072901', 'dates.csv', 'dg_abc', 2, 1,
    jsonb_build_array(
      jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 1, 'quantity', 2.25,
        'manufacture_date', '2026-01-15', 'manufacture_precision', 'day', 'expiration_date', '2026-07-31', 'expiration_precision', 'month', 'notes', 'edited'),
      jsonb_build_object('row_number', 3, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072202',
        'date_group_id', null, 'expected_version', null, 'quantity', 0.5,
        'manufacture_date', '2026-04-01', 'manufacture_precision', 'month', 'expiration_date', null, 'expiration_precision', null, 'notes', null)))
   - 'replayed'),
  '{"ok": true, "created": 1, "updated": 1, "skipped": 2, "rejected": 1}'::jsonb,
  'a mixed import returns accurate created/updated/skipped/rejected counts');
select results_eq(
  $$ select quantity, expiration_date::text, expiration_precision, notes, version, updated_by from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072301' $$,
  $$ values (2.25::numeric, '2026-07-31'::text, 'month'::text, 'edited'::text, 2, '00000000-0000-4000-8000-000000072001'::uuid) $$,
  'the updated group kept its id, dates, precision and recorded the real actor');
select results_eq(
  $$ select quantity, manufacture_date::text, manufacture_precision, active, created_by from public.inventory_date_lots
     where product_id = '00000000-0000-4000-8000-000000072202' and location_id = '00000000-0000-4000-8000-000000072011' and active $$,
  $$ values (0.50::numeric, '2026-04-01'::text, 'month'::text, true, '00000000-0000-4000-8000-000000072001'::uuid) $$,
  'the created group exists once, attributed to the real actor');
select is((select count(*)::int from public.inventory_date_group_imports where request_id = '00000000-0000-4000-8000-000000072901'), 1,
  'exactly one receipt was written');
select is((select actor_profile_id from public.inventory_date_group_imports where request_id = '00000000-0000-4000-8000-000000072901'),
  '00000000-0000-4000-8000-000000072001'::uuid, 'the receipt records the authenticated actor');
select is((select count(*)::int from public.inventory_date_lots where location_id = '00000000-0000-4000-8000-000000072011'), (select lots from _pre) + 1, 'one new group in total');

-- 2. Retry after success is a replay -----------------------------------------
select is(
  (select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072901', 'dates.csv', 'dg_abc', 2, 1,
    jsonb_build_array(
      jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 1, 'quantity', 2.25,
        'manufacture_date', '2026-01-15', 'manufacture_precision', 'day', 'expiration_date', '2026-07-31', 'expiration_precision', 'month', 'notes', 'edited'),
      jsonb_build_object('row_number', 3, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072202',
        'date_group_id', null, 'expected_version', null, 'quantity', 0.5,
        'manufacture_date', '2026-04-01', 'manufacture_precision', 'month', 'expiration_date', null, 'expiration_precision', null, 'notes', null)))),
  '{"ok": true, "created": 1, "updated": 1, "skipped": 2, "rejected": 1, "replayed": true}'::jsonb,
  'IDEMPOTENT: the same request id with the same payload replays the original result');
select is((select count(*)::int from public.inventory_date_lots where location_id = '00000000-0000-4000-8000-000000072011'), (select lots from _pre) + 1,
  'IDEMPOTENT: the replay created no duplicate group');
select is((select version from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072301'), 2,
  'IDEMPOTENT: the replay did not bump the version again');
select is((select count(*)::int from public.inventory_date_group_imports where request_id = '00000000-0000-4000-8000-000000072901'), 1,
  'IDEMPOTENT: still exactly one receipt');

-- 3. Same request id, DIFFERENT payload --------------------------------------
select throws_ok(
  $$ select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072901', 'dates.csv', 'dg_abc', 2, 1,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072202',
      'date_group_id', null, 'expected_version', null, 'quantity', 9, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', 'different'))) $$,
  '22023', null, 'IDEMPOTENT: a reused request id with a different payload is refused');
select is((select count(*)::int from public.inventory_date_lots where location_id = '00000000-0000-4000-8000-000000072011'), (select lots from _pre) + 1, 'the refused reuse wrote nothing');

-- 4. All-or-nothing: a later row fails -> earlier rows roll back --------------
select throws_ok(
  $$ select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072902', 'bad.csv', 'dg_bad', 0, 0,
    jsonb_build_array(
      jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
        'expiration_date', null, 'expiration_precision', null, 'notes', 'row 2 would succeed'),
      jsonb_build_object('row_number', 3, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', '00000000-0000-4000-8000-000000072302', 'expected_version', 1, 'quantity', 3,
        'manufacture_date', '2026-02-01', 'manufacture_precision', 'month', 'expiration_date', '2026-08-31', 'expiration_precision', 'month', 'notes', 'row 3 would succeed'),
      jsonb_build_object('row_number', 4, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 1, 'quantity', 5,
        'manufacture_date', '2026-01-15', 'manufacture_precision', 'day', 'expiration_date', '2026-07-31', 'expiration_precision', 'month', 'notes', 'row 4 is STALE'))) $$,
  'PT409', null, 'ATOMIC: a stale row fails the whole import');
select is((select count(*)::int from public.inventory_date_lots where location_id = '00000000-0000-4000-8000-000000072011'), (select lots from _pre) + 1,
  'ATOMIC: the row-2 create did not survive the failure');
select is((select quantity from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072302'), 1.50::numeric,
  'ATOMIC: the row-3 update did not survive the failure');
select is((select version from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072302'), 1,
  'ATOMIC: and left the version untouched');
select is((select count(*)::int from public.inventory_date_group_imports where request_id = '00000000-0000-4000-8000-000000072902'), 0,
  'ATOMIC: a failed import leaves no receipt');

-- 5. Failed transaction, then a corrected retry with the SAME id succeeds ------
select lives_ok(
  $$ select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072902', 'bad.csv', 'dg_fixed', 0, 0,
    jsonb_build_array(
      jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
        'date_group_id', '00000000-0000-4000-8000-000000072302', 'expected_version', 1, 'quantity', 3,
        'manufacture_date', '2026-02-01', 'manufacture_precision', 'month', 'expiration_date', '2026-08-31', 'expiration_precision', 'month', 'notes', 'now fine'))) $$,
  'RETRY: after a failed (rolled-back) attempt the corrected import under the same id is accepted');
select is((select quantity from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072302'), 3.00::numeric, 'RETRY: it applied');

-- 6. A different legitimate import uses a different id and may create again --------
select lives_ok(
  $$ select public.inventory_date_group_import_commit(
    '00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    '00000000-0000-4000-8000-000000072903', 'more.csv', 'dg_more', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072202',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  'a different import with a different request id is a different import');

-- 7. Validation ------------------------------------------------------------------
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0, '[]'::jsonb) $$,
  '22023', null, 'an empty import is refused');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    null, 'x.csv', 'fp', 0, 0, '[{"action":"create"}]'::jsonb) $$,
  '22023', 'A request id is required.', 'a missing request id is refused');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 2, 'quantity', 1, 'manufacture_date', '2026-01-15', 'manufacture_precision', 'day',
      'expiration_date', null, 'expiration_precision', null, 'notes', null),
    jsonb_build_object('row_number', 3, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 2, 'quantity', 2, 'manufacture_date', '2026-01-15', 'manufacture_precision', 'day',
      'expiration_date', null, 'expiration_precision', null, 'notes', null)) ) $$,
  '22023', null, 'the same date group twice in one import is refused');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', '00000000-0000-4000-8000-000000072311', 'expected_version', 1, 'quantity', 99, 'manufacture_date', '2026-01-01', 'manufacture_precision', 'day',
      'expiration_date', null, 'expiration_precision', null, 'notes', 'cross-location'))) $$,
  '22023', null, 'SECURITY: a date group of another restaurant cannot be updated through this restaurant');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072202',
      'date_group_id', '00000000-0000-4000-8000-000000072303', 'expected_version', 1, 'quantity', 1, 'manufacture_date', '2026-03-01', 'manufacture_precision', 'day',
      'expiration_date', null, 'expiration_precision', null, 'notes', 'archived'))) $$,
  '22023', null, 'an ARCHIVED date group is never silently reactivated by an import');
select is((select active from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072303'), false,
  'the archived group stayed archived');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'update', 'product_id', '00000000-0000-4000-8000-000000072202',
      'date_group_id', '00000000-0000-4000-8000-000000072301', 'expected_version', 2, 'quantity', 1, 'manufacture_date', '2026-01-15', 'manufacture_precision', 'day',
      'expiration_date', null, 'expiration_precision', null, 'notes', 'wrong product'))) $$,
  '22023', null, 'a date group id paired with a different product is refused');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072291',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '22023', null, 'SECURITY: a product of another organization cannot receive a date group');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', 1.234, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '22023', null, 'a quantity with more than two decimals is refused (no silent rounding)');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', -1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '22023', null, 'a negative quantity is refused');
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-15', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '23514', null, 'a month-precision date that is not the first of the month is refused by the table (precision is not rewritten)');

-- 8. Stock, ledger and Loc B are untouched by every date import -----------------------
reset role;
select is((select md5(string_agg(product_id::text || location_id::text || on_hand || backup || version, ',' order by product_id, location_id)) from public.inventory_stock),
  (select stock_digest from _pre), 'NO STOCK EFFECT: every stock row (quantity + version) is identical after all imports');
select is((select count(*)::int from public.inventory_adjustments), (select adj from _pre), 'NO STOCK EFFECT: no ledger rows were written');
select is((select count(*)::int from public.inventory_change_log where entity_type = 'stock_levels'), (select stock_log from _pre),
  'NO STOCK EFFECT: no stock_levels audit entries');
select is((select md5(string_agg(id::text || version, ',' order by id)) from public.inventory_date_lots where id = '00000000-0000-4000-8000-000000072311'),
  (select b1_digest from _pre), 'the other restaurant''s date group is untouched');
select cmp_ok((select count(*)::int from public.inventory_change_log where entity_type = 'import' and diff ->> 'kind' = 'date_groups'
  and actor_profile_id = '00000000-0000-4000-8000-000000072001'), '>=', 2, 'AUDIT: each committed import is logged against the real actor');

-- 9. Actor matrix -----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000072003"}';
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '42501', null, 'MATRIX: ordinary Location Staff cannot import');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000072002"}';
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '42501', null, 'MATRIX: the manager of the OTHER restaurant cannot import into Loc A');
select is_empty($$ select 1 from public.inventory_date_group_imports where location_id = '00000000-0000-4000-8000-000000072011' $$,
  'RLS: and cannot read Loc A''s import receipts');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000072004"}';
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0,
    jsonb_build_array(jsonb_build_object('row_number', 2, 'action', 'create', 'product_id', '00000000-0000-4000-8000-000000072201',
      'date_group_id', null, 'expected_version', null, 'quantity', 1, 'manufacture_date', '2026-05-01', 'manufacture_precision', 'month',
      'expiration_date', null, 'expiration_precision', null, 'notes', null))) $$,
  '42501', null, 'MATRIX: a foreign-organization owner cannot import');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000072001"}';
select is((select count(*)::int from public.inventory_date_group_imports where location_id = '00000000-0000-4000-8000-000000072011'), 3,
  'RLS: the Loc A manager reads Loc A''s three receipts');
set local role anon;
select throws_ok(
  $$ select public.inventory_date_group_import_commit('00000000-0000-4000-8000-000000072010', '00000000-0000-4000-8000-000000072011',
    gen_random_uuid(), 'x.csv', 'fp', 0, 0, '[{"action":"create"}]'::jsonb) $$,
  '42501', null, 'MATRIX: anonymous callers cannot execute the import RPC');

select * from finish();
rollback;
