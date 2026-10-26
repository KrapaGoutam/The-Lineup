begin;

create extension if not exists pgtap with schema extensions;

select plan(108);

-- ---------------------------------------------------------------------
-- Bar Inventory V1 / BI-1 -- catalog, authorization and audit boundary.
-- Cast (org A): owner Olga, manager Mona (general_manager), assistant manager
-- Asa (shift_manager), staff Ann (server) and Hal (host), inactive manager Ina.
-- Org B: Otto, an owner of a different organization.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000033001', '0331-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033002', '0331-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033003', '0331-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033004', '0331-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033005', '0331-hal@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033006', '0331-ina@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033007', '0331-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000033001', 'PGTAP 0331 Olga'),
  ('00000000-0000-0000-0000-000000033002', 'PGTAP 0331 Mona'),
  ('00000000-0000-0000-0000-000000033003', 'PGTAP 0331 Asa'),
  ('00000000-0000-0000-0000-000000033004', 'PGTAP 0331 Ann'),
  ('00000000-0000-0000-0000-000000033005', 'PGTAP 0331 Hal'),
  ('00000000-0000-0000-0000-000000033006', 'PGTAP 0331 Ina'),
  ('00000000-0000-0000-0000-000000033007', 'PGTAP 0331 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000033011', 'PGTAP 0331 Org', 'pgtap-0331-org', '00000000-0000-0000-0000-000000033001'),
  ('00000000-0000-0000-0000-000000033012', 'PGTAP 0331 Other', 'pgtap-0331-other', '00000000-0000-0000-0000-000000033007');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000033021', '00000000-0000-0000-0000-000000033011', 'PGTAP 0331 Loc', 'America/New_York'),
  ('00000000-0000-0000-0000-000000033022', '00000000-0000-0000-0000-000000033012', 'PGTAP 0331 Other Loc', 'America/New_York');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033005', array['host']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000033011', '00000000-0000-0000-0000-000000033006', array['shift_manager']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000033012', '00000000-0000-0000-0000-000000033007', array['owner']::public.app_role[], true);

-- Reads the PostgREST-visible `detail` of a failing statement (PT409 / 23505 JSON).
create function pg_temp.detail_of(p_sql text) returns text
language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end;
$$;

-- 1. Schema, grants and function hygiene -----------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
     and c.relname in ('inventory_vendors','inventory_categories','inventory_subcategories',
       'inventory_products','inventory_change_log')),
  5, 'BI-SEC-001 RLS is enabled on every catalog table'
);

select ok(
  not exists (
    select 1
    from unnest(array['inventory_vendors','inventory_categories','inventory_subcategories',
      'inventory_products','inventory_change_log']) t
    cross join unnest(array['insert','update','delete','truncate']) p
    where has_table_privilege('authenticated', 'public.' || t, p)
  ),
  'BI-SEC-001 authenticated has no INSERT/UPDATE/DELETE/TRUNCATE on any catalog table'
);

select ok(
  not exists (
    select 1
    from unnest(array['inventory_vendors','inventory_categories','inventory_subcategories',
      'inventory_products','inventory_change_log']) t
    where has_table_privilege('anon', 'public.' || t, 'select')
  ),
  'BI-SEC-001 anon cannot read any catalog table'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.proname like 'inventory\_%'
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'BI-SEC-003 every inventory function pins an empty search_path'
);

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in (
      'inventory_begin','inventory_log','inventory_diff','inventory_raise_stale',
      'inventory_raise_duplicate','inventory_ensure_system_vendor','inventory_valid_name',
      'inventory_optional_text','inventory_validate_product','inventory_check_product_unique',
      'inventory_name_key','inventory_size_key','inventory_sku_key','inventory_unit_key',
      'inventory_clean_text','inventory_change_log_append_only','inventory_vendors_system_guard')
      and (has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute'))
  ),
  'BI-SEC-003 internal helpers are not executable by clients'
);

select ok(
  has_function_privilege('authenticated', 'private.inventory_is_manager(uuid)', 'execute')
  and has_function_privilege('authenticated', 'private.inventory_can_access_location(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.inventory_is_manager(uuid)', 'execute'),
  'BI-SEC-003 the two policy predicates are executable by authenticated only'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'inventory_%' and p.proname not like 'inventory_stock_%'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')),
  13, 'BI-SEC-003 all 13 catalog RPCs are executable by authenticated and not anon'
);

