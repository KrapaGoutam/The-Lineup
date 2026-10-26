begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

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

-- 1. Schema, grants ------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('inventory_stock', 'inventory_adjustments')),
  2, 'BI-SEC-001 RLS is enabled on stock and the ledger'
);
select ok(
  not exists (
    select 1 from unnest(array['inventory_stock', 'inventory_adjustments']) t
    cross join unnest(array['insert', 'update', 'delete', 'truncate']) p
    where has_table_privilege('authenticated', 'public.' || t, p)
  ),
  'BI-SEC-001 clients cannot write stock or the ledger directly'
);
select ok(
  not has_table_privilege('anon', 'public.inventory_stock_status', 'select')
  and not has_table_privilege('anon', 'public.inventory_stock', 'select')
  and has_table_privilege('authenticated', 'public.inventory_stock_status', 'select'),
  'BI-SEC-001 the status view is readable by authenticated only'
);
select ok(
  not exists (
    select 1 from pg_proc p where p.proname = 'inventory_stock_adjust'
      and (p.proargnames @> array['p_prev_on_hand'] or p.proargnames @> array['p_prev_backup'])
  ),
  'BI-ADJ-002 the adjust RPC has no previous-value parameter to forge'
);

-- 2. Stock rows seeded for every location --------------------------------
select is(
  (select count(*)::int from public.inventory_stock where product_id = current_setting('t.titos')::uuid),
  1, 'a new product gets one stock row per location of its organization'
);
select is(
  (select on_hand + backup from public.inventory_stock
   where product_id = current_setting('t.titos')::uuid), 0::numeric,
  'a new stock row starts at zero'
);

-- 3. Roles --------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035004', true);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',5,0,'stock_count',null,1)$$, current_setting('t.titos')),
  '42501', null, 'BI-SEC-002 a server cannot adjust stock'
);
select throws_ok(
  format($$select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,4,6,12,1)$$, current_setting('t.titos')),
  '42501', null, 'BI-SEC-002 a server cannot set levels'
);
select is((select count(*)::int from public.inventory_stock_status), 0, 'BI-SEC-002 a server sees no stock');
select is((select count(*)::int from public.inventory_adjustments), 0, 'BI-SEC-002 a server sees no ledger');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035007', true);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',5,0,'stock_count',null,1)$$, current_setting('t.titos')),
  '42501', null, 'BI-SEC-002 another organization''s owner is refused'
);
select is((select count(*)::int from public.inventory_stock_status), 0, 'BI-SEC-005 another tenant sees no stock');
reset role;

set local role anon;
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',5,0,'stock_count',null,1)$$, current_setting('t.titos')),
  '42501', null, 'BI-SEC-002 anon cannot call the RPC'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035001', true);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035012','00000000-0000-0000-0000-000000035022',%L,'set',5,0,'stock_count',null,1)$$, current_setting('t.titos')),
  '42501', null, 'BI-CAT-011 a manager cannot adjust in another organization'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',gen_random_uuid(),'set',5,0,'stock_count',null,1)$$),
  '22023', null, 'an unknown product is refused'
);
reset role;

-- 4. Set mode, ledger, no-op ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 6, 3, 'stock_count', 'weekly count', 1) ->> 'version')::int,
  2, 'BI-ADJ-001 a count bumps the stock version'
);
reset role;

select is(
  (select prev_on_hand::text || '>' || new_on_hand::text || '/' || prev_backup::text || '>' || new_backup::text
   from public.inventory_adjustments where product_id = current_setting('t.titos')::uuid),
  '0.00>6.00/0.00>3.00', 'BI-ADJ-001 the ledger row carries previous and new values read from the locked row'
);
select is(
  (select delta_on_hand::text || '/' || delta_backup::text || '/' || delta_total::text
   from public.inventory_adjustments where product_id = current_setting('t.titos')::uuid),
  '6.00/3.00/9.00', 'the deltas are generated from the stored values'
);
select is(
  (select source || '|' || reason || '|' || status_after || '|' || actor_profile_id::text || '|' || stock_version_after::text
   from public.inventory_adjustments where product_id = current_setting('t.titos')::uuid),
  'count|stock_count|no_cutoff|00000000-0000-0000-0000-000000035002|2',
  'BI-ADJ-001 source, reason, status_after, actor (auth.uid) and version are recorded'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 6, 3, 'stock_count', null, 1) ->> 'changed')::boolean,
  false, 'BI-ADJ-008 re-submitting identical counts is a no-op (even with the old version)'
);
reset role;
select is(
  (select count(*)::int from public.inventory_adjustments where product_id = current_setting('t.titos')::uuid),
  1, 'BI-ADJ-008 the no-op wrote no ledger row'
);
select is(
  (select version from public.inventory_stock where product_id = current_setting('t.titos')::uuid),
  2, 'BI-ADJ-008 the no-op did not bump the version'
);

