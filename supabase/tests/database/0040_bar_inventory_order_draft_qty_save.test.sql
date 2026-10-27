begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

-- Vendor Order Drafts V1 / VOD-1.1 regression contract for
-- public.inventory_order_draft_save change detection.
-- Each line's stored order_qty must be compared with THAT line's own parsed
-- quantity, never with NULL (first line) or the previous line's quantity.
-- Org A: owner Olga, manager Mona, staff Ann. Org B: owner Otto.
-- Products A (41), B (42), C (43) are Critical with par 10 so the draft opens
-- with three blank-quantity lines in a known order.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000040001', '040-olga@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000040002', '040-mona@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000040004', '040-ann@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000040006', '040-otto@passcode.internal', 'x', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000040001', 'QTY Olga'),
  ('00000000-0000-0000-0000-000000040002', 'QTY Mona'),
  ('00000000-0000-0000-0000-000000040004', 'QTY Ann'),
  ('00000000-0000-0000-0000-000000040006', 'QTY Otto');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000040011', 'QTY Org A', 'qty-org-a', '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040012', 'QTY Org B', 'qty-org-b', '00000000-0000-0000-0000-000000040006');

insert into public.locations (id, organization_id, name, time_zone)
values
  ('00000000-0000-0000-0000-000000040021', '00000000-0000-0000-0000-000000040011', 'QTY Loc A1', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000040022', '00000000-0000-0000-0000-000000040011', 'QTY Loc A2', 'America/Chicago'),
  ('00000000-0000-0000-0000-000000040023', '00000000-0000-0000-0000-000000040012', 'QTY Loc B', 'America/Chicago');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000040012', '00000000-0000-0000-0000-000000040006', array['owner']::public.app_role[], true);

insert into public.inventory_vendors
  (id, organization_id, name, is_system, active, created_by)
values
  ('00000000-0000-0000-0000-000000040031', '00000000-0000-0000-0000-000000040011', 'Unassigned', true, true, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040032', '00000000-0000-0000-0000-000000040011', 'Faust', false, true, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040034', '00000000-0000-0000-0000-000000040011', 'Other Vendor', false, true, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040035', '00000000-0000-0000-0000-000000040012', 'Org B Vendor', false, true, '00000000-0000-0000-0000-000000040006');

insert into public.inventory_products
  (id, organization_id, vendor_id, name, size, unit_type, sku, active, archived_at, created_by)
values
  ('00000000-0000-0000-0000-000000040041', '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040032', 'Alpha', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040042', '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040032', 'Beta', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040043', '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040032', 'Gamma', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040044', '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040034', 'Other Rum', '750ml', 'bottle', null, true, null, '00000000-0000-0000-0000-000000040001'),
  ('00000000-0000-0000-0000-000000040046', '00000000-0000-0000-0000-000000040012', '00000000-0000-0000-0000-000000040035', 'Org B Vodka', '1L', 'bottle', null, true, null, '00000000-0000-0000-0000-000000040006');

update public.inventory_stock set on_hand = 1, backup = 0, cutoff = 2, warning = 3, par = 10
where location_id = '00000000-0000-0000-0000-000000040021'
  and product_id in (
    '00000000-0000-0000-0000-000000040041',
    '00000000-0000-0000-0000-000000040042',
    '00000000-0000-0000-0000-000000040043');

-- pid(41) = product A, pid(42) = product B, pid(43) = product C.
create function pg_temp.pid(p_n integer) returns uuid
language sql as $$ select ('00000000-0000-0000-0000-000000040' || lpad(p_n::text, 3, '0'))::uuid $$;

-- One sparse line; p_qty is jsonb so a blank quantity is 'null'::jsonb.
create function pg_temp.ln(p_n integer, p_qty jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('product_id', pg_temp.pid(p_n), 'order_qty', p_qty, 'item_note', null, 'included', true)
$$;

create function pg_temp.save(p_version integer, p_lines jsonb) returns jsonb
language sql as $$
  select public.inventory_order_draft_save(
    '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040021',
    current_setting('t.draft')::uuid, p_version, null, p_lines)
$$;

create function pg_temp.qty(p_n integer) returns numeric
language sql as $$
  select order_qty from public.inventory_order_draft_items
  where draft_id = current_setting('t.draft')::uuid and product_id = pg_temp.pid(p_n)
$$;

create function pg_temp.ver() returns integer
language sql as $$
  select version from public.inventory_order_drafts where id = current_setting('t.draft')::uuid
$$;

create function pg_temp.message_of(p_sql text) returns text
language plpgsql as $$
declare v_message text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_message = message_text;
  return v_message;
end;
$$;

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

-- Function contract is unchanged by the corrective migration.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inventory_order_draft_save'),
  1, 'VOD-1.1 exactly one save function exists (no overload was introduced)'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_location_id uuid, p_draft_id uuid, p_expected_version integer, p_vendor_note text, p_lines jsonb'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inventory_order_draft_save'),
  'VOD-1.1 save keeps its signature, SECURITY DEFINER, and empty search_path'
);
select ok(
  (select has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inventory_order_draft_save'),
  'VOD-1.1 save stays executable by authenticated only'
);

-- Manager opens the draft: three blank-quantity lines.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000040002', true);
select set_config('t.draft', public.inventory_order_draft_open(
  '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040021',
  '00000000-0000-0000-0000-000000040032')::text, true);
select is(
  (select count(*)::int from public.inventory_order_draft_items
   where draft_id = current_setting('t.draft')::uuid and order_qty is null and included),
  3, 'VOD-1.1 setup: three included lines with blank Order Qty'
);
select is(pg_temp.ver(), 1, 'VOD-1.1 setup: draft starts at version 1');

-- 1. Quantity-only change on the FIRST line (stored NULL -> 5).
select is((pg_temp.save(1, jsonb_build_array(pg_temp.ln(41, '5'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 a quantity-only change on the first line is detected');
select is(pg_temp.qty(41), 5.00::numeric, 'VOD-1.1 first-line quantity 5 is persisted');
select is(pg_temp.ver(), 2, 'VOD-1.1 first-line quantity change bumps the version once');
select ok(
  (select item_note is null and included and suggested_qty = 9
   from public.inventory_order_draft_items
   where draft_id = current_setting('t.draft')::uuid and product_id = pg_temp.pid(41)),
  'VOD-1.1 a quantity-only save leaves note, Included, and the suggestion snapshot alone'
);

-- 2. A stale quantity-only write must be PT409, not silently accepted as a no-op.
select throws_ok(
  $$select pg_temp.save(1, jsonb_build_array(pg_temp.ln(42, '3'::jsonb)))$$,
  'PT409', null, 'VOD-1.1 a stale quantity-only write is rejected with PT409'
);
select is((pg_temp.detail_of($$select pg_temp.save(1, jsonb_build_array(pg_temp.ln(42, '3'::jsonb)))$$)::jsonb ->> 'current_version')::int, 2,
  'VOD-1.1 stale detail reports the current version');
select ok(pg_temp.qty(42) is null and pg_temp.ver() = 2, 'VOD-1.1 a stale quantity-only write applies nothing');

-- 3. Quantity-only change on a LATER line while the earlier line is unchanged.
select is(
  (pg_temp.save(2, jsonb_build_array(pg_temp.ln(43, 'null'::jsonb), pg_temp.ln(42, '7'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 a later line detects its own quantity change after an unchanged blank line');
select ok(pg_temp.qty(42) = 7 and pg_temp.qty(43) is null and pg_temp.qty(41) = 5, 'VOD-1.1 only the later line changed');
select is(pg_temp.ver(), 3, 'VOD-1.1 later-line quantity change bumps the version once');

-- 4. Equal adjacent quantities are each judged against their own stored state.
select is((pg_temp.save(3, jsonb_build_array(pg_temp.ln(42, '5'::jsonb))) ->> 'version')::int, 4, 'setup: B 7 -> 5');
select is(
  (pg_temp.save(4, jsonb_build_array(pg_temp.ln(43, '5'::jsonb), pg_temp.ln(41, '5'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 blank line then equal-valued unchanged line: the blank-to-5 change is not masked by the next line');
select ok(pg_temp.qty(41) = 5 and pg_temp.qty(42) = 5 and pg_temp.qty(43) = 5, 'VOD-1.1 all three adjacent lines hold 5');
select is(pg_temp.ver(), 5, 'VOD-1.1 equal adjacent quantities bump the version once');
select is(
  (pg_temp.save(5, jsonb_build_array(pg_temp.ln(41, '6'::jsonb), pg_temp.ln(42, '6'::jsonb))) ->> 'version')::int, 6,
  'VOD-1.1 two adjacent equal new quantities save in one version');
select ok(pg_temp.qty(41) = 6 and pg_temp.qty(42) = 6 and pg_temp.qty(43) = 5, 'VOD-1.1 each line stored its own value; untouched line is unchanged');

-- 5. True no-ops: same stored quantity submitted again.
select is(
  (pg_temp.save(6, jsonb_build_array(pg_temp.ln(41, '6'::jsonb), pg_temp.ln(42, '6'::jsonb), pg_temp.ln(43, '5'::jsonb))) ->> 'changed')::boolean, false,
  'VOD-1.1 resubmitting the stored quantities is a no-op');
select is(pg_temp.ver(), 6, 'VOD-1.1 a true no-op does not bump the version');
select is(
  (pg_temp.save(6, jsonb_build_array(pg_temp.ln(41, '6.00'::jsonb), pg_temp.ln(43, '5.0'::jsonb))) ->> 'changed')::boolean, false,
  'VOD-1.1 numerically equal quantities (6.00, 5.0) are a no-op');
select is(
  (pg_temp.save(1, jsonb_build_array(pg_temp.ln(41, '6'::jsonb))) ->> 'changed')::boolean, false,
  'VOD-1.1 a true no-op is accepted even with a stale expected version');
select is(pg_temp.ver(), 6, 'VOD-1.1 no-ops leave the version at 6');

-- 6. Blank transition: 5 -> blank is a change and clears the quantity.
select is((pg_temp.save(6, jsonb_build_array(pg_temp.ln(41, 'null'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 6 -> blank is detected');
select ok(pg_temp.qty(41) is null and pg_temp.ver() = 7, 'VOD-1.1 blank is persisted as NULL and the version is bumped');
select is(
  (pg_temp.save(7, jsonb_build_array(pg_temp.ln(43, '5'::jsonb), pg_temp.ln(42, 'null'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 5 -> blank on a later line is detected');
select ok(pg_temp.qty(42) is null and pg_temp.qty(43) = 5 and pg_temp.ver() = 8, 'VOD-1.1 only the later line was cleared');
select is(
  (pg_temp.save(8, jsonb_build_array(pg_temp.ln(41, 'null'::jsonb), pg_temp.ln(42, 'null'::jsonb))) ->> 'changed')::boolean, false,
  'VOD-1.1 blank submitted over blank is a no-op');

-- 7. Zero is a valid quantity and distinct from blank.
select is((pg_temp.save(8, jsonb_build_array(pg_temp.ln(41, '0'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 blank -> 0 on the first line is detected');
select ok(pg_temp.qty(41) is not null and pg_temp.qty(41) = 0 and pg_temp.ver() = 9, 'VOD-1.1 zero is stored as 0, not NULL, and bumps the version');
select is((pg_temp.save(9, jsonb_build_array(pg_temp.ln(41, '0'::jsonb))) ->> 'changed')::boolean, false,
  'VOD-1.1 0 submitted over 0 is a no-op');
select is((pg_temp.save(9, jsonb_build_array(pg_temp.ln(41, 'null'::jsonb))) ->> 'changed')::boolean, true,
  'VOD-1.1 0 -> blank is a change');
select ok(pg_temp.qty(41) is null and pg_temp.ver() = 10, 'VOD-1.1 0 -> blank stores NULL');

-- 8. Validation still precedes persistence and leaves state untouched.
select ok(
  pg_temp.message_of($$select pg_temp.save(10, jsonb_build_array(pg_temp.ln(42, '"3"'::jsonb)))$$) like '%Beta%',
  'VOD-1.1 a text quantity on an existing line is refused with the item name');
select ok(
  pg_temp.message_of($$select pg_temp.save(10, jsonb_build_array(pg_temp.ln(42, '-1'::jsonb)))$$) like '%Beta%',
  'VOD-1.1 a negative quantity on an existing line is refused with the item name');
select ok(pg_temp.qty(42) is null and pg_temp.qty(43) = 5 and pg_temp.ver() = 10, 'VOD-1.1 refused quantities change nothing');
select throws_ok(
  $$select pg_temp.save(10, jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-0000-0000-000000040044', 'order_qty', 1, 'item_note', null, 'included', true)))$$,
  '22023', 'Choose an active item from this draft vendor.', 'VOD-1.1 another vendor product with a quantity is still refused');
select throws_ok(
  $$select pg_temp.save(10, jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-0000-0000-000000040046', 'order_qty', 1, 'item_note', null, 'included', true)))$$,
  '22023', 'Choose an active item from this draft vendor.', 'VOD-1.1 another tenant product with a quantity is still refused');

-- 9. Authorization and tenant/location isolation are unchanged.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000040004', true);
select throws_ok($$select pg_temp.save(10, jsonb_build_array(pg_temp.ln(42, '4'::jsonb)))$$, '42501', null, 'VOD-1.1 staff cannot save a quantity');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000040006', true);
select throws_ok($$select pg_temp.save(10, jsonb_build_array(pg_temp.ln(42, '4'::jsonb)))$$, '42501', null, 'VOD-1.1 another organization owner cannot save a quantity');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000040002', true);
select throws_ok(
  format($q$select public.inventory_order_draft_save('00000000-0000-0000-0000-000000040011','00000000-0000-0000-0000-000000040022',%L,10,null,'[{"product_id":"00000000-0000-0000-0000-000000040042","order_qty":4,"item_note":null,"included":true}]'::jsonb)$q$, current_setting('t.draft')),
  '22023', null, 'VOD-1.1 a draft cannot be saved through a forged location');
select ok(pg_temp.qty(42) is null and pg_temp.ver() = 10, 'VOD-1.1 rejected callers changed nothing');

-- 10. SENT drafts stay immutable, including quantity-only saves.
select is((pg_temp.save(10, jsonb_build_array(pg_temp.ln(41, '4'::jsonb))) ->> 'version')::int, 11, 'setup: A = 4 before Mark Sent');
select is((public.inventory_order_draft_mark_sent(
  '00000000-0000-0000-0000-000000040011', '00000000-0000-0000-0000-000000040021',
  current_setting('t.draft')::uuid, 11) ->> 'status'), 'sent', 'setup: the draft is marked Sent');
select throws_ok($$select pg_temp.save(12, jsonb_build_array(pg_temp.ln(41, '9'::jsonb)))$$, '23514', null,
  'VOD-1.1 a quantity-only save on a Sent draft is refused');
select throws_ok($$select pg_temp.save(12, jsonb_build_array(pg_temp.ln(41, '4'::jsonb)))$$, '23514', null,
  'VOD-1.1 even an unchanged save on a Sent draft is refused');
select ok(pg_temp.qty(41) = 4 and pg_temp.ver() = 12, 'VOD-1.1 the Sent quantity and version are frozen');
reset role;

select * from finish();
rollback;