-- 2. Role matrix --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033004', true);
select throws_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  '42501', null, 'BI-SEC-002 a server cannot bootstrap Bar Inventory'
);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','Staff vendor',null)$$,
  '42501', null, 'BI-SEC-002 a server cannot create a vendor'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033005', true);
select throws_ok(
  $$select public.inventory_category_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','Host category')$$,
  '42501', null, 'BI-SEC-002 a host cannot create a category'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033006', true);
select throws_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  '42501', null, 'BI-SEC-002 a deactivated manager is refused'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033007', true);
select throws_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  '42501', null, 'BI-SEC-002 an owner of another organization is refused'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  '42501', null, 'BI-SEC-002 anon cannot call the RPC at all'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033001', true);
select throws_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033022')$$,
  '42501', null, 'BI-SEC-005 a location from another organization is refused'
);
select lives_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  'BI-SEC-002 the owner may bootstrap'
);
reset role;
select set_config('t.unassigned', (select id::text from public.inventory_vendors
  where organization_id = '00000000-0000-0000-0000-000000033011' and is_system), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select is(
  public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')::text,
  current_setting('t.unassigned'),
  'BI-CAT-003 bootstrap is idempotent and returns the same system vendor (manager)'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033003', true);
select lives_ok(
  $$select public.inventory_bootstrap('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021')$$,
  'BI-SEC-002 the assistant manager may use Bar Inventory'
);
reset role;

select is(
  (select count(*)::int from public.inventory_vendors
   where organization_id = '00000000-0000-0000-0000-000000033011' and is_system),
  1, 'BI-CAT-003 exactly one system vendor per organization'
);
select is(
  (select name from public.inventory_vendors where id = current_setting('t.unassigned')::uuid),
  'Unassigned', 'BI-CAT-003 the system vendor is called Unassigned'
);

-- 3. Visibility (RLS) -----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select is(
  (select count(*)::int from public.inventory_vendors), 1,
  'BI-SEC-002 a manager sees the organization''s vendors'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033004', true);
select is((select count(*)::int from public.inventory_vendors), 0, 'BI-SEC-002 a server sees no vendors');
select is((select count(*)::int from public.inventory_change_log), 0, 'BI-SEC-002 a server sees no change log');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033007', true);
select is(
  (select count(*)::int from public.inventory_vendors where organization_id = '00000000-0000-0000-0000-000000033011'),
  0, 'BI-SEC-005 another organization''s owner sees none of these vendors'
);
reset role;

-- 4. Vendors ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select lives_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','Faust','Spirits rep: Sam')$$,
  'BI-CAT-004 a manager creates a vendor'
);
select lives_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','  Del   Papa ',null)$$,
  'vendor name whitespace is collapsed and trimmed'
);
reset role;
select set_config('t.faust', (select id::text from public.inventory_vendors where name = 'Faust'), true);
select set_config('t.delpapa', (select id::text from public.inventory_vendors where name = 'Del Papa'), true);

select is(
  (select name from public.inventory_vendors where id = current_setting('t.delpapa')::uuid),
  'Del Papa', 'the display name is the cleaned first-entered spelling'
);
select is(
  (select version from public.inventory_vendors where id = current_setting('t.faust')::uuid),
  1, 'a new vendor starts at version 1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','DelPapa',null)$$,
  '23505', null, 'BI-CAT-002 "DelPapa" collides with "Del Papa"'
);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','DEL PAPA',null)$$,
  '23505', null, 'BI-CAT-002 "DEL PAPA" collides with "Del Papa"'
);
select is(
  (pg_temp.detail_of($$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','del papa',null)$$)::jsonb ->> 'existing_label'),
  'Del Papa', 'BI-CAT-002 the duplicate error names the existing vendor'
);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','unassigned',null)$$,
  '23505', null, 'the reserved name Unassigned cannot be used'
);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','   ',null)$$,
  '22023', null, 'a blank vendor name is rejected'
);
select throws_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','---',null)$$,
  '22023', null, 'a vendor name with no letters or digits is rejected'
);
select throws_ok(
  format($$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,null)$$, repeat('x', 121)),
  '22023', null, 'a vendor name over 120 characters is rejected'
);

