# Feature 020 — Payroll

**Name:** Payroll (rates, generation, payments, balance, dashboard, export)
**Owner:** Krapa Goutam
**Status:** discovery (spec + phase plan only — no code written yet)
**Issue/PR:**

## This is a deliberate PRD expansion, not a narrow carve-out

`docs/PRD.md`'s "Out of scope for MVP" line currently reads: *"Payroll, clock-in/out, POS settlement, reservations, and waitlist marketplace integrations — **except** read-only display of already-existing attendance data from a separate external system (Feature 018)..."* — that carve-out was explicitly scoped to **display only, no computation, no write path**. Feature 020 is the opposite of that: it computes money from attendance hours, and it writes and stores financial records. This is not an extension of the 018 exception; it is a new, deliberate decision to bring payroll into MVP scope. **This confirms up front, per your instruction, that payroll persists in Supabase — its own tables, its own RLS, its own audit trail — never `useState`, never Neon.** Neon remains read-only and is used only as the hours *input* to generation, exactly the way it already is for Feature 018/019; nothing is ever written back to Neon. If this spec is approved, the PRD update (rewriting the "Out of scope" line to record payroll as in-scope, not as a second narrow exception) is part of Phase 1's doc sweep, not done now.

## User outcome

An owner, manager, or assistant manager can set pay rates, generate a person's monthly payroll from their Neon attendance hours, record and confirm payments against it, watch the balance count down as payments land, and see a dashboard of who's owed what — all backed by real Supabase tables with row-level security, not client state. A regular employee can see their own generated payroll and their own confirmed payments only — never anyone else's, never a draft entry that could still change. Every report is exportable as a PDF-style printout and as a spreadsheet.

## Scope

- **In**: `payroll_settings` (org default rate), `payroll_rates` (per-person override), `payroll_periods` (the snapshot — one row per person per month), `payroll_payments` (multiple per period); generate/regenerate/lock actions; record/edit/confirm payment actions; balance computation and the Paid stamp; the dashboard; PDF-via-print and CSV export; full RLS; a full audit trail.
- **Out**: any write path back into Neon (still strictly read-only, per 018/019). Tax withholding, deductions, or any payroll-compliance computation beyond gross hours × rate. Direct deposit or any real money movement — this system *records* that a payment happened outside it, it never sends money. Multi-currency. Overtime-rate rules (flagged as a likely fast-follow, not built here — every hour is paid at the same rate in this version).

## The four hard questions, answered directly

### 1. Neon hours are live and can change after a payment is recorded — does the generated payroll recompute?

**No — never silently.** `payroll_periods` is a **snapshot**, written once at generation time (`hours_snapshot`, `rate_cents_snapshot`, `gross_cents` all stored as plain columns, not derived at read time). Generation happens the moment a manager asks for it — not deferred until month close — because managers need to record payments mid-month (an advance against a still-open month is a real, normal case). Once a period is generated:

- A manager can explicitly **Regenerate** it — re-pulls current Neon hours, re-resolves the current rate, and overwrites the snapshot — but **only while the period has zero payments recorded against it (draft or confirmed) and is not locked.** The instant a single payment exists, regeneration is blocked outright. This is the direct fix for "a recorded payment against a moving total is a real problem": the total simply cannot move anymore once money has been recorded against it. Every regenerate is an audit event carrying the before/after gross amount, so a manager can never lose the history of what changed.
- **Lock** is a separate, one-way action (owner/manager/assistant manager) that freezes a period permanently — no further regeneration, ever, even if it had zero payments. Locking is optional, not required to record payments; it exists for "this month is closed, don't touch it again" peace of mind once a manager is done reconciling.
- If Neon hours change after generation and a manager wants that reflected, they must explicitly regenerate (only possible pre-payment) — there is no background job, no automatic recompute, and no silent drift.

### 2. Rounding — cents must reconcile exactly, no floating-point drift

All money is **integer cents**, matching `tip_intervals.amount_cents` and `calculate-tip-splits.ts`'s `dollarsToCents` convention — no dollar-typed column, no float, anywhere in the schema or the domain layer. Rate is stored as `rate_cents` (an integer — e.g. $10.00/hr is `1000`), never as a float dollar amount.

