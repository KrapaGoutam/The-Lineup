begin;
create extension if not exists pgtap with schema extensions;
select plan(105);

-- ===========================================================================
-- V2-008 Batch B / E-1 (owner decision D-10, Option A): shared-catalog authority
--
-- Organization-shared resources (the Recipes book and the shared Inventory catalog: vendors,
-- categories, subcategories, products) are managed by ORGANIZATION-level authority. A
-- location-level role keeps that authority only while its organization has at most one ACTIVE,
-- non-archived location. The location count is read from the database on every call.
-- Location-scoped Inventory operations (stock, bootstrap) are unchanged.
--
-- Probe = the 18 client-executable shared writers (6 recipe RPCs + 12 catalog RPCs) called with
-- inert arguments. pg_temp.denied() returns how many of the 18 answered SQLSTATE 42501:
-- 18 = fully denied, 0 = fully authorized.
--
-- Actors (profile id suffix 0800NN)
--   01 ovOwner  02 ovMgr  03 ovAsst      Overall roles, NO membership anywhere
--   04 orgOwner 05 gm 06 shiftM          org M organization roles (shiftM has NO location row)
--   07 lmgrM1   08 lasstM1 09 staffM1    org M location roles at M1
--   10 mgrM2    11 inactRow 12 inactOrg  M2-only manager / inactive row / inactive membership
--   13 noRow    14 foreign  23 banned    member without row / org B owner / banned org M owner
--   15..19      org S (ONE location): lmgr, lasst, shift, staff, owner
--   20..22,24   org T (transition):   lasst, inactive row, shift, late T2 manager
-- Orgs: M (2 active locations M1,M2), S (1: S1), T (T1 active + T3 archived, then T2 added), B.
-- ===========================================================================

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000080001', 'e1-ovowner@test.invalid'),
  ('00000000-0000-4000-8000-000000080002', 'e1-ovmgr@test.invalid'),
  ('00000000-0000-4000-8000-000000080003', 'e1-ovasst@test.invalid'),
  ('00000000-0000-4000-8000-000000080004', 'e1-orgowner@test.invalid'),
  ('00000000-0000-4000-8000-000000080005', 'e1-gm@test.invalid'),
  ('00000000-0000-4000-8000-000000080006', 'e1-shiftm@test.invalid'),
  ('00000000-0000-4000-8000-000000080007', 'e1-lmgrm1@test.invalid'),
  ('00000000-0000-4000-8000-000000080008', 'e1-lasstm1@test.invalid'),
  ('00000000-0000-4000-8000-000000080009', 'e1-staffm1@test.invalid'),
  ('00000000-0000-4000-8000-000000080010', 'e1-mgrm2@test.invalid'),
  ('00000000-0000-4000-8000-000000080011', 'e1-inactrow@test.invalid'),
  ('00000000-0000-4000-8000-000000080012', 'e1-inactorg@test.invalid'),
  ('00000000-0000-4000-8000-000000080013', 'e1-norow@test.invalid'),
  ('00000000-0000-4000-8000-000000080014', 'e1-foreign@test.invalid'),
  ('00000000-0000-4000-8000-000000080015', 'e1-slmgr@test.invalid'),
  ('00000000-0000-4000-8000-000000080016', 'e1-slasst@test.invalid'),
  ('00000000-0000-4000-8000-000000080017', 'e1-sshift@test.invalid'),
  ('00000000-0000-4000-8000-000000080018', 'e1-sstaff@test.invalid'),
  ('00000000-0000-4000-8000-000000080019', 'e1-sowner@test.invalid'),
  ('00000000-0000-4000-8000-000000080020', 'e1-tlasst@test.invalid'),
  ('00000000-0000-4000-8000-000000080021', 'e1-tinactrow@test.invalid'),
  ('00000000-0000-4000-8000-000000080022', 'e1-tshift@test.invalid'),
  ('00000000-0000-4000-8000-000000080023', 'e1-banned@test.invalid'),
  ('00000000-0000-4000-8000-000000080024', 'e1-tnew@test.invalid');

insert into auth.sessions (id, user_id, created_at, updated_at)
select id, id, now(), now() from auth.users where email like 'e1-%@test.invalid';

insert into public.profiles (id, display_name)
select id, replace(split_part(email, '@', 1), 'e1-', 'E1-') from auth.users where email like 'e1-%@test.invalid';

