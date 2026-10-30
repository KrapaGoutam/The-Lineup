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
create function pg_temp.payload(p_number int default 23, p_name text default 'My Drink', p_category uuid default '00000000-0000-0000-0000-000000044021') returns jsonb language sql as $$
select jsonb_build_object('recipe_number',p_number,'name',p_name,'category_id',p_category,'variants',
  '{"perfect":{"method":"Shake","ingredients":[{"ingredient_name":"Synthetic citrus","amount":"Splash"},{"ingredient_name":"Synthetic water","amount":"Top"}],"steps":[{"instruction":"Combine"},{"instruction":"Serve"}],"garnishes":[{"name":"Peel"},{"name":"Leaf"}]},"house":{"tips":"House notes","ingredients":[{"ingredient_name":"House citrus"}]}}'::jsonb);
$$;
create function pg_temp.save(p_number int default 23, p_name text default 'My Drink') returns jsonb language sql as $$
select public.bar_recipe_save('00000000-0000-0000-0000-000000044011',null,null,pg_temp.payload(p_number,p_name));
$$;
create function pg_temp.edit(p_payload jsonb default pg_temp.payload(),p_version int default 1) returns jsonb language sql as $$
select public.bar_recipe_save('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipes where organization_id='00000000-0000-0000-0000-000000044011' and slug='my-drink'),p_version,p_payload);
$$;
create function pg_temp.capture(p_sql text) returns jsonb language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return jsonb_build_object('code','00000');
exception when others then
  get stacked diagnostics v_detail=pg_exception_detail;
  return jsonb_build_object('code',sqlstate,'detail',case when v_detail like '{%' then v_detail::jsonb else null end);
end;
$$;
create function pg_temp.snapshot() returns jsonb language sql as $$
select jsonb_build_object('recipes',(select jsonb_agg(to_jsonb(r) order by id) from public.bar_recipes r),
 'variants',(select jsonb_agg(to_jsonb(v) order by id) from public.bar_recipe_variants v),
 'ingredients',(select jsonb_agg(to_jsonb(i) order by id) from public.bar_recipe_ingredients i),
 'steps',(select jsonb_agg(to_jsonb(s) order by id) from public.bar_recipe_steps s),
 'garnishes',(select jsonb_agg(to_jsonb(g) order by id) from public.bar_recipe_garnishes g));
$$;
create temp table evidence (key text primary key, value jsonb);
grant all on evidence to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044001',true);
select is(pg_temp.save()->>'slug','my-drink','RC-100 manager creates recipe');
select is((select count(*)::int from public.bar_recipe_variants),2,'Perfect and House both saved');
select is((select array_agg(sort_order order by sort_order) from public.bar_recipe_ingredients where ingredient_name like 'Synthetic%'),array[0,1],'RC-103 ingredients array order assigned');
select is((select array_agg(sort_order order by sort_order) from public.bar_recipe_steps),array[0,1],'steps order assigned');
select is((select array_agg(sort_order order by sort_order) from public.bar_recipe_garnishes),array[0,1],'garnishes order assigned');
select is(pg_temp.save(24)->>'slug','my-drink-2','RC-045 collision gets suffix 2');
select is(pg_temp.save(25)->>'slug','my-drink-3','collision gets suffix 3');
select is(pg_temp.save(26,'!!!')->>'slug','recipe-26','empty normalized name uses number fallback');
select is(pg_temp.save(27,'New')->>'slug','recipe-27','reserved slug never stored');
insert into evidence values ('original',pg_temp.snapshot());
insert into evidence values ('duplicate',pg_temp.capture($q$select pg_temp.save()$q$));
select is((select value->>'code' from evidence where key='duplicate'),'23505','RC-039 duplicate number fails through UNIQUE');
select is((select value->'detail' from evidence where key='duplicate'),
 jsonb_build_object('kind','duplicate','entity','recipe','field','recipe_number','existing_id',(select id from public.bar_recipes where recipe_number=23),'existing_label','23 My Drink'),'duplicate identifies existing row with useful label');
select is(pg_temp.snapshot(),(select value from evidence where key='original'),'duplicate rolls back graph');
select is(pg_temp.edit(pg_temp.payload(38,'Renamed'))->>'recipe_number','38','RC-038 management renumbers 23 to unused 38');
select is((select slug from public.bar_recipes where recipe_number=38),'my-drink','RC-044 renumber and rename preserve slug');
select is((select version from public.bar_recipes where recipe_number=38),2,'renumber increments version');
select ok((select value->'recipes' @> jsonb_build_array(jsonb_build_object('id',(select id from public.bar_recipes where recipe_number=38),'slug','my-drink')) from evidence where key='original'),'same recipe identity after renumber');
insert into evidence values ('before-stale',pg_temp.snapshot());
insert into evidence values ('stale',pg_temp.capture($q$select pg_temp.edit(pg_temp.payload(39,'Stale'),1)$q$));
select is((select value->>'code' from evidence where key='stale'),'PT409','RC-111 stale version fails');
select is((select value->'detail'->>'current_version' from evidence where key='stale'),'2','stale detail includes current version');
select ok((select value->'detail' ?& array['kind','updated_by','updated_at'] from evidence where key='stale'),'stale includes attribution');
select is(pg_temp.snapshot(),(select value from evidence where key='before-stale'),'stale leaves all rows, children and version unchanged');
select throws_ok($q$select pg_temp.edit(jsonb_set(pg_temp.payload(39,'Failed'),'{variants,house,ingredients,0,ingredient_name}','""'),2)$q$,'22023',null,'RC-110 late child validation fails');
select is(pg_temp.snapshot(),(select value from evidence where key='before-stale'),'failed House child rolls back recipe and Perfect graph');
select throws_ok($q$select pg_temp.edit(jsonb_set(pg_temp.payload(38),'{variants}','{}'),2)$q$,'22023',null,'RC-108 cannot remove all variants');
select throws_ok($q$select pg_temp.edit(jsonb_set(pg_temp.payload(38),'{variants,perfect,steps,0,sort_order}','99'),2)$q$,'22023',null,'RC-117 client sort_order denied');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38)||'{"slug":"forged"}',2)$q$,'22023',null,'client slug denied');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38)||'{"is_active":false}',2)$q$,'22023',null,'client archive field denied');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38)||'{"image_path":"forged"}',2)$q$,'22023',null,'client image path denied');
select throws_ok($q$select pg_temp.save(28,repeat('x',121))$q$,'22023',null,'RC-060 field length is a validation error');
select throws_ok($q$select pg_temp.save(28,E'\t\n ' )$q$,'22023',null,'whitespace-only name returns field validation error');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38,'My Drink','00000000-0000-0000-0000-000000044022'),2)$q$,'22023',null,'RC-032 foreign category denied');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38,'My Drink','00000000-0000-0000-0000-000000044023'),2)$q$,'22023',null,'cannot switch to another inactive category');
select throws_ok($q$select public.bar_recipe_save('00000000-0000-0000-0000-000000044011',null,null,pg_temp.payload(29,'Inactive create','00000000-0000-0000-0000-000000044023'))$q$,'22023',null,'create requires active category');
-- Legacy inactive-current data is installed as fixture, never by the client.
reset role;
update public.bar_recipes set category_id='00000000-0000-0000-0000-000000044023' where recipe_number=38;
set local role authenticated;
select is(pg_temp.edit(pg_temp.payload(38,'Retained','00000000-0000-0000-0000-000000044023'),2)->>'version','3','current inactive category may be retained');
select is(pg_temp.edit(jsonb_set(pg_temp.payload(38,'Updated'),'{variants}','{"house":{"ingredients":[{"ingredient_name":"Replacement"}],"steps":[{"instruction":"New step"}],"garnishes":[{"name":"New peel"}]}}'),3)->>'version','4','RC-101 update with House only succeeds');
select is((select count(*)::int from public.bar_recipe_variants v join public.bar_recipes r on r.id=v.recipe_id where r.recipe_number=38),1,'removed Perfect variant deleted');
select is((select array_agg(i.ingredient_name) from public.bar_recipe_ingredients i join public.bar_recipe_variants v on v.id=i.variant_id join public.bar_recipes r on r.id=v.recipe_id where r.recipe_number=38),array['Replacement'],'children replaced without old rows');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044002',true);
select throws_ok($q$select pg_temp.save(31)$q$,'42501',null,'RC-019 Staff save denied');
select throws_ok($q$select public.bar_recipe_set_archived('00000000-0000-0000-0000-000000044011',null,1,true)$q$,'42501',null,'Staff archive denied');
select throws_ok($q$select public.bar_recipe_set_image('00000000-0000-0000-0000-000000044011',null,1,null,null)$q$,'42501',null,'Staff set_image denied');
select throws_ok($q$select public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011',null,null,'Staff')$q$,'42501',null,'Staff category save denied');
select throws_ok($q$select public.bar_recipe_category_set_active('00000000-0000-0000-0000-000000044011',null,1,false)$q$,'42501',null,'Staff category active denied');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011','{}')$q$,'42501',null,'Staff category reorder denied');
select throws_ok($q$update public.bar_recipes set name='Direct'$q$,'42501',null,'direct table update denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044003',true);
select throws_ok($q$select pg_temp.save(31)$q$,'42501',null,'RC-020 inactive manager denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044004',true);
select throws_ok($q$select pg_temp.save(31)$q$,'42501',null,'RC-133 foreign manager denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044001',true);
select throws_ok($q$select public.bar_recipe_save('00000000-0000-0000-0000-000000044012',(select id from public.bar_recipes where recipe_number=38),4,pg_temp.payload(38))$q$,'42501',null,'wrong organization denied');
-- Archive/restore and images always use the current optimistic version.
create function pg_temp.archive(p_version int,p_archived boolean,p_cat uuid default null) returns jsonb language sql as $$
select public.bar_recipe_set_archived('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipes where recipe_number=38),p_version,p_archived,p_cat);
$$;
select is(pg_temp.archive(4,true)->>'version','5','RC-113 archive succeeds');
select ok((select not is_active and archived_at is not null and archived_by=auth.uid() from public.bar_recipes where recipe_number=38),'archive attribution recorded');
select throws_ok($q$select pg_temp.edit(pg_temp.payload(38),5)$q$,'22023',null,'RC-115 archived save denied');
select throws_ok($q$select public.bar_recipe_set_image('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipes where recipe_number=38),5,null,null)$q$,'22023',null,'archived image metadata save denied');
select throws_ok($q$select pg_temp.save(38)$q$,'23505',null,'archived number remains occupied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044002',true);
select is((select count(*)::int from public.bar_recipes where recipe_number=38),0,'Staff loses archived read');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000044001',true);
select is(pg_temp.archive(5,false)->>'version','6','RC-114 restore succeeds');
select ok((select is_active and archived_at is null and archived_by is null and updated_by=auth.uid() from public.bar_recipes where recipe_number=38),'restore clears archive and records actor');
select is(pg_temp.archive(6,true)->>'version','7','archive again');
reset role;
update public.bar_recipes set category_id='00000000-0000-0000-0000-000000044023' where recipe_number=38;
set local role authenticated;
select throws_ok($q$select pg_temp.archive(7,false)$q$,'22023',null,'RC-034 restore inactive category requires replacement');
select is(pg_temp.archive(7,false,'00000000-0000-0000-0000-000000044021')->>'version','8','restore with active category succeeds');
create function pg_temp.image(p_version int,p_hero text,p_thumb text) returns jsonb language sql as $$
select public.bar_recipe_set_image('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipes where recipe_number=38),p_version,p_hero,p_thumb);
$$;
select throws_ok($q$select pg_temp.image(8,'wrong','wrong')$q$,'22023',null,'image path scope denied');
select throws_ok($q$select pg_temp.image(8,'wrong',null)$q$,'22023',null,'both paths required');
select is(pg_temp.image(8,'00000000-0000-0000-0000-000000044011/'||(select id from public.bar_recipes where recipe_number=38)||'/00000000-0000-0000-0000-000000000001.webp',
 '00000000-0000-0000-0000-000000044011/'||(select id from public.bar_recipes where recipe_number=38)||'/00000000-0000-0000-0000-000000000001-thumb.webp')->>'version','9','set_image valid metadata');
select throws_ok($q$select pg_temp.image(8,null,null)$q$,'PT409',null,'stale image denied');
select is(pg_temp.image(9,null,null)->>'version','10','image metadata removal bumps version');
select ok((select image_path is null and image_thumb_path is null from public.bar_recipes where recipe_number=38),'image paths cleared together');
select is(public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011',null,null,'Added')->>'version','1','RC-029 add category');
insert into evidence values ('category-duplicate',pg_temp.capture($q$select public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011',null,null,'Added')$q$));
select is((select value->>'code' from evidence where key='category-duplicate'),'23505','duplicate category rejected');
select is((select value->'detail'->>'existing_label' from evidence where key='category-duplicate'),'Added','duplicate category detail labels existing record');
select ok((select value->'detail'->>'existing_id'=(select id::text from public.bar_recipe_categories where slug='added') from evidence where key='category-duplicate'),'duplicate category detail has id');
select is(public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipe_categories where slug='added'),1,'Renamed Category')->>'version','2','category rename');
select is((select slug from public.bar_recipe_categories where name='Renamed Category'),'added','category slug immutable');
select is(public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044024',1,'Miscellaneous')->>'version','2','RC-027 fallback rename allowed');
select is(public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array[(select id from public.bar_recipe_categories where slug='added'),'00000000-0000-0000-0000-000000044023'::uuid,'00000000-0000-0000-0000-000000044021'::uuid])->>'count','3','RC-030 complete category reorder');
select is((select array_agg(slug order by is_fallback,display_order,name) from public.bar_recipe_categories),array['added','dormant','synthetic','others'],'deterministic order with renamed fallback last');
select throws_ok($q$select public.bar_recipe_category_reorder('00000000-0000-0000-0000-000000044011',array(select id from public.bar_recipe_categories))$q$,'22023',null,'fallback cannot be reordered');
select throws_ok($q$select public.bar_recipe_category_set_active('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044024',2,false)$q$,'22023',null,'fallback cannot be deactivated even after rename');
select throws_ok($q$select public.bar_recipe_category_set_active('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044021',2,false)$q$,'22023',null,'RC-028 category with active recipes cannot deactivate');
select is(public.bar_recipe_category_set_active('00000000-0000-0000-0000-000000044011',(select id from public.bar_recipe_categories where slug='added'),3,false)->>'version','4','empty category deactivate');
select throws_ok($q$select public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044022',1,'Foreign')$q$,'22023',null,'cross-org category rename denied');
select throws_ok($q$select public.bar_recipe_category_save('00000000-0000-0000-0000-000000044011','00000000-0000-0000-0000-000000044024',1,'Stale')$q$,'PT409',null,'category stale version denied');
reset role;
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like 'bar_recipe_%' or p.proname like 'recipes_%') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)),'RC-136 SECURITY DEFINER search_path pinned');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'bar_recipe_%' and p.proname<>'bar_recipes_import' and (has_function_privilege('anon',p.oid,'execute') or not has_function_privilege('authenticated',p.oid,'execute'))),'RPC authenticated grants, no anon execute');
select ok(not has_function_privilege('authenticated','private.recipes_begin(uuid)','execute') and not has_function_privilege('authenticated','private.recipes_management_text(jsonb,text,integer,boolean,boolean)','execute'),'private mutation helpers inaccessible');
select ok(not exists(select 1 from unnest(array['bar_recipe_categories','bar_recipes','bar_recipe_variants','bar_recipe_ingredients','bar_recipe_steps','bar_recipe_garnishes']) t cross join unnest(array['insert','update','delete','truncate']) p where has_table_privilege('authenticated','public.'||t,p)),'all six tables stay SELECT only');
select * from finish();
rollback;
