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


create function pg_temp.lot(p_id uuid default null, p_version integer default null, p_qty numeric default 1, p_exp date default '2026-10-29', p_precision text default 'day', p_loc uuid default '00000000-0000-0000-0000-000000035021') returns uuid language sql as $$
 select public.inventory_date_lot_save('00000000-0000-0000-0000-000000035011',p_loc,p_id,current_setting('t.titos')::uuid,p_qty,null,null,p_exp,p_precision,null,true,p_version);
$$;
select is((select count(*)::int from pg_class where relname in ('inventory_date_lots','inventory_freshness_rules') and relrowsecurity),2,'RLS enabled');
select ok(not has_table_privilege('authenticated','public.inventory_date_lots','insert'),'no date direct inserts');
select ok(not has_table_privilege('authenticated','public.inventory_freshness_rules','update'),'no rule direct updates');
select ok(not has_table_privilege('anon','public.inventory_date_lots','select'),'anonymous cannot read dates');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035002',true);
select lives_ok('select pg_temp.lot()','manager creates date lot');
select set_config('t.lot',(select id::text from public.inventory_date_lots limit 1),true);
select lives_ok('select pg_temp.lot(null,null,null,''2026-11-30'',''month'')','multiple dates and optional quantity');
select is((select count(*)::int from public.inventory_date_lots),2,'manager reads date lots');
select lives_ok('select pg_temp.lot(current_setting(''t.lot'')::uuid,1,5)','manager updates quantity');
select throws_ok('select pg_temp.lot(current_setting(''t.lot'')::uuid,1,6)','PT409',null,'stale date version');
select throws_ok('select pg_temp.lot(null,null,-1)','22023',null,'negative quantity refused');
select throws_ok('select pg_temp.lot(null,null,1.123)','22023',null,'excess precision refused');
select throws_ok('select pg_temp.lot(null,null,1,''2026-11-01'',''month'')','23514',null,'month expiration must be last day');
select throws_ok('select pg_temp.lot(null,null,1,null,null)','23514',null,'at least one date');
select throws_ok('select pg_temp.lot(null,null,1,''2025-02-29'')','22008',null,'invalid leap date');
select throws_ok('select pg_temp.lot(null,null,1,''2026-10-29'',''day'',''00000000-0000-0000-0000-000000035022'')','42501',null,'wrong tenant location refused');
select lives_ok('select public.inventory_date_lot_save(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',current_setting(''t.lot'')::uuid,current_setting(''t.titos'')::uuid,5,null,null,''2026-10-29'',''day'',null,false,2)','archive audited');
select is((select active from public.inventory_date_lots where id=current_setting('t.lot')::uuid),false,'archive retained row');
select public.inventory_category_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021','Beer');
select set_config('t.category',(select id::text from public.inventory_categories where name='Beer'),true);
select public.inventory_subcategory_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',current_setting('t.category')::uuid,'IPA');
select set_config('t.subcategory',(select id::text from public.inventory_subcategories where name='IPA'),true);
reset role;
create function pg_temp.rule(p_id uuid default null,p_version integer default null,p_active boolean default true,p_max integer default 6,p_warn integer default 1) returns uuid language sql as $$
 select public.inventory_freshness_rule_save('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',p_id,current_setting('t.subcategory')::uuid,true,p_max,p_warn,p_active,p_version);
$$;
set local role authenticated;
select lives_ok('select pg_temp.rule()','manager creates configurable rule');
select set_config('t.rule',(select id::text from public.inventory_freshness_rules limit 1),true);
select lives_ok('select pg_temp.rule(current_setting(''t.rule'')::uuid,1,false)','manager deactivates rule');
select lives_ok('select pg_temp.rule(current_setting(''t.rule'')::uuid,2,true)','manager reactivates rule');
select throws_ok('select pg_temp.rule(current_setting(''t.rule'')::uuid,1)','PT409',null,'stale rule');
select throws_ok('select pg_temp.rule(current_setting(''t.rule'')::uuid,3,true,6,6)','23514',null,'invalid warning boundary');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035004',true);
select is((select count(*)::int from public.inventory_date_lots),0,'staff cannot read lots');
select is((select count(*)::int from public.inventory_freshness_rules),0,'staff cannot read rules');
select throws_ok('select pg_temp.lot()','42501',null,'staff cannot mutate lots');
select throws_ok('select pg_temp.rule()','42501',null,'staff cannot mutate rules');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035007',true);
select is((select count(*)::int from public.inventory_date_lots),0,'foreign manager cannot read lots');
select throws_ok('select pg_temp.lot()','42501',null,'foreign manager cannot mutate lots');
select throws_ok('select pg_temp.rule()','42501',null,'foreign manager cannot mutate rules');
reset role;
select is((select count(*)::int from public.inventory_change_log where entity_type='date_lot'),4,'create update archive use existing audit');
select is((select count(*)::int from public.inventory_change_log where entity_type='freshness_rule'),3,'rule lifecycle audited');
select ok(not exists(select 1 from public.inventory_change_log where entity_type in ('date_lot','freshness_rule') and actor_profile_id<>'00000000-0000-0000-0000-000000035002'),'actor comes from auth');
select is((select count(*)::int from public.inventory_adjustments),0,'dates and rules never change quantity ledger');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000035002',true);
select lives_ok('select public.inventory_date_lot_save(''00000000-0000-0000-0000-000000035011'',''00000000-0000-0000-0000-000000035021'',null,current_setting(''t.titos'')::uuid,null,''1999-01-01'',''month'',''2100-02-28'',''month'',null,true,null)','four-digit calendar years remain valid');
select * from finish();
rollback;
