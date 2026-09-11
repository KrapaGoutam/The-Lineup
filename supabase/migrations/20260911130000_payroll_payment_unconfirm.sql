-- Payroll UX mega-request, Phase 7: an explicit, audited "unconfirm"
-- door for a confirmed payment.
--
-- Context this migration must not silently reverse: `20260907200000
-- _payroll_payment_draft_delete_and_lock.sql` hardened
-- `private.forbid_confirmed_payment_edit()` specifically because a
-- privileged role could flip `status` back to `'draft'` (an update the
-- trigger's earlier version didn't guard at all) and then freely
-- re-edit the now-unconfirmed row in a second statement -- a real,
-- proven vulnerability, closed by making that trigger block ANY change
-- away from `'confirmed'`, for every role, unconditionally, "no
-- un-confirm path, at all, for anyone."
--
-- The product now legitimately needs one -- but the fix above must stay
-- exactly as strict as it is today for every *ordinary* UPDATE path.
-- The approach (this session's explicit, considered decision, not a
-- default): a session-local flag (`set_config`, transaction-scoped)
-- that only one new SECURITY DEFINER function ever sets, checked by
-- the trigger as the sole exception to its status-change block. A
-- plain client UPDATE -- the exact vulnerability this trigger was
-- written to close -- never sets that flag, so it is refused exactly
-- as before. The trigger's *other* guard (amount/date/comment/period/
-- organization immutability once confirmed) is left completely
-- unconditional, even for the new bypass path: the RPC below can only
-- ever flip `status` (plus `confirmed_at`/`confirmed_by`) back, never
-- sneak in any other field change in the same statement, even if it
-- had a bug that tried to.

create or replace function private.forbid_confirmed_payment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status is distinct from old.status then
    if current_setting('app.allow_payment_unconfirm', true) is distinct from 'true' then
      raise exception 'Cannot un-confirm a confirmed payment.';
    end if;
    if new.status is distinct from 'draft' then
      raise exception 'A confirmed payment can only be un-confirmed back to draft status.';
    end if;
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

-- The sole door. `SECURITY DEFINER` so it can set the session-local
-- flag and perform the UPDATE the trigger would otherwise always
-- refuse; `set search_path = ''` per this codebase's standing
-- convention for every such function. Re-validates privilege and
-- payment state itself rather than trusting the caller -- RLS is not
-- in effect for a SECURITY DEFINER function's own body, so this
-- function IS the authorization boundary here, not a supplement to one.
create function public.unconfirm_payroll_payment(
  p_payment_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payroll_payments;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Not signed in.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required to unconfirm a payment.';
  end if;

  select * into v_payment from public.payroll_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'That payment could not be found.';
  end if;
  if not private.has_org_role(
    v_payment.organization_id,
    array['owner', 'general_manager', 'shift_manager']::public.app_role[]
  ) then
    raise exception 'You do not have permission to unconfirm this payment.';
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'This payment is not confirmed.';
  end if;

  -- Transaction-local (`is_local => true`): automatically clears at
  -- commit or rollback, never leaks to any later statement on this
  -- connection, pooled or not.
  perform set_config('app.allow_payment_unconfirm', 'true', true);

  update public.payroll_payments
  set status = 'draft', confirmed_at = null, confirmed_by = null
  where id = p_payment_id;

  insert into public.audit_events (
    organization_id, actor_profile_id, action, entity_type, entity_id,
    before_state, after_state, reason
  ) values (
    v_payment.organization_id,
    v_actor,
    'payroll_payment_unconfirmed',
    'payroll_payment',
    p_payment_id::text,
    jsonb_build_object('status', 'confirmed'),
    jsonb_build_object('status', 'draft'),
    trim(p_reason)
  );
end;
$$;

revoke all on function public.unconfirm_payroll_payment(bigint, text) from public, anon;
grant execute on function public.unconfirm_payroll_payment(bigint, text) to authenticated;
