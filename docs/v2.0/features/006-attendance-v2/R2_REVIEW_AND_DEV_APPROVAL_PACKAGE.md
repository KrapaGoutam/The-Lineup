# V2-006 R2 — Financial gap closure: review scope and hosted DEV approval package

```text
Status:   IMPLEMENTED LOCALLY, ACTIVATION OFF. Not pushed. No PR. Hosted DEV untouched. Production untouched.
Branch:   feature/v2-006-attendance-v2   (R2 commits: b1fa651 database, 29ed814 TypeScript; docs commit follows)
Approved: Q1, Q4, Q6, Q9 (Option A), Q9b — decisions only, 2026-11-10.
Withheld: activation of native financial processing, real payments, Q8 hosted DEV, backend-enforcement
          activation, Q5 (manager self-correction), Q7 (correction authority).
```

## 1. What R2 added (one forward-only migration)

`20261110145124_attendance_native_payroll_identity.sql`, after the two Attendance migrations.

| Area                | Delivered                                                                                                                                                                                                                                                                                                                                                                        | Approved basis          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Staged switch       | `attendance_financial_activation` (singleton, **enabled = false**, no client grant, evidence required to enable)                                                                                                                                                                                                                                                                 | Q4, activation withheld |
| Identity            | `payroll_periods` / `payroll_rates`: `attendance_source` + `profile_id`, `neon_user_id` nullable, exactly-one-identity CHECK, composite FK to `memberships`, partial unique native key; identity immutable for **every** role                                                                                                                                                    | Q9                      |
| Dual-identity guard | Org-wide advisory lock + `BEFORE INSERT` guards on periods and rates (both directions); link edits refused while they would break it; a Neon period for a person with native attendance that month is refused once active (`MIXED_SOURCE_MONTH`)                                                                                                                                 | Q9                      |
| Self-read           | Native branch added to the self policy, `owns_payroll_period`, `payroll_can_read_period`; Neon branch unchanged; locked periods only; active membership                                                                                                                                                                                                                          | Q9                      |
| Ledger              | `payroll_attendance_consumptions`: session + version + frozen seconds per period; **at most one active row per session**; composite FKs bind tenant, location, employee and month; eligibility re-proved in the database on every insert; append-only (no delete, no truncate, only active→superseded of a draft)                                                                | Q9                      |
| Generation          | `payroll_generate_native_period(org, profile, month)`: one transaction takes the identity + attendance locks, re-proves eligibility, writes period + ledger + audit or nothing; idempotent; draft regeneration supersedes (never double-counts); locked/paid periods refused                                                                                                     | Q4, Q9                  |
| Correction review   | `payroll_attendance_consumption_staleness` view, `payroll_raise_consumption_reviews`, `payroll_resolve_consumption_review`: a correction after a frozen period raises one pending review; a decision **links** an adjustment recorded through the existing audited flow; baseline accounts for earlier adjusted differences; no payment, deduction, snapshot rewrite             | Q6                      |
| Lock safety         | A draft native period cannot be locked while any attendance is stale, unconsumed or unresolved, or if hours differ from the ledger                                                                                                                                                                                                                                               | Q6                      |
| Break policy        | Reused (Batch A/B): classification only by an authorized manager through `attendance_correct_session` with actor, time, reason, history; unclassified ⇒ payable NULL ⇒ generation refused; gross elapsed always visible; nothing inferred from length                                                                                                                            | Q1                      |
| Source transition   | `set_location_attendance_mode` (same signature) refuses a native↔external change once active (or once any attendance of the location was consumed) unless: first day of a payroll month in the location time zone, reason given, no open sessions, no unclassified breaks, nothing unconsumed, no unreviewed corrections, no dual-identity ambiguity, no current-month activity | Q9b                     |

Not built (deliberately): any new rounding, overtime, rate or holiday rule (Q4); any payment or deduction; a Payroll UI for native
employees; automatic copying of Neon attendance; changes to Tips formulas; Q5/Q7 effects.

