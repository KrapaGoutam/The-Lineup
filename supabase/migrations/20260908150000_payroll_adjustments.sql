-- Feature 020 Phase 3: payroll_adjustments -- the escape hatch for a wrong
-- CONFIRMED payment (confirmed payments are frozen by
-- forbid_confirmed_payment_edit/forbid_confirmed_payment_delete and can
-- never be edited or deleted) and, per the spec's hard question 1 "messy
-- middle" answer, for a wrong generated snapshot once regeneration is
-- blocked by forbid_payroll_period_snapshot_edit. An adjustment is a
-- signed delta plus a mandatory reason -- it never edits or deletes
-- anything; it only adds a new, visible, audited correction line. Once
-- created, an adjustment is itself permanently immutable -- if an
-- adjustment turns out wrong, the fix is another adjustment, never an
-- edit to this one. That is enforced simply by never granting update or
-- delete on this table at all, to anyone, the same way payroll_periods/
-- payroll_settings have no delete policy.

create table public.payroll_adjustments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payroll_period_id bigint not null references public.payroll_periods (id) on delete cascade,
  delta_cents integer not null check (delta_cents <> 0),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id)
);

comment on table public.payroll_adjustments is
  'Feature 020 Phase 3. A signed, reasoned correction line against a payroll period -- never an edit to payroll_periods.gross_cents or a payroll_payments row. Append-only: no update or delete grant exists, to any role.';

-- Postgres never indexes a foreign key column automatically.
create index payroll_adjustments_organization_id_idx
  on public.payroll_adjustments (organization_id);
create index payroll_adjustments_period_id_idx
  on public.payroll_adjustments (payroll_period_id);

-- select and insert only -- no update, no delete, for anyone, including
-- owner. This is what actually makes an adjustment append-only: not a
-- policy that could be relaxed, but a grant that was never made.
revoke all on table public.payroll_adjustments from anon, authenticated;
grant select, insert on public.payroll_adjustments to authenticated;
revoke all on sequence public.payroll_adjustments_id_seq from anon, authenticated;
grant usage on sequence public.payroll_adjustments_id_seq to authenticated;

alter table public.payroll_adjustments enable row level security;

create policy "payroll_adjustments_select_privileged" on public.payroll_adjustments
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- A regular member sees adjustments against their own linked period, same
-- join shape as payroll_payments_select_self -- but with no status filter,
-- since an adjustment has no draft state: it is final and visible to the
-- person it affects the instant it's created, matching "both entries
-- still visible in the ledger."
create policy "payroll_adjustments_select_self" on public.payroll_adjustments
  for select to authenticated
  using (
    payroll_period_id in (
      select p.id from public.payroll_periods p
      join public.attendance_identity_links l
        on l.organization_id = p.organization_id and l.neon_user_id = p.neon_user_id
      where l.profile_id = (select auth.uid())
    )
  );

create policy "payroll_adjustments_insert_privileged" on public.payroll_adjustments
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
