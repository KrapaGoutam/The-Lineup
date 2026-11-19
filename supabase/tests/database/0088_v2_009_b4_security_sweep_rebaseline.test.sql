begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- ===========================================================================
-- V2-009 Stage B (S-1 / S-3 / S-4): catalog-driven security sweeps on a disposable database.
--
--   * Two organizations (A, B); A has two ACTIVE locations (A1, A2) so the single-location legacy
--     fallback never applies; B has two as well.
--   * EVERY public table that has an organization_id column is populated with one synthetic row per
--     tenant by a catalog-driven seeder (FK/trigger checks are skipped with session_replication_role
--     = replica; CHECK / NOT NULL constraints that reject the synthetic row are dropped INSIDE this
--     rolled-back transaction, because the sweeps test RLS and grants, not those constraints).
--     A table the seeder cannot populate FAILS SW-S1, so a new table cannot silently escape the sweep.
--   * Personas are driven through the real `authenticated` role with real JWT claims, including a
--     live auth.sessions row (the strict Tasks/Tips helpers need one).
--   * Every probe that mutates runs in a sub-transaction that is rolled back with a sentinel.
--
-- B4 RE-BASELINE of the Stage B sweep (110ae9c, run at ledger 91) for ledger 96: pins F-1 (SW-C2..C4) updated to the post-B2 state.
-- Assertions that document a KNOWN, owner-visible exception say so in their description, and pin the
-- exact current behaviour so a deliberate fix flips the test (never a silent change).
--   F-1  anon holds table privileges on public.location_memberships (RLS still denies; TRUNCATE not RLS-gated)
--   F-2  seatings / floor_templates / audit_events keep ORG-level legacy RLS (no location predicate)
--   F-3  existence oracle on four RPCs (foreign-but-existing id -> 42501, random id -> P0002)
--   H-S1 four live-session helpers accept a token without session_id (D-11)
-- ===========================================================================

-- ---- fixtures -------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000082001','sw-a-owner@test.invalid'),
  ('00000000-0000-4000-8000-000000082002','sw-a-gm@test.invalid'),
  ('00000000-0000-4000-8000-000000082003','sw-a-lm1@test.invalid'),
  ('00000000-0000-4000-8000-000000082004','sw-a-am1@test.invalid'),
  ('00000000-0000-4000-8000-000000082005','sw-a-st1@test.invalid'),
  ('00000000-0000-4000-8000-000000082006','sw-a-st2@test.invalid'),
  ('00000000-0000-4000-8000-000000082007','sw-a-rev@test.invalid'),
  ('00000000-0000-4000-8000-000000082008','sw-a-none@test.invalid'),
  ('00000000-0000-4000-8000-000000082009','sw-b-owner@test.invalid'),
  ('00000000-0000-4000-8000-00000008200a','sw-b-staff@test.invalid'),
  ('00000000-0000-4000-8000-00000008200b','sw-mt@test.invalid'),
  ('00000000-0000-4000-8000-00000008200c','sw-a-host1@test.invalid'),
  ('00000000-0000-4000-8000-00000008200d','sw-a-sm1@test.invalid');
insert into public.profiles (id, display_name)
select id, split_part(email,'@',1) from auth.users where email like 'sw-%@test.invalid';
insert into public.organizations (id,name,slug,created_by) values
  ('00000000-0000-4000-8000-0000000821a1','Sweep A','sweep-a','00000000-0000-4000-8000-000000082001'),
  ('00000000-0000-4000-8000-0000000821b1','Sweep B','sweep-b','00000000-0000-4000-8000-000000082009');
-- This security sweep pins legacy unconfigured capabilities. V2.0.2 defaults
-- newly inserted branches to Internal, so keep the historical fixture explicit.
insert into public.locations (id, organization_id, name, time_zone, attendance_mode) values
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-0000000821a1','A1','America/Chicago',null),
  ('00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','A2','America/Chicago',null),
  ('00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-0000000821b1','B1','America/Chicago',null),
  ('00000000-0000-4000-8000-0000000822b2','00000000-0000-4000-8000-0000000821b1','B2','America/Chicago',null);
-- Org-level (legacy) role sits on memberships; location role sits on location_memberships.
--   lm1  = org 'server'        + location manager at A1      (a LOCATION manager, no org-level authority)
--   am1  = org 'server'        + assistant manager at A1
--   st1  = org 'server'        + staff at A1
--   st2  = org 'server'        + staff at A2 only
--   host1= org 'host'          + staff at A1                  (legacy org role can operate seatings)
--   sm1  = org 'shift_manager' + assistant manager at A1
--   rev  = INACTIVE org membership, none = no membership
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082001','{owner}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082002','{general_manager}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082003','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082004','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082005','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082006','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-000000082007','{server}',false),
  ('00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-000000082009','{owner}',true),
  ('00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-00000008200a','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-00000008200b','{server}',true),
  ('00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-00000008200b','{server}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-00000008200c','{host}',true),
  ('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-00000008200d','{shift_manager}',true);
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082003','manager',true),
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082004','assistant_manager',true),
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082005','staff',true),
  ('00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006','staff',true),
  ('00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-00000008200a','staff',true),
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-00000008200b','staff',true),
  ('00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-00000008200b','staff',true),
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-00000008200c','staff',true),
  ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-00000008200d','assistant_manager',true);
-- one live session per persona: session id = prefix || last two hex digits of the user id
insert into auth.sessions (id, user_id, created_at, updated_at)
select ('00000000-0000-4000-8000-0000000823' || right(id::text, 2))::uuid, id, now(), now()
from auth.users where email like 'sw-%@test.invalid';

