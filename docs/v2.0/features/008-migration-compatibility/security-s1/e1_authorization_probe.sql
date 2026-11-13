-- V2-008 Security Gate S1 / E-1 evidence probe (READ-ONLY EVIDENCE, NOT A TEST).
--
-- Runs the REAL Recipes / Inventory RPCs as every actor in the owner's matrix,
-- under the `authenticated` role with a live `session_id` claim, against the
-- DISPOSABLE local stack only. Every probe executes inside its own
-- subtransaction that is always rolled back (it raises PROBE after the statement
-- succeeds), and the whole file ends in ROLLBACK: nothing persists.
--
-- Result vocabulary (column `result`):
--   AUTHORIZED   the statement ran to completion (then was rolled back)
--   42501        denied by the authorization seam
--   <other code> passed the authorization seam and failed LATER on input /
--                state validation (e.g. 22023) - i.e. the actor WAS authorized
--
-- Run:  docker exec -i supabase_db_<local-project> psql -U postgres -X -q -At < e1_authorization_probe.sql

begin;

create extension if not exists pgtap with schema extensions;  -- parity with the pgTAP harness; harmless

-- Fixtures: org A (TWO active locations A1, A2), org B (one location) ---------
-- 01 Overall owner       02 Overall manager        03 Overall assistant manager
-- 04 org owner (A)       05 org general_manager (A) 06 org shift_manager (A), no location row
-- 07 location MANAGER A1 (org role server)         08 location ASSISTANT MANAGER A1 (server)
-- 09 location STAFF A1   10 INACTIVE location manager row A1
-- 11 location manager A1 with INACTIVE org membership
-- 12 org B owner (cross-organization)              13 location manager A2 only (cross-location)
-- 14 org member (server) with NO location row
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000e10' || lpad(n::text, 2, '0'))::uuid,
       'e1_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 14) n;
insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000e10' || lpad(n::text, 2, '0'))::uuid, 'E1 ' || n
from generate_series(1, 14) n;
-- Live session per user; session id == user id (claim `session_id` is set to it).
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
select ('00000000-0000-0000-0000-0000000e10' || lpad(n::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000e10' || lpad(n::text, 2, '0'))::uuid, now(), now(), null
from generate_series(1, 14) n;

insert into public.overall_roles (profile_id, role) values
  ('00000000-0000-0000-0000-0000000e1001', 'owner'),
  ('00000000-0000-0000-0000-0000000e1002', 'manager'),
  ('00000000-0000-0000-0000-0000000e1003', 'assistant_manager');

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000e1a01', 'E1 Org A', 'e1-org-a', '00000000-0000-0000-0000-0000000e1004', '{}'),
  ('00000000-0000-0000-0000-0000000e1a02', 'E1 Org B', 'e1-org-b', '00000000-0000-0000-0000-0000000e1012', '{}');

insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1004', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1005', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1006', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1007', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1008', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1009', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1010', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1011', array['server']::public.app_role[], false),
  ('00000000-0000-0000-0000-0000000e1a02', '00000000-0000-0000-0000-0000000e1012', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1013', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1014', array['server']::public.app_role[], true);

insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at) values
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1a01', 'A1', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000e1b02', '00000000-0000-0000-0000-0000000e1a01', 'A2', 'America/Chicago', '{}', true, null),
  ('00000000-0000-0000-0000-0000000e1b03', '00000000-0000-0000-0000-0000000e1a02', 'B1', 'America/Chicago', '{}', true, null);

insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1007', 'manager', true),
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1008', 'assistant_manager', true),
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1009', 'staff', true),
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1010', 'manager', false),
  ('00000000-0000-0000-0000-0000000e1b01', '00000000-0000-0000-0000-0000000e1011', 'manager', true),
  ('00000000-0000-0000-0000-0000000e1b02', '00000000-0000-0000-0000-0000000e1013', 'manager', true);

-- Plumbing -------------------------------------------------------------------
create table probe_out (ord serial, actor text, action text, result text);
grant all on probe_out to public;
grant usage on sequence probe_out_ord_seq to public;
create table probe_seed (k text primary key, v text);
grant all on probe_seed to public;

create function t_as(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  if p_uid is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_uid)::text, true);
  end if;
end $$ language plpgsql;

