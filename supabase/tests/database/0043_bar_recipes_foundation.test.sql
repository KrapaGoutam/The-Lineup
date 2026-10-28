begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values
('00000000-0000-0000-0000-000000043001','043-owner@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000043002','043-staff@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000043003','043-inactive@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000043004','043-other@passcode.internal','x',now(),'authenticated','authenticated');
insert into public.profiles (id,display_name) values
('00000000-0000-0000-0000-000000043001','043 Owner'),('00000000-0000-0000-0000-000000043002','043 Staff'),('00000000-0000-0000-0000-000000043003','043 Inactive'),('00000000-0000-0000-0000-000000043004','043 Other');
insert into public.organizations (id,name,slug,created_by) values
('00000000-0000-0000-0000-000000043011','043 A','pgtap-043-a','00000000-0000-0000-0000-000000043001'),
('00000000-0000-0000-0000-000000043012','043 B','pgtap-043-b','00000000-0000-0000-0000-000000043004');
insert into public.memberships (organization_id,profile_id,roles,active) values
('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',array['owner']::public.app_role[],true),
('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043002',array['server']::public.app_role[],true),
('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043003',array['shift_manager']::public.app_role[],false),
('00000000-0000-0000-0000-000000043012','00000000-0000-0000-0000-000000043004',array['owner']::public.app_role[],true);
insert into public.bar_recipe_categories (id,organization_id,name,slug,created_by) values
('00000000-0000-0000-0000-000000043021','00000000-0000-0000-0000-000000043011','Synthetic','synthetic','00000000-0000-0000-0000-000000043001'),
('00000000-0000-0000-0000-000000043022','00000000-0000-0000-0000-000000043012','Synthetic','synthetic','00000000-0000-0000-0000-000000043004');
insert into public.bar_recipes (id,organization_id,category_id,recipe_number,name,slug,is_active,archived_at,created_by) values
('00000000-0000-0000-0000-000000043031','00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043021',1,'R1 Test Citrus','r1-test-citrus',true,null,'00000000-0000-0000-0000-000000043001'),
('00000000-0000-0000-0000-000000043032','00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043021',2,'R1 Test Archived','r1-test-archived',false,now(),'00000000-0000-0000-0000-000000043001'),
('00000000-0000-0000-0000-000000043033','00000000-0000-0000-0000-000000043012','00000000-0000-0000-0000-000000043022',1,'R1 Test Other','r1-test-other',true,null,'00000000-0000-0000-0000-000000043004');
insert into public.bar_recipe_variants (id,organization_id,recipe_id,variant) values
('00000000-0000-0000-0000-000000043041','00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043031','perfect'),
('00000000-0000-0000-0000-000000043042','00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043032','house');
insert into public.bar_recipe_ingredients (organization_id,variant_id,ingredient_name,amount,sort_order) values
('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043041','Synthetic citrus','Splash',0),
('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043042','Synthetic archived','Top',0);
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity and c.relname = any(array['bar_recipe_categories','bar_recipes','bar_recipe_variants','bar_recipe_ingredients','bar_recipe_steps','bar_recipe_garnishes'])),6,'RLS enabled on six tables');
select ok(not exists(select 1 from unnest(array['bar_recipe_categories','bar_recipes','bar_recipe_variants','bar_recipe_ingredients','bar_recipe_steps','bar_recipe_garnishes']) t cross join unnest(array['insert','update','delete','truncate']) p where has_table_privilege('authenticated','public.'||t,p)),'authenticated has no direct writes');
select ok(not exists(select 1 from unnest(array['bar_recipe_categories','bar_recipes','bar_recipe_variants','bar_recipe_ingredients','bar_recipe_steps','bar_recipe_garnishes']) t where has_table_privilege('anon','public.'||t,'select')),'anon has no select');
select throws_ok($q$insert into public.bar_recipes (organization_id,category_id,recipe_number,name,slug,created_by) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043021',2,'Duplicate','duplicate','00000000-0000-0000-0000-000000043001')$q$,'23505',null,'archived number remains reserved');
select throws_ok($q$insert into public.bar_recipe_variants (organization_id,recipe_id,variant) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043031','perfect')$q$,'23505',null,'variant is unique');
select throws_ok($q$insert into public.bar_recipe_variants (organization_id,recipe_id,variant) values ('00000000-0000-0000-0000-000000043012','00000000-0000-0000-0000-000000043031','house')$q$,'23503',null,'cross-tenant parent is rejected');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000043002',true);
select is((select count(*)::int from public.bar_recipes),1,'staff sees active same-tenant recipe only');
select is((select count(*)::int from public.bar_recipe_variants),1,'staff cannot see archived variants');
select is((select count(*)::int from public.bar_recipe_ingredients),1,'staff cannot see archived ingredients');
select throws_ok($q$insert into public.bar_recipe_steps (organization_id,variant_id,instruction,sort_order) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043041','Synthetic',0)$q$,'42501',null,'staff cannot insert');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000043001',true);
select is((select count(*)::int from public.bar_recipes),2,'management can read archived');
select is((select count(*)::int from public.bar_recipe_variants),2,'management can read archived variants');
select is((select count(*)::int from public.bar_recipe_ingredients),2,'management can read archived children');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000043003',true);
select is((select count(*)::int from public.bar_recipes),0,'inactive member cannot read');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000043004',true);
select is((select count(*)::int from public.bar_recipes),1,'other organization sees only its recipe');
select is((select count(*)::int from public.bar_recipe_variants),0,'other organization cannot see variants');
select * from finish();
rollback;