-- ---- machinery (all in pg_temp; nothing survives the rollback) ------------------------------
create function pg_temp.gen_values(p_table regclass, p_org uuid, p_loc uuid) returns text language plpgsql as $fn$
declare col record; cols text := ''; vals text := ''; v text;
begin
  for col in
    select a.attname, a.atttypid, ty.typtype, ty.typname, ty.typcategory
    from pg_attribute a join pg_type ty on ty.oid = a.atttypid
    where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
      and (a.attname in ('organization_id','location_id')
           or (a.attnotnull and not a.atthasdef and a.attidentity = '' and a.attgenerated = ''))
    order by a.attnum
  loop
    if col.attname = 'organization_id' then v := quote_literal(p_org) || '::uuid';
    elsif col.attname = 'location_id' then
      if p_loc is null then continue; end if;
      v := quote_literal(p_loc) || '::uuid';
    elsif col.typcategory = 'A' then v := quote_literal('{}') || '::' || format_type(col.atttypid, null);
    elsif col.typtype = 'e' then
      v := quote_literal((select enumlabel from pg_enum where enumtypid = col.atttypid order by enumsortorder limit 1)) || '::' || format_type(col.atttypid, null);
    elsif col.typname = 'uuid' then v := 'gen_random_uuid()';
    elsif col.typname in ('text','varchar','bpchar','citext') then v := quote_literal('sweep');
    elsif col.typname in ('int2','int4','int8','numeric','float4','float8') then v := '1';
    elsif col.typname = 'bool' then v := 'false';
    elsif col.typname in ('timestamptz','timestamp') then v := 'now()';
    elsif col.typname = 'date' then v := 'current_date';
    elsif col.typname = 'time' then v := quote_literal('12:00') || '::time';
    elsif col.typname in ('jsonb','json') then v := quote_literal('{}') || '::' || col.typname;
    elsif col.typname = 'interval' then v := quote_literal('1 hour') || '::interval';
    elsif col.typname = 'bytea' then v := quote_literal('\x00') || '::bytea';
    else v := 'null'; end if;
    cols := cols || case when cols = '' then '' else ',' end || quote_ident(col.attname);
    vals := vals || case when vals = '' then '' else ',' end || v;
  end loop;
  return format('insert into %s (%s) values (%s)', p_table, cols, vals);
end $fn$;

create temp table sweep_tables (rel regclass primary key, has_loc boolean, seeded boolean default false, note text);
insert into sweep_tables (rel, has_loc)
select c.oid::regclass,
       exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'location_id' and not a.attisdropped)
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
  and c.relname not in ('organizations','locations','memberships','location_memberships');

create function pg_temp.seed_all(p_org uuid, p_loc uuid) returns void language plpgsql as $fn$
declare t record; sql text; tries int; done boolean; ck record; colname text;
begin
  for t in select rel from sweep_tables order by rel::text loop
    sql := pg_temp.gen_values(t.rel, p_org, p_loc);
    tries := 0; done := false;
    while not done and tries < 4 loop
      tries := tries + 1;
      begin
        execute sql; done := true;
        update sweep_tables set seeded = true where rel = t.rel;
      exception
        when check_violation then
          for ck in select conname from pg_constraint where conrelid = t.rel and contype = 'c' loop
            execute format('alter table %s drop constraint %I', t.rel, ck.conname);
          end loop;
        when not_null_violation then
          get stacked diagnostics colname = column_name;
          execute format('alter table %s alter column %I drop not null', t.rel, colname);
        when others then
          update sweep_tables set note = sqlstate || ' ' || left(sqlerrm, 90) where rel = t.rel; done := true;
      end;
    end loop;
  end loop;
end $fn$;

set local session_replication_role = replica;
select pg_temp.seed_all('00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1');  -- tenant B / B1
select pg_temp.seed_all('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2');  -- tenant A / A2
-- A1 gets its own entities too (its own-location RPC controls need real rows); tables with a unique key
-- already satisfied by the A2 row simply skip (their note is ignored, `seeded` stays true from the first pass)
select pg_temp.seed_all('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1');  -- tenant A / A1
set local session_replication_role = origin;

-- tables visible to a persona with the given filter (ignores plain "permission denied": that is a secure denial)
create function pg_temp.visible(p_user uuid, p_filter text) returns jsonb language plpgsql as $fn$
declare res jsonb := '{}'::jsonb; n bigint; tbls regclass[]; t regclass;
  sess uuid := ('00000000-0000-4000-8000-0000000823' || right(p_user::text, 2))::uuid;
begin
  select array_agg(rel order by rel::text) into tbls from sweep_tables where seeded;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', sess)::text, true);
  execute 'set local role authenticated';
  foreach t in array tbls loop
    begin
      execute format('select count(*) from %s where %s', t, p_filter) into n;
      if n > 0 then res := res || jsonb_build_object(t::text, n); end if;
    exception when others then
      if sqlstate <> '42501' then res := res || jsonb_build_object(t::text, 'ERR ' || sqlstate); end if;
    end;
  end loop;
  execute 'reset role';
  return res;
end $fn$;

-- what can a persona read / lock-for-update / delete / (policy-level) insert among rows where col = val
create function pg_temp.probe(p_user uuid, p_filter_col text, p_val uuid, p_org uuid, p_loc uuid) returns jsonb language plpgsql as $fn$
declare n bigint; res jsonb := jsonb_build_object('read','{}'::jsonb,'update','{}'::jsonb,'delete','{}'::jsonb,'insert','{}'::jsonb);
  sess uuid := ('00000000-0000-4000-8000-0000000823' || right(p_user::text, 2))::uuid;
  tbls regclass[]; r regclass; msg text; stmt text;