insert into public.organizations (id, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000080101', 'E1 Org M', 'e1-org-m', '00000000-0000-4000-8000-000000080004'),
  ('00000000-0000-4000-8000-000000080102', 'E1 Org S', 'e1-org-s', '00000000-0000-4000-8000-000000080019'),
  ('00000000-0000-4000-8000-000000080103', 'E1 Org T', 'e1-org-t', '00000000-0000-4000-8000-000000080022'),
  ('00000000-0000-4000-8000-000000080104', 'E1 Org B', 'e1-org-b', '00000000-0000-4000-8000-000000080014');

insert into public.locations (id, organization_id, name, time_zone) values
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080101', 'E1 M1', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000080202', '00000000-0000-4000-8000-000000080101', 'E1 M2', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000080203', '00000000-0000-4000-8000-000000080102', 'E1 S1', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000080204', '00000000-0000-4000-8000-000000080103', 'E1 T1', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000080206', '00000000-0000-4000-8000-000000080103', 'E1 T3 (archived)', 'America/Chicago'),
  ('00000000-0000-4000-8000-000000080207', '00000000-0000-4000-8000-000000080104', 'E1 B1', 'America/Chicago');
update public.locations set active = false, archived_at = now() where id = '00000000-0000-4000-8000-000000080206';

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080004', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080005', array['general_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080006', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080007', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080008', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080009', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080010', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080011', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080012', array['server']::public.app_role[], false),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080013', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080023', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080015', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080016', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080017', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080018', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080019', array['owner']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080103', '00000000-0000-4000-8000-000000080020', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080103', '00000000-0000-4000-8000-000000080021', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080103', '00000000-0000-4000-8000-000000080022', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080103', '00000000-0000-4000-8000-000000080024', array['server']::public.app_role[], true),
  ('00000000-0000-4000-8000-000000080104', '00000000-0000-4000-8000-000000080014', array['owner']::public.app_role[], true);

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080007', 'manager', true),
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080008', 'assistant_manager', true),
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080009', 'staff', true),
  ('00000000-0000-4000-8000-000000080202', '00000000-0000-4000-8000-000000080010', 'manager', true),
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080011', 'manager', false),
  ('00000000-0000-4000-8000-000000080201', '00000000-0000-4000-8000-000000080012', 'manager', true),
  ('00000000-0000-4000-8000-000000080203', '00000000-0000-4000-8000-000000080015', 'manager', true),
  ('00000000-0000-4000-8000-000000080203', '00000000-0000-4000-8000-000000080016', 'assistant_manager', true),
  ('00000000-0000-4000-8000-000000080203', '00000000-0000-4000-8000-000000080018', 'staff', true),
  ('00000000-0000-4000-8000-000000080204', '00000000-0000-4000-8000-000000080020', 'assistant_manager', true),
  ('00000000-0000-4000-8000-000000080204', '00000000-0000-4000-8000-000000080021', 'manager', false);

insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-4000-8000-000000080001', 'owner'),
  ('00000000-0000-4000-8000-000000080002', 'manager'),
  ('00000000-0000-4000-8000-000000080003', 'assistant_manager');

update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-000000080023';

-- Seeded shared catalog + recipe books (org M and org S), written as the platform operator.
insert into public.inventory_vendors (id, organization_id, name, created_by) values
  ('00000000-0000-4000-8000-000000080301', '00000000-0000-4000-8000-000000080101', 'E1 Vendor M', '00000000-0000-4000-8000-000000080004'),
  ('00000000-0000-4000-8000-000000080302', '00000000-0000-4000-8000-000000080102', 'E1 Vendor S', '00000000-0000-4000-8000-000000080019');
insert into public.inventory_products (id, organization_id, vendor_id, name, size, unit_type, created_by) values
  ('00000000-0000-4000-8000-000000080401', '00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080301', 'E1 Vodka M', '750 mL', 'bottle', '00000000-0000-4000-8000-000000080004'),
  ('00000000-0000-4000-8000-000000080402', '00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080302', 'E1 Vodka S', '750 mL', 'bottle', '00000000-0000-4000-8000-000000080019');
insert into public.bar_recipe_categories (id, organization_id, name, slug, display_order, created_by) values
  ('00000000-0000-4000-8000-000000080501', '00000000-0000-4000-8000-000000080101', 'E1 Classics M', 'e1-classics-m', 1, '00000000-0000-4000-8000-000000080004'),
  ('00000000-0000-4000-8000-000000080502', '00000000-0000-4000-8000-000000080102', 'E1 Classics S', 'e1-classics-s', 1, '00000000-0000-4000-8000-000000080019');
insert into public.bar_recipes (id, organization_id, category_id, recipe_number, name, slug, created_by) values
  ('00000000-0000-4000-8000-000000080601', '00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080501', 1, 'E1 Daiquiri M', 'e1-daiquiri-m', '00000000-0000-4000-8000-000000080004'),
  ('00000000-0000-4000-8000-000000080602', '00000000-0000-4000-8000-000000080102', '00000000-0000-4000-8000-000000080502', 1, 'E1 Daiquiri S', 'e1-daiquiri-s', '00000000-0000-4000-8000-000000080019');
insert into public.bar_recipes (id, organization_id, category_id, recipe_number, name, slug, is_active, archived_at, archived_by, created_by) values
  ('00000000-0000-4000-8000-000000080603', '00000000-0000-4000-8000-000000080101', '00000000-0000-4000-8000-000000080501', 2, 'E1 Retired M', 'e1-retired-m', false, now(), '00000000-0000-4000-8000-000000080004', '00000000-0000-4000-8000-000000080004');

-- helpers ------------------------------------------------------------------
create function pg_temp.act(p_user uuid, p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated', 'session_id', coalesce(p_session, p_user))::text, true);
end $$;

create function pg_temp.act_n(p_n int) returns void language sql as $$
  select pg_temp.act(('00000000-0000-4000-8000-0000000800' || lpad(p_n::text, 2, '0'))::uuid)
$$;

create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate || ':' || sqlerrm;
end $$;

-- How many of the 18 shared writers refuse the caller with 42501 (18 = all denied, 0 = none).
create function pg_temp.denied(p_org uuid, p_loc uuid) returns int language plpgsql as $$
declare
  v_n int := 0;
  v_sql text;
  v_stmts text[];
begin
  v_stmts := array[
    -- Recipes (6): authorization runs before any argument is examined.
    format('select public.bar_recipe_save(%L::uuid, null::uuid, null::integer, ''{}''::jsonb)', p_org),
    format('select public.bar_recipe_set_archived(%L::uuid, %L::uuid, 1, true, null::uuid)', p_org, gen_random_uuid()),
    format('select public.bar_recipe_set_image(%L::uuid, %L::uuid, 1, ''a'', ''b'')', p_org, gen_random_uuid()),
    format('select public.bar_recipe_category_save(%L::uuid, null::uuid, null::integer, %L)', p_org, 'c-' || gen_random_uuid()),
    format('select public.bar_recipe_category_set_active(%L::uuid, %L::uuid, 1, true)', p_org, gen_random_uuid()),
    format('select public.bar_recipe_category_reorder(%L::uuid, array[%L::uuid])', p_org, gen_random_uuid()),
    -- Shared Inventory catalog (12)
    format('select public.inventory_vendor_create(%L::uuid, %L::uuid, %L, null)', p_org, p_loc, 'v-' || gen_random_uuid()),
    format('select public.inventory_vendor_update(%L::uuid, %L::uuid, %L::uuid, %L, null, 1)', p_org, p_loc, gen_random_uuid(), 'n'),
    format('select public.inventory_vendor_set_active(%L::uuid, %L::uuid, %L::uuid, true, 1)', p_org, p_loc, gen_random_uuid()),
    format('select public.inventory_category_create(%L::uuid, %L::uuid, %L)', p_org, p_loc, 'c-' || gen_random_uuid()),
    format('select public.inventory_category_update(%L::uuid, %L::uuid, %L::uuid, %L, 1)', p_org, p_loc, gen_random_uuid(), 'n'),
    format('select public.inventory_category_set_active(%L::uuid, %L::uuid, %L::uuid, true, 1)', p_org, p_loc, gen_random_uuid()),
    format('select public.inventory_subcategory_create(%L::uuid, %L::uuid, %L::uuid, %L)', p_org, p_loc, gen_random_uuid(), 's'),
    format('select public.inventory_subcategory_update(%L::uuid, %L::uuid, %L::uuid, %L, %L::uuid, 1)', p_org, p_loc, gen_random_uuid(), 'n', gen_random_uuid()),
    format('select public.inventory_subcategory_set_active(%L::uuid, %L::uuid, %L::uuid, true, 1)', p_org, p_loc, gen_random_uuid()),
    format('select public.inventory_product_create(%L::uuid, %L::uuid, %L::uuid, %L, null::uuid, null::uuid, ''1L'', ''bottle'', null, null, null)', p_org, p_loc, gen_random_uuid(), 'p-' || gen_random_uuid()),
    format('select public.inventory_product_update(%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L, null::uuid, null::uuid, ''1L'', ''bottle'', null, null, null, 1)', p_org, p_loc, gen_random_uuid(), gen_random_uuid(), 'n'),
    format('select public.inventory_product_set_active(%L::uuid, %L::uuid, %L::uuid, true, 1)', p_org, p_loc, gen_random_uuid())
  ];
  foreach v_sql in array v_stmts loop
    begin
      execute v_sql;
    exception when sqlstate '42501' then
      v_n := v_n + 1;
    when others then
      null; -- authorized: the call got past authorization and failed (or succeeded) on content
    end;
  end loop;
  return v_n;
end $$;

-- ===========================================================================
-- 1. Organization M: TWO active locations. Only organization-level authority writes.
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(1);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 0, 'E1-01 Overall owner (no membership): all 18 shared writers authorized');
select pg_temp.act_n(2);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 0, 'E1-02 Overall manager: all 18 authorized');
select pg_temp.act_n(3);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 0, 'E1-03 Overall assistant manager: authority UNCHANGED (D-10b: the Overall tier is not narrowed)');
select pg_temp.act_n(4);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 0, 'E1-04 organization owner: all 18 authorized');
select pg_temp.act_n(5);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080202'), 0, 'E1-05 organization general manager: all 18 authorized (at either location)');
select pg_temp.act_n(6);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-06 organization shift manager, no location row, two locations: all 18 denied');
select pg_temp.act_n(7);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-07 location MANAGER at M1 (own location), two locations: all 18 denied (was the S1 spill)');
select pg_temp.act_n(8);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-08 location ASSISTANT manager at M1 (own location), two locations: all 18 denied (was the S1 spill)');
select pg_temp.act_n(9);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-09 location staff: all 18 denied');
select pg_temp.act_n(10);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-10 manager of M2 only, aimed at M1 (cross-location): all 18 denied');
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080202'), 18, 'E1-11 manager of M2 only, at their OWN location, two locations: all 18 denied (was the S1 recipe-book spill)');
select pg_temp.act_n(11);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-12 INACTIVE location manager row: all 18 denied');
select pg_temp.act_n(12);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-13 INACTIVE organization membership with an active location row: all 18 denied');
select pg_temp.act_n(13);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-14 organization member with no location row: all 18 denied');
select pg_temp.act_n(14);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-15 org B owner against org M (cross-organization): all 18 denied');
select is(pg_temp.denied('00000000-0000-4000-8000-000000080104','00000000-0000-4000-8000-000000080207'), 0, 'E1-16 control: the same org B owner IS authorized in their own organization');
select pg_temp.act_n(23);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-17 BANNED organization owner: all 18 denied');
select pg_temp.act(('00000000-0000-4000-8000-000000080004')::uuid, ('00000000-0000-4000-8000-0000000fffff')::uuid);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-18 organization owner with a REVOKED/unknown session: all 18 denied');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-19 authenticated role with no identity: all 18 denied');
reset role;

