-- Feature 020, found during a Phase 2 worked-sequence review before Phase 3:
-- "a payment exists -> regeneration is refused" was proven true, but only as
-- an application-layer guard (regeneratePayrollPeriodAction's own
-- countPaymentsForPeriod check) -- a raw UPDATE against payroll_periods,
-- issued directly (bypassing the Server Action entirely), was proven to
-- succeed even with a payment on record, silently moving hours_snapshot/
-- rate_cents_snapshot/gross_cents out from under it. This closes that gap
-- the same way the confirmed-payment immutability trigger closes the
-- equivalent gap on payroll_payments: a database trigger, independent of
-- any application code path, RLS policy, or role.
--
-- Scoped to exactly the three snapshot-defining columns -- status/locked_at/
-- locked_by (the lock action) and regenerated_at/regenerated_by (harmless
-- bookkeeping alongside a legitimate pre-payment regenerate) are
-- deliberately NOT covered, so locking an already-paid period still works.

create or replace function private.forbid_payroll_period_snapshot_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.hours_snapshot is distinct from old.hours_snapshot
      or new.rate_cents_snapshot is distinct from old.rate_cents_snapshot
      or new.gross_cents is distinct from old.gross_cents)
     and exists (
       select 1 from public.payroll_payments
       where payroll_period_id = old.id
     ) then
    raise exception 'Cannot change a payroll period''s snapshot once a payment has been recorded against it; record a manual adjustment instead.';
  end if;
  return new;
end;
$$;

create trigger forbid_payroll_period_snapshot_edit
  before update on public.payroll_periods
  for each row execute function private.forbid_payroll_period_snapshot_edit();