Unlike the tip split, payroll generation is **not** distributing a shared pool across people — each person's gross pay is computed independently from their own hours and their own rate, so there is no cross-person remainder to allocate and `allocateTipInterval`'s remainder-distribution algorithm doesn't apply here. What *does* apply, with the same rigor, is: **exactly one rounding operation, ever, per person-month** — `gross_cents = Math.round(hours_snapshot * rate_cents)` — computed once at generation time and stored as the immutable integer it produces. `hours_snapshot` itself is stored as the exact numeric value Neon returned (`numeric`, not `float8`, avoiding a second, earlier source of drift), so the only floating-point-adjacent operation in the entire pipeline is that single final `Math.round`, never repeated, never re-derived from re-multiplying stored floats. A unit test asserts this directly: a table of (hours, rate_cents) pairs with known correct cent outputs, including deliberately drift-prone values (e.g., `33.333333` hours), asserting exact integer equality — the same style of test `calculate-tip-splits.ts` already has for its own rounding.

Payments are entered directly in cents (a dollar-and-cents UI input converted once, at the input boundary, via the existing `dollarsToCents` helper reused as-is rather than reimplemented) — never accumulated from anything computed.

### 3. What stops a regular user reading another person's payments at the database level

Real RLS, not a UI hide — shown in full under **Data and authorization** below. In short: `payroll_periods` and `payroll_payments` both carry `organization_id`; a privileged member (owner/manager/assistant manager, via `private.has_org_role`) can read every row in their organization; a regular member can only read rows whose `neon_user_id` matches the one row in [[019]]'s `attendance_identity_links` where `profile_id = auth.uid()` — and even then, `payroll_payments` additionally requires `status = 'confirmed'`, enforced in the `using` clause itself, not filtered in application code after the fact. A regular member with no link row (the Feature 019 "unlinked" case) matches nothing and sees nothing, for the identical reason unlinked attendance shows nothing.

### 4. Pay rate changes — do they affect already-generated months?

**No.** `payroll_rates` holds only the *current* override (or its absence, meaning "use `payroll_settings.default_rate_cents`") — it is not consulted at read time for a month that has already been generated. The rate that mattered is frozen forever in that period's own `rate_cents_snapshot` column the moment generation happened. Changing `payroll_rates` today only changes what the *next* generation (a new month, or an explicit regenerate of an unpaid, unlocked period) will use. This is verified directly by a test: generate a period, change the person's rate, re-read the already-generated period, assert its stored `gross_cents` is untouched.

## Core data model

```sql
create table public.payroll_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_rate_cents integer not null check (default_rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id)
);

create table public.payroll_rates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  rate_cents integer not null check (rate_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
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
  generated_by uuid not null references public.profiles (id),
  regenerated_at timestamptz,
  regenerated_by uuid references public.profiles (id),
  locked_at timestamptz,
  locked_by uuid references public.profiles (id),
  unique (organization_id, neon_user_id, period_month)
);

create table public.payroll_payments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payroll_period_id bigint not null references public.payroll_periods (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  comment text check (comment is null or char_length(comment) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  reverses_payment_id bigint references public.payroll_payments (id)  -- set only on a correction row
);
```

**Balance** is never a stored column — always computed as `gross_cents − sum(amount_cents)` over *every* payment on the period, draft and confirmed alike. Unconfirmed payments count toward balance deliberately (answered below under "confirm/draft semantics") so a manager can never accidentally double-pay while a payment sits in draft. **Paid stamp**: shown when that computed balance is `≤ 0`.

## Confirm/draft semantics — exactly what "confirm" locks

