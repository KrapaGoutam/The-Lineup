begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_function('public', 'unconfirm_payroll_payment', array['bigint', 'text'], 'unconfirm_payroll_payment exists');
select ok(
  not has_function_privilege('anon', 'public.unconfirm_payroll_payment(bigint, text)', 'EXECUTE'),
  'anon cannot execute unconfirm_payroll_payment'
);
select ok(
  has_function_privilege('authenticated', 'public.unconfirm_payroll_payment(bigint, text)', 'EXECUTE'),
  'authenticated can execute unconfirm_payroll_payment'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-000000022001', '022-manager@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000022002', '022-server@passcode.internal', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000022003', '022-outsider-manager@passcode.internal', 'x', now(), 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000022001', 'PGTAP 022 Manager'),
  ('00000000-0000-0000-0000-000000022002', 'PGTAP 022 Server'),
  ('00000000-0000-0000-0000-000000022003', 'PGTAP 022 Outsider Manager');
insert into public.organizations (id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-000000022101', 'PGTAP 022 Org', 'pgtap-022-org', '00000000-0000-0000-0000-000000022001'),
  ('00000000-0000-0000-0000-000000022102', 'PGTAP 022 Other Org', 'pgtap-022-other-org', '00000000-0000-0000-0000-000000022003');
insert into public.memberships (organization_id, profile_id, roles, active)
values
  ('00000000-0000-0000-0000-000000022101', '00000000-0000-0000-0000-000000022001', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000022101', '00000000-0000-0000-0000-000000022002', array['server']::public.app_role[], true),
  ('00000000-0000-0000-0000-000000022102', '00000000-0000-0000-0000-000000022003', array['owner']::public.app_role[], true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022001', true);

insert into public.payroll_periods
  (organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, generated_by)
values
  ('00000000-0000-0000-0000-000000022101', 301, '2026-08-01', 40.0, 1000, 40000, '00000000-0000-0000-0000-000000022001')
returning id as period_id \gset

insert into public.payroll_payments
  (organization_id, payroll_period_id, amount_cents, payment_date, comment, created_by)
values
  ('00000000-0000-0000-0000-000000022101', :'period_id', 40000, '2026-08-15', 'Bi-weekly settlement', '00000000-0000-0000-0000-000000022001')
returning id as payment_id \gset

-- Confirm it -- the ordinary path, a plain privileged UPDATE from draft.
update public.payroll_payments
set status = 'confirmed', confirmed_at = now(), confirmed_by = '00000000-0000-0000-0000-000000022001'
where id = :'payment_id';

-- The exact regression this whole migration must not reopen: a plain
-- client UPDATE flipping status away from 'confirmed' is still refused,
-- unconditionally, for the manager who owns it -- the RPC is the only
-- door.
select throws_ok(
  format($$ update public.payroll_payments set status = 'draft' where id = %L $$, :'payment_id'),
  'P0001',
  'Cannot un-confirm a confirmed payment.',
  'a plain UPDATE still cannot un-confirm a payment, even for its own manager'
);

-- A regular member (not privileged) cannot use the RPC either.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022002', true);
select throws_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'server trying to unconfirm') $$, :'payment_id'),
  'P0001',
  'You do not have permission to unconfirm this payment.',
  'a non-privileged member cannot unconfirm a payment'
);

-- A manager from a completely different organization cannot use it on
-- someone else's payment either -- has_org_role checks the PAYMENT's
-- own organization, not the caller's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022003', true);
select throws_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'outsider manager trying to unconfirm') $$, :'payment_id'),
  'P0001',
  'You do not have permission to unconfirm this payment.',
  'a manager from a different organization cannot unconfirm this payment'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000022001', true);

-- A reason that's too short is rejected before anything changes.
select throws_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'no') $$, :'payment_id'),
  'P0001',
  'A reason of at least 3 characters is required to unconfirm a payment.',
  'a too-short reason is rejected'
);
select is(
  (select status from public.payroll_payments where id = :'payment_id'),
  'confirmed',
  'the payment is still confirmed after the rejected short-reason attempt'
);

-- The real, authorized path.
select lives_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'Wrong amount recorded, needs correction') $$, :'payment_id'),
  'the owning organization''s manager can unconfirm the payment through the RPC'
);
select is(
  (select status from public.payroll_payments where id = :'payment_id'),
  'draft',
  'the payment is back to draft status'
);
select ok(
  (select confirmed_at from public.payroll_payments where id = :'payment_id') is null,
  'confirmed_at was cleared'
);
select ok(
  (select confirmed_by from public.payroll_payments where id = :'payment_id') is null,
  'confirmed_by was cleared'
);

-- Audited, with the reason preserved in its own column.
select is(
  (select count(*) from public.audit_events
   where action = 'payroll_payment_unconfirmed' and entity_id = :'payment_id'::text),
  1::bigint,
  'exactly one audit event was recorded for the unconfirm'
);
select is(
  (select reason from public.audit_events
   where action = 'payroll_payment_unconfirmed' and entity_id = :'payment_id'::text),
  'Wrong amount recorded, needs correction',
  'the audit event carries the real reason'
);

-- Once unconfirmed, the pre-existing edit path (editDraftPaymentAction's
-- own underlying UPDATE) works again -- no new edit mechanism was
-- needed, only this unconfirm door.
select lives_ok(
  format($$ update public.payroll_payments set amount_cents = 35000 where id = %L $$, :'payment_id'),
  'a now-draft payment can be edited again through the ordinary UPDATE path'
);

-- Calling it again on an already-draft payment is refused.
select throws_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'trying again') $$, :'payment_id'),
  'P0001',
  'This payment is not confirmed.',
  'unconfirming an already-draft payment is refused'
);

-- Re-confirm and unconfirm once more, to confirm the door is
-- reusable, not a one-shot exception.
update public.payroll_payments
set status = 'confirmed', confirmed_at = now(), confirmed_by = '00000000-0000-0000-0000-000000022001'
where id = :'payment_id';
select lives_ok(
  format($$ select public.unconfirm_payroll_payment(%L, 'Second correction needed') $$, :'payment_id'),
  'the RPC works again on a re-confirmed payment -- not a single-use exception'
);

select * from finish();
rollback;
