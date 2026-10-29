begin;
-- Transaction-only metadata fixtures have no backing files. Mirror the
-- Storage API's delete guard setting while leaving role/RLS enforcement on.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id,email,encrypted_password,email_confirmed_at,aud,role) values
('00000000-0000-0000-0000-000000045001','045-owner@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000045002','045-staff@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000045003','045-inactive@passcode.internal','x',now(),'authenticated','authenticated'),
('00000000-0000-0000-0000-000000045004','045-other@passcode.internal','x',now(),'authenticated','authenticated');
insert into public.profiles (id,display_name) values
('00000000-0000-0000-0000-000000045001','045 Owner'),('00000000-0000-0000-0000-000000045002','045 Staff'),('00000000-0000-0000-0000-000000045003','045 Inactive'),('00000000-0000-0000-0000-000000045004','045 Other');
insert into public.organizations (id,name,slug,created_by) values
('00000000-0000-0000-0000-000000045011','045 A','pgtap-045-a','00000000-0000-0000-0000-000000045001'),
('00000000-0000-0000-0000-000000045012','045 B','pgtap-045-b','00000000-0000-0000-0000-000000045004');
insert into public.memberships (organization_id,profile_id,roles,active) values
('00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045001',array['owner']::public.app_role[],true),
('00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045002',array['server']::public.app_role[],true),
('00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045003',array['shift_manager']::public.app_role[],false),
('00000000-0000-0000-0000-000000045012','00000000-0000-0000-0000-000000045004',array['owner']::public.app_role[],true);
insert into public.bar_recipe_categories (id,organization_id,name,slug,created_by) values
('00000000-0000-0000-0000-000000045021','00000000-0000-0000-0000-000000045011','Synthetic','synthetic','00000000-0000-0000-0000-000000045001'),
('00000000-0000-0000-0000-000000045022','00000000-0000-0000-0000-000000045012','Synthetic','synthetic','00000000-0000-0000-0000-000000045004');
insert into public.bar_recipes (id,organization_id,category_id,recipe_number,name,slug,is_active,archived_at,created_by) values
('00000000-0000-0000-0000-000000045031','00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045021',1,'R1 Test Citrus','r1-test-citrus',true,null,'00000000-0000-0000-0000-000000045001'),
('00000000-0000-0000-0000-000000045032','00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045021',2,'R1 Test Archived','r1-test-archived',false,now(),'00000000-0000-0000-0000-000000045001'),
('00000000-0000-0000-0000-000000045033','00000000-0000-0000-0000-000000045012','00000000-0000-0000-0000-000000045022',1,'R1 Test Other','r1-test-other',true,null,'00000000-0000-0000-0000-000000045004');
insert into public.bar_recipe_variants (id,organization_id,recipe_id,variant) values
('00000000-0000-0000-0000-000000045041','00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045031','perfect'),
('00000000-0000-0000-0000-000000045042','00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045032','house');
insert into public.bar_recipe_ingredients (organization_id,variant_id,ingredient_name,amount,sort_order) values
('00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045041','Synthetic citrus','Splash',0),
('00000000-0000-0000-0000-000000045011','00000000-0000-0000-0000-000000045042','Synthetic archived','Top',0);

-- RC-119/121-125/130: real RLS operations, not function-existence checks.
create function pg_temp.image(p_recipe text default '00000000-0000-0000-0000-000000045031',p_org text default '00000000-0000-0000-0000-000000045011',p_image text default '00000000-0000-0000-0000-000000000001.webp') returns text language sql as $$
 select p_org || '/' || p_recipe || '/' || p_image;
$$;
create function pg_temp.upload(p_path text) returns void language sql as $$
 insert into storage.objects (bucket_id,name) values ('recipe-images',p_path);
$$;
insert into storage.objects (bucket_id,name) values
 ('recipe-images',pg_temp.image()),
 ('recipe-images',pg_temp.image('00000000-0000-0000-0000-000000045032')),
 ('recipe-images',pg_temp.image('00000000-0000-0000-0000-000000045033','00000000-0000-0000-0000-000000045012'));