-- Anonymous: the functions are not granted to anon at all.
set local role anon;
select is(left(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000080101'::uuid,null::uuid,null::integer,'{}'::jsonb)$q$), 5), '42501', 'E1-20 anonymous cannot call a recipe writer');
select is(left(pg_temp.err_of($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000080101'::uuid,'00000000-0000-4000-8000-000000080201'::uuid,'anon',null)$q$), 5), '42501', 'E1-21 anonymous cannot call a catalog writer');
select is(left(pg_temp.err_of($q$select public.catalog_authorized('00000000-0000-4000-8000-000000080101'::uuid)$q$), 5), '42501', 'E1-22 anonymous cannot call catalog_authorized');
reset role;

-- ===========================================================================
-- 2. Organization S: ONE active location (single-location compatibility exception)
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(15);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203'), 0, 'E1-23 location MANAGER in a one-location org keeps the shared-catalog authority (no pilot regression)');
select pg_temp.act_n(16);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203'), 0, 'E1-24 location ASSISTANT manager in a one-location org keeps it');
select pg_temp.act_n(17);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203'), 0, 'E1-25 organization shift manager in a one-location org keeps it');
select pg_temp.act_n(18);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203'), 18, 'E1-26 location staff in a one-location org: denied');
select pg_temp.act_n(19);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203'), 0, 'E1-27 organization owner in a one-location org: authorized');
select pg_temp.act_n(16);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201'), 18, 'E1-28 the one-location exception never crosses tenants: org S assistant manager vs org M denied');
reset role;

-- ===========================================================================
-- 3. Organization T: the number of active locations is read on EVERY decision
-- ===========================================================================
-- T1 active + T3 archived => exactly one ACTIVE location.
set local role authenticated;
select pg_temp.act_n(20);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 0, 'E1-29 one active + one ARCHIVED location: the assistant manager keeps the exception (archived does not count)');
select pg_temp.act_n(22);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 0, 'E1-30 same org: shift manager keeps it');
select pg_temp.act_n(21);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-31 same org: INACTIVE location row stays denied');
reset role;

-- A second ACTIVE location appears (the operator path; app users cannot change lifecycle directly).
insert into public.locations (id, organization_id, name, time_zone) values
  ('00000000-0000-4000-8000-000000080205', '00000000-0000-4000-8000-000000080103', 'E1 T2', 'America/Chicago');
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-000000080205', '00000000-0000-4000-8000-000000080024', 'manager', true);

set local role authenticated;
select pg_temp.act_n(20);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-32 TRANSITION 1 -> 2 active locations: the same assistant manager loses the exception on the very next call');
select pg_temp.act_n(22);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-33 TRANSITION 1 -> 2: the shift manager loses it too');
select pg_temp.act_n(24);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080205'), 18, 'E1-34 TRANSITION 1 -> 2: the manager of the NEW location is denied as well');
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080103')), false, 'E1-35 catalog_authorized agrees with the database decision at two locations');
select pg_temp.act_n(20);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080103')), false, 'E1-36 catalog_authorized false for the assistant manager at two locations');
reset role;

-- The second location is deactivated (not archived): it stops counting.
update public.locations set active = false where id = '00000000-0000-4000-8000-000000080205';
set local role authenticated;
select pg_temp.act_n(20);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 0, 'E1-37 TRANSITION 2 -> 1 (second location INACTIVE): the exception returns');
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080103')), true, 'E1-38 catalog_authorized flips back to true');
reset role;

-- Re-activated: denied again; then ARCHIVED: allowed again; nothing is revived by the flip.
update public.locations set active = true where id = '00000000-0000-4000-8000-000000080205';
set local role authenticated;
select pg_temp.act_n(20);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-39 second location active again: denied again (no caching)');
reset role;
update public.locations set active = false, archived_at = now() where id = '00000000-0000-4000-8000-000000080205';
set local role authenticated;
select pg_temp.act_n(20);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 0, 'E1-40 second location ARCHIVED: the exception returns');
select pg_temp.act_n(21);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-41 restoring ONE active location does not revive the inactive location row');
select pg_temp.act_n(24);
select is(pg_temp.denied('00000000-0000-4000-8000-000000080103','00000000-0000-4000-8000-000000080204'), 18, 'E1-42 the manager row that belongs to the now-ARCHIVED location grants nothing (and no location access to T1)');
reset role;
select is((select count(*)::int from public.location_memberships where location_id = '00000000-0000-4000-8000-000000080204' and profile_id = '00000000-0000-4000-8000-000000080021' and not active), 1, 'E1-43 the inactive row is still inactive: the flip changed no membership');

-- ===========================================================================
-- 4. Location-scoped Inventory operations are NOT affected (organization M, two locations)
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(8);
select lives_ok($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201','00000000-0000-4000-8000-000000080401','set',3,0,'stock_count','E1 count',1)$q$,
  'E1-44 location assistant manager still adjusts STOCK at their own location');
select is(left(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080202','00000000-0000-4000-8000-000000080401','set',3,0,'stock_count','E1 count',1)$q$), 5), '42501', 'E1-45 ... and still cannot adjust stock at another location');
select lives_ok($q$select public.inventory_bootstrap('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201')$q$,
  'E1-46 inventory_bootstrap (idempotent system vendor) stays a location-level operation');
select pg_temp.act_n(9);
select is(left(pg_temp.err_of($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201','00000000-0000-4000-8000-000000080401','set',4,0,'stock_count','E1 count',2)$q$), 5), '42501', 'E1-47 location staff still cannot adjust stock');
select pg_temp.act_n(10);
select lives_ok($q$select public.inventory_stock_adjust('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080202','00000000-0000-4000-8000-000000080401','set',5,0,'stock_count','E1 count M2',1)$q$,
  'E1-48 the M2 manager adjusts stock at M2 (their own location) as before');

-- Reads are unchanged: sharing the catalog with location managers is documented and intended.
select pg_temp.act_n(8);
select cmp_ok((select count(*)::int from public.inventory_vendors where organization_id = '00000000-0000-4000-8000-000000080101' and not is_system), '>=', 1, 'E1-49 the location assistant manager still READS the shared vendors (the authorized probes above also created some)');
select is((select count(*)::int from public.bar_recipes where slug = 'e1-retired-m'), 1, 'E1-50 ... and still reads archived recipes (recipes_is_manager is untouched)');
select pg_temp.act_n(9);
select is((select count(*)::int from public.bar_recipes where slug = 'e1-retired-m'), 0, 'E1-51 staff still do not read archived recipes');
reset role;

-- ===========================================================================
-- 5. Direct table writes stay impossible; storage follows the same predicate
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(4);
select is(left(pg_temp.err_of($q$insert into public.inventory_vendors (organization_id, name) values ('00000000-0000-4000-8000-000000080101', 'direct')$q$), 5), '42501', 'E1-52 even the organization owner cannot INSERT a vendor directly');
select is(left(pg_temp.err_of($q$update public.inventory_products set name = 'x' where organization_id = '00000000-0000-4000-8000-000000080101'$q$), 5), '42501', 'E1-53 ... cannot UPDATE a product directly');
select is(left(pg_temp.err_of($q$delete from public.bar_recipes where organization_id = '00000000-0000-4000-8000-000000080101'$q$), 5), '42501', 'E1-54 ... cannot DELETE a recipe directly');
select is(left(pg_temp.err_of($q$insert into public.bar_recipe_categories (organization_id, name, slug, display_order) values ('00000000-0000-4000-8000-000000080101', 'd', 'd', 9)$q$), 5), '42501', 'E1-55 ... cannot INSERT a recipe category directly');
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000080101/00000000-0000-4000-8000-000000080601/00000000-0000-4000-8000-0000000809a1.webp'), true, 'E1-56 recipe-images write: organization owner allowed');
select pg_temp.act_n(8);
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000080101/00000000-0000-4000-8000-000000080601/00000000-0000-4000-8000-0000000809a1.webp'), false, 'E1-57 recipe-images write: location assistant manager at two locations denied');
select pg_temp.act_n(16);
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000080102/00000000-0000-4000-8000-000000080602/00000000-0000-4000-8000-0000000809a2.webp'), true, 'E1-58 recipe-images write: location assistant manager at ONE location allowed');
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000080101/00000000-0000-4000-8000-000000080601/00000000-0000-4000-8000-0000000809a1.webp'), false, 'E1-59 ... but never another organization''s image');
select pg_temp.act_n(14);
select is(private.recipes_can_write_image('00000000-0000-4000-8000-000000080101/00000000-0000-4000-8000-000000080601/00000000-0000-4000-8000-0000000809a1.webp'), false, 'E1-60 recipe-images write: cross-organization owner denied');
reset role;
select is((select count(*)::int from pg_policies where schemaname = 'storage' and policyname in ('recipe_images_insert','recipe_images_delete') and coalesce(qual,'') || coalesce(with_check,'') like '%recipes_can_write_image%'), 2, 'E1-61 both storage write policies still authorize through recipes_can_write_image');
select is((select count(*)::int from pg_proc p where p.proname = 'recipes_can_write_image' and p.prosrc like '%catalog_can_manage_org%' and p.prosrc not like '%recipes_is_manager%'), 1, 'E1-62 recipes_can_write_image uses the shared predicate, not recipes_is_manager');

-- ===========================================================================
-- 6. Catalog-driven completeness: no unguarded writer of the shared tables can appear
-- ===========================================================================
create temp table e1_writers on commit drop as
select p.oid, n.nspname, p.proname, p.prosrc, p.prosecdef, p.proconfig, p.proowner::regrole::text as owner,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prokind = 'f'
  and p.prosrc ~* '(insert\s+into|update|delete\s+from|merge\s+into)\s+(only\s+)?(public\.)?(bar_recipes|bar_recipe_categories|bar_recipe_variants|bar_recipe_ingredients|bar_recipe_steps|bar_recipe_garnishes|inventory_vendors|inventory_categories|inventory_subcategories|inventory_products)\y';

select is((select count(*)::int from e1_writers where auth_exec), 18, 'E1-63 exactly 18 client-executable functions write the shared tables (6 recipes + 12 catalog)');
select is((select count(*)::int from e1_writers where auth_exec and not (prosrc ~ 'private\.recipes_begin\(' or prosrc ~ 'private\.inventory_catalog_begin\(')), 0, 'E1-64 every one of them authorizes through recipes_begin or inventory_catalog_begin');
select is((select count(*)::int from e1_writers where auth_exec and prosrc ~ 'private\.inventory_begin\(' ), 0, 'E1-65 none of them still relies on the location-only inventory_begin');
select is((select count(*)::int from e1_writers where auth_exec and (not prosecdef or proconfig is distinct from array['search_path=""'] or owner <> 'postgres' or anon_exec)), 0, 'E1-66 all 18: SECURITY DEFINER, search_path empty, owner postgres, no anon grant');
select is((select count(*)::int from e1_writers where not auth_exec and nspname = 'public'), 1, 'E1-67 the only non-client writer in public is the actor-parameter recipe importer');
select is((select string_agg(proname, ',' order by proname) from e1_writers where not auth_exec and nspname = 'private'), 'inventory_ensure_system_vendor,recipes_apply', 'E1-68 the only private writers are the documented system-vendor helper and recipes_apply');
select is((select count(*)::int from e1_writers w where w.auth_exec and (select count(*) from pg_proc q join pg_namespace qn on qn.oid = q.pronamespace where qn.nspname = w.nspname and q.proname = w.proname) <> 1), 0, 'E1-69 no overloads of any shared writer (no unguarded sibling signature)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('inventory_vendor_create','inventory_vendor_update','inventory_vendor_set_active','inventory_category_create','inventory_category_update','inventory_category_set_active','inventory_subcategory_create','inventory_subcategory_update','inventory_subcategory_set_active','inventory_product_create','inventory_product_update','inventory_product_set_active')
             and p.prosrc like '%private.inventory_catalog_begin(p_organization_id, p_location_id)%'), 12, 'E1-70 all twelve named catalog RPCs carry the guard');

-- Independent-review hardening: a REVIEWED allow-list. Any function (any non-system schema) that
-- mentions a shared table AND a write keyword must be one of the 18 guarded writers, a private
-- helper, or a location-scoped function reviewed to touch the shared tables read-only (joins and
-- lookups) and to write only its own location-scoped tables. A new function fails here until a
-- human reviews it and extends this list. Dynamic SQL near the shared tables is refused outright.
select is((
  select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname not in ('pg_catalog','information_schema','extensions','pgsodium','vault','graphql','graphql_public','realtime','storage','auth','supabase_functions','net','pgbouncer')
    and exists (select 1 from unnest(array['bar_recipes','bar_recipe_categories','bar_recipe_variants','bar_recipe_ingredients','bar_recipe_steps','bar_recipe_garnishes','inventory_vendors','inventory_categories','inventory_subcategories','inventory_products']) t(name)
                where p.prosrc ~* ('\y' || t.name || '\y'))
    and p.prosrc ~* '(insert\s+into|\yupdate\y|delete\s+from|merge\s+into|truncate)'
    and p.oid not in (select oid from e1_writers)
    and (n.nspname || '.' || p.proname) not in (
      -- location-scoped, reviewed (E-1 independent review): read the shared tables, write their own
      'public.inventory_bulk_count','public.inventory_date_lot_save','public.inventory_freshness_rule_save',
      'public.inventory_import_commit','public.inventory_order_draft_mark_sent','public.inventory_order_draft_open',
      'public.inventory_order_draft_save','public.inventory_order_draft_sync','public.inventory_stock_set_levels',
      'public.inventory_storage_placement_set',
      -- private helper that writes STOCK only
      'private.inventory_stock_adjust_core')
), '', 'E1-70b no unreviewed function mentions a shared table together with a write (allow-list; a new one needs review)');
select is((
  select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f' and n.nspname in ('public','private') and p.prosrc ~* '\yexecute\y'
    and exists (select 1 from unnest(array['bar_recipes','inventory_vendors','inventory_categories','inventory_subcategories','inventory_products']) t(name)
                where p.prosrc ~* ('\y' || t.name || '\y'))
), '', 'E1-70c no dynamic SQL (EXECUTE) near the shared tables');

-- ===========================================================================
-- 7. New objects: ownership, ACLs, search_path
-- ===========================================================================
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('catalog_can_manage_org','inventory_catalog_begin')), 2, 'E1-71 the two private functions exist exactly once each');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = 'catalog_authorized'), 1, 'E1-72 catalog_authorized exists exactly once');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname in ('private','public') and p.proname in ('catalog_can_manage_org','inventory_catalog_begin','catalog_authorized')
             and p.prosecdef and p.proconfig = array['search_path=""'] and p.proowner = 'postgres'::regrole), 3, 'E1-73 all three are SECURITY DEFINER, search_path empty, owned by postgres');
