begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

-- ---------------------------------------------------------------------
-- Bar Inventory V1 / BI-8c -- import batches and the atomic import commit.
-- Cast (org A, locations A1 and A2): owner Olga, manager Mona (general_manager),
-- assistant manager Asa (shift_manager), staff Ann (server).
-- Org B: Otto, an owner of a different organization.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000037001', '0371-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037002', '0371-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037003', '0371-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037004', '0371-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000037007', '0371-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000037001', 'PGTAP 0371 Olga'),
  ('00000000-0000-0000-0000-000000037002', 'PGTAP 0371 Mona'),
  ('00000000-0000-0000-0000-000000037003', 'PGTAP 0371 Asa'),
  ('00000000-0000-0000-0000-000000037004', 'PGTAP 0371 Ann'),
  ('00000000-0000-0000-0000-000000037007', 'PGTAP 0371 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000037011', 'PGTAP 0371 Org', 'pgtap-0371-org', '00000000-0000-0000-0000-000000037001'),
  ('00000000-0000-0000-0000-000000037012', 'PGTAP 0371 Other', 'pgtap-0371-other', '00000000-0000-0000-0000-000000037007');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000037021', '00000000-0000-0000-0000-000000037011', 'PGTAP 0371 Loc A1', 'America/New_York'),
  ('00000000-0000-0000-0000-000000037023', '00000000-0000-0000-0000-000000037011', 'PGTAP 0371 Loc A2', 'America/New_York'),
  ('00000000-0000-0000-0000-000000037022', '00000000-0000-0000-0000-000000037012', 'PGTAP 0371 Other Loc', 'America/New_York');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000037011', '00000000-0000-0000-0000-000000037004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000037012', '00000000-0000-0000-0000-000000037007', array['owner']::public.app_role[], true);

create function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$;

-- Catalog set-up through the real RPCs (as Mona): a vendor, a product with
-- levels and a count, a second product, and an archived one.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select public.inventory_vendor_create('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','Faust',null);
reset role;
select set_config('t.faust', (select id::text from public.inventory_vendors where name = 'Faust'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select public.inventory_product_create('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.faust')::uuid, 'Tito''s Handmade Vodka', null, null, '750 mL', 'bottle', null, null, null);
select public.inventory_product_create('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.faust')::uuid, 'Casamigos Blanco', null, null, '750 mL', 'bottle', null, null, null);
select public.inventory_product_create('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.faust')::uuid, 'Archived gin', null, null, '750 mL', 'bottle', null, null, null);
reset role;
select set_config('t.titos', (select id::text from public.inventory_products where name like 'Tito%'), true);
select set_config('t.casa', (select id::text from public.inventory_products where name = 'Casamigos Blanco'), true);
select set_config('t.gin', (select id::text from public.inventory_products where name = 'Archived gin'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.titos')::uuid, 4, 6, 12, 1);
select public.inventory_stock_adjust('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.titos')::uuid, 'set', 2, 1, 'stock_count', null, 2);
select public.inventory_stock_adjust('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.casa')::uuid, 'set', 6, 2, 'stock_count', null, 1);
select public.inventory_product_set_active('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.gin')::uuid, false, 1);
reset role;

-- 1. Schema, grants, the audited path ----------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname = 'inventory_import_batches'),
  1, 'BI-IMP-SEC-001 RLS is enabled on import batches'
);
select ok(
  not exists (
    select 1 from unnest(array['insert', 'update', 'delete', 'truncate']) p
    where has_table_privilege('authenticated', 'public.inventory_import_batches', p)
  ),
  'BI-IMP-SEC-001 clients cannot write import batches directly'
);
select ok(
  has_table_privilege('authenticated', 'public.inventory_import_batches', 'select')
  and not has_table_privilege('anon', 'public.inventory_import_batches', 'select'),
  'BI-IMP-SEC-001 batches are readable by authenticated only'
);
select ok(
  has_function_privilege('authenticated', 'public.inventory_import_stage(uuid, uuid, uuid, text, text, text, text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.inventory_import_commit(uuid, uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.inventory_import_stage(uuid, uuid, uuid, text, text, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.inventory_import_commit(uuid, uuid, uuid)', 'execute'),
  'BI-IMP-SEC-002 stage and commit are executable by authenticated, never anon'
);
select ok(
  not has_function_privilege('authenticated', 'private.inventory_stock_adjust_core(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, integer, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.inventory_stock_adjust_core(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, integer, text, uuid)', 'execute'),
  'BI-IMP-SEC-003 the adjust core (which takes source and batch) cannot be called by a client'
);
select ok(
  not exists (
    select 1 from pg_proc p where p.proname = 'inventory_stock_adjust' and p.pronamespace = 'public'::regnamespace
      and (p.proargnames @> array['p_source'] or p.proargnames @> array['p_import_batch_id'])
  ),
  'BI-IMP-SEC-003 the public adjust RPC still has no source or batch parameter to forge'
);
select ok(
  exists (
    select 1 from pg_constraint c
    where c.conname = 'inventory_import_batches_actor_fk' and c.condeferrable and c.condeferred
  ) and exists (
    select 1 from pg_constraint c
    where c.conname = 'inventory_import_batches_location_fk' and c.condeferrable and c.condeferred
  ) and exists (
    select 1 from pg_constraint c
    where c.conname = 'inventory_adjustments_import_batch_fk' and c.condeferrable and c.condeferred
  ),
  'BI-IMP-DB-001 the batch foreign keys are deferrable (tenant teardown cascades in any order)'
);

