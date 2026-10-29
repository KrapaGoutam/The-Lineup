begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ---------------------------------------------------------------------
-- Bar Inventory V1 / BI-2 -- stock, immutable ledger, status view.
-- Cast (org A, two locations): owner Olga, manager Mona (general_manager),
-- assistant manager Asa (shift_manager), staff Ann (server).
-- Org B: Otto, an owner of a different organization.
-- ---------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000035001', '0351-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035002', '0351-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035003', '0351-asa@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035004', '0351-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000035007', '0351-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000035001', 'PGTAP 0351 Olga'),
  ('00000000-0000-0000-0000-000000035002', 'PGTAP 0351 Mona'),
  ('00000000-0000-0000-0000-000000035003', 'PGTAP 0351 Asa'),
  ('00000000-0000-0000-0000-000000035004', 'PGTAP 0351 Ann'),
  ('00000000-0000-0000-0000-000000035007', 'PGTAP 0351 Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000035011', 'PGTAP 0351 Org', 'pgtap-0351-org', '00000000-0000-0000-0000-000000035001'),
  ('00000000-0000-0000-0000-000000035012', 'PGTAP 0351 Other', 'pgtap-0351-other', '00000000-0000-0000-0000-000000035007');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000035021', '00000000-0000-0000-0000-000000035011', 'PGTAP 0351 Loc A', 'America/New_York'),
  ('00000000-0000-0000-0000-000000035022', '00000000-0000-0000-0000-000000035012', 'PGTAP 0351 Other Loc', 'America/New_York');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000035011', '00000000-0000-0000-0000-000000035001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035011', '00000000-0000-0000-0000-000000035002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035011', '00000000-0000-0000-0000-000000035003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035011', '00000000-0000-0000-0000-000000035004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000035012', '00000000-0000-0000-0000-000000035007', array['owner']::public.app_role[], true);

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

-- Catalog set-up through the real RPCs (as Mona).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select public.inventory_vendor_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021','Faust',null);
reset role;
select set_config('t.faust', (select id::text from public.inventory_vendors where name = 'Faust'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select public.inventory_product_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.faust')::uuid, 'Tito''s Handmade Vodka', null, null, '750 mL', 'bottle', null, null, null);
select public.inventory_product_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.faust')::uuid, 'Casamigos Blanco', null, null, '750 mL', 'bottle', null, null, null);
select public.inventory_product_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.faust')::uuid, 'Archived gin', null, null, '750 mL', 'bottle', null, null, null);
reset role;
select set_config('t.titos', (select id::text from public.inventory_products where name like 'Tito%'), true);
select set_config('t.casa', (select id::text from public.inventory_products where name = 'Casamigos Blanco'), true);
select set_config('t.gin', (select id::text from public.inventory_products where name = 'Archived gin'), true);


create function pg_temp.batch(p_first numeric default 5,p_second numeric default 8,p_version integer default 1) returns jsonb language sql as $$
 select public.inventory_bulk_count('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',jsonb_build_array(
 jsonb_build_object('productId',current_setting('t.titos'),'expectedVersion',p_version,'onHand',p_first,'backup',null),
 jsonb_build_object('productId',current_setting('t.casa'),'expectedVersion',p_version,'onHand',p_second,'backup',null)), 'stock_count','Weekly count');
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035004',true);
select throws_ok('select pg_temp.batch()','42501',null,'staff denied bulk count');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035007',true);
select throws_ok('select pg_temp.batch()','42501',null,'foreign manager denied bulk count');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035002',true);
select throws_ok('select pg_temp.batch(5,-1)','22023',null,'one invalid row refuses entire batch');
select is((select sum(on_hand)::numeric from public.inventory_stock),0::numeric,'invalid batch leaves all stock unchanged');
select is((select count(*)::int from public.inventory_adjustments),0,'invalid batch writes no ledger');
select lives_ok('select pg_temp.batch()','multi-item count commits');
select is((select sum(on_hand)::numeric from public.inventory_stock),13::numeric,'all requested rows applied');
select is((select count(*)::int from public.inventory_adjustments),2,'one adjustment per changed product');
select ok(not exists(select 1 from public.inventory_adjustments where actor_profile_id<>'00000000-0000-0000-0000-000000035002' or reason<>'stock_count' or source<>'count' or note<>'Weekly count'),'normal actor/reason/source/note context');
select lives_ok('select pg_temp.batch(5,8,2)','unchanged counts accepted');
select is((select count(*)::int from public.inventory_adjustments),2,'unchanged counts have no ledger');
select throws_ok('select pg_temp.batch(5,8,1)','PT409',null,'stale even if proposed equals latest');
select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',current_setting('t.casa')::uuid,'delta',1,null,'delivery_restock',null,null);
select throws_ok('select pg_temp.batch(6,9,2)','PT409',null,'one stale row refuses entire batch');
select is((select on_hand from public.inventory_stock where product_id=current_setting('t.titos')::uuid),5::numeric,'fresh row not partially applied');
select is((select count(*)::int from public.inventory_adjustments),3,'stale batch writes zero ledger entries');
select lives_ok('select public.inventory_bulk_count(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',jsonb_build_array(jsonb_build_object(''productId'',current_setting(''t.titos''),''expectedVersion'',2,''onHand'',0,''backup'',null)),''stock_count'',null)','explicit zero is zero and null leaves backup');
select is((select on_hand from public.inventory_stock where product_id=current_setting('t.titos')::uuid),0::numeric,'zero persisted');
select throws_ok('select public.inventory_bulk_count(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',''[]'',''stock_count'',null)','22023',null,'empty batch invalid');
select throws_ok('select public.inventory_bulk_count(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',jsonb_build_array(jsonb_build_object(''productId'',current_setting(''t.titos''),''expectedVersion'',3,''onHand'',null,''backup'',null)),''stock_count'',null)','22023',null,'blank-only row rejected');
reset role;
select ok(not has_function_privilege('anon','public.inventory_bulk_count(uuid,uuid,jsonb,text,text)','execute'),'anon has no execute grant');
select * from finish(); rollback;