-- Execute stmt in a subtransaction that is ALWAYS rolled back; record outcome.
create function probe(p_actor text, p_action text, p_stmt text) returns void as $$
declare r text;
begin
  begin
    execute 'select (' || p_stmt || ')::text' into r;
    raise exception 'probe-ok' using errcode = 'P0E10';
  exception when others then
    if sqlstate = 'P0E10' then
      insert into probe_out (actor, action, result) values (p_actor, p_action, 'AUTHORIZED');
    else
      insert into probe_out (actor, action, result) values (p_actor, p_action, sqlstate);
    end if;
  end;
end $$ language plpgsql;

-- Read helper: record a scalar result (no rollback needed, read only).
create function probe_read(p_actor text, p_action text, p_stmt text) returns void as $$
declare r text;
begin
  begin
    execute 'select (' || p_stmt || ')::text' into r;
    insert into probe_out (actor, action, result) values (p_actor, p_action, coalesce(r, 'NULL'));
  exception when others then
    insert into probe_out (actor, action, result) values (p_actor, p_action, 'ERR ' || sqlstate);
  end;
end $$ language plpgsql;

-- Seed the shared catalogs through the real RPCs as the Overall owner ---------
select t_as('00000000-0000-0000-0000-0000000e1001');
set local role authenticated;
insert into probe_seed select 'inv_vendor', public.inventory_vendor_create('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1b01', 'Seed vendor', null)::text;
insert into probe_seed select 'inv_category', public.inventory_category_create('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1b01', 'Seed category')::text;
insert into probe_seed select 'inv_product', public.inventory_product_create('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1b01',
  (select v::uuid from probe_seed where k = 'inv_vendor'), 'Seed product', (select v::uuid from probe_seed where k = 'inv_category'), null, '750 mL', 'bottle', null, null, null)::text;
insert into probe_seed select 'rec_category', (public.bar_recipe_category_save('00000000-0000-0000-0000-0000000e1a01', null, null, 'Seed recipe category'))->>'id';
-- One active and one ARCHIVED recipe, so the read rows (R3) show the tier split.
insert into probe_seed select 'rec_active', (public.bar_recipe_save('00000000-0000-0000-0000-0000000e1a01', null, null,
  jsonb_build_object('recipe_number', 801, 'name', 'Seed active', 'category_id', (select v::uuid from probe_seed where k = 'rec_category'),
    'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye"}],"steps":[],"garnishes":[]}}'::jsonb)))::text;
insert into probe_seed select 'rec_archived', (public.bar_recipe_save('00000000-0000-0000-0000-0000000e1a01', null, null,
  jsonb_build_object('recipe_number', 802, 'name', 'Seed archived', 'category_id', (select v::uuid from probe_seed where k = 'rec_category'),
    'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye"}],"steps":[],"garnishes":[]}}'::jsonb)))::text;
reset role;
-- bar_recipe_save returns jsonb; keep only the recipe id for the archive step.
update probe_seed set v = (v::jsonb)->>'id' where k in ('rec_active', 'rec_archived') and v like '{%';
select t_as('00000000-0000-0000-0000-0000000e1001');
set local role authenticated;
select public.bar_recipe_set_archived('00000000-0000-0000-0000-0000000e1a01', (select v::uuid from probe_seed where k = 'rec_archived'), 1, true, null) is not null as archived_ok;
reset role;
select * from probe_seed order by k;

-- Per-actor probe battery -------------------------------------------------------
create function run_actor(p_label text, p_uid uuid, p_n int) returns void as $$
declare
  org_a  constant text := '00000000-0000-0000-0000-0000000e1a01';
  org_b  constant text := '00000000-0000-0000-0000-0000000e1a02';
  loc_a1 constant text := '00000000-0000-0000-0000-0000000e1b01';
  loc_a2 constant text := '00000000-0000-0000-0000-0000000e1b02';
  v_vendor  text := (select v from probe_seed where k = 'inv_vendor');
  v_cat     text := (select v from probe_seed where k = 'inv_category');
  v_prod    text := (select v from probe_seed where k = 'inv_product');
  v_rcat    text := (select v from probe_seed where k = 'rec_category');
