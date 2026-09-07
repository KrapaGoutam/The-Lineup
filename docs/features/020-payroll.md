# Feature 020 — Payroll

**Name:** Payroll (rates, generation, payments, balance, dashboard, export)
**Owner:** Krapa Goutam
**Status:** Phase 1 (schema + RLS, PR #16, including two follow-on hardening passes found via worked-sequence review — the regenerate boundary after Phase 2, a confirmed payment's target period/organization after Phase 3 — see Decisions and risks), Phase 2 (generation + snapshot, PR #17), Phase 3 (payments + balance + adjustments, PR #18), and Phase 4 (dashboard, this PR) complete. Branched off `feature/attendance-access-and-dashboard` (PR #15), stacked: #15 → #16 → #17 → #18 → this branch. Payroll PRs target the previous phase's branch, not `main` — the two features are meant to merge together once payroll is done. If the stack ever gets unwieldy to review or rebase, that's flagged rather than pushed through silently. Balance formula was revised during Phase 3 (see Decisions and risks): confirmed payments + adjustments only, not draft payments, after explicit review.
**Issue/PR:**

## Tips and payroll are fully independent systems

**Confirmed, and enforced structurally, not just by convention.** Tip Split (`tip_pools`, `tip_intervals`, `tip_interval_participants`, `tip_allocations`, `recalculate_tip_pool`) splits pooled gratuities among the servers present during a shift interval — a same-day, per-shift calculation with no persistence beyond that day's pool. Payroll pays wages computed from a full calendar month's Neon attendance hours × a rate — a monthly, per-person calculation with its own snapshot-and-payment lifecycle. These are different money, on different timelines, computed from different inputs, and nothing here changes that boundary:

- No payroll table has a foreign key to, or is joined against, any `tip_*` table.
- No payroll figure (`hours_snapshot`, `gross_cents`, a payment `amount_cents`) is ever derived from `tip_allocations` or any other tip-side amount, and no tip figure is ever derived from payroll data.
- `recalculate_tip_pool` and every other tip-side function is untouched by this feature and is never called from payroll code.
- The only table this feature shares with anything outside its own four new tables is a _read_ of `attendance_identity_links` (Feature 019) to resolve a regular member's own scope — the identical, already-audited mechanism Feature 019 itself uses for the same purpose, not a new coupling.

If a future feature ever wants to show tips and payroll side by side (a combined "total earnings" view, say), that's a new, explicit decision made at that time — not something this schema quietly permits by sharing a table or a function today.

## This is a deliberate PRD expansion, not a narrow carve-out

`docs/PRD.md`'s "Out of scope for MVP" line currently reads: _"Payroll, clock-in/out, POS settlement, reservations, and waitlist marketplace integrations — **except** read-only display of already-existing attendance data from a separate external system (Feature 018)..."_ — that carve-out was explicitly scoped to **display only, no computation, no write path**. Feature 020 is the opposite of that: it computes money from attendance hours, and it writes and stores financial records. This is not an extension of the 018 exception; it is a new, deliberate decision to bring payroll into MVP scope. **This confirms up front, per your instruction, that payroll persists in Supabase — its own tables, its own RLS, its own audit trail — never `useState`, never Neon.** Neon remains read-only and is used only as the hours _input_ to generation, exactly the way it already is for Feature 018/019; nothing is ever written back to Neon. If this spec is approved, the PRD update (rewriting the "Out of scope" line to record payroll as in-scope, not as a second narrow exception) is part of Phase 1's doc sweep, not done now.

## User outcome

An owner, manager, or assistant manager can set pay rates, generate a person's monthly payroll from their Neon attendance hours, record and confirm payments against it, watch the balance count down as payments land, and see a dashboard of who's owed what — all backed by real Supabase tables with row-level security, not client state. A regular employee can see their own generated payroll and their own confirmed payments only — never anyone else's, never a draft entry that could still change. Every report is exportable as a PDF-style printout and as a spreadsheet.

## Scope

- **In**: `payroll_settings` (org default rate), `payroll_rates` (per-person override), `payroll_periods` (the snapshot — one row per person per month), `payroll_payments` (multiple per period); generate/regenerate/lock actions; record/edit/confirm payment actions; balance computation and the Paid stamp; the dashboard; PDF-via-print and CSV export; full RLS; a full audit trail.
- **Out**: any write path back into Neon (still strictly read-only, per 018/019). Tax withholding, deductions, or any payroll-compliance computation beyond gross hours × rate. Direct deposit or any real money movement — this system _records_ that a payment happened outside it, it never sends money. Multi-currency. Overtime-rate rules (flagged as a likely fast-follow, not built here — every hour is paid at the same rate in this version).

## The four hard questions, answered directly

### 1. Neon hours are live and can change after a payment is recorded — does the generated payroll recompute?

**No — never silently.** `payroll_periods` is a **snapshot**, written once at generation time (`hours_snapshot`, `rate_cents_snapshot`, `gross_cents` all stored as plain columns, not derived at read time). Generation happens the moment a manager asks for it — not deferred until month close — because managers need to record payments mid-month (an advance against a still-open month is a real, normal case). Once a period is generated:

- A manager can explicitly **Regenerate** it — re-pulls current Neon hours, re-resolves the current rate, and overwrites the snapshot — but **only while the period has zero payments recorded against it (draft or confirmed) and is not locked.** The instant a single payment exists, regeneration is blocked outright. This is the direct fix for "a recorded payment against a moving total is a real problem": the total simply cannot move anymore once money has been recorded against it. Every regenerate is an audit event carrying the before/after gross amount, so a manager can never lose the history of what changed. **This is enforced twice, not once**: `regeneratePayrollPeriodAction`'s own guard (checking for any recorded payment before allowing the update) is the first layer; `private.forbid_payroll_period_snapshot_edit` — a database trigger, found necessary and added after a worked-sequence review surfaced that the guard alone had no backstop — is the second, independent of the Server Action, RLS, or caller role entirely. Scoped to exactly `hours_snapshot`/`rate_cents_snapshot`/`gross_cents`, so locking a period that already has a payment on it is unaffected.
- **Lock** is a separate, one-way action (owner/manager/assistant manager) that freezes a period permanently — no further regeneration, ever, even if it had zero payments. Locking is optional, not required to record payments; it exists for "this month is closed, don't touch it again" peace of mind once a manager is done reconciling.
- If Neon hours change after generation and a manager wants that reflected, they must explicitly regenerate (only possible pre-payment) — there is no background job, no automatic recompute, and no silent drift.

**The messy middle, nailed down before any of this is built (Phase 2), not glossed over:**

- **Hours change after generation but before any payment exists**: yes, a manager can regenerate freely — as many times as they want, with no restriction beyond "zero payments recorded." Nothing has been promised to anyone yet at that point, so overwriting the snapshot is exactly the point of having one that isn't final until money moves against it.
- **A payment already exists and the hours turn out to have been wrong**: regeneration stays permanently blocked for that period (per the rule above), and the fix is a **manual adjustment line item** — a new, small table (`payroll_adjustments`, not part of this Phase 1 schema — designed here, built in whichever later phase generation/correction logic lands) holding a signed `delta_cents`, a mandatory reason, and the usual actor/timestamp columns. An adjustment never edits or deletes `payroll_periods.gross_cents` — the original snapshot stays exactly as generated, forever — it only adds a visible, audited correction line that the effective-owed calculation (`gross_cents + sum(adjustment deltas) − sum(payment amounts)`) accounts for. This is the direct, confirmed answer to "I want a manual adjustment line item that preserves the audit trail, not editing or deleting history": nothing about a generated period, once a payment exists against it, is ever mutated or removed — every correction is a new row.

### 2. Rounding — cents must reconcile exactly, no floating-point drift

All money is **integer cents**, matching `tip_intervals.amount_cents` and `calculate-tip-splits.ts`'s `dollarsToCents` convention — no dollar-typed column, no float, anywhere in the schema or the domain layer. Rate is stored as `rate_cents` (an integer — e.g. $10.00/hr is `1000`), never as a float dollar amount.

Unlike the tip split, payroll generation is **not** distributing a shared pool across people — each person's gross pay is computed independently from their own hours and their own rate, so there is no cross-person remainder to allocate and `allocateTipInterval`'s remainder-distribution algorithm doesn't apply here. What _does_ apply, with the same rigor, is: **exactly one rounding operation, ever, per person-month** — `gross_cents = Math.round(hours_snapshot * rate_cents)` — computed once at generation time and stored as the immutable integer it produces. `hours_snapshot` itself is stored as the exact numeric value Neon returned (`numeric`, not `float8`, avoiding a second, earlier source of drift), so the only floating-point-adjacent operation in the entire pipeline is that single final `Math.round`, never repeated, never re-derived from re-multiplying stored floats. A unit test asserts this directly: a table of (hours, rate_cents) pairs with known correct cent outputs, including deliberately drift-prone values (e.g., `33.333333` hours), asserting exact integer equality — the same style of test `calculate-tip-splits.ts` already has for its own rounding.

Payments are entered directly in cents (a dollar-and-cents UI input converted once, at the input boundary, via the existing `dollarsToCents` helper reused as-is rather than reimplemented) — never accumulated from anything computed.

### 3. What stops a regular user reading another person's payments at the database level

Real RLS, not a UI hide — shown in full under **Data and authorization** below. In short: `payroll_periods` and `payroll_payments` both carry `organization_id`; a privileged member (owner/manager/assistant manager, via `private.has_org_role`) can read every row in their organization; a regular member can only read rows whose `neon_user_id` matches the one row in [[019]]'s `attendance_identity_links` where `profile_id = auth.uid()` — and even then, `payroll_payments` additionally requires `status = 'confirmed'`, enforced in the `using` clause itself, not filtered in application code after the fact. A regular member with no link row (the Feature 019 "unlinked" case) matches nothing and sees nothing, for the identical reason unlinked attendance shows nothing.

### 4. Pay rate changes — do they affect already-generated months?

**No.** `payroll_rates` holds only the _current_ override (or its absence, meaning "use `payroll_settings.default_rate_cents`") — it is not consulted at read time for a month that has already been generated. The rate that mattered is frozen forever in that period's own `rate_cents_snapshot` column the moment generation happened. Changing `payroll_rates` today only changes what the _next_ generation (a new month, or an explicit regenerate of an unpaid, unlocked period) will use. This is verified directly by a test: generate a period, change the person's rate, re-read the already-generated period, assert its stored `gross_cents` is untouched.

## Core data model

Every actor column (`updated_by`, `generated_by`, `regenerated_by`, `locked_by`, `created_by`, `confirmed_by`) is a **composite foreign key against `memberships (organization_id, profile_id)`, not a bare `profiles (id)` reference** — learned directly from Feature 019's post-apply hardening pass, applied proactively here instead of needing a follow-up migration: a bare `profiles` FK only proves the id exists somewhere, not that it belongs to this organization. `reverses_payment_id` is similarly a composite self-reference (`organization_id, reverses_payment_id`) against `payroll_payments (organization_id, id)`, so a correction can never point at a payment belonging to a different organization.

```sql
create table public.payroll_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_rate_cents integer not null check (default_rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id)
);

create table public.payroll_rates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  rate_cents integer not null check (rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  foreign key (organization_id, updated_by) references public.memberships (organization_id, profile_id),
  unique (organization_id, neon_user_id)
);

create table public.payroll_periods (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  period_month date not null,                    -- always the 1st of the month
  hours_snapshot numeric not null check (hours_snapshot >= 0),
  rate_cents_snapshot integer not null check (rate_cents_snapshot >= 0),
  gross_cents integer not null check (gross_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  generated_at timestamptz not null default now(),
  generated_by uuid not null,
  regenerated_at timestamptz,
  regenerated_by uuid,
  locked_at timestamptz,
  locked_by uuid,
  foreign key (organization_id, generated_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, regenerated_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, locked_by) references public.memberships (organization_id, profile_id),
  unique (organization_id, neon_user_id, period_month)
);
create index payroll_periods_org_neon_user_idx on public.payroll_periods (organization_id, neon_user_id);

create table public.payroll_payments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payroll_period_id bigint not null references public.payroll_periods (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  comment text check (comment is null or char_length(comment) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  reverses_payment_id bigint,  -- set only on a correction row
  foreign key (organization_id, created_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, confirmed_by) references public.memberships (organization_id, profile_id),
  foreign key (organization_id, reverses_payment_id) references public.payroll_payments (organization_id, id),
  unique (organization_id, id)  -- lets the self-referencing FK above target this table's (organization_id, id)
);
create index payroll_payments_organization_id_idx on public.payroll_payments (organization_id);
create index payroll_payments_period_id_idx on public.payroll_payments (payroll_period_id);
```

Both new indexes on `payroll_payments` exist because Postgres never indexes a foreign key column automatically: `payroll_period_id` backs the RLS self-select policy's join and every "this period's payments" read; `organization_id` backs the privileged policy's direct filter. `payroll_periods`' own composite index (`organization_id, neon_user_id`) is what the self-select policy's `neon_user_id in (...)` lookup actually uses; `payroll_settings`/`payroll_rates` need no extra index beyond their existing primary key / unique constraint, since neither table is ever self-queried (privileged-only, see below).

**Balance** is never a stored column — always computed as `gross_cents − sum(CONFIRMED payment amount_cents) − sum(adjustment delta_cents)`, all three keyed to the same `payroll_period_id`, never to any row's own date column. **Revised during Phase 3, from this section's original draft-counts-too design**: a draft payment is recorded but does not move balance until confirmed. The original reasoning for counting drafts (preventing an accidental double-pay while something sits unconfirmed) is instead handled by surfacing outstanding drafts as a separate, always-visible figure next to balance, never folded into the number itself — kept visible, just not blended into what's "owed." **Paid stamp**: shown when the computed balance is `≤ 0`.

## Confirm/draft semantics — exactly what "confirm" locks

- **Draft** (the default on creation): amount, date, comment, and `payroll_period_id` are all still editable by a privileged member, and the row is fully **deletable** by one too (owner/manager/assistant manager) — a payment recorded against the wrong person entirely needs to be removable, not just editable, since editing which person it belongs to would corrupt the audit trail worse than deleting a row that was never confirmed. **Does not count toward balance** (revised during Phase 3 from this spec's original design) — recorded, visible to a privileged viewer as a separate "N drafts pending, $X not yet counted" figure, but the official balance number only moves once confirmed.
- **Confirm**: sets `status = 'confirmed'`, `confirmed_at`, `confirmed_by`. From that instant, **amount, date, comment, and status itself all become immutable, and the row becomes undeletable** — enforced by database triggers (below), not merely disabled buttons in the UI. Confirming is also the visibility gate for the regular employee's own view: a payment only ever appears to the person it belongs to once it's confirmed, matching your instruction verbatim ("never draft entries").
- **Correcting a confirmed payment**: never an update to the confirmed row, and never a delete. A privileged member records a new payment with `reverses_payment_id` pointing at the original (negative-effect correction handled as a same-signed new row with an explicit reversal reference, not a negative `amount_cents` — the check constraint requires `amount_cents > 0`, so a reversal is modeled as _its own_ draft/confirm-able entry whose comment and `reverses_payment_id` make the correction traceable, and the balance math naturally accounts for it once confirmed). This preserves the same never-mutate-financial-history discipline the rest of this spec relies on. (This is distinct from `payroll_adjustments`, below — a reversal payment corrects a wrong _payment_; an adjustment corrects a wrong _generated snapshot_ when regeneration is no longer possible. Different problem, different mechanism.)

**A real bypass was found and closed during schema review, before Phase 2**: the first draft of the trigger only guarded `amount_cents`/`payment_date`/`comment` when `old.status = 'confirmed'` _at the time of that specific update_ — it never guarded `status` itself. Any privileged role could flip `status` back to `'draft'` (an update the original guard didn't touch, so it passed) and then edit the now-"unconfirmed" row freely in a second statement, silently rewriting a payment that was supposed to be locked — reachable through the normal app connection, no elevated database access required. Fixed by also forbidding `status` from ever changing away from `'confirmed'` once set: there is no un-confirm path, for any role, ever. A second trigger independently blocks _deleting_ a confirmed row too, as defense in depth beyond the delete policy's own `using` clause (verified directly: even with RLS bypassed entirely, the trigger alone still rejects it — see `supabase/tests/database/0010_payroll_schema_rls.test.sql`).

**A second real bypass was found and closed during a Phase 3 worked-sequence review**: a confirmed payment's amount was frozen, but nothing froze which period it counted against. A raw `update` re-pointing `payroll_period_id` (or `organization_id`) didn't touch any of the guarded columns, so it passed silently — proven live: a confirmed $400 payment against August was re-pointed to September with one `update`, moving its entire credit from August's balance to September's without editing the payment's amount, date, comment, or status at all. Reachable by any privileged role through the normal app connection, since `payroll_payments_update_privileged`'s RLS only asks "is this caller privileged for this organization," never "which columns is this update touching." Fixed by extending the same trigger to also guard `payroll_period_id` and `organization_id` once confirmed — a payment's target, not only its amount, is now exactly as frozen. Re-verified live after the fix: the identical re-point attempt now fails, and both periods' balances are provably unchanged.

```sql
create or replace function private.forbid_confirmed_payment_edit()
returns trigger language plpgsql set search_path = '' as $$
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

create trigger forbid_confirmed_payment_edit
  before update on public.payroll_payments
  for each row execute function private.forbid_confirmed_payment_edit();

create or replace function private.forbid_confirmed_payment_delete()
returns trigger language plpgsql set search_path = '' as $$
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
```

**No role can bypass either trigger through the app.** Triggers fire for every `update`/`delete` statement against the table regardless of which role issued it — unlike RLS, which only governs _whether a row is targeted at all_, a trigger fires once a row is targeted and cannot be skipped by having more privilege. `service_role` (used narrowly elsewhere in this app for Supabase Auth Admin calls, never for payroll writes) bypasses RLS but **not** triggers — RLS bypass and trigger execution are unrelated mechanisms in Postgres. The only way to bypass either trigger is direct Postgres superuser/table-owner access executing `alter table ... disable trigger ...` or setting `session_replication_role = 'replica'` — a database-administration action entirely outside this app's authorization model, not a role reachable by owner, manager, assistant manager, or server through the application.

## Data and authorization — real RLS

Every write policy below is split by operation (insert / update / delete), each with its own `using`/`with check` — a lesson from Feature 019's hardening pass: a single combined `for all` policy is harder to audit than three explicit ones, and an `update` needs both clauses (so a row can't be read under one condition and rewritten to no longer match it).

```sql
alter table public.payroll_settings enable row level security;
alter table public.payroll_rates enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_payments enable row level security;

-- settings and rates: privileged-only, full stop -- nothing here is ever self-visible
create policy "payroll_settings_select_privileged" on public.payroll_settings
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_settings_insert_privileged" on public.payroll_settings
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_settings_update_privileged" on public.payroll_settings
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_select_privileged" on public.payroll_rates
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_insert_privileged" on public.payroll_rates
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_update_privileged" on public.payroll_rates
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- payroll_rates is the one table in this feature where delete is allowed: a
-- row here is current configuration (an override), not financial history --
-- removing it just means "fall back to payroll_settings.default_rate_cents"
-- for the next generation. Nothing financial is lost, since any month
-- already generated has its own frozen rate_cents_snapshot regardless.
create policy "payroll_rates_delete_privileged" on public.payroll_rates
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- periods: privileged read/write everyone; a regular member reads only their own linked period, any status
create policy "payroll_periods_select_privileged" on public.payroll_periods
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_periods_select_self" on public.payroll_periods
  for select to authenticated
  using (
    neon_user_id in (
      select l.neon_user_id from public.attendance_identity_links l
      where l.organization_id = payroll_periods.organization_id
        and l.profile_id = (select auth.uid())
    )
  );

create policy "payroll_periods_write_privileged" on public.payroll_periods
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_periods_update_privileged" on public.payroll_periods
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- payments: privileged read/write everyone; a regular member reads only their own CONFIRMED payments
create policy "payroll_payments_select_privileged" on public.payroll_payments
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_payments_select_self" on public.payroll_payments
  for select to authenticated
  using (
    status = 'confirmed'
    and payroll_period_id in (
      select p.id from public.payroll_periods p
      join public.attendance_identity_links l
        on l.organization_id = p.organization_id and l.neon_user_id = p.neon_user_id
      where l.profile_id = (select auth.uid())
    )
  );

create policy "payroll_payments_write_privileged" on public.payroll_payments
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_payments_update_privileged" on public.payroll_payments
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

-- Privileged AND draft-only: a wrong-person draft is fully removable by
-- owner/manager/assistant manager (a server, per the select-only policy
-- above, has no write grant on this table at all). A confirmed payment
-- never matches `status = 'draft'`, so this policy alone already excludes
-- it from any DELETE's target set -- and the forbid_confirmed_payment_delete
-- trigger above is a second, independent backstop that doesn't rely on this
-- clause staying correctly scoped forever.
create policy "payroll_payments_delete_privileged_draft" on public.payroll_payments
  for delete to authenticated
  using (
    status = 'draft'
    and (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
```

No `delete` policy on `payroll_settings` or `payroll_periods` — every row on those two tables is either configuration-of-record or a financial snapshot, and is only ever superseded, never removed (a period is regenerated, in place, only pre-payment). `payroll_rates` allows delete because an override is current configuration, not history — deleting one has no effect on any already-generated period's frozen snapshot. `payroll_payments` allows delete, but **only** for draft rows, and only for the same three privileged roles as every other write — a confirmed payment is permanently undeletable, enforced twice (the policy's `status = 'draft'` clause, and independently by `forbid_confirmed_payment_delete`).

**Grants follow the same least-privilege discipline as everywhere else**: `revoke all ... from anon, authenticated` first, then only the specific verbs each table's policies actually support (`select, insert, update` for `payroll_settings`/`payroll_periods`; `select, insert, update, delete` for `payroll_rates` and `payroll_payments`) — RLS still governs which _rows_, this only governs which _operations_ are possible at all. Every identity sequence gets `usage` only, not `select` — `nextval()` doesn't need read access to the sequence's own state, the same fix Feature 019's hardening pass made after finding the broader grant was unnecessary.

**Audit events** — one row per: `payroll_rate_changed` (before/after `rate_cents`), `payroll_period_generated`, `payroll_period_regenerated` (before/after `gross_cents`), `payroll_period_locked`, `payroll_payment_recorded`, `payroll_payment_confirmed`, `payroll_payment_edited` (draft-only edits), `payroll_payment_deleted` (draft-only), `payroll_payment_reversed`.

## Views

- **Privileged**: month-to-month by default (current calendar month), same period-filter shape as Feature 018/019 (This month / Previous month / custom range) and the same person filter/"All." Every period, every payment (draft and confirmed), and every adjustment visible; draft payments shown as a separate pending figure, not folded into balance.
- **Regular employee**: no person picker (same reasoning as [[019]] — nothing to pick). Their own `payroll_periods` rows for the selected period, their own **confirmed-only** `payroll_payments`, their own adjustments. **Balance is identical in formula and in value to what a privileged viewer sees for the same period** (Phase 3 revision: since balance now only counts confirmed payments for everyone, not draft, there is no longer a divergence to explain — the two views were only ever going to differ while a draft existed, and drafts no longer factor into either one's balance). A draft payment recorded against them stays invisible until confirmed, exactly as originally specified.

## Payroll dashboard

**Built in Phase 4 exactly to the simpler shape you asked for when the phase started** — two summary tiles plus a two-column per-person table, not the original mockup's fuller Hours/Rate/Generated/Paid/Status breakdown with a period/person filter (that richer table already exists separately, as the periods list + per-period ledger panel built in Phases 2–3; the dashboard is a second, purely aggregate view on top of it, not a replacement):

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Total balance still owed     │  │ Generated last month         │
│           $4,230.00          │  │           $18,540.00         │
└─────────────────────────────┘  └─────────────────────────────┘

Balance per person
┌────────────┬───────────────────────┬─────────┐
│ Person     │ Total payroll (all-time) │ Balance │
├────────────┼───────────────────────┼─────────┤
│ Anil (Mgr) │ $1,000.00              │ $100.00 │
│ Tanya      │ $1,038.00               │  $0.00 Paid ✓ │
└────────────┴───────────────────────┴─────────┘
```

"Total balance still owed" sums, across **every generated period in the organization**, that period's own balance clamped to zero before summing — an overpaid month for one person never offsets what's still owed to someone else, or even to that same person in a different month (proven directly: a live worked example with one person owed $600 and a different person overpaid by $100 nets to exactly $600 total owed, not $500). "Generated last month" is always literally last calendar month relative to today, independent of any filter elsewhere on the page. The per-person table's "Total payroll" is a lifetime sum of `gross_cents` across all of that person's periods; "Balance" is their own **net**, unclamped balance across all their periods (so an overpayment shows as negative — genuinely useful to know for one person, unlike the clamped org-wide total).

**Every number here is keyed on `payroll_period_id`, exactly like the Phase 3 balance query, and computed by reusing that same function (`getPayrollBalance`) per period — never a second, independently-written aggregation that could disagree with it.** No new SQL aggregation exists for this dashboard; it is `listPayrollPeriods` (already RLS-scoped, already used by every other payroll view) plus `getPayrollBalance` (already proven in Phase 3's worked sequences) summed and grouped in plain JS.

**Non-privileged dashboard**: the identical fetch — `getPayrollAccessAction`'s `self` scope makes `listPayrollPeriods`/`getPayrollBalance` return only that person's own rows via RLS, the same pattern the ledger panel already uses — collapsed to three tiles: their own balance, their own total generated last month, and their own all-time total generated. Not a separate, differently-scoped implementation.

## Export

Recommended default, avoiding a new dependency per `AGENTS.md`:

- **PDF**: a dedicated print stylesheet (`@media print`) on a payroll-statement view — restaurant name/period/person header, a generated-vs-paid line-item table, running balance, footer — triggered by the browser's native print-to-PDF (`window.print()`), the same "no new library" approach as any other printable view in this codebase. Produces a genuinely paginated, properly laid-out document without adding a PDF-generation dependency.
- **Excel**: CSV export (a `Blob` + anchor-download of a properly quoted CSV, generated client-side from already-loaded report data) — opens directly in Excel/Sheets. Not a native `.xlsx` (no cell formatting/formulas) — if true `.xlsx` output with formatting is wanted later, that's a real new dependency (e.g. `exceljs`) and is called out below as an open question rather than assumed.

## Phase plan

Five phases, one per session, full validation (`npm run check`, `npm test`, `npm run build`, live verification against real Neon/Supabase data where applicable) and a stop for review between each, exactly as requested.

1. **Schema + RLS** (done, PR #16) — all four tables (with tenant-composite actor foreign keys and the FK/policy indexes applied from the start, not as a follow-up), the confirmed-payment-immutability trigger (later hardened further, before Phase 2, to also forbid un-confirming — see Build notes below), every split policy above, pgTAP coverage. No application code changes. Doc sweep: `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/PRD.md`'s scope line.
2. **Generation + snapshot** (done, this PR) — `resolveEffectiveRateCents`, `generatePayrollPeriodAction`, `regeneratePayrollPeriodAction` (blocked once any payment exists, or once locked), `lockPayrollPeriodAction`, plus rate-setting actions (`setPayrollDefaultRateAction`, `setPayrollRateOverrideAction`, `removePayrollRateOverrideAction` — needed as a prerequisite for generation to have anything to compute with, not explicitly named in the original phase list but in scope for the same reason); the single-`Math.round` cent computation with its drift-focused unit tests; a minimal privileged-only, real-mode-only Payroll screen listing generated periods per person, live-verified against real Neon hours end-to-end. See Build notes below.
3. **Payments + balance** (done, this PR) — `payroll_adjustments` (schema + RLS, append-only), record/edit(draft-only)/delete(draft-only)/confirm payment actions, `recordAdjustmentAction`, `getPayrollBalance`/`getPayrollLedgerAction` (a single formula shared by both privileged and self scope, relying on RLS to scope the underlying rows rather than two separately-filtered queries), the Paid stamp, self-view scoping wired to [[019]]'s `attendance_identity_links` via the same `resolvePayrollAccess` shape Attendance established. See Build notes below.
4. **Dashboard** (done, this PR) — `getPayrollDashboardAction`: total balance still owed (org-wide, clamped per period before summing), previous month's total generated, balance and lifetime total per person; the identical fetch collapsed to three tiles for a self-scoped viewer. Read-only aggregation only, no new writes; every figure keyed on `payroll_period_id` via the same `listPayrollPeriods`/`getPayrollBalance` Phase 3 already established. See Build notes below.
5. **Export** — the print stylesheet/PDF flow and the CSV download, for both the privileged full report and a single person's statement.

## Acceptance criteria

- [ ] Given a privileged member, when they generate a period, then `payroll_periods` gets exactly one row with a frozen `hours_snapshot`/`rate_cents_snapshot`/`gross_cents`, and re-reading it after Neon hours change shows the unchanged snapshot.
- [ ] Given a period with at least one payment recorded (draft or confirmed), when a privileged member attempts to regenerate it, then the action is refused.
- [ ] Given a confirmed payment, when any update to its amount/date/comment is attempted (application code or a raw SQL update), then the database trigger rejects it.
- [ ] Given a regular employee linked to a Neon user, when they open Payroll, then they see only their own generated totals and only their own confirmed payments — never a draft, never another person.
- [ ] Given the same employee with an unconfirmed payment recorded against them, when they view their balance, then it reflects only confirmed payments (a legitimately different number from the privileged balance), with UI copy explaining the difference.
- [ ] Given a rate change for a person, when an already-generated period for that person is re-read, then its stored `gross_cents` is unchanged.
- [ ] Given the RLS test suite, then a regular member's direct query against `payroll_periods`/`payroll_payments` for another person, or for a draft payment, returns zero rows — proven at the database level, not only hidden in the UI.
- [ ] Given a set of (hours, rate_cents) pairs including drift-prone decimals, then `gross_cents` output matches a hand-computed integer-cent table exactly.

## Decisions and risks

- **Decision, superseded in Phase 3**: this section originally had unconfirmed payments counting toward balance immediately, to prevent double-payment risk. Revised once adjustments existed as the formal correction path: balance now counts confirmed payments only; an outstanding draft is surfaced as a separate, always-visible figure instead of being blended into the number. See Phase 3's build notes.
- **Decision**: corrections are always new rows (`reverses_payment_id`), never mutations of a confirmed row — matches the append-only discipline `audit_events` already establishes elsewhere in this codebase.
- **Decision**: `payroll_rates`/`payroll_periods` key on `neon_user_id`, not `profile_id` — payroll must be generatable for every active Neon user a manager wants to pay, regardless of whether that person has (or ever gets) a linked Lineup account; the `attendance_identity_links` table from [[019]] is consulted only to resolve a _regular signed-in user's own_ scope, never as a requirement for generation itself.
- **Risk**: no overtime-rate support in this version — flat rate × hours only. Flagged, not built, per your instruction to keep scope to what's specified.
- **Risk**: true `.xlsx` export (vs. CSV) is a real new dependency decision, deliberately left open below rather than assumed.
- **Decision**: payroll and tips are fully independent systems, confirmed above — no shared tables, no shared functions, no derived figures in either direction.
- **Decision, found during schema review before Phase 2**: the first draft of the confirmed-payment trigger didn't guard `status` itself, leaving a two-statement bypass (un-confirm, then edit) reachable by any privileged role with no elevated access. Closed by forbidding `status` from ever leaving `'confirmed'`. `payroll_payments` also gained a delete policy scoped to `status = 'draft'` only, so a wrong-person draft is removable without corrupting the audit trail by editing which person it belongs to — a confirmed row stays permanently undeletable, backed by both the policy and an independent trigger.
- **Decision**: the post-payment correction mechanism is a manual `payroll_adjustments` line item (delta + mandatory reason), never an edit to a generated snapshot or a payment — designed now, built in a later phase, so Phase 2's generation/regeneration logic can be written against a settled design instead of guessing at it.
- **Decision, found during a Phase 2 worked-sequence review, before Phase 3**: "a payment exists → regeneration is refused" was true, but only as an application-layer guard (`regeneratePayrollPeriodAction`'s own payment-count check) — a raw `update` against `payroll_periods`, issued directly and bypassing the Server Action entirely, was proven (not merely suspected) to succeed even with a payment on record. Closed by `private.forbid_payroll_period_snapshot_edit`, a trigger scoped to exactly `hours_snapshot`/`rate_cents_snapshot`/`gross_cents` that rejects any change to those columns once a `payroll_payments` row exists for the period — independent of caller, role, or code path, the same standard already applied to confirmed-payment immutability. Verified twice: pgTAP (four new assertions: a zero-payment period's snapshot is freely updatable, a period with a payment rejects the identical shape of update, and locking a paid period still works), and a worked SQL sequence re-run before and after the fix, showing the exact error message the raw update now produces.
- **Decision, found during a Phase 3 worked-sequence review**: a confirmed payment's amount was frozen, but its _target_ wasn't — a raw `update` re-pointing `payroll_period_id` (or `organization_id`) to a different period didn't touch any of the columns the original trigger guarded, so it passed silently, proven live by moving a real $400 credit from August's balance to September's with one `update`. Closed by extending `forbid_confirmed_payment_edit` to also guard `payroll_period_id` and `organization_id` once confirmed. Verified the same way as the regenerate-boundary finding: three new pgTAP assertions, and the identical worked SQL sequence (RLS bypassed entirely, no Server Action involved) re-run before and after the fix, showing both periods' balances provably unchanged afterward.

## Open questions for your approval

1. Export: CSV-for-Excel + print-for-PDF (no new dependency) as the default, or do you want native `.xlsx` formatting badly enough to justify adding a library (e.g. `exceljs`) now?
2. `payroll_settings`/`payroll_rates` are organization-wide (one default, per-person overrides) with no location split — confirming that's right for a single-location-per-org setup today, since nothing in the current schema suggests per-location pay rates are needed.

Phase plan and table design are approved.

## Build notes — Phase 2

- **`src/features/payroll/`** — `domain/calculate-payroll.ts` (pure: `computeGrossCents`, `resolveEffectiveRateCents`, `normalizePeriodMonth`, `monthDateRange`, each independently unit-tested — 18 tests, including drift-prone hand-verified-in-Node cases like `7.15 * 950 = 6792.5 → 6793`), `data/payroll-data.ts` (Supabase queries, mirroring `identity-links.ts`'s untyped-client/manual-mapping/compensating-audit-rollback pattern exactly), `actions/payroll-actions.ts` (Server Actions, `zod`-validated inputs throughout), `components/payroll-workspace.tsx` (the minimal screen).
- **Demo mode deliberately not supported this phase** — the Payroll tab only appears for a manager/owner in real mode (`isManager && !demoMode`), matching how Attendance was manager-only before Feature 019 opened it up. Building demo-mode parity (an in-memory `payroll_periods`-shaped store, the way `demoAttendanceLinks` mirrors the real table) is real additional work with no bearing on this phase's actual goal — proving generation computes correctly against real Neon hours — so it's deferred, named explicitly rather than silently missing.
- **Generate vs. regenerate are two separate actions**, not one upsert: `generatePayrollPeriodAction` refuses outright (a clear, actionable error) if a period already exists for that person/month, directing the caller to Regenerate; `regeneratePayrollPeriodAction` refuses if the period is locked or has any payment (draft or confirmed) recorded against it — the exact rule from hard question 1 and its "messy middle" answer, now actually enforced in code, not just described in prose. Both compute the snapshot identically (`computeSnapshot`, shared): resolve the effective rate fresh (override, else org default, else a clear "set a rate first" error), fetch that month's real hours from Neon via the exact same `getAttendanceRows` attendance-data.ts already uses, aggregate with the exact same `aggregateHours` (excluded-null-hours rows counted, never silently dropped), then `computeGrossCents` once.
- **Live-verified against the real hosted Neon and Supabase projects**, not just pgTAP/unit tests: a throwaway script queried the real `attendance` table with the exact literal `ATTENDANCE_QUERY_SQL` this app's own code uses, found a real person (Anil, Manager designation, Neon id 13) with 27 real August 2026 attendance rows totaling 295.37 hours, computed the expected gross at an arbitrary non-round rate (1234 cents/hr → 364487 cents), inserted a `payroll_periods` row into the real hosted table with that exact shape, read it back and confirmed both `hours_snapshot` and `gross_cents` matched exactly, then deleted the row — the hosted table was left exactly as it started. An interactive browser walkthrough (sign in as a real manager, click through Generate/Regenerate/Lock) was not performed in this session, since no live passcode was available to it; the script above verifies the same underlying data path the UI calls into, end-to-end against real data, which is what "live-verified" is actually checking.
- **Full validation**: `npm run check` clean; `npm test` — 166 passed across 26 files (148 carried over + 18 new payroll-domain tests); `npm run build` clean. No schema changes this phase, so no new pgTAP run was needed beyond Phase 1's 149 assertions, which remain passing.

## Build notes — Phase 3

- **Balance formula revised before this phase was built**, per explicit review: draft payments no longer count toward balance at all (a real change from this doc's original design — see the updated "Balance" and "Confirm/draft semantics" sections above). The rationale for counting drafts (preventing an accidental double-pay) is preserved a different way: a privileged viewer sees outstanding drafts as a separate, always-visible figure next to balance, never blended into the number itself. A direct, welcome consequence: the privileged and self-service balance are now the exact same formula and the exact same value for a given period — there is no longer a legitimate divergence between the two views to explain in the UI.
- **`payroll_adjustments`** — a new table, append-only by construction: `select, insert` granted, `update`/`delete` never granted to any role, so "an adjustment is immutable once created" doesn't depend on a policy staying correctly scoped, the same defense-in-depth principle as the two triggers on `payroll_payments`. Self-visible immediately (no draft state, unlike payments) via the identical `attendance_identity_links` join `payroll_payments_select_self` already uses.
- **`resolvePayrollAccess`** (payroll-actions.ts) is the same three-scope (`all`/`self`/`unlinked`) shape as Attendance's `resolveAttendanceAccess`, reusing the identical `attendance_identity_links` row via `getOwnAttendanceLink` rather than a second linking mechanism. Every write action (rates, generate/regenerate/lock, recording/editing/deleting/confirming a payment, recording an adjustment) still requires `scope === "all"`; read actions (`listPayrollPeriodsAction`, `getPayrollLedgerAction`) accept `self` too and run the identical query privileged callers use — `payroll_periods`/`payroll_payments`/`payroll_adjustments`'s own RLS self-select policies do the actual row-scoping, not a second app-layer filter that could disagree with it.
- **A payment targets its period by `payroll_period_id` alone, never by its own `payment_date`** — proven directly (not merely by code inspection) with the exact sequence requested: a real `generatePayrollPeriod` call for August at $1000, a real `recordPayment`+`confirmPayment` for $400 dated September 1, a real `getPayrollBalance` read showing $600, a second $500 payment dated September 2, and a final balance of $100 — run through the actual, unmodified `payroll-data.ts` functions (not a mock, not the pure domain formula in isolation) against a real local Postgres instance via a plain `@supabase/supabase-js` client (service role, bypassing RLS deliberately — RLS itself is proven separately and exhaustively in pgTAP; this proof is about the balance _calculation_, not authorization). `listPaymentsForPeriod`/`listAdjustmentsForPeriod` (payroll-data.ts) filter exclusively on `payroll_period_id`; neither function's query, nor `getPayrollBalance`'s aggregation of their results, ever reads `payment_date` for any purpose other than display and ordering.
- **The adjustment escape hatch, proven the same way**: a real $400 payment confirmed (frozen — the two Phase 1 triggers make it genuinely uneditable and undeletable through this same script, confirmed live when cleanup attempted a cascade delete and the trigger rejected it), balance read as $600, a real `-$360` adjustment recorded, balance re-read as $960 — equivalent to a net $40 credited (400 − 360 = 40, i.e. as if only a $40 payment had been made: $1000 − $40 = $960) — with `confirmedPaymentsCents` in the balance result still reading $400 afterward, proving the original payment row itself was never touched. Both the payment and the adjustment remain in the ledger.
- **UI**: `PayrollWorkspace` now branches on `getPayrollAccessAction`'s result exactly like `AttendanceReport` does. A privileged viewer gets the existing rate/generate/periods screen plus a "View payments" toggle per period opening a ledger panel (balance tiles, payment table with Confirm/Delete for drafts, adjustment table, a record-payment form, a record-adjustment form). A self-scoped viewer gets a month picker and the same ledger panel in read-only mode — literally the same `PeriodLedgerPanel` component with `readOnly` set, not a parallel implementation that could drift from the privileged one.
- **Full validation**: `npm run check` clean; `npm test` — 171 passed across 26 files (166 carried over + 5 new: `computeBalanceCents`, including the spec's own worked numbers, and `isFullyPaid`); `npm run build` clean; `npx supabase test db` — 171 pgTAP assertions across 11 files, all passing (15 new for `payroll_adjustments`, covering append-only-ness, self-visibility with no draft gate, and the composite tenant FK; the total reflects the payment-target-lock fix cascaded down from Phase 1 after this branch was rebased). Migration applied to the hosted Supabase project; types regenerated.

## Build notes — Phase 4

- **Read-only aggregation, confirmed by construction, not just by description**: `getPayrollDashboardAction` never calls an `insert`/`update`/`delete` anywhere in its own body or in anything it calls (`listPayrollPeriods`, `getPayrollBalance` — both already-existing, already-proven read functions from Phase 2/3). No new migration this phase.
- **Every aggregate keyed on `payroll_period_id`, exactly as instructed** — `totalBalanceOwedCents` is `Σ max(0, getPayrollBalance(period).balanceCents)` over every period `listPayrollPeriods` returns; `previousMonthGeneratedCents` filters on `period.periodMonth` (the frozen snapshot's own month, not any payment's date) equalling a new pure helper, `previousPeriodMonth`; per-person `balanceCents`/`totalGeneratedCents` are the same two figures grouped by `period.neonUserId`. No second, independently-written SQL aggregation exists anywhere in this feature — the entire dashboard is `listPayrollPeriods` plus `getPayrollBalance` summed and grouped in plain JS, so it cannot silently drift from the balance figure Phase 3's worked sequences already proved correct.
- **A deliberate asymmetry, named explicitly**: the org-wide "total balance still owed" clamps each period's balance to zero _before_ summing (an overpaid month for one person never offsets what's still owed to someone else, or even to that same person in a different month), while a single person's own "balance" (both in the per-person table and the self-service tile) is their **net**, unclamped total across all their periods (so an overpayment shows as a real negative number, which is the useful answer when looking at one person specifically). Proven live, not just asserted: a worked example with Anil owed a net $600 across his periods and Tanya overpaid by a net $100 across hers aggregates to an org-wide total of exactly $600 — Tanya's overpayment does not quietly erase $100 of what's still owed to Anil.
- **Self-service dashboard is the identical fetch, not a parallel implementation**: `getPayrollAccessAction`'s `self` scope means `listPayrollPeriods` and `getPayrollBalance` return only that person's own rows via RLS (the exact mechanism the ledger panel already relies on) — the dashboard component branches only on how to _display_ the result (three tiles instead of two tiles plus a table), never on how to _fetch_ it.
- **`timeZone` is now threaded into `PayrollWorkspace`** (previously only `restaurantSlug`) so "previous month" resolves against the restaurant's own local date via `zonedWallTimeFromInstant`, the same convention every other date-sensitive figure in this app already follows — never the server's or browser's own clock.
- **Live-verified beyond unit tests**: a throwaway script exercised the real `listPayrollPeriods`/`getPayrollBalance`/`recordPayment`/`confirmPayment`/`recordAdjustment` functions against local Postgres with two real people in mixed owed/overpaid states, reproducing the dashboard's exact aggregation loop and confirming the numbers above, then confirming a further `-$200` adjustment moved both the person's own balance and would move the org total by the identical amount.
- **Full validation**: `npm run check` clean; `npm test` — 173 passed across 26 files (171 carried over + 2 new: `previousPeriodMonth`); `npm run build` clean; `npx supabase test db` — 171 pgTAP assertions across 11 files, unchanged (no schema this phase).