begin
  select array_agg(rel order by rel::text) into tbls from sweep_tables
   where seeded and (p_filter_col = 'organization_id' or has_loc);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', sess)::text, true);
  foreach r in array tbls loop
    stmt := pg_temp.gen_values(r, p_org, p_loc);
    execute 'set local role authenticated';
    begin
      execute format('select count(*) from %s where %I = %L', r, p_filter_col, p_val) into n;
      if n > 0 then res := jsonb_set(res, '{read}', (res->'read') || jsonb_build_object(r::text, n)); end if;
    exception when others then null; end;
    begin
      begin
        execute format('select count(*) from (select 1 from %s where %I = %L for update) s', r, p_filter_col, p_val) into n;
        raise exception 'SENTINEL %', n;
      exception when others then
        msg := sqlerrm;
        if msg like 'SENTINEL %' then
          n := substr(msg, 10)::bigint;
          if n > 0 then res := jsonb_set(res, '{update}', (res->'update') || jsonb_build_object(r::text, n)); end if;
        elsif sqlstate <> '42501' then
          res := jsonb_set(res, '{update}', (res->'update') || jsonb_build_object(r::text, 'ERR ' || sqlstate));
        end if;
      end;
    end;
    begin
      begin
        execute format('with d as (delete from %s where %I = %L returning 1) select count(*) from d', r, p_filter_col, p_val) into n;
        raise exception 'SENTINEL %', n;
      exception when others then
        msg := sqlerrm;
        if msg like 'SENTINEL %' then
          n := substr(msg, 10)::bigint;
          if n > 0 then res := jsonb_set(res, '{delete}', (res->'delete') || jsonb_build_object(r::text, n)); end if;
        elsif sqlstate <> '42501' then
          res := jsonb_set(res, '{delete}', (res->'delete') || jsonb_build_object(r::text, 'ERR ' || sqlstate));
        end if;
      end;
    end;
    execute 'reset role';
    -- INSERT: RLS + grants only (FKs and triggers off). 42501 = denied; success or any other error = the policy let it through.
    execute 'set local session_replication_role = replica';
    execute 'set local role authenticated';
    begin
      begin
        execute stmt;
        raise exception 'SENTINEL 1';
      exception when others then
        msg := sqlerrm;
        if msg like 'SENTINEL %' then
          res := jsonb_set(res, '{insert}', (res->'insert') || jsonb_build_object(r::text, 'ALLOWED'));
        elsif sqlstate <> '42501' then
          res := jsonb_set(res, '{insert}', (res->'insert') || jsonb_build_object(r::text, 'ERR ' || sqlstate));
        end if;
      end;
    end;
    execute 'reset role';
    execute 'set local session_replication_role = origin';
  end loop;
  return res;
end $fn$;

-- ---- RPC sweep machinery ---------------------------------------------------------------------
-- entity-id parameters resolve to a REAL seeded row of the target tenant/location, so entity-keyed RPCs
-- reach their authorization check instead of stopping at "not found"
create function pg_temp.entity_ref(p_fn text, p_name text, p_org uuid, p_loc uuid) returns text language plpgsql as $fn$
declare tbl text; v text;
begin
  tbl := case
    when p_name in ('p_task_id') then 'tasks'
    when p_name in ('p_rule_id') then 'task_recurrence_rules'
    when p_name in ('p_template_id') then 'checklist_templates'
    when p_name in ('p_device_id') then 'kiosk_devices'
    when p_name in ('p_session_id') then 'attendance_sessions'
    when p_name in ('p_payment_id') then 'payroll_payments'
    when p_name in ('p_review_id') then 'payroll_attendance_consumption_reviews'
    when p_name in ('p_tip_pool_id','target_tip_pool_id') then 'tip_pools'
    when p_name in ('p_product_id') then 'inventory_products'
    when p_name in ('p_vendor_id') then 'inventory_vendors'
    when p_name in ('p_category_id') then case when p_fn like 'bar_recipe%' then 'bar_recipe_categories' else 'inventory_categories' end
    when p_name in ('p_subcategory_id') then 'inventory_subcategories'
    when p_name in ('p_recipe_id') then 'bar_recipes'
    when p_name in ('p_draft_id') then 'inventory_order_drafts'
    when p_name in ('p_area_id','p_storage_area_id') then 'inventory_storage_areas'
    when p_name in ('p_shelf_id') then 'inventory_storage_shelves'
    when p_name in ('p_placement_id') then 'inventory_storage_placements'
    when p_name in ('p_batch_id') then 'inventory_import_batches'
    when p_name in ('p_service_session_id') then 'service_sessions'
    when p_name in ('p_round_id') then 'rotation_rounds'
    when p_name in ('p_member_id') then 'rotation_members'
    when p_name = 'p_id' then case when p_fn like 'inventory_date_lot%' then 'inventory_date_lots'
                                   when p_fn like 'inventory_freshness%' then 'inventory_freshness_rules'
                                   when p_fn like 'inventory_saved_view%' then 'inventory_saved_views' end
    else null end;
  if tbl is null then return null; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = tbl and column_name = 'location_id') then
    execute format('select id::text from public.%I where organization_id = %L and location_id = %L order by id limit 1', tbl, p_org, p_loc) into v;
  else
    execute format('select id::text from public.%I where organization_id = %L order by id limit 1', tbl, p_org) into v;
  end if;
  return v;
exception when others then return null;
end $fn$;

create function pg_temp.arg_val(p_fn text, p_name text, p_typ oid, p_org uuid, p_loc uuid, p_prof uuid) returns text language plpgsql as $fn$
declare tn text := format_type(p_typ, null); ty record; ent text;
begin
  select typtype, typcategory into ty from pg_type where oid = p_typ;
  ent := pg_temp.entity_ref(p_fn, p_name, p_org, p_loc);
  if ent is not null then return quote_literal(ent) || '::' || tn; end if;
  if tn = 'uuid' then
    if p_name ~ 'organization_id|^p_org' then return quote_literal(p_org) || '::uuid';
    elsif p_name ~ 'location_id' then return quote_literal(p_loc) || '::uuid';
    elsif p_name ~ 'profile_id|owner_profile|assignee' then return quote_literal(p_prof) || '::uuid';
    else return 'gen_random_uuid()'; end if;
  elsif ty.typcategory = 'A' then return quote_literal('{}') || '::' || tn;
  elsif ty.typtype = 'e' then
    return quote_literal((select enumlabel from pg_enum where enumtypid = p_typ order by enumsortorder limit 1)) || '::' || tn;
  elsif tn in ('bigint','integer','smallint','numeric','double precision','real') then return '1::' || tn;
  elsif tn = 'boolean' then return 'false';
  elsif tn = 'text' then
    return case when p_name ~ 'time_zone' then quote_literal('America/Chicago')
                when p_name ~ 'slug' then quote_literal('sweep-x')
                when p_name ~ 'reason|note' then quote_literal('sweep reason text')
                when p_name = 'p_decision' then quote_literal('no_adjustment_needed')
                else quote_literal('x') end;
  elsif tn = 'date' then return 'current_date';
  elsif tn like 'timestamp%' then return 'now()';
  elsif tn like 'time%' then return quote_literal('12:00') || '::time';
  elsif tn = 'jsonb' then
    return case when p_name ~ 'breaks|rows|lines|items|plan' then quote_literal('[]') else quote_literal('{}') end || '::jsonb';
  else return 'null'; end if;
