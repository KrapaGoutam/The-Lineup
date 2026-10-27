begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(88);

-- Vendor Order Drafts V1 / VOD-1 database contract.
-- Org A: owner Olga, manager Mona, assistant manager Asa, staff Ann,
-- inactive manager Ina. Org B: owner Otto. Org A has two locations so the
-- RPC boundary can prove that a draft id cannot be used with a forged location.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000039001', '039-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000039002', '039-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000039003', '039-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000039004', '039-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000039005', '039-ina@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000039006', '039-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000039001', 'VOD Olga'),
  ('00000000-0000-0000-0000-000000039002', 'VOD Mona'),
  ('00000000-0000-0000-0000-000000039003', 'VOD Asa'),
  ('00000000-0000-0000-0000-000000039004', 'VOD Ann'),
  ('00000000-0000-0000-0000-000000039005', 'VOD Ina'),
  ('00000000-0000-0000-0000-000000039006', 'VOD Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000039011', 'VOD Org A', 'vod-org-a', '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039012', 'VOD Org B', 'vod-org-b', '00000000-0000-0000-0000-000000039006');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000039021', '00000000-0000-0000-0000-000000039011', 'VOD Loc A1', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000039022', '00000000-0000-0000-0000-000000039011', 'VOD Loc A2', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000039023', '00000000-0000-0000-0000-000000039012', 'VOD Loc B', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039005', array['general_manager']::public.app_role[], false),
  ('00000000-0000-0000-0000-000000039012', '00000000-0000-0000-0000-000000039006', array['owner']::public.app_role[], true);

insert into public.inventory_vendors
  (id, organization_id, name, is_system, active, created_by)
values
  ('00000000-0000-0000-0000-000000039031', '00000000-0000-0000-0000-000000039011', 'Unassigned', true, true, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039032', '00000000-0000-0000-0000-000000039011', 'Faust', false, true, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039033', '00000000-0000-0000-0000-000000039011', 'Inactive Vendor', false, false, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039034', '00000000-0000-0000-0000-000000039011', 'Other Vendor', false, true, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039035', '00000000-0000-0000-0000-000000039012', 'Org B Vendor', false, true, '00000000-0000-0000-0000-000000039006');

insert into public.inventory_products
  (id, organization_id, vendor_id, name, size, unit_type, sku, active, archived_at, created_by)
values
  ('00000000-0000-0000-0000-000000039041', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039032', 'Titos', '1L', 'bottle', 'TITO-1L', true, null, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039042', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039032', 'Corona', 'Case', 'case', null, true, null, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039043', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039032', 'Promo Gin', '750ml', 'bottle', null, true, null, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039044', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039034', 'Other Rum', '750ml', 'bottle', null, true, null, '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039045', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039032', 'Archived Rye', '750ml', 'bottle', null, false, now(), '00000000-0000-0000-0000-000000039001'),
  ('00000000-0000-0000-0000-000000039046', '00000000-0000-0000-0000-000000039012', '00000000-0000-0000-0000-000000039035', 'Org B Vodka', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000039006'),
  ('00000000-0000-0000-0000-000000039047', '00000000-0000-0000-0000-000000039011', '00000000-0000-0000-0000-000000039032', 'Future Low', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000039001');

-- Seed stock snapshots: Titos is Critical with suggestion 8; Corona is
-- Critical without a par; Promo Gin is healthy and is added manually later.
update public.inventory_stock set on_hand = 4, backup = 0, cutoff = 4, warning = 6, par = 12
where product_id = '00000000-0000-0000-0000-000000039041' and location_id = '00000000-0000-0000-0000-000000039021';
update public.inventory_stock set on_hand = 1, backup = 0, cutoff = 2, warning = 3, par = null
where product_id = '00000000-0000-0000-0000-000000039042' and location_id = '00000000-0000-0000-0000-000000039021';
update public.inventory_stock set on_hand = 20, backup = 0, cutoff = 4, warning = 6, par = 24
where product_id = '00000000-0000-0000-0000-000000039043' and location_id = '00000000-0000-0000-0000-000000039021';
update public.inventory_stock set on_hand = 20, backup = 0, cutoff = 4, warning = 6, par = 10
where product_id = '00000000-0000-0000-0000-000000039047' and location_id = '00000000-0000-0000-0000-000000039021';

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

create function pg_temp.message_of(p_sql text) returns text
language plpgsql as $$
declare v_message text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_message = message_text;
  return v_message;
end;
$$;

-- Schema, grants, RLS, and function hygiene.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
     and c.relname in ('inventory_order_drafts', 'inventory_order_draft_items')),
  2, 'VOD-090 RLS is enabled on both order-draft tables'
);
select ok(
  not exists (
    select 1 from unnest(array['inventory_order_drafts','inventory_order_draft_items']) t
    cross join unnest(array['insert','update','delete','truncate']) p
    where has_table_privilege('authenticated', 'public.' || t, p)
  ), 'VOD-010 authenticated clients cannot write draft tables directly'
);
select ok(
  not has_table_privilege('anon', 'public.inventory_order_drafts', 'select')
  and not has_table_privilege('anon', 'public.inventory_order_draft_items', 'select')
  and has_table_privilege('authenticated', 'public.inventory_order_drafts', 'select')
  and has_table_privilege('authenticated', 'public.inventory_order_draft_items', 'select'),
  'VOD-090 only authenticated has table read grants'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'inventory_order_draft\_%'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')),
  6, 'VOD-091 exactly six order-draft RPCs are authenticated-only'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname like 'inventory_order_draft\_%'
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'all order-draft functions pin an empty search_path'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'inventory_order_draft\_%'
     and coalesce(p.proargnames, '{}'::text[]) && array['p_suggested_qty','p_created_by','p_updated_by','p_sent_by']),
  0, 'VOD-010 snapshots and actors are never client-supplied RPC arguments'
);
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'inventory_order_drafts'
     and indexdef ilike '%unique%organization_id%location_id%vendor_id%where (status = ''draft''%'),
  1, 'VOD-004 one partial unique index enforces one active vendor/location draft'
);