select is((select bool_or(has_function_privilege('authenticated', 'private.catalog_can_manage_org(uuid)', 'execute') or has_function_privilege('anon', 'private.catalog_can_manage_org(uuid)', 'execute'))), false, 'E1-74 the predicate is not executable by authenticated or anon');
select is((select bool_or(has_function_privilege('authenticated', 'private.inventory_catalog_begin(uuid,uuid)', 'execute') or has_function_privilege('anon', 'private.inventory_catalog_begin(uuid,uuid)', 'execute'))), false, 'E1-75 inventory_catalog_begin is not executable by authenticated or anon');
select is((select has_function_privilege('authenticated', 'public.catalog_authorized(uuid)', 'execute')), true, 'E1-76 catalog_authorized is executable by authenticated');
select is((select has_function_privilege('anon', 'public.catalog_authorized(uuid)', 'execute')), false, 'E1-77 ... and not by anon');
select is((select count(*)::int from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'catalog_authorized' and grantee = 'PUBLIC'), 0, 'E1-78 ... and not by PUBLIC');
select is((select count(*)::int from pg_proc p where p.oid in ('private.recipes_begin(uuid)'::regprocedure, 'private.recipes_can_write_image(text)'::regprocedure) and p.prosecdef and p.proconfig = array['search_path=""']), 2, 'E1-79 the two redefined recipe helpers keep SECURITY DEFINER and an empty search_path');
select is((select has_function_privilege('authenticated', 'private.recipes_can_write_image(text)', 'execute')), true, 'E1-80 recipes_can_write_image keeps EXECUTE for authenticated (the storage policy needs it)');
select is((select has_function_privilege('authenticated', 'private.recipes_is_manager(uuid)', 'execute') and has_function_privilege('authenticated', 'private.inventory_is_manager(uuid)', 'execute')), true, 'E1-81 the read-visibility helpers keep their grants (reads unchanged)');