end $fn$;

create function pg_temp.call_fn(p_oid oid, p_user uuid, p_org uuid, p_loc uuid, p_prof uuid) returns text language plpgsql as $fn$
declare pr record; args text := ''; nm text[]; ty oid[]; i int; stmt text; res text; msg text;
  sess uuid := ('00000000-0000-4000-8000-0000000823' || right(p_user::text, 2))::uuid;
begin
  select proname, proargnames, string_to_array(proargtypes::text, ' ')::oid[] as intypes, proallargtypes, proargmodes, proretset
    into pr from pg_proc where oid = p_oid;
  if pr.proargmodes is null then nm := coalesce(pr.proargnames, array[]::text[]); ty := pr.intypes;
  else
    select array_agg(n order by o), array_agg(t order by o) into nm, ty from (
      select (pr.proargnames)[o] n, (pr.proallargtypes)[o] t, o
      from generate_subscripts(pr.proargmodes, 1) o where pr.proargmodes[o] in ('i','b','v')) q;
  end if;
  for i in 1 .. coalesce(array_length(ty, 1), 0) loop
    args := args || case when i > 1 then ', ' else '' end || quote_ident(nm[i]) || ' => ' || pg_temp.arg_val(pr.proname::text, nm[i], ty[i], p_org, p_loc, p_prof);
  end loop;
  if pr.proretset then stmt := format('select count(*)::text from public.%I(%s)', pr.proname, args);
  else stmt := format('select (public.%I(%s))::text', pr.proname, args); end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', sess)::text, true);
  begin
    begin
      execute 'set local role authenticated';
      execute stmt into res;
      raise exception 'SENTINEL %', coalesce(left(res, 80), '<null>');
    exception when others then
      msg := sqlerrm;
      if msg like 'SENTINEL %' then return 'OK:' || substr(msg, 10); end if;
      return 'ERR:' || sqlstate || ':' || regexp_replace(left(msg, 110), '[0-9a-f]{8}-[0-9a-f-]*', '<uuid>', 'g');
    end;
  end;
end $fn$;

create temp table fn_list as
select p.oid as fn_oid, p.proname
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and has_function_privilege('authenticated', p.oid, 'execute')
  and pg_get_function_result(p.oid) <> 'trigger';
create temp table rpc_out (persona text, mode text, proname text, outcome text);

create function pg_temp.run_mode(p_persona text, p_user uuid, p_mode text, p_org uuid, p_loc uuid, p_prof uuid) returns void language plpgsql as $fn$
declare f record;
begin
  for f in select * from fn_list order by proname loop
    insert into rpc_out values (p_persona, p_mode, f.proname, pg_temp.call_fn(f.fn_oid, p_user, p_org, p_loc, p_prof));
  end loop;
end $fn$;

-- ===========================================================================
-- C: live catalog checks
-- ===========================================================================
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity),
  0, 'SW-C1 every public table has row level security enabled');