## 2. Honest limits (read before approving)

1. **Payroll UI is still Neon-only.** A native employee cannot be generated, listed or paid from the Payroll screen. The
   TypeScript boundary exists (`native-payroll-actions.ts`) but is gated closed and has no UI. ~190 `neonUserId` call sites are
   intentionally unchanged; Neon-keyed readers now filter `attendance_source = 'external_neon'`.
2. **The boundary rule is strict:** a source change is allowed only on the first local day of a month. That is the literal reading of
   "at a payroll-period boundary" and may surprise an owner on the 2nd; a scheduled/effective-dated switch is a possible later feature.
3. **Tips are not gated.** Transition readiness only _warns_ (`tip_pools_not_finalized`); a location whose tip cycle differs from the
   payroll month needs explicit manual reconciliation. Tips records are never touched.
4. **Native periods are organization-level** (`location_id` NULL, org-manager authority) exactly like Neon periods; a location manager
   cannot generate them. Sessions are summed across all locations.
5. A shift crossing the month end is **refused**, not split (no approved split rule).
6. Concurrency was proven with real overlapping connections on the local stack (25/25) plus 146 pgTAP assertions; nothing ran against
   hosted DEV or a Neon database.

## 3. Evidence (consolidated, local only)

| Check                                                                                                      | Result                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full pgTAP on a freshly reset DB                                                                           | 78 files / **3,076** tests PASS (R1 baseline 77 / 2,929); new file 0076 = 146 assertions                                                             |
| Full Vitest                                                                                                | **3,837** pass, 7 pre-existing skips (R1 baseline 3,784; +53 new)                                                                                    |
| `next build --webpack` with `CI=1` (cold)                                                                  | PASS                                                                                                                                                 |
| tsc, ESLint, Prettier                                                                                      | clean                                                                                                                                                |
| Concurrency harness (`.tmp/v2-006-attendance-handoff/concurrency/run.sh`, committed fixtures, reset after) | 25/25: two simultaneous generations; dual identity both orders; correction during preparation, both orders; retry after timeout; global invariants   |
| Neon history                                                                                               | digest of every Neon-keyed period/rate fixture identical before/after the native work; control proves the digest detects a one-cent change           |
| Playwright                                                                                                 | **Not re-run** (deferred to the final PR gate): the Playwright specs run in demo mode and exercise none of the changed Supabase paths; no UI changed |

Defects found and fixed during R2 (all by tests, none in shipped code):

- **P1 (own code, before commit):** the "clients cannot hand-insert a native period" guard was a `SECURITY DEFINER` trigger, where `current_user`
  is always the owner, so it never fired. Split into an invoker write-guard and a definer lock-guard; proven by 0076 (a fabricated 99-hour row
  is refused).
- **P2 (pre-existing, tests only):** pgTAP 0074/0075 fixtures set `service_date` with a UTC `::date` while the correction RPC recomputes it in the
  location time zone, so the suites failed whenever the UTC hour was 15–17. Fixtures now compute it in the location time zone.
- **P2 (pre-existing, vacuous test):** the 0075 isolation assertions matched `regclass::text` against `'public.…'`, which the default search path
  omits, so the foreign-key check matched nothing. Rewritten schema-exact; the consumption ledger is the one sanctioned bridge and its exact
  reference set is asserted.
- **P2 (own code):** `text[] || 'literal'` is ambiguous in PL/pgSQL; found by the first test run of the readiness function; fixed with `array_append`.

## 4. Independent review — what needs which eyes

Financial / security reviewer (new, separate from the author):

1. `supabase/migrations/20261110145124_attendance_native_payroll_identity.sql` — all of it. Priority: §1 guards and the link guard (can a person ever be paid twice?),
   §3 ledger triggers, the generation function (locks, ordering, reconciliation), RLS and grants of the new objects, `SECURITY DEFINER` search paths.