begin
  perform t_as(p_uid);
  set local role authenticated;

  -- predicates ---------------------------------------------------------------
  perform probe_read(p_label, 'P  recipes_is_member(A)',        format('private.recipes_is_member(%L::uuid)', org_a));
  perform probe_read(p_label, 'P  recipes_is_manager(A)',       format('private.recipes_is_manager(%L::uuid)', org_a));
  perform probe_read(p_label, 'P  inventory_is_manager(A)',     format('private.inventory_is_manager(%L::uuid)', org_a));
  perform probe_read(p_label, 'P  inventory_can_access(A,A1)',  format('private.inventory_can_access_location(%L::uuid, %L::uuid)', org_a, loc_a1));
  perform probe_read(p_label, 'P  inventory_can_access(A,A2)',  format('private.inventory_can_access_location(%L::uuid, %L::uuid)', org_a, loc_a2));

  -- ORGANIZATION-WIDE Recipes writes (recipes_begin(org)) ----------------------
  perform probe(p_label, 'W1 recipe category save (org-wide)',  format('public.bar_recipe_category_save(%L::uuid, null, null, %L)', org_a, 'E1 cat ' || p_label));
  perform probe(p_label, 'W2 recipe save (org-wide book)',
    format($f$public.bar_recipe_save(%L::uuid, null, null, jsonb_build_object('recipe_number', %s, 'name', %L, 'category_id', %L::uuid,
            'variants', '{"perfect":{"method":"Stir","ingredients":[{"ingredient_name":"Rye","amount":"2 oz"}],"steps":[{"instruction":"Stir"}],"garnishes":[]}}'::jsonb))$f$,
           org_a, 900 + p_n, 'E1 recipe ' || p_label, v_rcat));

  -- ORGANIZATION-LEVEL Inventory catalog writes (inventory_begin(org, LOCATION)) -
  perform probe(p_label, 'W3 inventory vendor create @A1 (org catalog)',   format('public.inventory_vendor_create(%L::uuid, %L::uuid, %L, null)', org_a, loc_a1, 'E1 vendor ' || p_label));
  perform probe(p_label, 'W4 inventory vendor RENAME @A1 (shared row)',    format('public.inventory_vendor_update(%L::uuid, %L::uuid, %L::uuid, %L, null, 1)', org_a, loc_a1, v_vendor, 'Hijacked ' || p_label));
  perform probe(p_label, 'W5 inventory category create @A1 (org catalog)', format('public.inventory_category_create(%L::uuid, %L::uuid, %L)', org_a, loc_a1, 'E1 cat ' || p_label));
  perform probe(p_label, 'W6 inventory product create @A1 (org catalog)',  format('public.inventory_product_create(%L::uuid, %L::uuid, %L::uuid, %L, %L::uuid, null, %L, %L, null, null, null)', org_a, loc_a1, v_vendor, 'E1 product ' || p_label, v_cat, '1 L', 'bottle'));
  perform probe(p_label, 'W7 inventory product DEACTIVATE @A1 (shared row)', format('public.inventory_product_set_active(%L::uuid, %L::uuid, %L::uuid, false, 1)', org_a, loc_a1, v_prod));
  -- Same catalog write but anchored at A2 (the actor must hold authority AT THAT location).
  perform probe(p_label, 'W8 inventory vendor create @A2 (org catalog)',   format('public.inventory_vendor_create(%L::uuid, %L::uuid, %L, null)', org_a, loc_a2, 'E1 vendor@A2 ' || p_label));

  -- LOCATION-scoped Inventory operations ---------------------------------------
  perform probe(p_label, 'L1 inventory bootstrap read @A1',                format('public.inventory_bootstrap(%L::uuid, %L::uuid)', org_a, loc_a1));
  perform probe(p_label, 'L2 inventory bootstrap read @A2',                format('public.inventory_bootstrap(%L::uuid, %L::uuid)', org_a, loc_a2));
  perform probe(p_label, 'L3 bulk count (empty rows) @A1',                 format($f$public.inventory_bulk_count(%L::uuid, %L::uuid, '[]'::jsonb, 'probe', null)$f$, org_a, loc_a1));
  perform probe(p_label, 'L4 bulk count (empty rows) @A2',                 format($f$public.inventory_bulk_count(%L::uuid, %L::uuid, '[]'::jsonb, 'probe', null)$f$, org_a, loc_a2));

  -- Shared-resource READS (visibility, not management) ------------------------------
  perform probe_read(p_label, 'R1 rows visible: inventory_vendors',    'select count(*) from public.inventory_vendors');
  perform probe_read(p_label, 'R2 rows visible: inventory_products',   'select count(*) from public.inventory_products');
  perform probe_read(p_label, 'R3 rows visible: bar_recipes',          'select count(*) from public.bar_recipes');
  perform probe_read(p_label, 'R4 rows visible: bar_recipe_categories','select count(*) from public.bar_recipe_categories');

  reset role;
