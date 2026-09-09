-- Feature 026. Real gap found reading `payroll_periods_select_self`
-- directly (20260907180000_payroll_schema_rls.sql), not assumed: it has
-- no status filter at all -- a self-scoped viewer currently sees their
-- own payroll period regardless of status, including 'draft'. This
-- directly contradicts the spec's own stated policy
-- (`profile_id = auth.uid() AND status IN ('locked', 'paid')`) and its
-- "draft periods are hidden" requirement for regular employees.
--
-- 'paid' is never a stored status -- payroll_periods.status is DB-
-- checked to exactly 'draft'/'locked' (see the original migration's own
-- check constraint). "Paid" is a computed display state
-- (balance_cents <= 0 on an otherwise-locked period), so restricting to
-- status = 'locked' already covers both Locked and (locked-and-fully-
-- paid) Paid -- there is no separate DB-level state to add.
--
-- Every other payroll_periods policy (privileged select/insert/update,
-- the delete-never grant) is untouched. Privileged (owner/general_
-- manager/shift_manager) visibility is unaffected -- they already see
-- every status via payroll_periods_select_privileged, a completely
-- separate policy.

drop policy "payroll_periods_select_self" on public.payroll_periods;

create policy "payroll_periods_select_self" on public.payroll_periods
  for select to authenticated
  using (
    status = 'locked'
    and neon_user_id in (
      select l.neon_user_id from public.attendance_identity_links l
      where l.organization_id = payroll_periods.organization_id
        and l.profile_id = (select auth.uid())
    )
  );

-- Real regression, caught by re-running the existing pgTAP suite before
-- trusting this migration, not assumed safe: `payroll_payments_select_self`
-- and `payroll_adjustments_select_self` (20260907180000_payroll_schema_rls.sql,
-- 20260908150000_payroll_adjustments.sql) each resolve ownership with a
-- plain subquery JOIN against `payroll_periods` -- which, run as the
-- self-scoped caller, is now itself subject to the tightened policy
-- above. Left unfixed, a CONFIRMED payment or an adjustment against a
-- still-draft period would silently become invisible too, breaking the
-- adjustments policy's own deliberately-documented design ("an
-- adjustment ... is final and visible to the person it affects the
-- instant it's created" -- no draft state of its own, and not meant to
-- inherit its parent period's). A narrow SECURITY DEFINER helper
-- resolves ownership without going through payroll_periods' own
-- (now-tightened) row visibility, restoring that original guarantee
-- while keeping the periods-list tightening above intact.
--
-- Second regression, also only caught by re-running the full suite, not
-- assumed fixed after the first pass: `payroll_periods_select_self`'s
-- own original comment explains it deliberately never re-checks active
-- membership itself, because attendance_identity_links' OWN RLS already
-- requires an active membership to see a self-row at all -- so a
-- deactivated member's self-select subquery already returned zero rows
-- on its own. A SECURITY DEFINER function bypasses RLS on EVERY table
-- it reads, including that inherited protection -- so it must
-- re-check active membership explicitly itself, rather than relying on
-- a transitive guarantee that no longer applies inside it.
create function private.owns_payroll_period(target_payroll_period_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_periods p
    join public.attendance_identity_links l
      on l.organization_id = p.organization_id and l.neon_user_id = p.neon_user_id
    join public.memberships m
      on m.organization_id = p.organization_id and m.profile_id = l.profile_id
    where p.id = target_payroll_period_id
      and l.profile_id = (select auth.uid())
      and m.active
  );
$$;

grant execute on function private.owns_payroll_period(bigint) to authenticated;

drop policy "payroll_payments_select_self" on public.payroll_payments;

create policy "payroll_payments_select_self" on public.payroll_payments
  for select to authenticated
  using (
    status = 'confirmed'
    and private.owns_payroll_period(payroll_period_id)
  );

drop policy "payroll_adjustments_select_self" on public.payroll_adjustments;

create policy "payroll_adjustments_select_self" on public.payroll_adjustments
  for select to authenticated
  using (private.owns_payroll_period(payroll_period_id));