select is((select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
             from information_schema.role_table_grants
            where table_schema = 'public' and grantee = 'anon' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')),
  array[]::text[],
  'SW-C2 B2/F-1 CLOSED: no public table grants anon any DML privilege (location_memberships revoked)');

set local role anon;
select throws_ok($$select count(*) from public.location_memberships$$,
  '42501', null, 'SW-C3a anon cannot SELECT location_memberships (privilege revoked by B2)');
select throws_ok($$insert into public.location_memberships (location_id, profile_id, role, active) values ('00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082008','manager',true)$$,
  '42501', null, 'SW-C3b anon cannot INSERT into location_memberships (privilege revoked by B2)');
reset role;

select is((select coalesce(array_agg(p.proname::text order by p.proname), '{}')
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')),
  array[]::text[],
  'SW-C4 B2/F-1 CLOSED: anon can EXECUTE no public function (the two trigger functions were revoked)');

select is((select count(*)::int from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
              and pg_get_function_result(p.oid) <> 'trigger'),
  0, 'SW-C5 no non-trigger public function is executable by anon');

select is((select count(*)::int from pg_proc p
            where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'SW-C6 every SECURITY DEFINER function in public/private pins search_path');

select is((select coalesce(array_agg(c.relname::text order by c.relname::text), '{}')
             from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'location_id' and not a.attisdropped)
              and not exists (
                select 1 from pg_constraint k
                where k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'public.locations'::regclass
                  and array_length(k.conkey, 1) = 2
                  and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
                        where a.attrelid = c.oid and a.attnum = any (k.conkey)) = array['location_id','organization_id'])),
  array['attendance_breaks','attendance_events','checklist_instances','inventory_order_draft_items','inventory_storage_placements',
        'inventory_storage_shelves','kiosk_devices','kiosk_pairing_codes','kiosk_sessions','payroll_attendance_consumption_reviews',
        'payroll_attendance_consumptions','section_assignments'],
  'SW-C7 tables with organization_id+location_id lacking a DIRECT composite FK to locations: exactly the 12 reviewed (child tables inherit through a parent composite FK; kiosk_* and section_assignments/payroll consumption tables have no authenticated write policy)');

-- ===========================================================================
-- S: seeding coverage (the sweep is only meaningful if every table really holds rows for both tenants)
-- ===========================================================================
select is((select coalesce(array_agg(rel::text order by rel::text), '{}') from sweep_tables where not seeded),
  '{}'::text[], 'SW-S1 the catalog seeder populated EVERY organization-scoped table (a new table the seeder cannot fill fails here and needs review)');

select cmp_ok((select count(*)::int from sweep_tables where seeded and has_loc), '>=', 35,
  'SW-S2 at least 35 location-scoped tables carry seeded rows (the cross-location sweep is not vacuous)');

-- ===========================================================================
-- X: cross-organization (V2-009.001) — tenant-A personas against tenant-B rows
-- ===========================================================================
select is(pg_temp.visible('00000000-0000-4000-8000-000000082001', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1a org owner A sees no tenant-B row in any table');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082002', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1b general manager A sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082003', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1c location manager A1 sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082004', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1d assistant manager A1 sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082005', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1e staff A1 sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1f staff A2 sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082007', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1g INACTIVE member of A sees no tenant-B row');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082008', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$), '{}'::jsonb, 'SW-X1h user with NO membership sees no tenant-B row');

select cmp_ok((select count(*)::int from jsonb_object_keys(pg_temp.visible('00000000-0000-4000-8000-000000082009', $$organization_id = '00000000-0000-4000-8000-0000000821b1'$$))),
  '>=', 40, 'SW-X1z CONTROL: the tenant-B owner sees tenant-B rows in at least 40 tables (the zero results above are RLS, not empty tables)');

select is(pg_temp.visible('00000000-0000-4000-8000-000000082007', $$organization_id = '00000000-0000-4000-8000-0000000821a1'$$), '{}'::jsonb,
  'SW-X2a INACTIVE member of A sees no tenant-A row either (revocation is total)');
select is(pg_temp.visible('00000000-0000-4000-8000-000000082008', $$organization_id = '00000000-0000-4000-8000-0000000821a1'$$), '{}'::jsonb,
  'SW-X2b user with NO membership sees no tenant-A row');

select is(pg_temp.probe('00000000-0000-4000-8000-000000082001','organization_id','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb, 'SW-X3a org owner A: no read / update / delete / forged INSERT on tenant B in any table');
select is(pg_temp.probe('00000000-0000-4000-8000-000000082002','organization_id','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb, 'SW-X3b general manager A: same');
select is(pg_temp.probe('00000000-0000-4000-8000-000000082003','organization_id','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb, 'SW-X3c location manager A1: same');
select is(pg_temp.probe('00000000-0000-4000-8000-000000082005','organization_id','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb, 'SW-X3d staff A1: same');

-- ===========================================================================
-- L: cross-location (V2-009.002) — A1 personas against A2 rows of the SAME organization
-- ===========================================================================
select is(pg_temp.probe('00000000-0000-4000-8000-000000082003','location_id','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb,
  'SW-L1a location MANAGER at A1: no read or write on any A2 row (B2/F-2 CLOSED: legacy seatings/floor_templates now location-scoped)');
select is(pg_temp.probe('00000000-0000-4000-8000-000000082004','location_id','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb,
  'SW-L1b location ASSISTANT manager at A1: same');
select is(pg_temp.probe('00000000-0000-4000-8000-000000082005','location_id','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb,
  'SW-L1c STAFF at A1: same');
select is(pg_temp.probe('00000000-0000-4000-8000-00000008200c','location_id','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2'),
  '{"read":{},"update":{},"delete":{},"insert":{}}'::jsonb,
  'SW-L2a B2/F-2 CLOSED: legacy org role host (assigned to A1 only) has no read or write at A2');
select is(pg_temp.probe('00000000-0000-4000-8000-00000008200d','location_id','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2'),
  '{"read":{"audit_events":1},"update":{},"delete":{},"insert":{}}'::jsonb,
  'SW-L2b B2/F-2 CLOSED for seatings/floor_templates; KNOWN V9-T residual: legacy org role shift_manager still reads audit_events organization-wide (no write)');

select cmp_ok((select count(*)::int from jsonb_object_keys(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$location_id = '00000000-0000-4000-8000-0000000822a2'$$))),
  '>=', 8, 'SW-L3 CONTROL: staff assigned to A2 reads A2 rows in at least 8 tables (so the A1 personas above are blocked by location RLS, not by empty tables)');

-- ===========================================================================
-- R: RPC sweep — every authenticated-executable public function called with foreign ids
-- ===========================================================================
select pg_temp.run_mode('st1',  '00000000-0000-4000-8000-000000082005','xorg','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-00000008200a');
select pg_temp.run_mode('lm1',  '00000000-0000-4000-8000-000000082003','xorg','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-00000008200a');
select pg_temp.run_mode('owner','00000000-0000-4000-8000-000000082001','xorg','00000000-0000-4000-8000-0000000821b1','00000000-0000-4000-8000-0000000822b1','00000000-0000-4000-8000-00000008200a');
select pg_temp.run_mode('lm1',  '00000000-0000-4000-8000-000000082003','xloc','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('am1',  '00000000-0000-4000-8000-000000082004','xloc','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('st1',  '00000000-0000-4000-8000-000000082005','xloc','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('host1','00000000-0000-4000-8000-00000008200c','xloc','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('sm1',  '00000000-0000-4000-8000-00000008200d','xloc','00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a2','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('lm1',  '00000000-0000-4000-8000-000000082003','own', '00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082005');
select pg_temp.run_mode('am1',  '00000000-0000-4000-8000-000000082004','own', '00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082005');
select pg_temp.run_mode('st1',  '00000000-0000-4000-8000-000000082005','own', '00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082006');
select pg_temp.run_mode('sm1',  '00000000-0000-4000-8000-00000008200d','own', '00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082005');
select pg_temp.run_mode('host1','00000000-0000-4000-8000-00000008200c','own', '00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1','00000000-0000-4000-8000-000000082005');
create temp view passes as
  select persona, proname from rpc_out
   where mode = 'own' and outcome not like 'ERR:42501%' and outcome !~* 'ERR:P0002|not found|could not be found';
select pg_temp.run_mode('st1',  '00000000-0000-4000-8000-000000082005','random', gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

select is((select count(*)::int from rpc_out where outcome like 'ERR:42883%'), 0,
  'SW-R1 the generated argument lists matched every function signature (no sweep call missed its guard on a signature error)');

select is((select count(*)::int from fn_list), 124, 'SW-R2 the sweep covered exactly the 124 (118 at Stage B + team_set_member_active + team_add_member + V2.0.8 tips_save_interval/tips_void_interval/tips_recalculate_pool/tips_get_range) authenticated-callable non-trigger public functions (a new RPC changes this count and needs review)');

select is((select coalesce(array_agg(distinct proname::text order by proname::text), '{}') from rpc_out
            where mode = 'xorg' and outcome like 'OK:%' and outcome not in ('OK:false','OK:0')),
  array['kiosk_list_manageable_locations'],
  'SW-R3 cross-org: with foreign tenant ids no RPC succeeds for tenant-A personas except the caller''s own kiosk location list');

select is((select count(*)::int from rpc_out where mode = 'xorg' and proname = 'kiosk_list_manageable_locations' and outcome not in ('OK:0','OK:1','OK:2')), 0,
  'SW-R3b that list is bounded by the caller''s own tenant (never more than A''s two locations)');

select is((select coalesce(array_agg(distinct proname::text order by proname::text), '{}') from rpc_out
            where mode = 'xloc' and outcome like 'OK:%' and outcome not in ('OK:false','OK:0')),
  array['kiosk_list_manageable_locations','recipes_org_authorized'],
  'SW-R4 cross-location: with A2 ids no RPC succeeds for A1 personas except own kiosk list and org-wide Recipes read (E-1: recipes are organization-level by design)');

select cmp_ok((select count(*)::int from rpc_out where persona = 'lm1' and mode = 'own' and outcome not like 'ERR:42501%'), '>=', 40,
  'SW-R5 CONTROL: at its OWN location the location manager passes authorization (or reaches argument validation) in at least 40 functions, so the denials above are authorization, not bad arguments');

-- "denied" = an authorization error, OR "not found" because RLS hides the foreign row (both reveal nothing)
select is((select coalesce(array_agg(own.proname::text || ' own=' || own.outcome || ' xloc=' || x.outcome order by own.proname::text), '{}')
             from rpc_out own
             join rpc_out x on x.proname = own.proname and x.persona = 'lm1' and x.mode = 'xloc'
            where own.persona = 'lm1' and own.mode = 'own'
              and own.outcome not like 'ERR:42501%' and own.outcome !~* 'ERR:P0002|not found|could not be found'
              and x.outcome not like 'ERR:42501%' and x.outcome !~* 'ERR:P0002|not found|could not be found'
              and x.outcome not in ('OK:false','OK:0') and x.proname not in ('kiosk_list_manageable_locations','recipes_org_authorized','team_add_member')), -- B4: team_add_member validates generic sweep args (22023) before authority, identically for own and foreign; its authority matrix is pgTAP 0084
  array[]::text[], 'SW-R6 every function the location manager passes at A1 is authorization-denied, hidden as not-found, or harmless at A2');

select cmp_ok((select count(*)::int from rpc_out own
                 join rpc_out x on x.proname = own.proname and x.persona = 'lm1' and x.mode = 'xloc'
                where own.persona = 'lm1' and own.mode = 'own'
                  and own.outcome not like 'ERR:42501%' and x.outcome like 'ERR:42501%'),
  '>=', 30, 'SW-R6b the discriminating set (passes at A1, denied at A2) holds at least 30 functions, so SW-R6 is not vacuous');

select is((select coalesce(array_agg(a.proname::text order by a.proname::text), '{}')
             from rpc_out a join rpc_out r on r.proname = a.proname and r.persona = 'st1' and r.mode = 'random'
            where a.persona = 'st1' and a.mode = 'xorg' and a.outcome <> r.outcome),
  array['apply_location_assignment_changes','get_location_lifecycle_readiness','provision_location','transition_location_lifecycle','unconfirm_payroll_payment'],
  'SW-R7 KNOWN F-3 (P3): the existence oracle is limited to exactly five RPCs (a foreign-but-existing id answers differently from a random id; unconfirm_payroll_payment reads the sequential bigint payment before authorizing)');

-- Capability ladder at the persona's OWN location, discovered from the database (S-4 / L-02 / L-03).
-- "passes" = the RPC is not authorization-denied (it succeeds or fails later on argument/state validation).
select is((select coalesce(array_agg(l.proname::text order by l.proname::text), '{}') from passes l
            where l.persona = 'lm1' and not exists (select 1 from passes a where a.persona = 'am1' and a.proname = l.proname)),
  array['kiosk_generate_pairing_code','kiosk_reassign_device','kiosk_rename_device','kiosk_revoke_device'],
  'SW-R8 manager-over-assistant authority is EXACTLY the four kiosk device RPCs (D-2: kiosk management excludes assistant managers)');

select is((select coalesce(array_agg(l.proname::text order by l.proname::text), '{}') from passes l
            where l.persona = 'am1' and not exists (select 1 from passes a where a.persona = 'lm1' and a.proname = l.proname)),
  '{}'::text[], 'SW-R9 an assistant manager can never do something a manager cannot (strict subset)');

select is((select coalesce(array_agg(l.proname::text order by l.proname::text), '{}') from passes l
            where l.persona = 'am1' and not exists (select 1 from passes a where a.persona = 'st1' and a.proname = l.proname)),
  array['attendance_correct_session','checklist_template_save','checklist_template_set_active','inventory_bootstrap','inventory_bulk_count',
        'inventory_date_group_import_commit','inventory_date_lot_save','inventory_freshness_rule_save','inventory_import_commit','inventory_import_stage',
        'inventory_order_draft_clear','inventory_order_draft_fill','inventory_order_draft_mark_sent','inventory_order_draft_open','inventory_order_draft_save',
        'inventory_order_draft_sync','inventory_saved_view_save','inventory_stock_adjust','inventory_stock_set_levels','inventory_storage_area_archive',
        'inventory_storage_area_upsert','inventory_storage_placement_delete','inventory_storage_placement_reorder','inventory_storage_placement_set',
        'inventory_storage_shelf_delete','inventory_storage_shelf_upsert','recalculate_tip_pool','task_assign','task_cancel','task_create',
        'task_series_create','task_series_stop','task_series_update','task_update','tips_add_interval','tips_finalize_pool','tips_recalculate_pool','tips_reopen_pool','tips_save_interval'],
  'SW-R10 the staff-to-assistant step is exactly the 39 pinned management RPCs (attendance corrections, checklist/task authoring, inventory stock+orders, tips pool close/reopen + V2.0.8 save/recalculate); staff holds none of them');

select is((select count(*)::int from passes where persona = 'st1' and proname in (select proname from rpc_out where mode = 'own' and persona = 'st1' and proname like 'kiosk_%' escape '' and proname <> 'kiosk_list_manageable_locations')), 0,
  'SW-R10b staff passes no kiosk management RPC');

select is((select coalesce(array_agg(x.proname::text order by x.proname::text), '{}') from (
            (select proname from passes where persona = 'sm1' except select proname from passes where persona = 'am1')
            union all (select proname from passes where persona = 'am1' except select proname from passes where persona = 'sm1')
            union all (select proname from passes where persona = 'host1' except select proname from passes where persona = 'st1')
            union all (select proname from passes where persona = 'st1' except select proname from passes where persona = 'host1')) x),
  '{}'::text[], 'SW-R11 once an organization has several locations the LEGACY org role (shift_manager, host) adds no RPC capability beyond the location role (sm1 == am1, host1 == st1)');

-- ===========================================================================
-- T: Team authority (L-05 / V9-T) — who can change memberships and profiles
-- ===========================================================================
create function pg_temp.rows_changed(p_user uuid, p_sql text) returns text language plpgsql as $fn$
declare n bigint; msg text;
  sess uuid := ('00000000-0000-4000-8000-0000000823' || right(p_user::text, 2))::uuid;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', sess)::text, true);
  begin
    begin
      execute 'set local role authenticated';
      execute 'with c as (' || p_sql || ' returning 1) select count(*) from c' into n;
      raise exception 'SENTINEL %', n;
    exception when others then
      msg := sqlerrm;
      if msg like 'SENTINEL %' then return substr(msg, 10); end if;
      return 'ERR ' || sqlstate;
    end;
  end;
end $fn$;

select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082003', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821a1' and profile_id = '00000000-0000-4000-8000-000000082006'$$),
  'ERR 42501', 'SW-T1 a LOCATION manager (org role server) cannot deactivate any member (Team writes need an org-level owner/general_manager)');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-00000008200d', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821a1' and profile_id = '00000000-0000-4000-8000-000000082006'$$),
  'ERR 42501', 'SW-T2 an assistant manager (org role shift_manager) cannot deactivate any member');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082003', $$update public.profiles set display_name = 'renamed' where id = '00000000-0000-4000-8000-000000082006'$$),
  '0', 'SW-T3 a LOCATION manager cannot rename another member');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082002', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821a1' and profile_id = '00000000-0000-4000-8000-000000082005'$$),
  'ERR 42501', 'SW-T4a B1/F-5: direct active UPDATE is revoked for everyone (transitions go through team_set_member_active, covered by 0083/0084); org general_manager deactivates a member assigned only to A1 (Team is ORGANIZATION-wide by role; V9-T option (a), unchanged)');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082002', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821a1' and profile_id = '00000000-0000-4000-8000-000000082006'$$),
  'ERR 42501', 'SW-T4b B1/F-5: direct active UPDATE is revoked for everyone (transitions go through team_set_member_active, covered by 0083/0084); ...and one assigned only to A2 (same org-level authority, both locations)');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082002', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821a1' and profile_id = '00000000-0000-4000-8000-000000082001'$$),
  'ERR 42501', 'SW-T5 a general_manager cannot touch the organization owner');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082001', $$update public.memberships set active = false where organization_id = '00000000-0000-4000-8000-0000000821b1'$$),
  'ERR 42501', 'SW-T6 the tenant-A owner cannot deactivate any tenant-B member');
select is(pg_temp.rows_changed('00000000-0000-4000-8000-000000082001', $$insert into public.memberships (organization_id, profile_id, roles, active) select '00000000-0000-4000-8000-0000000821b1', '00000000-0000-4000-8000-000000082008', '{owner}', true$$),
  'ERR 42501', 'SW-T7 the tenant-A owner cannot add a member (let alone an owner) to tenant B');

-- ===========================================================================
-- V: revocation takes effect on the very next request (X-09 / X-10) — membership, location, session
-- ===========================================================================
select is(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$location_id = '00000000-0000-4000-8000-0000000822a2' and organization_id = '00000000-0000-4000-8000-0000000821a1'$$) ? 'tasks',
  true, 'SW-V1 BEFORE: A2 staff reads A2 tasks');
update public.location_memberships set active = false where profile_id = '00000000-0000-4000-8000-000000082006';
select is(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$location_id = '00000000-0000-4000-8000-0000000822a2' and organization_id = '00000000-0000-4000-8000-0000000821a1'$$) ? 'tasks',
  false, 'SW-V2 location assignment revoked: the open session loses A2 immediately (X-10)');
update public.location_memberships set active = true where profile_id = '00000000-0000-4000-8000-000000082006';
update public.memberships set active = false where profile_id = '00000000-0000-4000-8000-000000082006' and organization_id = '00000000-0000-4000-8000-0000000821a1';
select is(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$organization_id = '00000000-0000-4000-8000-0000000821a1'$$),
  '{}'::jsonb, 'SW-V3 organization membership deactivated: the open session sees nothing of A at all (X-09)');