-- rename: optimistic concurrency, no-op, collision
select is(
  public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.faust')::uuid, 'Faust Distributing', 'Spirits rep: Sam', 1),
  2, 'BI-CAT-004 renaming a vendor bumps the version'
);
select throws_ok(
  format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Faust Again',null,1)$$, current_setting('t.faust')),
  'PT409', null, 'BI-ADJ-005 a stale vendor edit is refused with PT409'
);
select is(
  (pg_temp.detail_of(format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Faust Again',null,1)$$, current_setting('t.faust')))::jsonb ->> 'kind'),
  'stale', 'the stale error is structured'
);
select is(
  (pg_temp.detail_of(format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Faust Again',null,1)$$, current_setting('t.faust')))::jsonb ->> 'updated_by'),
  'PGTAP 0331 Mona', 'the stale error says who changed it'
);
select is(
  public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.faust')::uuid, 'Faust Distributing', 'Spirits rep: Sam', 2),
  2, 'BI-ADJ-008 an identical re-submit is a no-op (same version)'
);
select throws_ok(
  format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'delpapa',null,2)$$, current_setting('t.faust')),
  '23505', null, 'BI-CAT-004 renaming into another vendor''s key is refused'
);
select throws_ok(
  format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Renamed',null,1)$$, current_setting('t.unassigned')),
  '22023', null, 'BI-CAT-003 the system vendor cannot be renamed'
);
select throws_ok(
  format($$select public.inventory_vendor_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,false,1)$$, current_setting('t.unassigned')),
  '22023', null, 'BI-CAT-003 the system vendor cannot be deactivated'
);
select is(
  public.inventory_vendor_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.delpapa')::uuid, false, 1),
  2, 'BI-CAT-004 a vendor can be deactivated'
);
select is(
  public.inventory_vendor_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.delpapa')::uuid, true, 2),
  3, 'BI-CAT-004 a vendor can be reactivated'
);
select throws_ok(
  format($$select public.inventory_vendor_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,false,1)$$, current_setting('t.delpapa')),
  'PT409', null, 'a stale deactivate is refused'
);
reset role;

-- guards (as the table owner)
select throws_ok(
  format($$update public.inventory_vendors set name = 'Hacked' where id = %L$$, current_setting('t.unassigned')),
  '23514', null, 'BI-CAT-003 the system vendor cannot be renamed even by direct SQL'
);
select throws_ok(
  format($$delete from public.inventory_vendors where id = %L$$, current_setting('t.unassigned')),
  '23514', null, 'BI-CAT-003 the system vendor cannot be deleted even by direct SQL'
);

