# V2-006 — Native Payroll identity and duplicate-consumption architecture

```text
Status:   APPROVED (Q9 Option A + ledger + Q9b, owner, 2026-11-10) and IMPLEMENTED LOCALLY in R2 behind a
          default-off activation switch (see R2_REVIEW_AND_DEV_APPROVAL_PACKAGE.md). Activation, real payments
          and hosted DEV remain NOT authorized. Differences from this proposal are listed in section 8.
Written:  2026-11-10, V2-006 R1 independent review (Claude). Base e796eee, reviewed HEAD 44f6e8a.
Scope:    How a native attendance record (keyed by `profile_id`) can ever become Payroll hours
          (keyed by `neon_user_id`), and how a record is guaranteed to be consumed at most once.
```

This document is evidence-backed. Every "today" statement below was checked against the schema and
code at the reviewed HEAD. Nothing here changes the owner policy questions Q1, Q4 and Q6; it only
shows what shape of Payroll change would be safe once they are answered.

## 1. What exists today (verified)

| Fact                                                                                                                          | Evidence                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A payroll period is one frozen snapshot per **(organization, Neon person, calendar month)**.                                  | `payroll_periods`: `neon_user_id integer NOT NULL`, `UNIQUE (organization_id, neon_user_id, period_month)` (migration `20260907180000`).                                                                                                     |
| Pay-rate overrides are keyed the same way.                                                                                    | `payroll_rates`: `neon_user_id integer NOT NULL`, `UNIQUE (organization_id, neon_user_id)`.                                                                                                                                                  |
| The only bridge between a Lineup account and a Neon person is a manager-set link.                                             | `attendance_identity_links`: `UNIQUE (organization_id, profile_id)` and `UNIQUE (organization_id, neon_user_id)`; `neon_user_id integer NOT NULL`; never inferred by name.                                                                   |
| A staff member reads their **own locked** periods only through that link.                                                     | `payroll_periods` self-select RLS: `neon_user_id in (select l.neon_user_id from attendance_identity_links l where l.profile_id = auth.uid())` (`20260909120000`, re-stated in `20261108021714`).                                             |
| Payments and adjustments hang off the period id.                                                                              | `payroll_payments.payroll_period_id`, `payroll_adjustments.payroll_period_id`, composite `(id, organization_id)` FKs (`20261108021714`).                                                                                                     |
| The employee of a period can never change; a locked period's snapshot cannot change; a paid or confirmed period is immutable. | `payroll_periods` guard trigger (`Cannot change the employee of a payroll period`, `Cannot change the snapshot of a locked payroll period`); confirmed-payment trigger. Proved again by pgTAP 0075.                                          |
| Hours come **only** from Neon.                                                                                                | `computeSnapshot` → `getAttendanceRows({ userIds: [neonUserId] })` → `aggregateHours` (`hours_worked`); `location_id` is deliberately `NULL` because Neon rows carry no location; generation therefore needs organization-manager authority. |
| The TypeScript and UI are keyed by `neonUserId` end to end.                                                                   | ≈190 references: `payroll-actions.ts` (46), `statement-actions.ts` (16), `payroll-data.ts` (14), the workspace, period groups, print and combined-statement dialogs. Employee lookup is `getActiveNeonUsers()`.                              |
| Native sessions are keyed by `profile_id` and always have an active organization membership.                                  | `attendance_sessions_membership_fk (organization_id, profile_id)`.                                                                                                                                                                           |
| Nothing in the attendance code touches Payroll or Tips.                                                                       | pgTAP 0075 structural assertions (no FK, no trigger, no function in either direction); `git diff base..HEAD -- src/features/payroll` is empty.                                                                                               |

**Conclusion.** A native-only employee (a person with a profile and native sessions but no Neon
user) has no way to receive a payroll period, a rate override or a self-read policy today. Neither
a fake `neon_user_id` nor a name match is acceptable: the identity-link comment and Feature 018
already record real duplicate and near-duplicate names, and a wrong link is a wrong paycheck.

## 2. The three designs, assessed

Criteria are the ones the review brief named. "Today" = unchanged behaviour for existing rows.