-- 5. Levels ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select throws_ok(
  format($$select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,6,4,12,2)$$, current_setting('t.titos')),
  '22023', null, 'BI-CALC-003 warning below cutoff is rejected'
);
select throws_ok(
  format($$select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,-1,null,null,2)$$, current_setting('t.titos')),
  '22023', null, 'BI-CALC-003 a negative cutoff is rejected'
);
select throws_ok(
  format($$select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,4.123,null,null,2)$$, current_setting('t.titos')),
  '22023', null, 'a cutoff with three decimals is rejected, never rounded silently'
);
select is(
  public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 4, 6, 12, 2),
  3, 'cutoff, warning and par are set together'
);
select is(
  public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 4, 6, 12, 2),
  3, 'identical levels are a no-op even with the old version'
);
select throws_ok(
  format($$select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,5,6,12,2)$$, current_setting('t.titos')),
  'PT409', null, 'BI-ADJ-011 a stale level edit is refused'
);
reset role;
select is(
  (select diff from public.inventory_change_log
   where entity_type = 'stock_levels' and entity_id = current_setting('t.titos')::uuid),
  '{"par": [null, 12.00], "cutoff": [null, 4.00], "warning": [null, 6.00]}'::jsonb,
  'BI-ADJ-011 a level change is recorded in the change log with old and new values'
);

-- 6. Status through the view and in the ledger -----------------------------
select is(
  (select status from public.inventory_stock_status where product_id = current_setting('t.titos')::uuid),
  'healthy', 'total 9 against cutoff 4 / warning 6 is healthy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035003', true);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 1, 1, 'usage', null, 3) ->> 'status'),
  'critical', 'the RPC answers the new status (assistant manager)'
);
reset role;
select is(
  (select status_after || '|' || cutoff_at_time::text from public.inventory_adjustments
   where product_id = current_setting('t.titos')::uuid order by id desc limit 1),
  'critical|4.00', 'BI-ADJ-004 status_after and cutoff_at_time are frozen on the ledger row'
);

-- a later threshold change must not rewrite history
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select public.inventory_stock_set_levels('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.titos')::uuid, 1, 2, 12, 4);
reset role;
select is(
  (select cutoff_at_time from public.inventory_adjustments
   where product_id = current_setting('t.titos')::uuid order by id desc limit 1),
  4.00, 'BI-ADJ-004 editing the cutoff later does not rewrite the recorded cutoff'
);

-- 7. Stale set, partial set, delta ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',20,0,'stock_count',null,2)$$, current_setting('t.titos')),
  'PT409', null, 'BI-ADJ-005 a stale count is refused'
);
select is(
  (pg_temp.detail_of(format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',20,0,'stock_count',null,2)$$, current_setting('t.titos')))::jsonb ->> 'on_hand')::numeric,
  1::numeric, 'the stale error carries the current count and who changed it'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',20,0,'stock_count',null,null)$$, current_setting('t.titos')),
  '22023', null, 'a set without an expected version is refused'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 8, null, 'correction', 'miscounted', 5) ->> 'backup')::numeric,
  1::numeric, 'a partial set changes only the fields given'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'delta', null, 5, 'delivery_restock', null, null) ->> 'backup')::numeric,
  6::numeric, 'BI-ADJ-007 a delta needs no version and applies to the locked row'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'delta', -3, 0, 'usage', null, null) ->> 'total')::numeric,
  11::numeric, 'two deltas in a row are exact (8 - 3 + 6)'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'delta', 0, 0, 'usage', null, null) ->> 'changed')::boolean,
  false, 'a zero delta is a no-op'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',-99,0,'usage',null,null)$$, current_setting('t.titos')),
  '22023', null, 'a delta cannot take a count below zero'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',null,null,'usage',null,null)$$, current_setting('t.titos')),
  '22023', null, 'a request with no quantity is refused'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 3, 8, 'transfer_out', null, 8) ->> 'status'),
  'healthy', 'moving stock between on hand and backup reports status from the total (11 vs warning 2)'
);
select is(
  (public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
    current_setting('t.titos')::uuid, 'set', 8, 3, 'correction', null, 9) ->> 'changed')::boolean,
  true, 'BI-ADJ-010 a move between on hand and backup is recorded'
);
reset role;
select is(
  (select delta_on_hand::text || '/' || delta_backup::text || '/' || delta_total::text
   from public.inventory_adjustments where product_id = current_setting('t.titos')::uuid order by id desc limit 1),
  '5.00/-5.00/0.00', 'BI-ADJ-010 the ledger keeps both deltas; the total delta is zero'
);

