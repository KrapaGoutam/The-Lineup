-- Feature 020, found during a Phase 3 worked-sequence review, the same
-- rigor already applied to the regenerate boundary: "a confirmed payment
-- is frozen" was true for amount_cents/payment_date/comment/status, but
-- forbid_confirmed_payment_edit never guarded payroll_period_id (or
-- organization_id). A raw UPDATE re-pointing a confirmed payment's
-- payroll_period_id from one period to another -- proven live, bypassing
-- both the Server Action and RLS entirely -- silently moved a confirmed
-- payment's $400 credit from one month's balance to another's, without
-- touching any of the columns the trigger already guarded. Reachable by
-- any privileged role through the normal app connection too, since
-- payroll_payments_update_privileged's RLS `with check` only asks
-- "is this caller privileged for this organization," never "which
-- columns is this update actually touching."
--
-- Also closes the related organization_id case: nothing previously
-- stopped a confirmed payment's organization_id from being changed
-- independently of payroll_period_id either, which would leave the row's
-- organization_id inconsistent with the organization its own period
-- actually belongs to -- a cross-tenant variant of the same bug.
--
-- Once confirmed, a payment's identity -- which period it counts against,
-- and which organization it belongs to -- is now exactly as frozen as
-- its amount. The only way to move money between periods, ever, is a new
-- payment or adjustment against the correct one.

create or replace function private.forbid_confirmed_payment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status is distinct from old.status then
    raise exception 'Cannot un-confirm a confirmed payment.';
  end if;
  if old.status = 'confirmed'
     and (new.amount_cents is distinct from old.amount_cents
          or new.payment_date is distinct from old.payment_date
          or new.comment is distinct from old.comment
          or new.payroll_period_id is distinct from old.payroll_period_id
          or new.organization_id is distinct from old.organization_id) then
    raise exception 'Cannot edit a confirmed payment; record a correction instead.';
  end if;
  return new;
end;
$$;