| Criterion                         | **A. Generalised employee identity** (discriminated key on the existing tables)                                              | **B. Explicit identity mapping only**                       | **C. New payroll-subject indirection**                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Covers a **native-only** employee | **Yes**                                                                                                                      | **No** (needs a legitimate external identity by definition) | Yes                                                                                                                                                    |
| Existing confirmed rows           | Untouched: new nullable column + `source` default; existing rows satisfy the first branch of the check                       | Untouched                                                   | Needs a **backfill** of every historical period and rate into subject rows, under immutability triggers that forbid changing a locked/confirmed period |
| Uniqueness / double pay           | Existing unique key kept; a second partial unique key for native; a **cross-key guard** closes the dual-identity hole (§3.3) | Existing unique key is already the guard                    | One subject key; strongest uniqueness, but at the cost of the backfill                                                                                 |
| Staff self-read                   | Extend the existing policy with `OR profile_id = auth.uid()`; no join through links for native                               | Unchanged (join through links)                              | New policy over the subject table                                                                                                                      |
| Authority / tenancy               | Same composite `(id, organization_id)` shape as today                                                                        | Same                                                        | New table to harden                                                                                                                                    |
| Audit attribution                 | Unchanged (`generated_by` etc. already point at `profiles`)                                                                  | Unchanged                                                   | Unchanged                                                                                                                                              |
| Existing exports and statements   | Keep working untouched for Neon rows; native rows need the identity widened in ~190 call sites                               | Unchanged                                                   | All call sites move to the subject id                                                                                                                  |
| Rollout / rollback                | Additive; forward-fix only (a column cannot be dropped once it holds financial history)                                      | None                                                        | Largest; the backfill itself is a financial change                                                                                                     |
| Verdict                           | **Recommended**                                                                                                              | Keep as the _bridge_, not the solution                      | Reject for now: the backfill risk buys nothing the guard in A does not                                                                                 |

**Option B is not a rival: it already exists** (`attendance_identity_links`). It remains the bridge
for a person who has both identities, and the cross-key guard in A reads it. It cannot, by itself,
carry a native-only person.

**Why not C.** C is the cleanest model on paper, but its safety depends on rewriting historical,
immutable, possibly paid financial rows. A achieves the same "one person, one period per month"
guarantee with a guard trigger and leaves every historical byte alone.

## 3. Recommended design — Option A (discriminated identity) with a cross-key guard

> Proposal only. Table/column names are indicative; the contract is the invariants.

### 3.1 Shape

On `payroll_periods` and `payroll_rates`:

- add `attendance_source text not null default 'external_neon'` with check in
  (`'external_neon'`, `'internal_the_lineup'`);
- add `profile_id uuid null`, with composite FK `(profile_id, organization_id)` →
  `memberships (profile_id, organization_id)`;
- relax `neon_user_id` to nullable;
- add the **exactly-one-identity check**:

```sql
check (
  (attendance_source = 'external_neon' and neon_user_id is not null and profile_id is null)
  or (attendance_source = 'internal_the_lineup' and profile_id is not null and neon_user_id is null)
)
```

Existing rows satisfy the first branch with the default; the existing
`UNIQUE (organization_id, neon_user_id, period_month)` is kept untouched (NULLs are distinct, so
it never constrains native rows). Add
`UNIQUE (organization_id, profile_id, period_month) WHERE profile_id IS NOT NULL` for native rows.

Guard triggers must also forbid changing `attendance_source` or `profile_id` after insert (the
existing "cannot change the employee" rule, extended).

### 3.2 Self-read and tenancy

Self-select policy gains `OR (profile_id = auth.uid() and attendance_source = 'internal_the_lineup')`
under the same locked-only and live-session conditions. Everything else keeps the composite
tenant FKs and the module-enforcement restrictive policy.

### 3.3 The dual-identity hole (the one real risk of A)

A person linked in `attendance_identity_links` (profile P ↔ Neon N) could otherwise receive **two**
periods for one month — one by `neon_user_id = N`, one by `profile_id = P`. Close it in the
database, not in the UI:

