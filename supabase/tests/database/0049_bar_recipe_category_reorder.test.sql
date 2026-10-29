begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values
('00000000-0000-0000-0000-000000044001','044-owner@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000044002','044-staff@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000044003','044-inactive@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000044004','044-other@passcode.internal','x',now(),'authenticated','authenticated');
insert into public.profiles (id,display_name) values
('00000000-0000-0000-0000-000000044001','044 Owner'),('00000000-0000-0000-0000-000000044002','044 Staff'),('00000000-0000-0000-0000-000000044003','044 Inactive'),('00000000-0000-0000-0000-000000044004','044 Other');
insert into public.organizations (id,name,slug,created_by) values
('00000000-0000-0000-0000-000000044011','044 A','pgtap-044-a','00000000-0000-0000-0000-000000044001'),
('00000000-0000-0000-0000-000000044012','044 B','pgtap-044-b','00000000-0000-0000-0000-000000044004');
insert into public.memberships (organization_id,profile_id,roles,active) values
('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044001',array['owner']::public.app_role[],true),
('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044002',array['server']::public.app_role[],true),
('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044003',array['shift_manager']::public.app_role[],false),
('00000000-0000-0000-0000-000000044012','00000000-0000-0000-0000-000000044004',array['owner']::public.app_role[],true);
insert into public.bar_recipe_categories (id,organization_id,name,slug,created_by) values
('00000000-0000-0000-0000-000000044021','00000000-0000-0000-0000-000000044011','Synthetic','synthetic','00000000-0000-0000-0000-000000044001'),
('00000000-0000-0000-0000-000000044022','00000000-0000-0000-0000-000000044012','Synthetic','synthetic','00000000-0000-0000-0000-000000044004');

-- RC-019/020/027-034/035-046/060/108-117/133/136. All calls below
-- execute as authenticated; pg_temp helpers are SECURITY INVOKER.
insert into public.bar_recipe_categories (id,organization_id,name,slug,is_active,is_fallback,created_by) values
('00000000-0000-0000-0000-000000044023','00000000-0000-0000-0000-000000044011','Dormant','dormant',false,false,'00000000-0000-0000-0000-000000044001'),
('00000000-0000-0000-0000-000000044024','00000000-0000-0000-0000-000000044011','Others','others',true,true,'00000000-0000-0000-0000-000000044001');
create temp table before_order as select * from public.bar_recipe_categories;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044001',true);
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array['00000000-0000-0000-0000-000000044023','99999999-9999-4999-8999-999999999999']::uuid[])$q$,'22023','Invalid category order','unknown UUID rejected');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array['00000000-0000-0000-0000-000000044023','00000000-0000-0000-0000-000000044022']::uuid[])$q$,'22023','Invalid category order','foreign organization category rejected');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array['00000000-0000-0000-0000-000000044021','00000000-0000-0000-0000-000000044021']::uuid[])$q$,'22023','Invalid category order','duplicate IDs rejected');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array['00000000-0000-0000-0000-000000044021',null]::uuid[])$q$,'22023','Invalid category order','null entry rejected');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',null)$q$,'22023','Invalid category order','null array rejected');
reset role;
select results_eq('select * from public.bar_recipe_categories order by id','select * from before_order order by id','invalid requests leave every organization unchanged');
set local role authenticated;
select is(public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array['00000000-0000-0000-0000-000000044023','00000000-0000-0000-0000-000000044021']::uuid[])->>'count','2','valid reorder succeeds including inactive category');
select is((select array_agg(slug order by display_order) from public.bar_recipe_categories where not is_fallback),array['dormant','synthetic'],'requested ordering persisted');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044002',true);
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011','{}')$q$,'42501',null,'Staff denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044003',true);
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011','{}')$q$,'42501',null,'inactive manager denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044004',true);
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011','{}')$q$,'42501',null,'foreign manager denied');
reset role;
select results_eq($q$select * from public.bar_recipe_categories where organization_id='00000000-0000-0000-0000-000000044012' or is_fallback order by id$q$,$q$select * from before_order where organization_id='00000000-0000-0000-0000-000000044012' or is_fallback order by id$q$,'valid reorder leaves foreign tenant and fallback unchanged');
select * from finish();
rollback;