-- 2. Staging: who may, what is refused ----------------------------------------
select set_config('t.plan_ok', $plan${
  "summary": {"rows": 5, "created": 2, "updated": 1, "skipped": 1, "errors": 1},
  "vendors": [{"ref": "v1", "name": "New Dist"}],
  "categories": [{"ref": "c1", "name": "Wine"}],
  "subcategories": [{"ref": "s1", "name": "Red", "category": {"ref": "c1"}}],
  "rows": [
    {"row": 2, "action": "create", "vendor": {"ref": "v1"}, "category": {"ref": "c1"}, "subcategory": {"ref": "s1"},
     "name": "Malbec", "size": "750 mL", "unit_type": "bottle", "unit_label": null, "sku": "MAL-1", "notes": "Red",
     "on_hand": 6, "backup": 2, "cutoff": 3, "warning": null, "par": 10},
    {"row": 3, "action": "update", "product_id": "__TITOS__", "expected_stock_version": __TITOSVER__,
     "set_product": false, "on_hand": 9, "backup": null, "cutoff": null, "warning": null, "par": null},
    {"row": 4, "action": "create", "vendor": {"id": "__FAUST__"}, "category": null, "subcategory": null,
     "name": "House Gin", "size": "1 L", "unit_type": "bottle", "unit_label": null, "sku": null, "notes": null,
     "on_hand": null, "backup": null, "cutoff": null, "warning": null, "par": null}
  ]
}$plan$, true);

create function pg_temp.plan_ok() returns jsonb language sql as $$
  select replace(replace(replace(current_setting('t.plan_ok'),
    '__TITOS__', current_setting('t.titos')),
    '__TITOSVER__', (select version::text from public.inventory_stock where product_id = current_setting('t.titos')::uuid and location_id = '00000000-0000-0000-0000-000000037021')),
    '__FAUST__', current_setting('t.faust'))::jsonb
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037004', true);
select is(
  pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037001','a.csv','csv',null,'stock_count', pg_temp.plan_ok())$$),
  '42501', 'BI-IMP-AUTH-001 staff cannot stage an import'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037007', true);
select is(
  pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037001','a.csv','csv',null,'stock_count', pg_temp.plan_ok())$$),
  '42501', 'BI-IMP-ISO-001 another organization''s owner cannot stage into this one'
);
select is(
  pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037022','10000000-0000-0000-0000-000000037001','a.csv','csv',null,'stock_count', pg_temp.plan_ok())$$),
  '42501', 'BI-IMP-ISO-001 a location of another organization is refused'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',null,'a.csv','csv',null,'stock_count', pg_temp.plan_ok())$$),
  '22023', 'BI-IMP-VAL-001 a request id is required');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','','csv',null,'stock_count', pg_temp.plan_ok())$$),
  '22023', 'BI-IMP-VAL-001 a file name is required');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','a.xls','xls',null,'stock_count', pg_temp.plan_ok())$$),
  '22023', 'BI-IMP-VAL-001 only csv and xlsx are accepted');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','a.csv','csv',null,'usage', pg_temp.plan_ok())$$),
  '22023', 'BI-IMP-VAL-001 only Stock Count or Delivery / Restock may be the reason');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','a.csv','csv',null,'stock_count','{"rows": "nope"}'::jsonb)$$),
  '22023', 'BI-IMP-VAL-002 a plan whose rows are not a list is refused');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','a.csv','csv',null,'stock_count','{"rows": []}'::jsonb)$$),
  '22023', 'BI-IMP-VAL-002 a plan with nothing to import is refused');