- a `BEFORE INSERT` trigger on `payroll_periods` takes a per-(organization, person) advisory lock,
  resolves the link both ways, and **refuses** an insert when the same person already has a period
  for that month under the other key (and the same for `payroll_rates` overrides);
- unlinking or relinking an identity must not be allowed while it would orphan a period under the
  other key for an unconfirmed month (otherwise the guard could be bypassed by editing the link).

### 3.4 Who may generate

Today generation needs organization-manager authority _because Neon rows have no location_. Native
rows do have one, so the contract is a policy choice and is part of Q4, not something to guess:
the conservative default is **unchanged** — organization-level period, organization-manager
authority, hours summed over every location's eligible sessions for that month, `location_id`
`NULL`. Per-location periods would break the "one period per person-month" unit that payments and
balances are built on and are not proposed.

## 4. Duplicate financial consumption — an exact contract

**Is an existing mechanism enough?** No. `payroll_periods` prevents a second _month snapshot_ for a
person, and `hours_snapshot` is a bare number with no provenance. Nothing records **which sessions**
made up that number, at **which version**, so a retry, a regeneration or a correction after
generation cannot be reconciled. The Tips tables carry interval provenance but Tips has no hours
formula (an equal split per interval), so they are not a fit. A native-only consumption ledger is
required; Neon rows keep their existing month-level guard and need no ledger.

### 4.1 Contract (indicative)

`attendance_financial_consumptions` — one row per (consumer, session):

| Column                                                                 | Rule                                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                   | identity                                                                                                                                     |
| `organization_id`, `location_id`, `profile_id`, `session_id`           | composite FK to `attendance_sessions (id, organization_id, location_id, profile_id)` `ON DELETE RESTRICT` — tenant and location cannot drift |
| `consumer_type`                                                        | check in (`'payroll_period'`); extensible, Tips deliberately absent                                                                          |
| `consumer_ref`                                                         | `payroll_periods.id`, composite FK `(consumer_ref, organization_id)` `ON DELETE RESTRICT`                                                    |
| `service_date`                                                         | copied from the session                                                                                                                      |
| `source_version`                                                       | the session `version` **at consumption** (the existing counter bumped by trigger on every change)                                            |
| `gross_elapsed_seconds`, `unpaid_break_seconds`, `net_payable_seconds` | frozen copy; `net >= 0`; never recomputed                                                                                                    |
| `status`                                                               | `'active'` or `'superseded'`                                                                                                                 |
| `consumed_at`, `consumed_by`                                           | actor is a profile (works for Overall administrators without a membership)                                                                   |
| `superseded_at`, `superseded_by`, `superseded_reason`                  | required when superseded                                                                                                                     |

Invariants:

1. **At most once.** `UNIQUE (consumer_type, session_id) WHERE status = 'active'` — a session can
   feed exactly one live period. A retry is a no-op by construction.
2. **Atomic.** Rows are written only by a `SECURITY DEFINER` generate/regenerate RPC in the same
   transaction as the period row; no direct DML grants, no TRUNCATE. A failure leaves neither.
3. **Eligibility is re-proved in the database**, not trusted from TypeScript: the RPC reads the
   summary at that statement, requires `status = 'completed'`, `break_policy_resolved`, no open
   break, no void, correct tenant/location/employee, and `net_payable_seconds is not null`. A
   session that crosses the month boundary (`PERIOD_BOUNDARY`) is **refused**, not split, until Q4
   defines the rule.
4. **Reconciliation.** `sum(net_payable_seconds) of active rows = hours_snapshot * 3600` for the
   period is asserted at generation and checked by a read-only reconciliation view.
5. **Stale detection, never auto-adjust.** A view lists active rows where the session's current
   `version <> source_version` ("corrected after payroll"). It creates no adjustment and changes no
   snapshot; what happens next is Q6.
6. **Immutability.** Rows of a locked period or a period with a confirmed payment cannot be updated
   or deleted. Regenerating a _draft_ period marks the old rows `superseded` and inserts new ones;
   history is kept.
7. **Idempotency.** The RPC takes `(profile_id, period_month, idempotency_key)`; the period unique
   key plus invariant 1 make a replay return the same period.

### 4.2 Why this reuses the existing contract