- **Draft** (the default on creation): amount, date, and comment are all still editable by a privileged member. Counts toward balance immediately — the money already left hand-to-hand when it was recorded; draft only means "not yet reconciled/finalized," not "didn't happen."
- **Confirm**: sets `status = 'confirmed'`, `confirmed_at`, `confirmed_by`. From that instant, **amount, date, and comment become immutable** — enforced by a database trigger (below), not merely disabled buttons in the UI. Confirming is also the visibility gate for the regular employee's own view: a payment only ever appears to the person it belongs to once it's confirmed, matching your instruction verbatim ("never draft entries").
- **Correcting a confirmed payment**: never an update to the confirmed row. A privileged member records a new payment with `reverses_payment_id` pointing at the original (negative-effect correction handled as a same-signed new row with an explicit reversal reference, not a negative `amount_cents` — the check constraint requires `amount_cents > 0`, so a reversal is modeled as *its own* draft/confirm-able entry whose comment and `reverses_payment_id` make the correction traceable, and the balance math naturally accounts for it once confirmed). This preserves the same never-mutate-financial-history discipline the rest of this spec relies on.

```sql
create or replace function private.forbid_confirmed_payment_edit()
returns trigger language plpgsql as $$
begin
  if old.status = 'confirmed'
     and (new.amount_cents is distinct from old.amount_cents
          or new.payment_date is distinct from old.payment_date
          or new.comment is distinct from old.comment) then
    raise exception 'Cannot edit a confirmed payment; record a correction instead.';
  end if;
  return new;
end;
$$;

create trigger forbid_confirmed_payment_edit
  before update on public.payroll_payments
  for each row execute function private.forbid_confirmed_payment_edit();
```

## Data and authorization — real RLS

```sql
alter table public.payroll_settings enable row level security;
alter table public.payroll_rates enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_payments enable row level security;

-- settings and rates: privileged-only, full stop -- nothing here is ever self-visible
create policy "payroll_settings_privileged" on public.payroll_settings
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "payroll_rates_privileged" on public.payroll_rates
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

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
```

No `delete` policy on any of the four tables — payroll rows are never deleted, only superseded (a rate override changes going forward; a payment is corrected via a reversal row, never removed). This matches the append-only-audit spirit of `audit_events` itself.

**Audit events** — one row per: `payroll_rate_changed` (before/after `rate_cents`), `payroll_period_generated`, `payroll_period_regenerated` (before/after `gross_cents`), `payroll_period_locked`, `payroll_payment_recorded`, `payroll_payment_confirmed`, `payroll_payment_edited` (draft-only edits), `payroll_payment_reversed`.

## Views

- **Privileged**: month-to-month by default (current calendar month), same period-filter shape as Feature 018/019 (This month / Previous month / custom range) and the same person filter/"All." Every period and every payment, draft and confirmed, visible.
- **Regular employee**: no person picker (same reasoning as [[019]] — nothing to pick). Their own `payroll_periods` rows for the selected period, their own **confirmed-only** `payroll_payments`. A draft payment recorded against them is invisible until a manager confirms it — the balance they see is therefore based only on what they can see (gross minus confirmed payments), which can legitimately differ from the privileged balance (gross minus all payments) while something is still in draft; this is intentional, not a bug, and is called out in the UI copy so it's never mistaken for a discrepancy.

## Payroll dashboard

Recommended layout — two summary cards, then one table (privileged view):

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Total balance still owed     │  │ Total payroll generated      │
│ (everyone, all periods)      │  │ (previous calendar month)    │
│           $4,230.00          │  │           $18,540.00         │
└─────────────────────────────┘  └─────────────────────────────┘