-- ===========================================================================
-- 8. catalog_authorized mirrors the decision for the UI (never offers a refused action)
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(4);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), true, 'E1-82 organization owner: catalog_authorized true');
select pg_temp.act_n(1);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), true, 'E1-83 Overall owner: true');
select pg_temp.act_n(3);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), true, 'E1-84 Overall assistant manager: true (unchanged)');
select pg_temp.act_n(7);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), false, 'E1-85 location manager, two locations: false');
select pg_temp.act_n(15);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080102')), true, 'E1-86 location manager, one location: true');
select pg_temp.act_n(18);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080102')), false, 'E1-87 location staff: false');
select pg_temp.act_n(14);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), false, 'E1-88 cross-organization: false');
select is((select public.catalog_authorized('00000000-0000-4000-8000-0000000fffff')), false, 'E1-89 an unknown organization id: false (no existence oracle)');
select pg_temp.act_n(23);
select is((select public.catalog_authorized('00000000-0000-4000-8000-000000080101')), false, 'E1-90 banned owner: false');
reset role;

-- ===========================================================================
-- 9. Authorized paths really write (the guard is not a blanket denial) and history is intact
-- ===========================================================================
set local role authenticated;
select pg_temp.act_n(5);
select lives_ok($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080202','E1 General Manager Vendor',null)$q$, 'E1-91 general manager creates a shared vendor (organization authority, any location)');
select pg_temp.act_n(16);
select lives_ok($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000080102','00000000-0000-4000-8000-000000080203','E1 Single-Location Vendor',null)$q$, 'E1-92 assistant manager in a ONE-location org creates a shared vendor');
select lives_ok($q$select public.bar_recipe_category_save('00000000-0000-4000-8000-000000080102', null, null, 'E1 Single-Location Category')$q$, 'E1-93 ... and a recipe category');
select pg_temp.act_n(8);
select is(pg_temp.err_of($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201','E1 Denied Vendor',null)$q$), '42501:You do not have permission to change the shared Bar Inventory catalog.', 'E1-94 denial message is the catalog-specific one (location access was already fine)');
select is(pg_temp.err_of($q$select public.bar_recipe_save('00000000-0000-4000-8000-000000080101',null,null,'{}'::jsonb)$q$), '42501:You do not have permission to change recipes', 'E1-95 recipe denial keeps its original message (the Server Action maps it)');
select pg_temp.act_n(9);
select is(pg_temp.err_of($q$select public.inventory_vendor_create('00000000-0000-4000-8000-000000080101','00000000-0000-4000-8000-000000080201','E1 Staff Vendor',null)$q$), '42501:You do not have access to Bar Inventory for this location.', 'E1-96 a staff member is still stopped by the LOCATION guard first (message unchanged)');
reset role;
select is((select count(*)::int from public.inventory_vendors where name in ('E1 Denied Vendor','E1 Staff Vendor')), 0, 'E1-97 denied calls wrote nothing');
select is((select count(*)::int from public.inventory_vendors where name = 'E1 General Manager Vendor'), 1, 'E1-98 the authorized call wrote exactly one vendor');
select is((select on_hand from public.inventory_stock where product_id = '00000000-0000-4000-8000-000000080401' and location_id = '00000000-0000-4000-8000-000000080201'), 3::numeric, 'E1-99 stock quantities are exactly what the location-scoped operations wrote');
select is((select count(*)::int from public.inventory_vendors where organization_id = '00000000-0000-4000-8000-000000080101' and is_system), 1, 'E1-100 bootstrap created the single idempotent system vendor (and nothing else)');
select is((select count(*)::int from public.bar_recipes where organization_id = '00000000-0000-4000-8000-000000080101'), 2, 'E1-101 the org M recipe book is exactly the two seeded recipes: no denied write landed');
select is((select count(*)::int from public.inventory_products where organization_id = '00000000-0000-4000-8000-000000080101'), 1, 'E1-102 the org M product list is untouched');
select is((select count(*)::int from public.location_memberships where location_id = '00000000-0000-4000-8000-000000080201' and role = 'assistant_manager' and active), 1, 'E1-103 no membership was created or changed by any probe');

select * from finish();
rollback;