-- cross-tenant
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033007', true);
select lives_ok(
  $$select public.inventory_vendor_create('00000000-0000-0000-0000-000000033012','00000000-0000-0000-0000-000000033022','Faust',null)$$,
  'BI-SEC-005 another organization may use the same vendor name'
);
reset role;
select set_config('t.otherfaust', (select id::text from public.inventory_vendors
  where organization_id = '00000000-0000-0000-0000-000000033012' and name = 'Faust'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select throws_ok(
  format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Stolen',null,1)$$, current_setting('t.otherfaust')),
  '22023', null, 'BI-CAT-011 another organization''s vendor id cannot be edited'
);
select throws_ok(
  format($$select public.inventory_vendor_update('00000000-0000-0000-0000-000000033012','00000000-0000-0000-0000-000000033022',%L,'Stolen',null,1)$$, current_setting('t.otherfaust')),
  '42501', null, 'BI-CAT-011 and the other organization is refused outright'
);
reset role;

-- 5. Categories and subcategories ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033003', true);
select lives_ok(
  $$select public.inventory_category_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','Spirits')$$,
  'an assistant manager creates a category'
);
select lives_ok(
  $$select public.inventory_category_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021','Beer')$$,
  'a second category'
);
select throws_ok(
  $$select public.inventory_category_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',' SPIRITS ')$$,
  '23505', null, 'a duplicate category (case/space-insensitive) is refused'
);
reset role;
select set_config('t.spirits', (select id::text from public.inventory_categories where name = 'Spirits'), true);
select set_config('t.beer', (select id::text from public.inventory_categories where name = 'Beer'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033003', true);
select lives_ok(
  format($$select public.inventory_subcategory_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Vodka')$$, current_setting('t.spirits')),
  'BI-CAT-006 a subcategory under its category'
);
select lives_ok(
  format($$select public.inventory_subcategory_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Vodka')$$, current_setting('t.beer')),
  'the same subcategory name is allowed under another category'
);
select throws_ok(
  format($$select public.inventory_subcategory_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'vodka')$$, current_setting('t.spirits')),
  '23505', null, 'BI-CAT-006 a duplicate subcategory in the same category is refused'
);
select throws_ok(
  $$select public.inventory_subcategory_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',gen_random_uuid(),'Orphan')$$,
  '22023', null, 'BI-CAT-006 a subcategory must have a category'
);
reset role;
select set_config('t.vodka', (select s.id::text from public.inventory_subcategories s
  where s.name = 'Vodka' and s.category_id = current_setting('t.spirits')::uuid), true);
select set_config('t.beervodka', (select s.id::text from public.inventory_subcategories s
  where s.name = 'Vodka' and s.category_id = current_setting('t.beer')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033003', true);
select is(
  public.inventory_category_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.beer')::uuid, 'Beer & Cider', 1),
  2, 'a category can be renamed'
);
select throws_ok(
  format($$select public.inventory_category_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Wine',1)$$, current_setting('t.beer')),
  'PT409', null, 'a stale category rename is refused'
);
select is(
  public.inventory_category_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.beer')::uuid, false, 2),
  3, 'a category can be archived'
);
select throws_ok(
  format($$select public.inventory_subcategory_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Lager')$$, current_setting('t.beer')),
  '22023', null, 'no new subcategory under an archived category'
);
select is(
  public.inventory_subcategory_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.beervodka')::uuid, false, 1),
  2, 'a subcategory can be archived'
);
select throws_ok(
  format($$select public.inventory_subcategory_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,true,2)$$, current_setting('t.beervodka')),
  '22023', null, 'a subcategory cannot be reactivated while its category is archived'
);
select is(
  public.inventory_category_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.beer')::uuid, true, 3),
  4, 'the category is reactivated'
);
select is(
  public.inventory_subcategory_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.beervodka')::uuid, true, 2),
  3, 'the subcategory is reactivated once its category is active'
);
reset role;

-- 6. Products ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Tito''s Handmade Vodka',%L,%L,'750 mL','bottle',null,'TIT-750','house vodka')$$,
    current_setting('t.faust'), current_setting('t.spirits'), current_setting('t.vodka')),
  'BI-CAT-007 a manager creates a product'
);
reset role;
select set_config('t.titos750', (select id::text from public.inventory_products where sku = 'TIT-750'), true);

select is(
  (select name_key || '|' || size_key || '|' || unit_key || '|' || sku_key
   from public.inventory_products where id = current_setting('t.titos750')::uuid),
  'titoshandmadevodka|750ml|bottle|TIT-750', 'BI-CAT-001 matching keys are generated by the database'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'TITOS handmade vodka',null,null,'750ml','bottle',null,null,null)$$, current_setting('t.faust')),
  '23505', null, 'BI-CAT-007 the same vendor + name + size + unit is refused'
);
select is(
  (pg_temp.detail_of(format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'TITOS handmade vodka',null,null,'750ml','bottle',null,null,null)$$, current_setting('t.faust')))::jsonb ->> 'field'),
  'identity', 'the duplicate error says it was the identity that collided'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Tito''s Handmade Vodka',null,null,'1.75 L','bottle',null,null,null)$$, current_setting('t.faust')),
  'BI-CAT-007 Tito''s 1.75 L is a different product'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Tito''s Handmade Vodka',null,null,'750 mL','bottle',null,null,null)$$, current_setting('t.delpapa')),
  'the same product from a different vendor is a different product'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Tito''s Handmade Vodka',null,null,'750 mL','keg',null,null,null)$$, current_setting('t.faust')),
  'a different unit is a different product'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Another vodka',null,null,'1 L','bottle',null,' tit-750 ',null)$$, current_setting('t.faust')),
  '23505', null, 'BI-CAT-007 a SKU already in use is refused (case/whitespace-insensitive)'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Growler pour',null,null,null,'other',null,null,null)$$, current_setting('t.faust')),
  '22023', null, 'BI-CAT-008 unit Other needs a label'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Growler pour',null,null,null,'other','Growler',null,null)$$, current_setting('t.faust')),
  'BI-CAT-008 unit Other with a label is accepted'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Label on bottle',null,null,null,'bottle','Growler',null,null)$$, current_setting('t.faust')),
  '22023', null, 'BI-CAT-008 a label is only valid with Other'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Barrel thing',null,null,null,'barrel',null,null,null)$$, current_setting('t.faust')),
  '22023', null, 'BI-CAT-008 an unknown unit is refused'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Sub no cat',null,%L,null,'bottle',null,null,null)$$, current_setting('t.faust'), current_setting('t.vodka')),
  '22023', null, 'BI-CAT-006 a subcategory without a category is refused'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Wrong sub',%L,%L,null,'bottle',null,null,null)$$, current_setting('t.faust'), current_setting('t.spirits'), current_setting('t.beervodka')),
  '22023', null, 'BI-CAT-006 a subcategory from another category is refused'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Foreign vendor',null,null,null,'bottle',null,null,null)$$, current_setting('t.otherfaust')),
  '22023', null, 'BI-CAT-011 a vendor from another organization is refused'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Mystery mixer',null,null,null,'can',null,null,null)$$, current_setting('t.unassigned')),
  'BI-CAT-003 a product can be assigned to the Unassigned vendor'
);

-- update, archive, reactivate
select is(
  public.inventory_product_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.titos750')::uuid, current_setting('t.faust')::uuid, 'Tito''s Handmade Vodka',
    current_setting('t.spirits')::uuid, current_setting('t.vodka')::uuid, '750 mL', 'bottle', null, 'TIT-750', 'house vodka', 1),
  1, 'BI-ADJ-008 an identical product update is a no-op'
);
select is(
  public.inventory_product_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.titos750')::uuid, current_setting('t.faust')::uuid, 'Tito''s Handmade Vodka',
    current_setting('t.spirits')::uuid, current_setting('t.vodka')::uuid, '750 mL', 'bottle', null, 'TIT-750', 'rail vodka', 1),
  2, 'a product edit bumps the version'
);
select throws_ok(
  format($$select public.inventory_product_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,%L,'Tito''s Handmade Vodka',null,null,'750 mL','bottle',null,'TIT-750','x',1)$$, current_setting('t.titos750'), current_setting('t.faust')),
  'PT409', null, 'BI-ADJ-005 a stale product edit is refused'
);
select throws_ok(
  format($$select public.inventory_product_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,%L,'Tito''s Handmade Vodka',null,null,'1.75 L','bottle',null,'TIT-750',null,2)$$, current_setting('t.titos750'), current_setting('t.faust')),
  '23505', null, 'editing into another product''s identity is refused'
);
select is(
  public.inventory_product_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.titos750')::uuid, false, 2),
  3, 'BI-CAT-010 a product can be archived'
);
select throws_ok(
  format($$select public.inventory_product_update('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,%L,'Edited',null,null,'750 mL','bottle',null,null,null,3)$$, current_setting('t.titos750'), current_setting('t.faust')),
  '22023', null, 'an archived product cannot be edited'
);
select lives_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Tito''s Handmade Vodka',null,null,'750 mL','bottle',null,'TIT-750',null)$$, current_setting('t.faust')),
  'BI-CAT-010 an archived product does not block re-creating the same product (and its SKU)'
);
select throws_ok(
  format($$select public.inventory_product_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,true,3)$$, current_setting('t.titos750')),
  '23505', null, 'BI-CAT-010 reactivation re-checks identity and SKU'
);
reset role;