update public.memberships set active = true where profile_id = '00000000-0000-4000-8000-000000082006' and organization_id = '00000000-0000-4000-8000-0000000821a1';
delete from auth.sessions where id = '00000000-0000-4000-8000-000000082306';
select is(pg_temp.visible('00000000-0000-4000-8000-000000082006', $$location_id = '00000000-0000-4000-8000-0000000822a2' and organization_id = '00000000-0000-4000-8000-0000000821a1'$$) ? 'tasks',
  false, 'SW-V4 session revoked (auth.sessions row gone): the strict Tasks path denies the very next read');

-- The six module tier functions (attendance:inventory:payroll:schedule:tasks:tips) must honour BOTH `active` flags.
-- Persona lm1 = org role 'server' + location MANAGER at A1, so a revoked location row is not masked by the org baseline.
-- The S-0 regression experiments found that removing `lm.active` from tasks_/payroll_profile_level failed no historical assertion.
-- KNOWN F-4 (P3): attendance/inventory/payroll return the staff tier 1 for ANY active org member at ANY location of the
-- organization (schedule/tasks/tips require an explicit assignment). No consumer turns that into data or capability
-- (SW-L1 / SW-R4 / SW-R6), so it is latent defense-in-depth, pinned here so a stricter helper flips this test on purpose.
create function pg_temp.tiers(p_profile uuid) returns text language sql as $fn$
  select concat_ws(':',
    private.attendance_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile),
    private.inventory_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile),
    private.payroll_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile),
    private.schedule_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile),
    private.tasks_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile),
    private.tips_profile_level('00000000-0000-4000-8000-0000000821a1','00000000-0000-4000-8000-0000000822a1', p_profile))