-- 8. Validation -----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',1,0,'sold',null,null)$$, current_setting('t.titos')),
  '22023', null, 'BI-ADJ-009 an unknown reason is refused'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',1,0,null,null,null)$$, current_setting('t.titos')),
  '22023', null, 'BI-ADJ-009 a reason is required'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'swap',1,0,'usage',null,null)$$, current_setting('t.titos')),
  '22023', null, 'an unknown mode is refused'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',1.234,0,'usage',null,null)$$, current_setting('t.titos')),
  '22023', null, 'three decimals are refused, never rounded'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',-1,0,'stock_count',null,9)$$, current_setting('t.titos')),
  '22023', null, 'a negative absolute count is refused'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'set',99999999999,0,'stock_count',null,9)$$, current_setting('t.titos')),
  '22023', null, 'an absurdly large count is refused'
);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',1,0,'usage',%L,null)$$, current_setting('t.titos'), repeat('n', 501)),
  '22023', null, 'a note over 500 characters is refused'
);
select lives_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',0.5,0,'usage',null,null)$$, current_setting('t.casa')),
  'half a bottle is a valid count'
);
reset role;

-- 9. Archived products ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select public.inventory_product_set_active('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.gin')::uuid, false, 1);
select throws_ok(
  format($$select public.inventory_stock_adjust('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'delta',1,0,'usage',null,null)$$, current_setting('t.gin')),
  '22023', null, 'an archived product cannot be adjusted'
);
reset role;
select is(
  (select status from public.inventory_stock_status where product_id = current_setting('t.gin')::uuid),
  'archived', 'BI-CALC-006 an archived product reports status archived (excluded from KPIs)'
);

-- 10. Immutability and constraints ---------------------------------------
set constraints all immediate;
select throws_ok($$update public.inventory_adjustments set note = 'x'$$, '23514', null, 'BI-ADJ-003 the ledger cannot be updated');
select throws_ok($$delete from public.inventory_adjustments$$, '23514', null, 'BI-ADJ-003 the ledger cannot be deleted from');
select throws_ok($$truncate public.inventory_adjustments$$, '23514', null, 'BI-ADJ-003 the ledger cannot be truncated');
select throws_ok(
  format($$insert into public.inventory_adjustments (organization_id, location_id, product_id, source, reason, prev_on_hand, new_on_hand, prev_backup, new_backup, status_after, actor_profile_id, stock_version_after)
    values ('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',%L,'system','other',1,1,1,1,'healthy','00000000-0000-0000-0000-000000035002',1)$$, current_setting('t.titos')),
  '23514', null, 'a ledger row must record a real change'
);
select throws_ok(
  format($$update public.inventory_stock set warning = 1, cutoff = 5 where product_id = %L$$, current_setting('t.titos')),
  '23514', null, 'BI-CALC-003 the table refuses warning below cutoff'
);
select throws_ok(
  format($$update public.inventory_stock set on_hand = -1 where product_id = %L$$, current_setting('t.titos')),
  '23514', null, 'BI-CALC-003 the table refuses a negative count'
);
select throws_ok(
  format($$update public.inventory_stock set total = 99 where product_id = %L$$, current_setting('t.titos')),
  '428C9', null, 'BI-CALC-002 total is generated and cannot be written'
);
select is(
  (select total from public.inventory_stock where product_id = current_setting('t.titos')::uuid),
  (select on_hand + backup from public.inventory_stock where product_id = current_setting('t.titos')::uuid),
  'BI-CALC-002 total equals on hand plus backup'
);

-- 11. A product created after a second location exists gets stock at both ---
insert into public.locations (id, organization_id, name, time_zone)
values ('00000000-0000-0000-0000-000000035023', '00000000-0000-0000-0000-000000035011', 'PGTAP 0351 Loc A2', 'America/New_York');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000035002', true);
select public.inventory_product_create('00000000-0000-0000-0000-000000035011','00000000-0000-0000-0000-000000035021',
  current_setting('t.faust')::uuid, 'Two-location item', null, null, null, 'can', null, null, null);
reset role;
select is(
  (select count(*)::int from public.inventory_stock s join public.inventory_products p on p.id = s.product_id
   where p.name = 'Two-location item'),
  2, 'stock rows exist for both locations of the organization'
);

select is(
  (select count(*)::int from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   where t.relname like 'inventory_%' and c.contype = 'f' and not c.condeferrable
     and c.confrelid in ('public.memberships'::regclass, 'public.locations'::regclass)),
  0, 'every inventory FK to memberships / locations is deferrable (tenant teardown cascades in any order)'
);

set constraints all deferred;
-- 12. Tenant teardown cascades product -> stock -> ledger -------------------
delete from public.inventory_products where id = current_setting('t.casa')::uuid;
select is(
  (select count(*)::int from public.inventory_adjustments where product_id = current_setting('t.casa')::uuid),
  0, 'deleting a product (service-role maintenance) cascades its ledger and stock'
);
delete from public.organizations where id = '00000000-0000-0000-0000-000000035012';
select is(
  (select count(*)::int from public.inventory_stock where organization_id = '00000000-0000-0000-0000-000000035012'),
  0, 'deleting an organization cascades its stock'
);

select * from finish();
rollback;
