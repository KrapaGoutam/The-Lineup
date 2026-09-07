-- Feature 020 Phase 1 follow-up, found during schema review before Phase 2:
--
-- 1. Close a real bypass in the confirmed-payment immutability trigger: it
--    only guarded amount_cents/payment_date/comment when old.status was
--    'confirmed' AT THE TIME of that specific update -- it never guarded
--    status itself. Any privileged role could flip status back to 'draft'
--    (an update the old guard didn't touch, so it passed) and then edit the
--    now-unconfirmed row freely in a second statement, silently rewriting a
--    payment that was supposed to be locked. No superuser/DBA access
--    required -- reachable by owner, manager, or assistant manager through
--    the normal app connection. Fixed by also forbidding status from ever
--    changing away from 'confirmed' once set: there is no un-confirm path,
--    at all, for anyone.
--
-- 2. payroll_payments gets a delete policy, scoped to drafts only: a
--    payment recorded against the wrong person entirely needs to be
--    removable, and editing its payroll_period_id to "fix" it would
--    corrupt the audit trail worse than deleting a draft that was never
--    confirmed in the first place. A confirmed payment stays permanently
--    undeletable -- the only correction path for one is a new offsetting
--    payroll_payments row (reverses_payment_id), never a delete, never an
--    edit.

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
          or new.comment is distinct from old.comment) then
    raise exception 'Cannot edit a confirmed payment; record a correction instead.';
  end if;
  return new;
end;
$$;

-- Deleting a confirmed row is blocked the same way editing one is: a
-- BEFORE DELETE trigger, independent of any RLS policy that might exist
-- now or later. This means "confirmed payments are undeletable" holds even
-- if a future migration ever mistakenly widened the delete policy below --
-- defense in depth, not solely relying on the policy's own `using` clause
-- getting the status check right forever.
create or replace function private.forbid_confirmed_payment_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed' then
    raise exception 'Cannot delete a confirmed payment; record a correction instead.';
  end if;
  return old;
end;
$$;

create trigger forbid_confirmed_payment_delete
  before delete on public.payroll_payments
  for each row execute function private.forbid_confirmed_payment_delete();

grant delete on public.payroll_payments to authenticated;

-- Privileged AND draft-only: an owner/manager/assistant-manager can delete
-- a payment only while it's still a draft. The trigger above is the real
-- backstop for confirmed rows; this `using` clause is the first line of
-- defense (RLS filters the row out of DELETE's target set before the
-- trigger even runs for a confirmed row targeted this way).
create policy "payroll_payments_delete_privileged_draft" on public.payroll_payments
  for delete to authenticated
  using (
    status = 'draft'
    and (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