-- Authorization: every public entry point derives the actor and rechecks the
-- management/location boundary. A staff member cannot call any of the six.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039004', true);
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')$$, '42501', null, 'VOD-091 staff cannot open');
select throws_ok($$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',gen_random_uuid(),1,null,'[]'::jsonb)$$, '42501', null, 'VOD-091 staff cannot save');
select throws_ok($$select public.inventory_order_draft_fill('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',gen_random_uuid(),1,'empty_only')$$, '42501', null, 'VOD-091 staff cannot fill');
select throws_ok($$select public.inventory_order_draft_clear('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',gen_random_uuid(),1)$$, '42501', null, 'VOD-091 staff cannot clear');
select throws_ok($$select public.inventory_order_draft_sync('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',gen_random_uuid(),1)$$, '42501', null, 'VOD-091 staff cannot sync');
select throws_ok($$select public.inventory_order_draft_mark_sent('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',gen_random_uuid(),1)$$, '42501', null, 'VOD-091 staff cannot mark sent');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039005', true);
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')$$, '42501', null, 'VOD-091 an inactive manager is refused');
reset role;

set local role anon;
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')$$, '42501', null, 'VOD-091 anon cannot call open');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039006', true);
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')$$, '42501', null, 'VOD-091 another organization owner is refused');
reset role;

-- Owner creates and seeds from current Critical/Low status.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039001', true);
select set_config('t.draft', public.inventory_order_draft_open(
  '00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')::text, true);
