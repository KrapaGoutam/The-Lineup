begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'payroll_adjustments', 'payroll_adjustments exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payroll_adjustments'::regclass),
  'RLS is enabled on payroll_adjustments'
);
select ok(
  not has_table_privilege('anon', 'public.payroll_adjustments', 'SELECT'),
  'anon cannot read payroll_adjustments'
);
-- Append-only, structurally: no update or delete privilege exists at all,
-- for anyone -- not merely denied by a policy that could later be
-- loosened, but never granted in the first place.
select ok(
  has_table_privilege('authenticated', 'public.payroll_adjustments', 'SELECT')
  and has_table_privilege('authenticated', 'public.payroll_adjustments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.payroll_adjustments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.payroll_adjustments', 'DELETE'),
  'authenticated can select and insert, but never update or delete'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000021001', '021-manager@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021002', '021-server@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000021003', '021-outsider@passcode.internal', 'x', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000021001', 'PGTAP 021 Manager'),
  ('00000000-0000-0000-0000-000000021002', 'PGTAP 021 Server'),
  ('00000000-0000-0000-0000-000000021003', 'PGTAP 021 Outsider');
insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000021101', 'PGTAP 021 Org', 'pgtap-021-org', '00000000-0000-0000-0000-000000021001'),
  ('00000000-0000-0000-0000-000000021102', 'PGTAP 021 Other Org', 'pgtap-021-other-org', '00000000-0000-0000-0000-000000021003');
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021001', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000021102', '00000000-0000-0000-0000-000000021003', array['owner']::public.app_role[], true);
insert into public.attendance_identity_links (organization_id, profile_id, neon_user_id, linked_by)
values ('00000000-0000-0000-0000-000000021101', '00000000-0000-0000-0000-000000021002', 301, '00000000-0000-0000-0000-000000021001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021001', true);

insert into public.payroll_periods
  (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
values
  ('00000000-0000-0000-0000-000000021101', 301, '2026-08-01', 40.0, 1000, 40000, '00000000-0000-0000-0000-000000021001')
returning id as period_id \gset

select lives_ok(
  format(
    $$ insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
       values ('00000000-0000-0000-0000-000000021101', %L, -36000, 'Confirmed $400 payment should have been $40', '00000000-0000-0000-0000-000000021001') $$,
    :'period_id'
  ),
  'a manager can record an adjustment'
);

select throws_ok(
  $$ insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
     values ('00000000-0000-0000-0000-000000021101', 1, 0, 'zero delta', '00000000-0000-0000-0000-000000021001') $$,
  '23514',
  null,
  'a zero delta_cents adjustment is rejected'
);
select throws_ok(
  format(
    $$ insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
       values ('00000000-0000-0000-0000-000000021101', %L, -100, 'ok', '00000000-0000-0000-0000-000000021001') $$,
    :'period_id'
  ),
  '23514',
  null,
  'a reason shorter than 3 characters is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021002', true);
select is(
  (select count(*) from public.payroll_adjustments),
  1::bigint,
  'the linked server sees the adjustment against their own period -- no draft state, visible immediately'
);
select is(
  (select delta_cents from public.payroll_adjustments),
  -36000,
  'the linked server sees the correct delta_cents'
);
select throws_ok(
  format(
    $$ insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
       values ('00000000-0000-0000-0000-000000021101', %L, -100, 'self-serve adjustment', '00000000-0000-0000-0000-000000021002') $$,
    :'period_id'
  ),
  '42501',
  null,
  'a regular member cannot record an adjustment'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021003', true);
select is(
  (select count(*) from public.payroll_adjustments),
  0::bigint,
  'an outsider in a different organization sees no adjustments at all'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000021001', true);
select adjustment_id as adjustment_id from (
  select id as adjustment_id from public.payroll_adjustments limit 1
) sub \gset

select throws_ok(
  format($$ update public.payroll_adjustments set delta_cents = -1 where id = %L $$, :'adjustment_id'),
  '42501',
  null,
  'no role -- not even the manager who created it -- can update an adjustment (no update grant exists)'
);
select throws_ok(
  format($$ delete from public.payroll_adjustments where id = %L $$, :'adjustment_id'),
  '42501',
  null,
  'no role can delete an adjustment either (no delete grant exists)'
);
select is(
  (select count(*) from public.payroll_adjustments),
  1::bigint,
  'the adjustment is still there -- both the original 40000 gross and the -36000 adjustment remain in the ledger'
);

-- Composite tenant FK: an adjustment cannot be attributed to an actor
-- outside the organization.
select throws_ok(
  format(
    $$ insert into public.payroll_adjustments (organization_id, payroll_period_id, delta_cents, reason, created_by)
       values ('00000000-0000-0000-0000-000000021101', %L, -100, 'cross-org actor', '00000000-0000-0000-0000-000000021003') $$,
    :'period_id'
  ),
  '23503',
  null,
  'an adjustment cannot be attributed to an actor from a different organization'
);

select * from finish();
rollback;