select ok((select not public from storage.buckets where id='recipe-images'),'RC-119 bucket exists and private');
select is((select file_size_limit from storage.buckets where id='recipe-images'),2097152::bigint,'2 MiB limit');
select is((select allowed_mime_types from storage.buckets where id='recipe-images'),array['image/webp','image/jpeg'],'exact MIME allowlist');
select is((select array_agg(policyname::text order by policyname) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'recipe_images_%'),array['recipe_images_delete','recipe_images_insert','recipe_images_select'],'migration installs exactly three policies');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('UPDATE','ALL')),0,'RC-125 no effective UPDATE policy');
select is(private.recipes_image_parts('not-a-uuid/also-bad/arbitrary.webp'),null::uuid[],'malformed path safely returns null');
select is(private.recipes_image_parts(pg_temp.image()||'/extra'),null::uuid[],'extra path segments denied');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000045002',true);
select is((select count(*)::int from storage.objects where bucket_id='recipe-images'),1,'active Staff reads only own active object');
select is((select count(*)::int from storage.objects where name=pg_temp.image('00000000-0000-0000-0000-000000045032')),0,'RC-123 Staff archived SELECT denied');
select is((select count(*)::int from storage.objects where name=pg_temp.image('00000000-0000-0000-0000-000000045033','00000000-0000-0000-0000-000000045012')),0,'RC-122 cross-org SELECT denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002.webp'))$q$,'42501',null,'RC-121 Staff INSERT denied');
with removed as (delete from storage.objects where bucket_id='recipe-images' and name=pg_temp.image() returning *) select is((select count(*)::int from removed),0,'RC-121 Staff DELETE affects zero rows');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000045003',true);
select is((select count(*)::int from storage.objects where bucket_id='recipe-images'),0,'inactive management reads no objects');
select throws_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002.webp'))$q$,'42501',null,'inactive management INSERT denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000045001',true);
select is((select count(*)::int from storage.objects where bucket_id='recipe-images'),2,'management reads own active and archived objects');
select lives_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002.webp'))$q$,'management valid INSERT allowed');
select lives_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002-thumb.jpg'))$q$,'thumbnail JPG valid INSERT');
with removed as (delete from storage.objects where name=pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002.webp') returning *) select is((select count(*)::int from removed),1,'management own active DELETE allowed');
with changed as (update storage.objects set metadata='{"changed":true}' where name=pg_temp.image() returning *) select is((select count(*)::int from changed),0,'UPDATE cannot overwrite even manager-owned object');
select throws_ok($q$select pg_temp.upload(pg_temp.image('00000000-0000-0000-0000-000000045032',p_image=>'00000000-0000-0000-0000-000000000002.webp'))$q$,'42501',null,'archived recipe INSERT denied');
with removed as (delete from storage.objects where name=pg_temp.image('00000000-0000-0000-0000-000000045032') returning *) select is((select count(*)::int from removed),0,'archived recipe DELETE denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image('00000000-0000-0000-0000-000000045033','00000000-0000-0000-0000-000000045012','00000000-0000-0000-0000-000000000002.webp'))$q$,'42501',null,'foreign management INSERT denied');
with removed as (delete from storage.objects where name=pg_temp.image('00000000-0000-0000-0000-000000045033','00000000-0000-0000-0000-000000045012') returning *) select is((select count(*)::int from removed),0,'foreign management DELETE denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image('00000000-0000-0000-0000-000000045033'))$q$,'42501',null,'wrong organization/recipe folder pair denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image('00000000-0000-0000-0000-000000045099'))$q$,'42501',null,'nonexistent recipe folder denied');
select throws_ok($q$select pg_temp.upload('bad/uuid/path.webp')$q$,'42501',null,'malformed arbitrary path denied without cast error');
select throws_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'name.webp'))$q$,'42501',null,'names instead of UUID denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000002.png'))$q$,'42501',null,'unsupported stored extension denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000045004',true);
select is((select count(*)::int from storage.objects where bucket_id='recipe-images'),1,'other manager sees only own organization');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*)::int from storage.objects where bucket_id='recipe-images'),0,'unauthenticated SELECT denied');
select throws_ok($q$select pg_temp.upload(pg_temp.image(p_image=>'00000000-0000-0000-0000-000000000003.webp'))$q$,'42501',null,'unauthenticated INSERT denied');
with removed as (delete from storage.objects where bucket_id='recipe-images' returning *) select is((select count(*)::int from removed),0,'unauthenticated DELETE denied');
reset role;
select is((select count(*)::int from storage.objects where name=pg_temp.image()),1,'denied DELETE/UPDATE leave original object intact');
select * from finish();
rollback;