reset role;
select is((select count(*)::int from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid), 2, 'VOD-001 open seeds only Critical/Low vendor items');
select results_eq(
  $$select product_name, suggested_qty, total_at_snapshot, par_at_snapshot, status_at_snapshot
    from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid order by product_name$$,
  $$values ('Corona'::text, null::numeric, 1.00::numeric, null::numeric, 'critical'::text),
           ('Titos'::text, 8.00::numeric, 4.00::numeric, 12.00::numeric, 'critical'::text)$$,
  'VOD-001/012 suggestion and no-Par snapshots are persisted exactly'
);
select is((select created_by from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), '00000000-0000-0000-0000-000000039001'::uuid, 'the authenticated owner is recorded as creator');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select ok(
  (select count(*) = 1 from public.inventory_order_drafts)
  and (select count(*) = 2 from public.inventory_order_draft_items),
  'VOD-090 an authorized manager sees the existing draft and its items'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039004', true);
select ok(
  (select count(*) = 0 from public.inventory_order_drafts)
  and (select count(*) = 0 from public.inventory_order_draft_items),
  'VOD-090 staff cannot read existing draft or item rows'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039006', true);
select ok(
  (select count(*) = 0 from public.inventory_order_drafts)
  and (select count(*) = 0 from public.inventory_order_draft_items),
  'VOD-090 another tenant cannot read existing draft or item rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select is(public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032'), current_setting('t.draft')::uuid, 'VOD-002 manager retry returns the same draft');
reset role;
select is((select count(*)::int from public.inventory_order_drafts where organization_id = '00000000-0000-0000-0000-000000039011' and location_id = '00000000-0000-0000-0000-000000039021' and vendor_id = '00000000-0000-0000-0000-000000039032' and status = 'draft'), 1, 'VOD-002 retry keeps one active row');
select throws_ok(
  $$insert into public.inventory_order_drafts (organization_id, location_id, vendor_id, vendor_name, created_by, updated_by)
    values ('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032','Faust','00000000-0000-0000-0000-000000039001','00000000-0000-0000-0000-000000039001')$$,
  '23505', null, 'VOD-004 direct duplicate DRAFT is rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039031')$$, '22023', null, 'VOD-006 the stable system vendor is rejected');
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039033')$$, '22023', null, 'VOD-006 an inactive vendor is rejected');
select throws_ok($$select public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039035')$$, '22023', null, 'VOD-006 another tenant vendor is rejected');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039022',%L,1,null,'[]'::jsonb)$q$, current_setting('t.draft')), '22023', null, 'VOD-092 a draft cannot be used through a forged location');
reset role;

-- Sparse save changes the header and named lines, may add a healthy same-vendor
-- product, and never accepts a suggested quantity from the caller.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select is(
  (public.inventory_order_draft_save(
    '00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,1,
    E'  Weekend stock\nDeliver Thursday.  ',
    jsonb_build_array(
      jsonb_build_object('product_id','00000000-0000-0000-0000-000000039041','order_qty',12,'item_note','  Feature table  ','included',true),
      jsonb_build_object('product_id','00000000-0000-0000-0000-000000039042','order_qty',null,'item_note',null,'included',false),
      jsonb_build_object('product_id','00000000-0000-0000-0000-000000039043','order_qty',3.5,'item_note','Promo','included',true)
    )) ->> 'version')::int,
  2, 'VOD-007 save updates lines and adds an active same-vendor product once'
);
reset role;
select is((select vendor_note from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), E'Weekend stock\nDeliver Thursday.', 'VOD-014 vendor note trims edges but preserves its newline');
select results_eq(
  $$select product_id, included, order_qty, item_note from public.inventory_order_draft_items
    where draft_id = current_setting('t.draft')::uuid order by product_id$$,
  $$values
    ('00000000-0000-0000-0000-000000039041'::uuid,true,12.00::numeric,'Feature table'::text),
    ('00000000-0000-0000-0000-000000039042'::uuid,false,null::numeric,null::text),
    ('00000000-0000-0000-0000-000000039043'::uuid,true,3.50::numeric,'Promo'::text)$$,
  'VOD-013/014/015 order quantity, notes, included, and added line persist'
);
select is((select suggested_qty from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039041'), 8.00::numeric, 'VOD-010 save never overwrites the suggestion snapshot');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,null,'[{"product_id":"00000000-0000-0000-0000-000000039044","order_qty":1,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft')), '22023', 'Choose an active item from this draft vendor.', 'VOD-007 another vendor product is refused by the intended validation branch');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,null,'[{"product_id":"00000000-0000-0000-0000-000000039045","order_qty":1,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft')), '22023', 'Choose an active item from this draft vendor.', 'VOD-007 an archived new product is refused by the intended validation branch');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,null,'[{"product_id":"00000000-0000-0000-0000-000000039046","order_qty":1,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft')), '22023', 'Choose an active item from this draft vendor.', 'VOD-007 another tenant product is refused by the intended validation branch');
select ok(pg_temp.message_of(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,E'Weekend stock\nDeliver Thursday.','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":"12","item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft'))) like '%Titos%', 'VOD-013 a text quantity is refused with the item name');
select ok(pg_temp.message_of(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,E'Weekend stock\nDeliver Thursday.','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":-1,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft'))) like '%Titos%', 'VOD-013 a negative quantity is refused with the item name');
select ok(pg_temp.message_of(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,E'Weekend stock\nDeliver Thursday.','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":1.234,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft'))) like '%Titos%', 'VOD-013 excessive precision is refused with the item name');
select ok(pg_temp.message_of(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,E'Weekend stock\nDeliver Thursday.','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":10000000000,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft'))) like '%Titos%', 'VOD-013 an absurdly large quantity is refused with the item name');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,E'Weekend stock\nDeliver Thursday.',jsonb_build_array(jsonb_build_object('product_id','00000000-0000-0000-0000-000000039041','order_qty',12,'item_note',repeat('x',201),'included',true)))$q$, current_setting('t.draft')), '22023', null, 'VOD-014 an item note over 200 characters is refused');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,repeat('x',1001),'[]'::jsonb)$q$, current_setting('t.draft')), '22023', null, 'VOD-014 a vendor note over 1000 characters is refused');
select throws_ok(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,1,'stale','[]'::jsonb)$q$, current_setting('t.draft')), 'PT409', null, 'VOD-040 a stale save is rejected');
select is((pg_temp.detail_of(format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,1,'stale','[]'::jsonb)$q$, current_setting('t.draft')))::jsonb ->> 'current_version')::int, 2, 'VOD-040 stale detail reports the current version');
select is((public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,1,E'Weekend stock\nDeliver Thursday.','[]'::jsonb) ->> 'changed')::boolean, false, 'VOD-043 a true no-op is accepted even after a retry');
reset role;
select is((select version from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), 2, 'VOD-043 no-op does not bump the draft version');

