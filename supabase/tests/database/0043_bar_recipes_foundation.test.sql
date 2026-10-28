begin;
create extension if not exists pgtap with schema extensions;
select plan(51);
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
reset role;
create function pg_temp.recipe_import_sample() returns jsonb language sql as $$
  select '{"format":"the-lineup.bar-recipes.import","version":1,"categories":[{"slug":"import-test","name":"Import Test","display_order":1}],"recipes":[{"recipe_number":99,"name":"R1 Test Import","category_slug":"import-test","variants":{"perfect":{"ingredients":[{"ingredient_name":"Synthetic","amount":"Splash"}],"steps":[{"instruction":"Combine"}],"garnishes":[{"name":"Synthetic peel"}]},"house":null}}]}'::jsonb;
$$;
select ok(not has_function_privilege('authenticated','public.bar_recipes_import(uuid,uuid,jsonb,text,integer[])','execute') and not has_function_privilege('anon','public.bar_recipes_import(uuid,uuid,jsonb,text,integer[])','execute'),'import denied to clients');
select is((public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'dry_run','{}')->'recipes'->0->>'status'),'created','dry run validates and reports creation');
select is(public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'dry_run','{}'),public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'dry_run','{}'),'dry-run reports are deterministic');
select is((select count(*)::int from public.bar_recipe_categories where slug='import-test'),0,'dry run rolls back category');
select is((select count(*)::int from public.bar_recipes where recipe_number=99),0,'dry run rolls back recipe and children');
select is((public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'create','{}')->'recipes'->0->>'status'),'created','create imports synthetic recipe');
select is((public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'create','{}')->'recipes'->0->>'status'),'skipped-existing','repeat skips existing recipe');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043002',pg_temp.recipe_import_sample(),'create','{}')$q$,'42501',null,'staff actor denied');
select is((select count(*)::int from public.bar_recipe_ingredients i join public.bar_recipe_variants v on v.id=i.variant_id join public.bar_recipes r on r.id=v.recipe_id where r.recipe_number=99),1,'synthetic child imported once');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043012','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'create','{}')$q$,'42501',null,'cross-organization actor denied');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043003',pg_temp.recipe_import_sample(),'create','{}')$q$,'42501',null,'inactive manager denied');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,category_slug}', '"missing"'),'create','{}')$q$,'22023',null,'unknown category rejected');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,recipe_number}','100'),'{recipes,0,variants,perfect,ingredients,0,ingredient_name}','""'),'create','{}')$q$,'23514',null,'invalid child rejected');
select is((select count(*)::int from public.bar_recipes where recipe_number=100),0,'invalid child rolls back recipe');
select ok((select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname like 'recipes\_%' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)),'security definer helpers pin search path');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes}',(pg_temp.recipe_import_sample()->'recipes') || (pg_temp.recipe_import_sample()->'recipes')),'create','{}')$q$,'23505',null,'duplicate input number rejected');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,variants,your}','{}'),'dry_run','{}')$q$,'22023',null,'unknown variant rejected even on skipped identity');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,variants,perfect,ingredients,0,sort_order}','1'),'dry_run','{}')$q$,'22023',null,'client sort order rejected');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,is_popular}','"true"'),'dry_run','{}')$q$,'22023',null,'non-boolean flag rejected');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes}',jsonb_build_array(jsonb_set(jsonb_set(pg_temp.recipe_import_sample()->'recipes'->0,'{recipe_number}','101'),'{name}','"R1 Atomic First"'),jsonb_set(jsonb_set(jsonb_set(pg_temp.recipe_import_sample()->'recipes'->0,'{recipe_number}','102'),'{name}','"R1 Atomic Second"'),'{variants,perfect,steps,0,instruction}','""'))),'create','{}')$q$,'23514',null,'invalid second recipe rejects entire import');
select is((select count(*)::int from public.bar_recipes where recipe_number in (101,102)),0,'failed batch leaves no recipes');
select ok(not has_function_privilege('authenticated','private.recipes_apply(uuid,uuid,uuid,jsonb,uuid)','execute'),'write core denied to clients');
select is((select version from public.bar_recipes where organization_id='00000000-0000-0000-0000-000000043011' and recipe_number=99),1,'repeat import does not update version');
select is((public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,name}','"R1 Test Changed"'),'create',array[99])->'recipes'->0->>'status'),'updated','explicit overwrite updates selected recipe');
select is((select slug from public.bar_recipes where organization_id='00000000-0000-0000-0000-000000043011' and recipe_number=99),'r1-test-import','overwrite preserves slug');
select is((select version from public.bar_recipes where organization_id='00000000-0000-0000-0000-000000043011' and recipe_number=99),2,'explicit overwrite updates version');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',pg_temp.recipe_import_sample(),'create',array[100])$q$,'22023',null,'overwrite numbers must occur in payload');
select is(private.recipes_slugify('Crème brûlée'),'creme-brulee','slug strips composed accents');
select is(private.recipes_slugify(U&'Cafe\0301'),'cafe','slug strips decomposed accents');
select throws_ok($q$insert into public.bar_recipe_variants (organization_id,recipe_id,variant) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043032','house')$q$,'23505',null,'house variant is unique');
select throws_ok($q$select public.bar_recipes_import('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043001',jsonb_set(pg_temp.recipe_import_sample(),'{recipes,0,category_id}','"00000000-0000-0000-0000-000000043022"'),'dry_run','{}')$q$,'22023',null,'foreign category id is rejected rather than ignored');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bar_recipes_import'),'import RPC pins search path');
select ok(has_function_privilege('service_role','public.bar_recipes_import(uuid,uuid,jsonb,text,integer[])','execute'),'service role may execute import');
select throws_ok($q$insert into public.bar_recipes (organization_id,category_id,recipe_number,name,slug,created_by) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043021',88,'Slug collision','r1-test-citrus','00000000-0000-0000-0000-000000043001')$q$,'23505',null,'slug unique within organization');
select throws_ok($q$insert into public.bar_recipe_ingredients (organization_id,variant_id,ingredient_name,sort_order) values ('00000000-0000-0000-0000-000000043011','00000000-0000-0000-0000-000000043041','Duplicate position',0)$q$,'23505',null,'ingredient order is unique per variant');
select * from finish();
rollback;