$fn$;
select is(pg_temp.tiers('00000000-0000-4000-8000-000000082003'), '3:3:3:3:3:3', 'SW-V5a CONTROL: the A1 location manager holds tier 3 in all six modules');
update public.location_memberships set active = false where profile_id = '00000000-0000-4000-8000-000000082003';
select is(pg_temp.tiers('00000000-0000-4000-8000-000000082003'), '1:1:1:0:0:0', 'SW-V5b a revoked MANAGER row falls back to the org baseline: schedule/tasks/tips 0, and KNOWN F-4 org-member tier 1 in attendance/inventory/payroll');
update public.location_memberships set active = true where profile_id = '00000000-0000-4000-8000-000000082003';
update public.memberships set active = false where profile_id = '00000000-0000-4000-8000-000000082003' and organization_id = '00000000-0000-4000-8000-0000000821a1';
select is(pg_temp.tiers('00000000-0000-4000-8000-000000082003'), '0:0:0:0:0:0', 'SW-V5c a deactivated organization membership grants nothing in any of the six modules, even with an active manager row');
update public.memberships set active = true where profile_id = '00000000-0000-4000-8000-000000082003' and organization_id = '00000000-0000-4000-8000-0000000821a1';

-- ===========================================================================
-- H: D-11 session-contract visibility — one signature per live-session helper
--    live : valid session_id            unknown : session_id with no auth.sessions row
--    none : token WITHOUT session_id    banned  : valid session of a banned user      gone : session row deleted
-- ===========================================================================
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000824f1', 'sw-h-user@test.invalid');
insert into auth.sessions (id, user_id, created_at, updated_at) values ('00000000-0000-4000-8000-0000000824f2', '00000000-0000-4000-8000-0000000824f1', now(), now());