Per-person breakdown (respects the person/period filter below it)
┌────────────┬───────┬────────┬───────────┬───────────┬─────────┬──────────┐
│ Name       │ Hours │ Rate   │ Generated │ Paid      │ Balance │ Status   │
├────────────┼───────┼────────┼───────────┼───────────┼─────────┼──────────┤
│ Anil (Mgr) │ 100.0 │ $10/hr │ $1,000.00 │ $900.00   │ $100.00 │ Outstanding │
│ Tanya      │  86.5 │ $12/hr │ $1,038.00 │ $1,038.00 │   $0.00 │ Paid ✓   │
└────────────┴───────┴────────┴───────────┴───────────┴─────────┴──────────┘
```

"Total balance still owed" sums positive balances across **every generated period to date**, independent of the period filter — it's a running "what do I currently owe everyone" figure, not scoped to whichever month is being browsed below. "Total payroll generated (previous month)" is always literally last calendar month, a fixed, unambiguous reference point (deliberately not "the selected period," so this tile answers one specific recurring question — "what did we run last month" — without depending on filter state). The per-person table *does* respect the person/period filter, and each row is clickable through to that person's month: generated snapshot detail, payment history, confirm/edit/reverse actions.

**Non-privileged dashboard**: the same two-card-plus-row shape, collapsed to exactly one row — their own.

## Export

Recommended default, avoiding a new dependency per `AGENTS.md`:

- **PDF**: a dedicated print stylesheet (`@media print`) on a payroll-statement view — restaurant name/period/person header, a generated-vs-paid line-item table, running balance, footer — triggered by the browser's native print-to-PDF (`window.print()`), the same "no new library" approach as any other printable view in this codebase. Produces a genuinely paginated, properly laid-out document without adding a PDF-generation dependency.
- **Excel**: CSV export (a `Blob` + anchor-download of a properly quoted CSV, generated client-side from already-loaded report data) — opens directly in Excel/Sheets. Not a native `.xlsx` (no cell formatting/formulas) — if true `.xlsx` output with formatting is wanted later, that's a real new dependency (e.g. `exceljs`) and is called out below as an open question rather than assumed.

## Phase plan

Five phases, one per session, full validation (`npm run check`, `npm test`, `npm run build`, live verification against real Neon/Supabase data where applicable) and a stop for review between each, exactly as requested.

1. **Schema + RLS** — all four tables, the confirmed-payment-immutability trigger, every policy above, pgTAP coverage (privileged full access; regular member sees only their own linked, confirmed data; the two "no delete policy" and "no self-write" assertions; the rate-change-doesn't-touch-past-periods assertion at the SQL level). No application code changes. Doc sweep: `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/PRD.md`'s scope line.
2. **Generation + snapshot** — `resolveEffectiveRate`, `generatePayrollPeriod`, `regeneratePayrollPeriod` (blocked once any payment exists), `lockPayrollPeriod` Server Actions; the single-`Math.round` cent computation with its drift-focused unit tests; a minimal privileged-only Payroll screen listing generated periods per person (read-only at this stage) so generation can be live-verified against real Neon hours end-to-end.
3. **Payments + balance** — record/edit(draft-only)/confirm/reverse payment actions, the confirmed-immutability behavior exercised live, balance computation (privileged and self-scoped versions), the Paid stamp, self-view scoping wired to [[019]]'s `attendance_identity_links`.
4. **Dashboard** — the two summary cards, the per-person table, the period/person filters, the non-privileged collapsed view.
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

- **Decision**: unconfirmed payments count toward balance immediately, to prevent double-payment risk; confirm's role is locking the record for audit integrity and gating self-visibility, not gating whether the money "counts."
- **Decision**: corrections are always new rows (`reverses_payment_id`), never mutations of a confirmed row — matches the append-only discipline `audit_events` already establishes elsewhere in this codebase.
- **Decision**: `payroll_rates`/`payroll_periods` key on `neon_user_id`, not `profile_id` — payroll must be generatable for every active Neon user a manager wants to pay, regardless of whether that person has (or ever gets) a linked Lineup account; the `attendance_identity_links` table from [[019]] is consulted only to resolve a *regular signed-in user's own* scope, never as a requirement for generation itself.
- **Risk**: no overtime-rate support in this version — flat rate × hours only. Flagged, not built, per your instruction to keep scope to what's specified.
- **Risk**: true `.xlsx` export (vs. CSV) is a real new dependency decision, deliberately left open below rather than assumed.

## Open questions for your approval

1. Phase plan and table design as above — approve to build Phase 1 first?
2. Export: CSV-for-Excel + print-for-PDF (no new dependency) as the default, or do you want native `.xlsx` formatting badly enough to justify adding a library (e.g. `exceljs`) now?
3. `payroll_settings`/`payroll_rates` are organization-wide (one default, per-person overrides) with no location split — confirming that's right for a single-location-per-org setup today, since nothing in the current schema suggests per-location pay rates are needed.
