begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

-- Table/RLS/grant shape ------------------------------------------------

select has_table('public', 'payroll_settings', 'payroll_settings exists');
select has_table('public', 'payroll_rates', 'payroll_rates exists');
select has_table('public', 'payroll_periods', 'payroll_periods exists');
select has_table('public', 'payroll_payments', 'payroll_payments exists');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in (
     'public.payroll_settings'::regclass,
     'public.payroll_rates'::regclass,
     'public.payroll_periods'::regclass,
     'public.payroll_payments'::regclass
   )),
  'RLS is enabled on all four payroll tables'
);

select ok(
  not has_table_privilege('anon', 'public.payroll_settings', 'SELECT')
  and not has_table_privilege('anon', 'public.payroll_rates', 'SELECT')
  and not has_table_privilege('anon', 'public.payroll_periods', 'SELECT')
  and not has_table_privilege('anon', 'public.payroll_payments', 'SELECT'),
  'anon cannot read any payroll table'
);

select ok(
  not has_table_privilege('authenticated', 'public.payroll_settings', 'DELETE')
  and has_table_privilege('authenticated', 'public.payroll_rates', 'DELETE')
  and not has_table_privilege('authenticated', 'public.payroll_periods', 'DELETE')
  and not has_table_privilege('authenticated', 'public.payroll_payments', 'DELETE'),
  'delete is grantable only on payroll_rates -- the other three are financial history'
);

-- No coupling to Tip Split, checked at the database level, not just by
-- convention: no foreign key from any payroll_* table to any tip_* table.
select is(
  (
    select count(*)::bigint
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_class frel on frel.oid = c.confrelid
    where c.contype = 'f'
      and rel.relname like 'payroll\_%'
      and frel.relname like 'tip\_%'
  ),
  0::bigint,
  'no payroll table has a foreign key to any tip_* table'
);

-- Seed -------------------------------------------------------------------

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000020001', '020-creator@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000020002', '020-manager@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000020003', '020-server-one@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000020004', '020-server-two@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000020005', '020-outsider@passcode.internal', 'not-a-real-hash', now(), 'authenticated', 'authenticated');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000020001', 'PGTAP 020 Creator'),
  ('00000000-0000-0000-0000-000000020002', 'PGTAP 020 Manager'),
  ('00000000-0000-0000-0000-000000020003', 'PGTAP 020 Server One'),
  ('00000000-0000-0000-0000-000000020004', 'PGTAP 020 Server Two'),
  ('00000000-0000-0000-0000-000000020005', 'PGTAP 020 Outsider');

insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000020101', 'PGTAP 020 Org', 'pgtap-020-org', '00000000-0000-0000-0000-000000020001'),
  ('00000000-0000-0000-0000-000000020102', 'PGTAP 020 Other Org', 'pgtap-020-other-org', '00000000-0000-0000-0000-000000020005');

insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000020002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000020003', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000020004', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000020102', '00000000-0000-0000-0000-000000020005', array['owner']::public.app_role[], true);

insert into public.attendance_identity_links (organization_id, profile_id, neon_user_id, linked_by)
values
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000020003', 201, '00000000-0000-0000-0000-000000020002'),
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000020004', 202, '00000000-0000-0000-0000-000000020002');

set local role authenticated;

-- Manager writes settings/rates/period/payment -----------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);

select lives_ok(
  $$
    insert into public.payroll_settings (organization_id, default_rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000020101', 1000, '00000000-0000-0000-0000-000000020002')
  $$,
  'a manager can set the organization default rate'
);

select lives_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000020101', 201, 1200, '00000000-0000-0000-0000-000000020002')
  $$,
  'a manager can set a per-person rate override'
);

select lives_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
    values
      ('00000000-0000-0000-0000-000000020101', 201, '2026-08-01', 100.0, 1200, 120000, '00000000-0000-0000-0000-000000020002')
  $$,
  'a manager can generate a payroll period'
);

select lives_ok(
  $$
    insert into public.payroll_payments
      (organization_id, payroll_period_id, amount_cents, payment_date, created_by)
    select '00000000-0000-0000-0000-000000020101', id, 40000, '2026-09-01', '00000000-0000-0000-0000-000000020002'
    from public.payroll_periods
    where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201
  $$,
  'a manager can record a draft payment'
);

-- Regular members cannot write any of the four tables --------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020003', true);