create function pg_temp.helper_sig(p_helper regprocedure) returns text language plpgsql as $fn$
declare u uuid := '00000000-0000-4000-8000-0000000824f1'; s uuid := '00000000-0000-4000-8000-0000000824f2'; r text[] := '{}'; v boolean;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', s)::text, true);
  execute format('select %s', p_helper) into v; r := r || v::text;                                  -- live
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  execute format('select %s', p_helper) into v; r := r || v::text;                                  -- unknown
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute format('select %s', p_helper) into v; r := r || v::text;                                  -- none
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', s)::text, true);
  update auth.users set banned_until = now() + interval '1 day' where id = u;
  execute format('select %s', p_helper) into v; r := r || v::text;                                  -- banned
  update auth.users set banned_until = null where id = u;
  delete from auth.sessions where id = s;
  execute format('select %s', p_helper) into v; r := r || v::text;                                  -- gone
  insert into auth.sessions (id, user_id, created_at, updated_at) values (s, u, now(), now());      -- restore for the next helper
  return array_to_string(r, ':');
end $fn$;

select is(pg_temp.helper_sig('private.tasks_live_session()'::regprocedure),     'true:false:false:false:false', 'SW-H1 tasks_live_session: STRICT (a token without session_id is denied)');
select is(pg_temp.helper_sig('private.tips_live_session()'::regprocedure),      'true:false:false:false:false', 'SW-H2 tips_live_session: STRICT');
select is(pg_temp.helper_sig('private.schedule_live_session()'::regprocedure),  'true:false:true:false:false',  'SW-H3 KNOWN H-S1: schedule_live_session accepts a token WITHOUT session_id (ban + stale session_id still denied)');
select is(pg_temp.helper_sig('private.payroll_live_session()'::regprocedure),   'true:false:true:false:false',  'SW-H4 KNOWN H-S1: payroll_live_session accepts a token without session_id');
select is(pg_temp.helper_sig('private.inventory_live_session()'::regprocedure), 'true:false:true:false:false',  'SW-H5 KNOWN H-S1: inventory_live_session accepts a token without session_id');
select is(pg_temp.helper_sig('private.attendance_live_session()'::regprocedure),'true:false:true:false:false',  'SW-H6 KNOWN H-S1: attendance_live_session accepts a token without session_id');
select is(pg_temp.helper_sig('private.kiosk_live_session()'::regprocedure),     'true:false:true:false:false',  'SW-H7 KNOWN H-S1: kiosk_live_session accepts a token without session_id');

select * from finish();
rollback;