end $$ language plpgsql;

select run_actor('01 Overall owner',                '00000000-0000-0000-0000-0000000e1001', 1);
select run_actor('02 Overall manager',              '00000000-0000-0000-0000-0000000e1002', 2);
select run_actor('03 Overall assistant manager',    '00000000-0000-0000-0000-0000000e1003', 3);
select run_actor('04 Org owner (A)',                '00000000-0000-0000-0000-0000000e1004', 4);
select run_actor('05 Org general manager (A)',      '00000000-0000-0000-0000-0000000e1005', 5);
select run_actor('06 Org shift manager (A, no loc row)', '00000000-0000-0000-0000-0000000e1006', 6);
select run_actor('07 Location MANAGER A1',          '00000000-0000-0000-0000-0000000e1007', 7);
select run_actor('08 Location ASSISTANT MGR A1',    '00000000-0000-0000-0000-0000000e1008', 8);
select run_actor('09 Location STAFF A1',            '00000000-0000-0000-0000-0000000e1009', 9);
select run_actor('10 INACTIVE location manager A1', '00000000-0000-0000-0000-0000000e1010', 10);
select run_actor('11 Loc manager A1, INACTIVE org membership', '00000000-0000-0000-0000-0000000e1011', 11);
select run_actor('12 Cross-org actor (org B owner)', '00000000-0000-0000-0000-0000000e1012', 12);
select run_actor('13 Cross-location: manager of A2 only', '00000000-0000-0000-0000-0000000e1013', 13);
select run_actor('14 Org member, no location row',  '00000000-0000-0000-0000-0000000e1014', 14);

-- Anonymous actor (no JWT at all) --------------------------------------------------
select t_as(null);
set local role anon;
do $$
declare r text;
begin
  begin perform public.bar_recipe_category_save('00000000-0000-0000-0000-0000000e1a01', null, null, 'anon'); r := 'AUTHORIZED';
  exception when others then r := sqlstate; end;
  insert into probe_out (actor, action, result) values ('15 Anonymous', 'W1 recipe category save (org-wide)', r);
  begin perform public.inventory_vendor_create('00000000-0000-0000-0000-0000000e1a01', '00000000-0000-0000-0000-0000000e1b01', 'anon', null); r := 'AUTHORIZED';
  exception when others then r := sqlstate; end;
  insert into probe_out (actor, action, result) values ('15 Anonymous', 'W3 inventory vendor create @A1 (org catalog)', r);
end $$;
reset role;

-- Cross-tenant: every in-org actor aimed at ORG B (writes must never cross tenants) ---------------
create function run_cross_tenant(p_label text, p_uid uuid) returns void as $$
begin
  perform t_as(p_uid);
  set local role authenticated;
  perform probe(p_label, 'X1 recipe category save in ORG B',
    format('public.bar_recipe_category_save(%L::uuid, null, null, %L)', '00000000-0000-0000-0000-0000000e1a02', 'x'));
  perform probe(p_label, 'X2 inventory vendor create in ORG B @B1',
    format('public.inventory_vendor_create(%L::uuid, %L::uuid, %L, null)', '00000000-0000-0000-0000-0000000e1a02', '00000000-0000-0000-0000-0000000e1b03', 'x'));
  reset role;
end $$ language plpgsql;
select run_cross_tenant('04 Org owner (A)',            '00000000-0000-0000-0000-0000000e1004');
select run_cross_tenant('07 Location MANAGER A1',      '00000000-0000-0000-0000-0000000e1007');
select run_cross_tenant('08 Location ASSISTANT MGR A1','00000000-0000-0000-0000-0000000e1008');
select run_cross_tenant('13 Manager of A2 only',       '00000000-0000-0000-0000-0000000e1013');
select run_cross_tenant('12 Cross-org actor (org B owner)', '00000000-0000-0000-0000-0000000e1012');

-- Report ------------------------------------------------------------------------
select actor, action, result from probe_out order by ord;

rollback;