2. `supabase/tests/database/0076_*.test.sql` and the changed assertions in 0075 (are they proving the real thing?).
3. `src/features/payroll/actions/native-payroll-actions.ts` (authority, gate order, no client-supplied organization) and `data/native-payroll-data.ts`.
4. The four Neon-reader filters in `payroll-data.ts` (no behaviour change for Neon rows).

Specific questions worth asking: Can a SECURITY DEFINER function be reached by a client in a way that skips the org-manager check? Can the org-level
advisory lock starve payroll? Is the ledger's `PERIOD_FROZEN` definition (locked **or** any payment) consistent with the existing snapshot trigger?
Is first-of-month the right boundary?

### R1-F1 second review (the R1 reviewer authored `b4d056e`)

Not re-audited here. A reviewer other than the author should verify the patch with this focused package:

| Concern                    | Existing proof (file → test)                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Report action, stale tab   | `attendance/actions/native-report-actions.test.ts` → "stale-tab binding (R1): the rows must be for the location on screen"           |
| Financial-readiness action | `attendance/actions/financial-readiness-actions.test.ts` → "R1 stale-tab binding…", "R1: a malformed expectedLocationId is rejected" |
| UI location labels         | `attendance/components/payroll-readiness-panel.test.tsx`, `attendance-workspace.test.tsx`                                            |
| Switching / cross-location | the two action suites above (other-location id ⇒ stale response, case-insensitive match, malformed id rejected before any read)      |

Suggested manual step for the reviewer: open two tabs on different locations, switch the location in one, then act in the other.

## 5. Hosted DEV approval package (Q8 — NOT granted; nothing below has been executed)

Migration set that would be applied to hosted DEV (ledger currently 82; they are the only three pending):

```text
20261110000000_attendance_v2_foundation.sql       sha256 40bb802beb7ff13a…d024c63e   (unchanged since Batch A)
20261110010000_attendance_corrections.sql         sha256 a7556ae715e2d34f…ca8bdb15   (unchanged since Batch B)
20261110145124_attendance_native_payroll_identity.sql  sha256 fb0fe460b803fab6459a101bc63ce990786755871631ac5bd36eda40fb610381
Expected DEV ledger after apply: 85
```

Readiness of the SET: **ready for ONE owner-authorized deployment after the independent review**, with these conditions:

1. Independent financial/security review done and any P0/P1 fixed (re-run 0076 and the harness after any migration edit; reset the local DB).
2. Fresh restorable DEV backup and an isolated restore rehearsal; apply the three migrations to the rehearsal copy first.
3. Populated-data compatibility: DEV has Neon-keyed periods, rates, payments and adjustments — verify the digests are identical after apply
   (the pgTAP digest technique in 0076 is reusable). The new columns are additive with defaults; no existing row is rewritten.
4. Old app + new schema (the Neon readers do not select the new columns, and a Neon insert uses the default) and new app + old schema (the new
   Neon filters reference `attendance_source`, so **migrations must go first**).
5. Authenticated-JWT smoke as a real manager, a location manager and an employee; confirm `payroll_generate_native_period` returns
   `NOT_ACTIVATED` and nothing was written.
6. Preview binding check (Preview binds DEV): do not deploy an app that reads `attendance_source` before the migration is applied.
7. Leave `attendance_financial_activation.enabled = false` and the application gate closed. Activation is a separate owner authorization.
8. Rollback is **forward-fix**: before any native period exists the new objects are inert and can be dropped by a forward migration; after
   that, they hold financial history.

Backend enforcement activation (`module_enforcement_settings`) stays STAGED and is independent of this package.

## 6. Activation checklist (a later, separate authorization)

Owner writes: activate native financial processing; confirm the first-of-month boundary rule; confirm who may classify breaks (Q1 lists
location manager and above); decide Q5/Q7. Engineering then: set the DB switch with recorded evidence, open the application gate in its own
reviewed PR, build the Payroll UI for native employees, run a rehearsal month on DEV with synthetic data only.