`DUPLICATE_SOURCE_RECORD`, `ALREADY_CONSUMED`, `sourceRecordId` (the session uuid) and
`correctionVersion` already exist in `domain/financial-source.ts`. The ledger is what finally
supplies `alreadyConsumedSourceIds` and makes `detectCorrectionsAfterSnapshot` meaningful; today no
production caller passes either.

## 5. What this does **not** decide

- Break classification (Q1), overtime/rounding/holiday rules and rate policy (Q4), and the handling
  of a correction after confirmation or payment (Q6) are owner policy. Nothing above invents them.
- The source-switch cutoff: a location whose attendance mode changes mid-month would put one
  employee's month on two sources, and the contract forbids merging them. The recommended boundary
  is **a payroll-month boundary** (a mode change that affects an unconfirmed month is refused), but
  that is an owner decision (Q9b in the register), not an implemented rule. Today the database only
  refuses leaving internal mode while sessions are open.

## 6. Rollout, rollback and tests (for whoever builds this after approval)

- **Migrations first**, additive only, in a new migration after the two Attendance ones; never edit
  an applied migration. Rollback is **forward-fix**: once a native period exists the new columns
  hold financial history.
- Preconditions before any hosted write: a fresh restorable backup, an isolated restore rehearsal,
  populated-data compatibility, old-app/new-schema and new-app/old-schema checks, actual
  authenticated-JWT behaviour, and the DEV Preview binding (README §13.7).
- pgTAP (real subjects): exactly-one-identity; dual-identity guard both directions and under
  concurrency; self-read; unique native key; ledger at-most-once, atomicity (forced failure leaves
  nothing), eligibility refusals (unresolved break, open, voided, boundary, wrong tenant/location),
  stale-version view, immutability after lock and after a confirmed payment, no TRUNCATE; **a
  before/after digest of every existing Neon period, rate, payment and adjustment must be
  byte-identical** (use a mutation control, as R1 did for 0075).
- Vitest: unchanged Neon generation path; native generation calls the RPC only; no client-side hour
  arithmetic; the readiness preview stays read-only.
- Playwright: one native-only employee end to end on a disposable local database; a Neon employee
  unchanged.

## 7. Decision requested — Q9

**Recommended:** adopt Option A (§3) with the cross-key guard, plus the consumption ledger (§4),
organization-level periods and organization-manager authority (§3.4), and a payroll-month source
cutoff (§5). **Alternatives:** C (subject indirection; larger, requires touching historical rows);
B only (keeps native-only employees permanently out of Payroll). **Blocks:** native financial
activation and the final PR's "financially integrated" claim; does **not** block local development
or the read-only preview.

## 8. As implemented (R2) — differences from the proposal

- Ledger and review tables are named `payroll_attendance_consumptions` / `payroll_attendance_consumption_reviews` (payroll side), not
  `attendance_*`, so the attendance ledger tables stay free of any payroll reference (R1 isolation, pgTAP 0075, still holds; its assertions were
  made schema-exact and the ledger is the one sanctioned bridge).
- The cross-key guard serialises on one **organization-level** advisory lock instead of a per-person lock (deadlock-free, payroll writes are rare).
- A Neon period for a person who has native attendance in that month is also refused once activation is on (`MIXED_SOURCE_MONTH`).
- Unlinking/relinking is refused while the person has native payroll history, or Neon payroll history together with native attendance.
- A correction after a frozen period raises a **pending review** that LINKS an adjustment recorded through the existing audited flow; the review
  stores only the payable-seconds difference and never a money amount (no new rounding rule).
- Q9b is implemented as: a native/external change is allowed only on the first local day of a payroll month, with the other dependencies resolved.
- A default-off database switch gates generation and the source-transition rule; the application keeps its own closed gate.
- Consolidated independent review added forward-only migration `20261110160147`:
  native confirmation tries the shared employee attendance lock before proving
  finality (a busy employee is refused, avoiding period-row/advisory deadlock),
  and confirmed native periods cannot reopen through the legacy unlock workflow.
  Neon unlock remains unchanged. See [the closeout](FINAL_CONSOLIDATED_CLOSEOUT.md).