select is(pg_temp.sqlstate_of($$select public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','10000000-0000-0000-0000-000000037002','a.csv','csv',null,'stock_count','{"rows": [{"action": "delete"}]}'::jsonb)$$),
  '22023', 'BI-IMP-VAL-002 a row that is neither create nor update is refused');

select set_config('t.batch1', public.inventory_import_stage(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  '10000000-0000-0000-0000-000000037010','stock.csv','csv',null,'stock_count', pg_temp.plan_ok())::text, true);
reset role;

select is(
  (select row(status, filename, format, reason, rows_in_file, created_count, updated_count, skipped_count, error_count, actor_profile_id)::text
   from public.inventory_import_batches where id = current_setting('t.batch1')::uuid),
  '(staged,stock.csv,csv,stock_count,5,2,1,1,1,00000000-0000-0000-0000-000000037002)',
  'BI-IMP-STG-001 a staged batch records the file, reason, counts and the actor'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select is(
  public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
    '10000000-0000-0000-0000-000000037010','stock.csv','csv',null,'stock_count', pg_temp.plan_ok()),
  current_setting('t.batch1')::uuid,
  'BI-IMP-IDEM-001 staging the same request again returns the same batch'
);
reset role;
select is(
  (select count(*)::int from public.inventory_import_batches where organization_id = '00000000-0000-0000-0000-000000037011'),
  1, 'BI-IMP-IDEM-001 and no second batch is created'
);

-- 3. Who may commit ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037004', true);
select is(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','%s')$$, current_setting('t.batch1'))),
  '42501', 'BI-IMP-AUTH-002 staff cannot commit an import'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037007', true);
select is(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','%s')$$, current_setting('t.batch1'))),
  '42501', 'BI-IMP-ISO-002 another organization''s owner cannot commit into this one'
);
select is(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037012','00000000-0000-0000-0000-000000037022','%s')$$, current_setting('t.batch1'))),
  '22023', 'BI-IMP-ISO-002 naming this batch from another organization finds nothing'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select is(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037023','%s')$$, current_setting('t.batch1'))),
  '22023', 'BI-IMP-ISO-003 a batch staged for one location cannot be committed through another'
);
reset role;

-- 4. A successful commit -----------------------------------------------------
select set_config('t.ledger_before', (select count(*)::text from public.inventory_adjustments), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.res1', public.inventory_import_commit(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021', current_setting('t.batch1')::uuid)::text, true);
reset role;

select is(
  (current_setting('t.res1')::jsonb) - 'already',
  jsonb_build_object('ok', true, 'created', 2, 'updated', 1, 'skipped', 1, 'errors', 1,
    'vendors_created', 1, 'categories_created', 1, 'subcategories_created', 1, 'ledger_rows', 2),
  'BI-IMP-COM-001 the commit reports exactly what it did'
);
select is(
  (select row(v.name, c.name, s.name)::text
   from public.inventory_products p
   join public.inventory_vendors v on v.id = p.vendor_id
   join public.inventory_categories c on c.id = p.category_id
   join public.inventory_subcategories s on s.id = p.subcategory_id
   where p.name = 'Malbec'),
  '("New Dist",Wine,Red)',
  'BI-IMP-COM-002 a new product lands under the vendor, category and subcategory the same batch created'
);
select is(
  (select row(p.sku, p.notes, st.on_hand, st.backup, st.cutoff, st.par)::text
   from public.inventory_products p join public.inventory_stock st on st.product_id = p.id and st.location_id = '00000000-0000-0000-0000-000000037021'
   where p.name = 'Malbec'),
  '(MAL-1,Red,6.00,2.00,3.00,10.00)',
  'BI-IMP-COM-003 a new product gets its SKU, notes, counts and levels'
);
select is(
  (select row(on_hand, backup, cutoff, warning, par)::text from public.inventory_stock where product_id = current_setting('t.titos')::uuid and location_id = '00000000-0000-0000-0000-000000037021'),
  '(9.00,1.00,4.00,6.00,12.00)',
  'BI-IMP-COM-004 an update sets what the file gave and leaves blanks unchanged (D4)'
);
select is(
  (select count(*)::int from public.inventory_products where name = 'House Gin'),
  1, 'BI-IMP-COM-005 a product with no counts is still created'
);
select is(
  (select row(on_hand, backup)::text from public.inventory_stock st join public.inventory_products p on p.id = st.product_id where p.name = 'House Gin' and st.location_id = '00000000-0000-0000-0000-000000037021'),
  '(0.00,0.00)', 'BI-IMP-COM-005 its stock starts at zero'
);
select is(
  (select count(*)::int from public.inventory_adjustments where import_batch_id = current_setting('t.batch1')::uuid),
  2, 'BI-IMP-LED-001 exactly the changed counts were written to the ledger'
);
select is(
  (select string_agg(distinct source || '/' || reason || '/' || actor_profile_id::text, ',')
   from public.inventory_adjustments where import_batch_id = current_setting('t.batch1')::uuid),
  'bulk_import/stock_count/00000000-0000-0000-0000-000000037002',
  'BI-IMP-LED-001 they are bulk_import rows with the batch reason and the committing actor'
);
select is(
  (select row(prev_on_hand, new_on_hand, prev_backup, new_backup, cutoff_at_time)::text
   from public.inventory_adjustments
   where import_batch_id = current_setting('t.batch1')::uuid and product_id = current_setting('t.titos')::uuid),
  '(2.00,9.00,1.00,1.00,4.00)',
  'BI-IMP-LED-002 an imported change records the true previous values and the cutoff of the time'
);
select is(
  (select count(*)::int from public.inventory_adjustments where product_id = (select id from public.inventory_products where name = 'House Gin')),
  0, 'BI-IMP-LED-003 an import never writes a ledger row for a count that did not change'
);
select is(
  (select row(status, created_count, updated_count, vendors_created, categories_created, subcategories_created)::text
   from public.inventory_import_batches where id = current_setting('t.batch1')::uuid),
  '(committed,2,1,1,1,1)',
  'BI-IMP-COM-006 the batch is committed with its real counts'
);
select ok(
  (select committed_at is not null and result is not null from public.inventory_import_batches where id = current_setting('t.batch1')::uuid),
  'BI-IMP-COM-006 and carries the time and the stored result'
);
select ok(
  exists (select 1 from public.inventory_change_log
          where entity_type = 'import' and action = 'import' and entity_id = current_setting('t.batch1')::uuid
            and actor_profile_id = '00000000-0000-0000-0000-000000037002')
  and exists (select 1 from public.inventory_change_log where entity_type = 'vendor' and action = 'create' and diff ->> 'name' = 'New Dist'),
  'BI-IMP-LOG-001 the import and the vendor it created are in the change log'
);

-- 5. Replaying a commit changes nothing --------------------------------------
select set_config('t.ledger_after', (select count(*)::text from public.inventory_adjustments), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.res1b', public.inventory_import_commit(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021', current_setting('t.batch1')::uuid)::text, true);
reset role;
select is(
  (current_setting('t.res1b')::jsonb ->> 'already')::boolean, true,
  'BI-IMP-IDEM-002 committing a committed batch answers "already" with the stored result'
);
select is(
  (select count(*)::text from public.inventory_adjustments), current_setting('t.ledger_after'),
  'BI-IMP-IDEM-002 and writes nothing again'
);
select is(
  (select count(*)::int from public.inventory_products where name in ('Malbec', 'House Gin')),
  2, 'BI-IMP-IDEM-002 and creates no duplicate products'
);

-- 6. A conflict applies nothing ----------------------------------------------
select set_config('t.plan_conflict', $plan${
  "summary": {"rows": 2, "created": 1, "updated": 1, "skipped": 0, "errors": 0},
  "vendors": [{"ref": "v1", "name": "Ghost Co"}],
  "rows": [
    {"row": 2, "action": "create", "vendor": {"ref": "v1"}, "category": null, "subcategory": null,
     "name": "Ghost Rum", "size": "1 L", "unit_type": "bottle", "unit_label": null, "sku": null, "notes": null,
     "on_hand": 3, "backup": null, "cutoff": null, "warning": null, "par": null},
    {"row": 3, "action": "update", "product_id": "__CASA__", "expected_stock_version": __CASAVER__,
     "set_product": false, "on_hand": 1, "backup": null, "cutoff": null, "warning": null, "par": null}
  ]
}$plan$, true);
-- The plan was made against this version of Casamigos' stock...
select set_config('t.casa_ver', (select version::text from public.inventory_stock where product_id = current_setting('t.casa')::uuid and location_id = '00000000-0000-0000-0000-000000037021'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.batch2', public.inventory_import_stage(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  '10000000-0000-0000-0000-000000037020','late.csv','csv',null,'stock_count',
  replace(replace(current_setting('t.plan_conflict'), '__CASA__', current_setting('t.casa')), '__CASAVER__', current_setting('t.casa_ver'))::jsonb)::text, true);
-- ...and then someone else counted it before the manager confirmed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037003', true);
select public.inventory_stock_adjust('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  current_setting('t.casa')::uuid, 'set', 4, 2, 'stock_count', null, current_setting('t.casa_ver')::integer);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.res2', public.inventory_import_commit(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021', current_setting('t.batch2')::uuid)::text, true);
reset role;

select is(
  (current_setting('t.res2')::jsonb -> 'conflicts' -> 0 ->> 'kind') || ':' || (current_setting('t.res2')::jsonb -> 'conflicts' -> 0 ->> 'row'),
  'stock:3', 'BI-IMP-CON-001 a row whose stock changed since the preview is reported as a conflict'
);
select is((current_setting('t.res2')::jsonb ->> 'ok')::boolean, false, 'BI-IMP-CON-001 and the commit says it did not apply');
select is(
  (select row(on_hand, backup)::text from public.inventory_stock where product_id = current_setting('t.casa')::uuid and location_id = '00000000-0000-0000-0000-000000037021'),
  '(4.00,2.00)', 'BI-IMP-CON-002 the other person''s count was not overwritten'
);
select is(
  (select count(*)::int from public.inventory_vendors where name = 'Ghost Co')
  + (select count(*)::int from public.inventory_products where name = 'Ghost Rum'),
  0, 'BI-IMP-CON-003 nothing else from the plan was applied either (no vendor, no product)'
);
select is(
  (select status from public.inventory_import_batches where id = current_setting('t.batch2')::uuid),
  'staged', 'BI-IMP-CON-004 the batch stays staged so it can be previewed again'
);

-- An archived target and a changed product are conflicts too.
select set_config('t.plan_arch', format($plan${
  "summary": {"rows": 2, "created": 0, "updated": 2, "skipped": 0, "errors": 0},
  "rows": [
    {"row": 2, "action": "update", "product_id": "%s", "expected_stock_version": 1, "set_product": false,
     "on_hand": 5, "backup": null, "cutoff": null, "warning": null, "par": null},
    {"row": 3, "action": "update", "product_id": "%s", "expected_stock_version": %s, "set_product": true,
     "expected_product_version": 99, "vendor": {"id": "%s"}, "name": "Renamed", "size": "750 mL", "unit_type": "bottle",
     "unit_label": null, "sku": null, "notes": null, "category": null, "subcategory": null,
     "on_hand": null, "backup": null, "cutoff": null, "warning": null, "par": null}
  ]
}$plan$, current_setting('t.gin'), current_setting('t.casa'),
  (select version::text from public.inventory_stock where product_id = current_setting('t.casa')::uuid and location_id = '00000000-0000-0000-0000-000000037021'),
  current_setting('t.faust')), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.res3', public.inventory_import_commit(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
    '10000000-0000-0000-0000-000000037030','arch.csv','csv',null,'stock_count', current_setting('t.plan_arch')::jsonb))::text, true);
reset role;
select is(
  (select string_agg(c ->> 'kind', ',' order by (c ->> 'row')::int) from jsonb_array_elements(current_setting('t.res3')::jsonb -> 'conflicts') c),
  'archived,product', 'BI-IMP-CON-005 an archived item and a changed product are conflicts, reported per row'
);

-- 7. One failing row rolls the whole import back -----------------------------
select set_config('t.plan_dup', format($plan${
  "summary": {"rows": 2, "created": 2, "updated": 0, "skipped": 0, "errors": 0},
  "vendors": [{"ref": "v1", "name": "Rollback Co"}],
  "rows": [
    {"row": 2, "action": "create", "vendor": {"ref": "v1"}, "category": null, "subcategory": null,
     "name": "Fresh Rum", "size": "1 L", "unit_type": "bottle", "unit_label": null, "sku": null, "notes": null,
     "on_hand": 7, "backup": null, "cutoff": null, "warning": null, "par": null},
    {"row": 3, "action": "create", "vendor": {"id": "%s"}, "category": null, "subcategory": null,
     "name": "Casamigos Blanco", "size": "750 mL", "unit_type": "bottle", "unit_label": null, "sku": null, "notes": null,
     "on_hand": 1, "backup": null, "cutoff": null, "warning": null, "par": null}
  ]
}$plan$, current_setting('t.faust')), true);
select set_config('t.ledger_pre_fail', (select count(*)::text from public.inventory_adjustments), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.batch4', public.inventory_import_stage(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  '10000000-0000-0000-0000-000000037040','dup.csv','csv',null,'stock_count', current_setting('t.plan_dup')::jsonb)::text, true);
select isnt(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','%s')$$, current_setting('t.batch4'))),
  null, 'BI-IMP-ATM-001 a row the catalog refuses (a duplicate product) fails the commit'
);
reset role;
select is(
  (select count(*)::int from public.inventory_vendors where name = 'Rollback Co')
  + (select count(*)::int from public.inventory_products where name = 'Fresh Rum'),
  0, 'BI-IMP-ATM-001 and the vendor and product created before it are rolled back'
);
select is(
  (select count(*)::text from public.inventory_adjustments), current_setting('t.ledger_pre_fail'),
  'BI-IMP-ATM-001 no ledger row survives'
);
select is(
  (select status from public.inventory_import_batches where id = current_setting('t.batch4')::uuid),
  'staged', 'BI-IMP-ATM-001 the batch is still staged, not half-committed'
);

-- A plan that names something it does not create is refused whole.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037002', true);
select set_config('t.batch5', public.inventory_import_stage(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  '10000000-0000-0000-0000-000000037050','ref.csv','csv',null,'stock_count',
  '{"rows": [{"row": 2, "action": "create", "vendor": {"ref": "nope"}, "name": "X", "unit_type": "bottle"}]}'::jsonb)::text, true);
select is(
  pg_temp.sqlstate_of(format($$select public.inventory_import_commit('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021','%s')$$, current_setting('t.batch5'))),
  '22023', 'BI-IMP-VAL-003 a plan that refers to an entity it does not create is refused'
);
reset role;

-- 8. A Delivery / Restock batch is a bulk_import row with that reason ---------
select set_config('t.plan_deliv', format($plan${
  "summary": {"rows": 1, "created": 0, "updated": 1, "skipped": 0, "errors": 0},
  "rows": [{"row": 2, "action": "update", "product_id": "%s", "expected_stock_version": %s, "set_product": false,
    "on_hand": 20, "backup": null, "cutoff": null, "warning": null, "par": null}]
}$plan$, current_setting('t.casa'),
  (select version::text from public.inventory_stock where product_id = current_setting('t.casa')::uuid and location_id = '00000000-0000-0000-0000-000000037021')), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037001', true);
select set_config('t.res6', public.inventory_import_commit(
  '00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
  public.inventory_import_stage('00000000-0000-0000-0000-000000037011','00000000-0000-0000-0000-000000037021',
    '10000000-0000-0000-0000-000000037060','deliv.csv','csv',null,'delivery_restock', current_setting('t.plan_deliv')::jsonb))::text, true);
reset role;
select is(
  (select source || '/' || reason from public.inventory_adjustments
   where product_id = current_setting('t.casa')::uuid order by id desc limit 1),
  'bulk_import/delivery_restock',
  'BI-IMP-LED-004 a delivery import keeps the Delivery / Restock reason (and the owner may commit)'
);

-- 9. Reading batches ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037003', true);
select ok(
  (select count(*) from public.inventory_import_batches) >= 4,
  'BI-IMP-RLS-001 an assistant manager can read the location''s batches'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037004', true);
select is((select count(*)::int from public.inventory_import_batches), 0, 'BI-IMP-RLS-001 staff see no batches');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000037007', true);
select is((select count(*)::int from public.inventory_import_batches), 0, 'BI-IMP-RLS-001 another organization sees no batches');
reset role;

-- 10. Tenant teardown --------------------------------------------------------
select lives_ok(
  $$delete from public.organizations where id = '00000000-0000-0000-0000-000000037011'$$,
  'BI-IMP-DB-002 an organization with imports, batches and ledger rows can be torn down'
);
select is(
  (select count(*)::int from public.inventory_import_batches where organization_id = '00000000-0000-0000-0000-000000037011')
  + (select count(*)::int from public.inventory_adjustments where organization_id = '00000000-0000-0000-0000-000000037011'),
  0, 'BI-IMP-DB-002 and nothing is left behind'
);

select * from finish();
rollback;