-- vendor deactivation interplay
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033002', true);
select is(
  public.inventory_vendor_set_active('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',
    current_setting('t.delpapa')::uuid, false, 3),
  4, 'deactivating a vendor with products is allowed (nothing is deleted)'
);
select throws_ok(
  format($$select public.inventory_product_create('00000000-0000-0000-0000-000000033011','00000000-0000-0000-0000-000000033021',%L,'Late product',null,null,null,'bottle',null,null,null)$$, current_setting('t.delpapa')),
  '22023', null, 'no new product under an inactive vendor'
);
select is(
  (select count(*)::int from public.inventory_products where vendor_id = current_setting('t.delpapa')::uuid),
  1, 'the inactive vendor''s product is still readable'
);
reset role;

-- 7. Table constraints (as the table owner) ----------------------------
-- Foreign keys are DEFERRABLE INITIALLY DEFERRED (tenant-teardown cascades);
-- check them immediately so each violation is reported where it happens.
set constraints all immediate;
select throws_ok(
  format($$insert into public.inventory_products (organization_id, vendor_id, name, subcategory_id, unit_type, created_by)
    values ('00000000-0000-0000-0000-000000033011', %L, 'Bad sub', %L, 'bottle', '00000000-0000-0000-0000-000000033002')$$,
    current_setting('t.faust'), current_setting('t.vodka')),
  '23514', null, 'BI-CAT-006 a lone subcategory violates the table check'
);
select throws_ok(
  format($$insert into public.inventory_products (organization_id, vendor_id, name, unit_type, unit_label, created_by)
    values ('00000000-0000-0000-0000-000000033011', %L, 'Bad label', 'bottle', 'Growler', '00000000-0000-0000-0000-000000033002')$$,
    current_setting('t.faust')),
  '23514', null, 'BI-CAT-008 the unit-label rule is enforced by the table'
);
select throws_ok(
  format($$insert into public.inventory_products (organization_id, vendor_id, name, unit_type, active, created_by)
    values ('00000000-0000-0000-0000-000000033011', %L, 'Bad archive', 'bottle', false, '00000000-0000-0000-0000-000000033002')$$,
    current_setting('t.faust')),
  '23514', null, 'an inactive product must carry an archived_at'
);
select throws_ok(
  format($$insert into public.inventory_vendors (organization_id, name, name_key, created_by)
    values ('00000000-0000-0000-0000-000000033011', 'Forged', 'forged', '00000000-0000-0000-0000-000000033002')$$),
  '428C9', null, 'BI-CAT-001 a key cannot be supplied: it is a generated column'
);
select throws_ok(
  format($$insert into public.inventory_products (organization_id, vendor_id, name, unit_type, created_by)
    values ('00000000-0000-0000-0000-000000033011', %L, 'Cross tenant', 'bottle', '00000000-0000-0000-0000-000000033002')$$,
    current_setting('t.otherfaust')),
  '23503', null, 'BI-SEC-005 the composite foreign key rejects another tenant''s vendor'
);
select throws_ok(
  format($$delete from public.inventory_vendors where id = %L$$, current_setting('t.faust')),
  '23503', null, 'BI-CAT-005 a vendor referenced by products cannot be deleted'
);

