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


create function pg_temp.save_view(p_id uuid default null,p_version integer default null,p_name text default 'Weekly',p_default boolean default false) returns uuid language sql as $$
 select public.inventory_saved_view_save('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',p_id,p_name,'{"version":1,"owns":["search"],"state":{"search":"Beer"}}',p_default,p_version);
$$;
select ok((select relrowsecurity from pg_class where relname='inventory_saved_views'),'RLS enabled');
select ok(not has_table_privilege('authenticated','public.inventory_saved_views','insert'),'no direct write');
select ok(not has_table_privilege('anon','public.inventory_saved_views','select'),'no anon read');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035002',true);
select lives_ok('select pg_temp.save_view()','manager saves personal view');
select set_config('t.view',(select id::text from public.inventory_saved_views limit 1),true);
select lives_ok('select pg_temp.save_view(current_setting(''t.view'')::uuid,1,''Renamed'',true)','rename and default');
select is((select name from public.inventory_saved_views),'Renamed','rename persisted');
select throws_ok('select pg_temp.save_view(null,null,''renamed'')','22023',null,'case-insensitive duplicate refused');
select throws_ok('select pg_temp.save_view(null,null,'''')','22023',null,'empty name refused');
select throws_ok('select pg_temp.save_view(current_setting(''t.view'')::uuid,1)','PT409',null,'stale version refused');
select lives_ok('select pg_temp.save_view(null,null,''Second'',true)','second view becomes default');
select is((select count(*)::int from public.inventory_saved_views where is_default),1,'exactly one default');
select is((select is_default from public.inventory_saved_views where id=current_setting('t.view')::uuid),false,'previous default removed');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035003',true);
select is((select count(*)::int from public.inventory_saved_views),0,'other manager sees no personal views');
select throws_ok('select pg_temp.save_view(current_setting(''t.view'')::uuid,3)','42501',null,'cannot update another profile view');
select throws_ok('select public.inventory_saved_view_delete(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',current_setting(''t.view'')::uuid,3)','42501',null,'cannot delete another profile view');
select lives_ok('select pg_temp.save_view(null,null,''Renamed'')','same name allowed for another manager');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035004',true);
select is((select count(*)::int from public.inventory_saved_views),0,'staff cannot read');
select throws_ok('select pg_temp.save_view()','42501',null,'staff cannot save');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035007',true);
select throws_ok('select pg_temp.save_view()','42501',null,'foreign org denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035002',true);
select lives_ok('select public.inventory_saved_view_delete(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',current_setting(''t.view'')::uuid,3)','owner deletes view');
select is((select count(*)::int from public.inventory_saved_views),1,'personal deletion persisted');
reset role;
select * from finish(); rollback;