select throws_ok(
  $$
    insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
    values ('00000000-0000-0000-0000-000000020101', 202, 900, '00000000-0000-0000-0000-000000020003')
  $$,
  '42501',
  'new row violates row-level security policy for table "payroll_rates"',
  'a regular member cannot create a rate override'
);

select throws_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
    values
      ('00000000-0000-0000-0000-000000020101', 201, '2026-07-01', 50.0, 1200, 60000, '00000000-0000-0000-0000-000000020003')
  $$,
  '42501',
  'new row violates row-level security policy for table "payroll_periods"',
  'a regular member cannot generate a payroll period'
);

delete from public.payroll_rates
where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201;

-- Switch to the manager to actually check whether the row survived --
-- payroll_rates has no self-select policy at all (privileged-only), so
-- checking the count as server-one here would read 0 regardless of
-- whether the delete did anything, since server-one can never see this
-- table's rows in the first place.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);
select is(
  (select count(*) from public.payroll_rates
   where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201),
  1::bigint,
  'a regular member''s delete of a rate override affects zero rows under RLS'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020003', true);

-- Self-select: own period visible (any status), other person's is not ---

select is(
  (select count(*) from public.payroll_periods
   where organization_id = '00000000-0000-0000-0000-000000020101'),
  1::bigint,
  'the linked server sees their own payroll period'
);
select is(
  (select gross_cents from public.payroll_periods
   where organization_id = '00000000-0000-0000-0000-000000020101'),
  120000,
  'the linked server sees the correct gross_cents on their own period'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020004', true);
select is(
  (select count(*) from public.payroll_periods
   where organization_id = '00000000-0000-0000-0000-000000020101'),
  0::bigint,
  'a different linked server (server two) sees none of server one''s payroll periods'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020005', true);
select is(
  (select count(*) from public.payroll_periods),
  0::bigint,
  'an outsider in a different organization sees no payroll periods at all'
);

-- Self-select on payments: draft is invisible, confirmed is visible -----

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020003', true);
select is(
  (select count(*) from public.payroll_payments),
  0::bigint,
  'the linked server does not see their own DRAFT payment'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);
update public.payroll_payments
set status = 'confirmed', confirmed_at = now(), confirmed_by = '00000000-0000-0000-0000-000000020002'
where organization_id = '00000000-0000-0000-0000-000000020101';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020003', true);
select is(
  (select count(*) from public.payroll_payments),
  1::bigint,
  'once confirmed, the linked server sees their own payment'
);
select is(
  (select amount_cents from public.payroll_payments),
  40000,
  'the linked server sees the correct confirmed amount_cents'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020004', true);
select is(
  (select count(*) from public.payroll_payments),
  0::bigint,
  'a different linked server sees none of server one''s confirmed payments'
);

-- Confirmed-payment immutability trigger ---------------------------------

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);

select throws_ok(
  $$
    update public.payroll_payments
    set amount_cents = 1
    where organization_id = '00000000-0000-0000-0000-000000020101'
  $$,
  'P0001',
  'Cannot edit a confirmed payment; record a correction instead.',
  'the trigger rejects an amount_cents edit on a confirmed payment'
);
select throws_ok(
  $$
    update public.payroll_payments
    set payment_date = '2026-09-02'
    where organization_id = '00000000-0000-0000-0000-000000020101'
  $$,
  'P0001',
  'Cannot edit a confirmed payment; record a correction instead.',
  'the trigger rejects a payment_date edit on a confirmed payment'
);
select throws_ok(
  $$
    update public.payroll_payments
    set comment = 'sneaky edit'
    where organization_id = '00000000-0000-0000-0000-000000020101'
  $$,
  'P0001',
  'Cannot edit a confirmed payment; record a correction instead.',
  'the trigger rejects a comment edit on a confirmed payment'
);
select lives_ok(
  $$
    update public.payroll_payments
    set updated_at = now()
    where organization_id = '00000000-0000-0000-0000-000000020101'
  $$,
  'the trigger allows touching an unprotected column on a confirmed payment'
);

-- Rate changes never touch an already-generated period -------------------

update public.payroll_rates
set rate_cents = 5000
where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201;

select is(
  (select gross_cents from public.payroll_periods
   where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201),
  120000,
  'changing a person''s rate does not alter an already-generated period''s frozen gross_cents'
);
select is(
  (select rate_cents_snapshot from public.payroll_periods
   where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201),
  1200,
  'the already-generated period keeps its original rate_cents_snapshot too'
);

-- Transitive protection: deactivating the linked member's membership
-- blocks their own self-select, even though their attendance_identity_links
-- row is left physically in place -- inherited from that table's own RLS
-- (has_org_role requires memberships.active), not re-checked here.
update public.memberships
set active = false
where organization_id = '00000000-0000-0000-0000-000000020101'
  and profile_id = '00000000-0000-0000-0000-000000020003';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020003', true);
select is(
  (select count(*) from public.payroll_periods),
  0::bigint,
  'a deactivated member sees none of their own payroll periods, inherited from attendance_identity_links'' own RLS'
);
select is(
  (select count(*) from public.payroll_payments),
  0::bigint,
  'a deactivated member sees none of their own confirmed payroll payments either'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);
update public.memberships
set active = true
where organization_id = '00000000-0000-0000-0000-000000020101'
  and profile_id = '00000000-0000-0000-0000-000000020003';

-- Tenant-composite foreign keys reject a cross-organization actor/target -

select throws_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
    values
      ('00000000-0000-0000-0000-000000020101', 999, '2026-06-01', 10.0, 1000, 10000, '00000000-0000-0000-0000-000000020005')
  $$,
  '23503',
  null,
  'a payroll period cannot be attributed to an actor from a different organization'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020005', true);
select lives_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
    values
      ('00000000-0000-0000-0000-000000020102', 501, '2026-08-01', 10.0, 1000, 10000, '00000000-0000-0000-0000-000000020005')
  $$,
  'the other organization''s owner can generate their own, unrelated payroll period'
);
select lives_ok(
  $$
    insert into public.payroll_payments (organization_id, payroll_period_id, amount_cents, payment_date, created_by)
    select '00000000-0000-0000-0000-000000020102', id, 5000, '2026-08-05', '00000000-0000-0000-0000-000000020005'
    from public.payroll_periods
    where organization_id = '00000000-0000-0000-0000-000000020102'
  $$,
  'seed a payment in the other organization to prove cross-tenant reversal references are rejected'
);

-- Capture the other organization's payment id by dropping back to the
-- connection's original (RLS-bypassing) role -- no ordinary session can
-- see across tenants, which is rather the point; this lookup step is
-- purely to construct the test, not part of what's being proven. The FK
-- below, evaluated against the actual data regardless of who's asking, is
-- what actually prevents a real cross-tenant reference.
reset role;
select id as other_org_payment_id from public.payroll_payments
where organization_id = '00000000-0000-0000-0000-000000020102' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000020002', true);
select throws_ok(
  format(
    $$
      insert into public.payroll_payments
        (organization_id, payroll_period_id, amount_cents, payment_date, created_by, reverses_payment_id)
      select '00000000-0000-0000-0000-000000020101', id, 1, '2026-09-03',
        '00000000-0000-0000-0000-000000020002', %L
      from public.payroll_periods
      where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201
    $$,
    :'other_org_payment_id'
  ),
  '23503',
  null,
  'a payment cannot reverse another organization''s payment id'
);

-- Check constraints -------------------------------------------------------

select throws_ok(
  $$ insert into public.payroll_rates (organization_id, neon_user_id, rate_cents, updated_by)
     values ('00000000-0000-0000-0000-000000020101', 301, -1, '00000000-0000-0000-0000-000000020002') $$,
  '23514',
  null,
  'a negative rate_cents is rejected'
);
select throws_ok(
  $$
    insert into public.payroll_payments (organization_id, payroll_period_id, amount_cents, payment_date, created_by)
    select '00000000-0000-0000-0000-000000020101', id, 0, '2026-09-04', '00000000-0000-0000-0000-000000020002'
    from public.payroll_periods
    where organization_id = '00000000-0000-0000-0000-000000020101' and neon_user_id = 201
  $$,
  '23514',
  null,
  'a zero or negative amount_cents payment is rejected'
);
select throws_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_by)
    values
      ('00000000-0000-0000-0000-000000020101', 401, '2026-05-01', 1.0, 100, 100, 'bogus', '00000000-0000-0000-0000-000000020002')
  $$,
  '23514',
  null,
  'an invalid payroll_periods.status value is rejected'
);
select throws_ok(
  $$
    insert into public.payroll_periods
      (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
    values
      ('00000000-0000-0000-0000-000000020101', 201, '2026-08-01', 1.0, 100, 100, '00000000-0000-0000-0000-000000020002')
  $$,
  '23505',
  null,
  'the database rejects a second period for the same person and month'
);

select * from finish();
rollback;