-- Fill and clear use stored snapshots only.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039003', true);
select throws_ok(
  format($q$select public.inventory_order_draft_fill('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,2,null)$q$, current_setting('t.draft')),
  '22023', 'Choose fill empty only or replace all.', 'VOD-031 NULL is never treated as confirmed replace-all'
);
select is((select version from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), 2, 'VOD-031 rejected NULL mode leaves the draft version unchanged');
select is((public.inventory_order_draft_fill('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,2,'empty_only') ->> 'version')::int, 2, 'VOD-030 fill empty-only is a no-op when only no-Par blanks remain');
select is((public.inventory_order_draft_fill('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,2,'replace_all') ->> 'version')::int, 3, 'VOD-031 replace-all changes manual quantities explicitly');
reset role;
select is((select order_qty from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039041'), 8.00::numeric, 'VOD-031 numeric snapshot replaces a manual quantity');
select is((select order_qty from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039042'), null::numeric, 'VOD-030 no-Par line remains blank');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039003', true);
select is((public.inventory_order_draft_clear('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,3) ->> 'version')::int, 4, 'VOD-032 clear bumps once');
reset role;
select is((select vendor_note from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), null::text, 'VOD-032 clear removes vendor note');
select is((select count(*)::int from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and (order_qty is not null or item_note is not null or not included)), 0, 'VOD-032 clear resets quantities, notes, and included');
select is((select count(*)::int from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid), 3, 'VOD-032 clear keeps lines and snapshots');

-- Sync restamps current snapshots and appends newly low items without touching
-- user-entered fields.
update public.inventory_stock set on_hand = 2, par = 12 where product_id = '00000000-0000-0000-0000-000000039041' and location_id = '00000000-0000-0000-0000-000000039021';
update public.inventory_stock set on_hand = 1, backup = 0, cutoff = 2, warning = 3, par = 8 where product_id = '00000000-0000-0000-0000-000000039043' and location_id = '00000000-0000-0000-0000-000000039021';
update public.inventory_stock set on_hand = 1, backup = 0, cutoff = 2, warning = 3, par = 10 where product_id = '00000000-0000-0000-0000-000000039047' and location_id = '00000000-0000-0000-0000-000000039021';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select is((public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,4,'Keep me','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":11,"item_note":"Keep item","included":false}]'::jsonb) ->> 'version')::int, 5, 'setup user edits before sync');
select is((public.inventory_order_draft_sync('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,5) ->> 'version')::int, 6, 'VOD-008 sync changes the snapshot once');
reset role;
select is((select suggested_qty from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039041'), 10.00::numeric, 'VOD-008 sync restamps a changed suggestion');
select ok((select order_qty = 11 and item_note = 'Keep item' and not included from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039041'), 'VOD-008 sync preserves order quantity, note, and included');
select is((select vendor_note from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), 'Keep me', 'VOD-008 sync preserves vendor note');
select ok(
  (select suggested_qty = 9 and order_qty is null and item_note is null and included
   from public.inventory_order_draft_items
   where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039047'),
  'VOD-008 sync appends a newly Low item with a current suggestion and blank manager fields'
);

-- Mark Sent requires an included positive quantity, freezes labels, is
-- retry-safe, and leaves stock plus its immutable ledger byte-for-byte alone.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select throws_ok(format($q$select public.inventory_order_draft_mark_sent('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,5)$q$, current_setting('t.draft')), 'PT409', null, 'VOD-076 stale Mark Sent is rejected while the draft is still editable');
select throws_ok(format($q$select public.inventory_order_draft_mark_sent('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,6)$q$, current_setting('t.draft')), '22023', null, 'VOD-070 an order with no included positive quantity cannot be sent');
select is((public.inventory_order_draft_save('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,6,'Send note','[{"product_id":"00000000-0000-0000-0000-000000039041","order_qty":12,"item_note":"Weekend stock","included":true}]'::jsonb) ->> 'version')::int, 7, 'setup an included positive quantity');
reset role;
select set_config('t.stock_before', (select jsonb_agg(to_jsonb(s) order by s.product_id)::text from public.inventory_stock s where s.organization_id = '00000000-0000-0000-0000-000000039011' and s.location_id = '00000000-0000-0000-0000-000000039021'), true);
select set_config('t.adjustments_before', (select jsonb_build_object('count',count(*),'max_id',max(id))::text from public.inventory_adjustments where organization_id = '00000000-0000-0000-0000-000000039011' and location_id = '00000000-0000-0000-0000-000000039021'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039002', true);
select is((public.inventory_order_draft_mark_sent('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,7) ->> 'status'), 'sent', 'VOD-072 mark sent changes status atomically');
reset role;
select ok((select status = 'sent' and sent_by = '00000000-0000-0000-0000-000000039002'::uuid and sent_at is not null and version = 8 from public.inventory_order_drafts where id = current_setting('t.draft')::uuid), 'VOD-072 sent actor, time, and version are recorded');
select is((select jsonb_agg(to_jsonb(s) order by s.product_id)::text from public.inventory_stock s where s.organization_id = '00000000-0000-0000-0000-000000039011' and s.location_id = '00000000-0000-0000-0000-000000039021'), current_setting('t.stock_before'), 'VOD-073 Mark Sent does not change any stock field or version');
select is((select jsonb_build_object('count',count(*),'max_id',max(id))::text from public.inventory_adjustments where organization_id = '00000000-0000-0000-0000-000000039011' and location_id = '00000000-0000-0000-0000-000000039021'), current_setting('t.adjustments_before'), 'VOD-073 Mark Sent does not add or change the adjustment ledger');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname like 'inventory_order_draft\_%'
     and (pg_get_functiondef(p.oid) ~ '\minventory_stock\M'
       or pg_get_functiondef(p.oid) ~ '\minventory_stock_adjust\M'
       or pg_get_functiondef(p.oid) ~ '\minventory_adjustments\M')),
  0, 'VOD-074 draft function bodies never reference stock tables, adjustment RPC, or ledger'
);

select throws_ok(format($q$update public.inventory_order_drafts set vendor_note = 'x' where id = %L$q$, current_setting('t.draft')), '23514', null, 'VOD-075 a Sent draft cannot be updated directly');
select throws_ok(format($q$delete from public.inventory_order_drafts where id = %L$q$, current_setting('t.draft')), '23514', null, 'VOD-075 a Sent draft cannot be deleted directly');
select throws_ok(format($q$update public.inventory_order_draft_items set item_note = 'x' where draft_id = %L$q$, current_setting('t.draft')), '23514', null, 'VOD-075 Sent items cannot be updated directly');
select throws_ok(format($q$delete from public.inventory_order_draft_items where draft_id = %L$q$, current_setting('t.draft')), '23514', null, 'VOD-075 Sent items cannot be deleted directly');
select throws_ok(
  format($q$insert into public.inventory_order_draft_items
    (draft_id, organization_id, location_id, product_id, product_name, unit)
    values (%L,'00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039044','Injected','bottle')$q$, current_setting('t.draft')),
  '23514', null, 'VOD-075 an item cannot be inserted into a Sent draft'
);
set constraints all immediate;
select throws_ok($$truncate public.inventory_order_draft_items$$, '23514', null, 'VOD-075 draft items cannot be truncated');
select throws_ok($$truncate public.inventory_order_drafts, public.inventory_order_draft_items$$, '23514', null, 'VOD-075 drafts cannot be truncated');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039003', true);
select is((public.inventory_order_draft_mark_sent('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',current_setting('t.draft')::uuid,1) ->> 'version')::int, 8, 'VOD-076 a second Mark Sent is an idempotent echo despite stale version');
select throws_ok(format($q$select public.inventory_order_draft_clear('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021',%L,8)$q$, current_setting('t.draft')), '23514', null, 'VOD-075 an edit RPC refuses a Sent draft');
select set_config('t.next_draft', public.inventory_order_draft_open('00000000-0000-0000-0000-000000039011','00000000-0000-0000-0000-000000039021','00000000-0000-0000-0000-000000039032')::text, true);
reset role;
select isnt(current_setting('t.next_draft')::uuid, current_setting('t.draft')::uuid, 'VOD-005 a new DRAFT is allowed after the prior order is Sent');
select is((select count(*)::int from public.inventory_order_drafts where organization_id = '00000000-0000-0000-0000-000000039011' and location_id = '00000000-0000-0000-0000-000000039021' and vendor_id = '00000000-0000-0000-0000-000000039032' and status = 'draft'), 1, 'VOD-005 exactly one new active draft exists');
select is(
  (select count(*)::int from public.inventory_order_draft_items
   where draft_id = current_setting('t.next_draft')::uuid
     and order_qty is null and item_note is null and included),
  4, 'VOD-005 the new draft is freshly seeded with blank manager fields'
);
select is(
  (select count(*)::int
   from public.inventory_order_draft_items i
   join public.inventory_stock_status s
     on s.product_id = i.product_id and s.organization_id = i.organization_id and s.location_id = i.location_id
   where i.draft_id = current_setting('t.next_draft')::uuid
     and (i.suggested_qty is distinct from s.suggested_order
       or i.total_at_snapshot is distinct from s.total
       or i.par_at_snapshot is distinct from s.par
       or i.status_at_snapshot is distinct from s.status)),
  0, 'VOD-005 the new draft uses current stock snapshots rather than copying Sent history'
);
select throws_ok(
  format($q$update public.inventory_order_draft_items set draft_id = %L
    where draft_id = %L and product_id = '00000000-0000-0000-0000-000000039041'$q$,
    current_setting('t.draft'), current_setting('t.next_draft')),
  '23514', null, 'VOD-075 an item cannot be reparented into a Sent draft'
);

update public.inventory_products set name = 'Titos Renamed', updated_by = '00000000-0000-0000-0000-000000039001', updated_at = now(), version = version + 1 where id = '00000000-0000-0000-0000-000000039041';
select is((select product_name from public.inventory_order_draft_items where draft_id = current_setting('t.draft')::uuid and product_id = '00000000-0000-0000-0000-000000039041'), 'Titos', 'VOD-082 Sent label history survives a later catalog rename');

-- Deferred actor FKs and immutability triggers must still permit a full tenant
-- teardown cascade.
set constraints all deferred;
delete from public.organizations where id = '00000000-0000-0000-0000-000000039011';
set constraints all immediate;
select is((select count(*)::int from public.inventory_order_drafts where organization_id = '00000000-0000-0000-0000-000000039011'), 0, 'tenant teardown cascades draft history without weakening ordinary immutability');

-- Dispatch two opens to independent backends against committed, isolated
-- fixtures. Both requests sleep in-flight before entering the RPC so their
-- open attempts overlap rather than merely exercising a serial retry.
create temporary table vod_concurrent_results (caller text primary key, draft_id uuid not null);
do $vod$
declare
  v_connection text := 'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres';
begin
  perform extensions.dblink_connect('vod_setup', v_connection);
  perform extensions.dblink_connect('vod_c1', v_connection);
  perform extensions.dblink_connect('vod_c2', v_connection);

  perform extensions.dblink_exec('vod_setup', 'begin');
  perform extensions.dblink_exec('vod_setup', 'set constraints all deferred');
  perform extensions.dblink_exec('vod_setup', $$delete from public.organizations where id = '00000000-0000-0000-0000-000000039111'$$);
  perform extensions.dblink_exec('vod_setup', $$delete from auth.users where id = '00000000-0000-0000-0000-000000039101'$$);
  perform extensions.dblink_exec('vod_setup', $$insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
    values ('00000000-0000-0000-0000-000000039101','039-concurrent@passcode.internal','x',now(),'authenticated','authenticated')$$);
  perform extensions.dblink_exec('vod_setup', $$insert into public.profiles (id, display_name)
    values ('00000000-0000-0000-0000-000000039101','VOD Concurrent')$$);
  perform extensions.dblink_exec('vod_setup', $$insert into public.organizations (id, name, slug, created_by)
    values ('00000000-0000-0000-0000-000000039111','VOD Concurrent Org','vod-concurrent-org','00000000-0000-0000-0000-000000039101')$$);
  perform extensions.dblink_exec('vod_setup', $$insert into public.locations (id, organization_id, name, time_zone)
    values ('00000000-0000-0000-0000-000000039121','00000000-0000-0000-0000-000000039111','VOD Concurrent Loc','America/Chicago')$$);
  perform extensions.dblink_exec('vod_setup', $$insert into public.memberships (organization_id, profile_id, roles, active)
    values ('00000000-0000-0000-0000-000000039111','00000000-0000-0000-0000-000000039101',array['owner']::public.app_role[],true)$$);
  perform extensions.dblink_exec('vod_setup', $$insert into public.inventory_vendors (id, organization_id, name, is_system, active, created_by)
    values ('00000000-0000-0000-0000-000000039131','00000000-0000-0000-0000-000000039111','Concurrent Vendor',false,true,'00000000-0000-0000-0000-000000039101')$$);
  perform extensions.dblink_exec('vod_setup', 'commit');

  perform extensions.dblink_exec('vod_c1', 'set role authenticated');
  perform extensions.dblink_exec('vod_c2', 'set role authenticated');
  perform extensions.dblink_exec('vod_c1', $$set request.jwt.claim.sub = '00000000-0000-0000-0000-000000039101'$$);
  perform extensions.dblink_exec('vod_c2', $$set request.jwt.claim.sub = '00000000-0000-0000-0000-000000039101'$$);
  perform extensions.dblink_send_query('vod_c1', $$select public.inventory_order_draft_open(
    '00000000-0000-0000-0000-000000039111','00000000-0000-0000-0000-000000039121','00000000-0000-0000-0000-000000039131')
    from (select pg_sleep(0.25)) gate$$);
  perform extensions.dblink_send_query('vod_c2', $$select public.inventory_order_draft_open(
    '00000000-0000-0000-0000-000000039111','00000000-0000-0000-0000-000000039121','00000000-0000-0000-0000-000000039131')
    from (select pg_sleep(0.25)) gate$$);
end;
$vod$;
insert into vod_concurrent_results select 'c1', draft_id from extensions.dblink_get_result('vod_c1') as r(draft_id uuid);
insert into vod_concurrent_results select 'c2', draft_id from extensions.dblink_get_result('vod_c2') as r(draft_id uuid);
select ok(
  (select count(*) = 2 and count(distinct draft_id) = 1 and bool_and(draft_id is not null) from vod_concurrent_results),
  'VOD-003 two simultaneous connections return the same non-null draft'
);
select is(
  (select count(*)::int from public.inventory_order_drafts
   where organization_id = '00000000-0000-0000-0000-000000039111'
     and location_id = '00000000-0000-0000-0000-000000039121'
     and vendor_id = '00000000-0000-0000-0000-000000039131'
     and status = 'draft'),
  1, 'VOD-003 concurrent open persists exactly one active draft'
);
do $cleanup$
begin
  perform extensions.dblink_exec('vod_setup', $$delete from public.organizations where id = '00000000-0000-0000-0000-000000039111'$$);
  perform extensions.dblink_exec('vod_setup', $$delete from auth.users where id = '00000000-0000-0000-0000-000000039101'$$);
  perform extensions.dblink_disconnect('vod_c1');
  perform extensions.dblink_disconnect('vod_c2');
  perform extensions.dblink_disconnect('vod_setup');
end;
$cleanup$;

select * from finish();
rollback;