-- 8. Change log ---------------------------------------------------------
select ok(
  (select count(*) >= 10 from public.inventory_change_log
   where organization_id = '00000000-0000-0000-0000-000000033011'),
  'BI-HIST-004 catalog changes are recorded in the change log'
);
select is(
  (select count(distinct actor_profile_id)::int from public.inventory_change_log
   where organization_id = '00000000-0000-0000-0000-000000033011'
     and entity_type in ('vendor','product','category','subcategory')),
  2, 'the actor is always the authenticated caller (Mona and Asa made the changes)'
);
select is(
  (select diff -> 'name' from public.inventory_change_log
   where entity_type = 'vendor' and entity_id = current_setting('t.faust')::uuid and action = 'rename'),
  '["Faust", "Faust Distributing"]'::jsonb, 'a rename records old and new values'
);
select is(
  (select count(*)::int from public.inventory_change_log
   where entity_type = 'vendor' and entity_id = current_setting('t.faust')::uuid and action = 'rename'),
  1, 'a no-op re-submit wrote no extra log row'
);
select throws_ok(
  $$update public.inventory_change_log set diff = '{}'::jsonb$$,
  '23514', null, 'BI-ADJ-003 the change log cannot be updated'
);
select throws_ok(
  $$delete from public.inventory_change_log$$,
  '23514', null, 'the change log cannot be deleted from'
);
select throws_ok(
  $$truncate public.inventory_change_log$$,
  '23514', null, 'the change log cannot be truncated'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000033003', true);
select ok(
  (select count(*) >= 10 from public.inventory_change_log),
  'a manager can read the change log'
);
reset role;

-- 9. Tenant teardown still works (cascade from the organization) ----------
set constraints all deferred;
delete from public.organizations where id = '00000000-0000-0000-0000-000000033012';
select is(
  (select count(*)::int from public.inventory_vendors where organization_id = '00000000-0000-0000-0000-000000033012'),
  0, 'BI-SEC-005 deleting an organization cascades its catalog away'
);

-- The organization WITH categories / subcategories / products / ledger-style history
-- also tears down completely (deferred checks run at the end of the statement).
delete from public.organizations where id = '00000000-0000-0000-0000-000000033011';
set constraints all immediate;
select is(
  (select count(*)::int from public.inventory_subcategories where organization_id = '00000000-0000-0000-0000-000000033011')
  + (select count(*)::int from public.inventory_products where organization_id = '00000000-0000-0000-0000-000000033011'),
  0, 'BI-SEC-005 an organization with subcategories and products tears down completely'
);

select * from finish();
rollback;
