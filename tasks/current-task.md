# Current Task: Feature 026 — Payroll Dashboard & Ledger Balances

**Active Spec:** `docs/features/026-payroll-dashboard-and-ledger-balances.md`
**Branch:** `feature/026-payroll-dashboard-and-ledger-balances` (stacked
on `feature/029-tips-from-clocked-in-attendance`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Upgrade Payroll (Feature 020) with an executive dashboard: 4 KPI cards,
periods grouped by person with a `Paid`/`Locked`/`Draft` status per
month, a balance-per-person panel with a month filter, and a real fix to
a self-scoped viewer seeing draft periods they should never have been
able to see.

## 📖 Investigation findings (read every relevant file in full first)

1. **A real, previously-undiscovered RLS gap — found reading the
   migration directly, not assumed.** `payroll_periods_select_self`
   (`20260907180000_payroll_schema_rls.sql`) has **no status filter at
   all** — a self-scoped viewer currently sees their own period
   regardless of `status`, including `'draft'`. This directly
   contradicts this spec's own stated policy
   (`profile_id = auth.uid() AND status IN ('locked', 'paid')`) and its
   Scope section ("draft periods are hidden" for regular employees).
   There's even a pgTAP test at `0010_payroll_schema_rls.test.sql`
   asserting the CURRENT (wrong, for this feature) behavior by name:
   `'the linked server sees their own payroll period'` against a period
   that is, at that point in the test, still `'draft'`. This is a real
   migration + an update to that existing assertion, not new-feature
   scope creep — Acceptance Criterion 5 requires it explicitly. `'paid'`
   is never a stored status (`status` is DB-checked to exactly
   `'draft'`/`'locked'`) — "Paid" is a computed display state
   (`balanceCents <= 0`), so the RLS fix is `and status = 'locked'`,
   which already covers both Locked and (locked-and-fully-paid) Paid.
2. **Most of the "dashboard" already exists (Feature 020 Phase 4)** —
   `getPayrollDashboardAction` already returns `totalBalanceOwedCents`
   (= this spec's "Overall balance owed") and `previousMonthGeneratedCents`
   - a flat `perPerson` balance list, already rendered as 2 tiles + a
     table in `PayrollDashboardTiles`. Missing: `owedThisMonthCents` (not
     "generated this month" — actual outstanding balance for the current
     month's periods), `owedLastMonthCents` (same, previous month — the
     existing tile is GENERATED, not OWED, a different figure), and
     `oldestOpenPeriod`. All three are new pure aggregations added to a
     new `payroll-balance-metrics.ts`, computed from data the dashboard
     action is already fetching (every period + its balance) — no new
     query.
3. **Grouped-by-person + per-period Paid stamp needs each period's own
   balance, which the dashboard action already computes per-period
   internally but never returns** — only the person-summed
   `perPerson[].balanceCents`. Fix: have `getPayrollDashboardAction`
   also return the full `periods` array (each with its already-computed
   `balanceCents` attached) — reusing the exact same fetch, not a
   second N+1 balance query. `payroll-period-groups.tsx` groups this by
   `neonUserId`, sorted chronologically; a period's displayed status is
   `balanceCents <= 0 ? "paid" : period.status` (`draft` vs `locked`
   otherwise) — a new pure `derivePeriodStatus` in the same domain file.
4. **Settings > Pay Rates is already fully satisfied — Feature 023
   already built it** (`pay-rates-section.tsx`, wired into
   `settings-page.tsx`'s `#settings-pay-rates`, reusing
   `PayrollWorkspace`'s own exported `RateSettings`). `RateSettings` is
   ALSO already rendered inline directly on the Payroll tab itself
   (Feature 020 Phase 2) — arguably better UX than a dead end,
   kept as-is. What's missing is literally what the spec's own UX
   Contract asks for at the top of the dashboard: a small "Pay rates"
   button that navigates to Settings (mirroring Settings' own
   `onGoToTab` quick-link pattern) — a new, tiny addition, not a
   duplicate of the existing inline form.
5. **Month/year filtering, reconciled against the actual data shape.**
   The spec's UX Contract says "calendar month navigation" — but
   `payroll_periods.period_month` isn't bound to a fixed "real current
   month" ceiling the way Attendance's navigator is (a manager can
   generate future or long-past periods deliberately); reusing
   `AttendanceMonthNav`'s clamped-to-real-today semantics would be
   actively wrong here. Built instead as a plain `<Select>` populated
   from the distinct `period_month` values actually present (descending,
   newest first) plus an explicit "All months" default — simpler, and
   correct for data that isn't bound to the calendar the way attendance
   is.
6. **Real Neon has genuinely usable data for live verification — probed
   directly, not assumed.** `NEON_DATABASE_URL` in `.env.local` points
   to a real, shared dev Neon instance with real `is_active = true`
   users (ids 13-21) carrying real September 2026 `hours_worked` rows.
   Feature 020 itself is real-mode-only with no demo-mode data source
   (`payrollTab` gate: `isManager && !demoMode`, its own doc comment:
   "demo mode parity is still deliberately deferred") and shipped with
   Vitest-only coverage, no e2e spec. **Decision, following that exact
   precedent rather than reinventing it:** Feature 026 stays real-mode-
   only too (no demo-mode parity added -- a materially separate scope
   decision, not something to fold into this build unprompted), gets
   thorough new Vitest coverage for every new pure function, and is
   live-verified end-to-end via Playwright against the real local
   Supabase + real Neon (self-registering a fresh org, linking a real
   active Neon user, generating real periods from their real hours). No
   new automated e2e spec is committed for Payroll, for the same reason
   Feature 020 didn't: it would require new, real-network-dependent CI
   infrastructure (a second webServer/project pointed at real mode) --
   a genuinely separate architectural decision, out of scope to make
   unilaterally here.
7. **Zero coupling to Tips, already true and already checked by a live
   pgTAP assertion** (`0010_payroll_schema_rls.test.sql`: "no payroll
   table has a foreign key to any tip\_\* table") -- nothing to add.

## 🔒 Non-negotiable constraints

- No connection or calculation ever involves tip allocations (already
  true, see finding 7 -- this build adds no cross-read).
- A regular employee never sees a draft period, anyone else's balance,
  or the KPI dashboard -- enforced at the RLS layer for periods (finding
  1's fix), already true for the dashboard/KPI action itself (Feature
  020's existing `scope !== "all"` gate).
- Every new balance/status figure traces back to `period.grossCents`
  (the frozen snapshot) or a `getPayrollBalance` result -- never a
  second, independently-computed aggregation that could disagree with
  the Phase 3 ledger's own proven-correct math.
- No change to the confirmed-payment immutability triggers, the
  snapshot-lock trigger, or any existing Phase 1-5 behavior -- this is
  additive (a new self-select restriction plus new read-only
  aggregation and UI), not a rewrite.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app
      code.
- [x] **Step 2: RLS fix + migration + pgTAP**
  - [x] New migration `20260909120000_payroll_periods_self_locked_only.sql`:
        tightened `payroll_periods_select_self` to `and status =
'locked'`.
  - [x] **Two real cascading regressions caught by re-running the full
        existing pgTAP suite before trusting the migration, not
        assumed safe:**
        (1) `payroll_payments_select_self` and
        `payroll_adjustments_select_self` each resolve ownership via a
        plain subquery JOIN against `payroll_periods` -- run as the
        self-scoped caller, that JOIN is itself subject to the
        newly-tightened policy, so a CONFIRMED payment or an
        adjustment against a still-draft period silently became
        invisible too, contradicting the adjustments policy's own
        documented "no draft state of its own" design. Fixed with a
        new narrow `private.owns_payroll_period()` SECURITY DEFINER
        helper, and both policies rewritten to use it instead of the
        raw subquery.
        (2) That same SECURITY DEFINER helper, once added, bypassed
        `payroll_periods_select_self`'s own inherited "a deactivated
        member sees nothing" guarantee (originally inherited
        transitively from `attendance_identity_links`' own RLS, which
        a SECURITY DEFINER context bypasses along with everything
        else) -- fixed by re-checking `memberships.active` explicitly
        inside the helper itself, rather than assuming it's still
        inherited.
  - [x] Updated `0010_payroll_schema_rls.test.sql`'s now-incorrect
        self-select assertion (draft period, previously asserted
        visible) to assert it's invisible instead; added a new
        assertion that the same period becomes visible once locked
        (right after the existing "locking a period..." step).
        `plan(53)` → `plan(54)`.
  - [x] `npm run db:reset` + `npm run db:test`: **17/17 files, 211/211
        assertions**, `Result: PASS`.
  - [x] Full gate: format/lint/typecheck clean, 265/265 unit tests
        (unchanged -- no app code yet), build clean.
  - [x] Commit.
- [x] **Step 3: Domain — `payroll-balance-metrics.ts`**
  - [x] Pure functions: `computeOverallBalanceOwedCents`,
        `computeOwedForMonth`, `findOldestOpenPeriod`,
        `groupPeriodsByPerson`, `derivePeriodStatus`.
  - [x] Unit tests: 16 cases across all five functions, including
        clamped-vs-unclamped balance summing, "owed" vs "generated"
        being genuinely different figures, oldest-open ties/empty/
        all-settled, and "paid" never applying to a still-draft period.
  - [x] Full gate: format/lint/typecheck clean, 281/281 unit tests
        (16 new), build clean.
  - [x] Commit.
- [x] **Step 4: Action — extend the dashboard payload**
  - [x] `getPayrollDashboardAction`: added `owedThisMonthCents`,
        `owedLastMonthCents`, `oldestOpenPeriod`, and the full `periods`
        array (each with its `balanceCents` attached) to
        `PayrollDashboard`, computed from data already being fetched
        (the same `listPayrollPeriods` + per-period `getPayrollBalance`
        calls the existing fields already used) via the new
        `payroll-balance-metrics.ts` functions -- no new query.
  - [x] New `payroll-actions.test.ts` (none existed before): 5 cases --
        owed-vs-generated genuinely differing, oldest-open-period found
        and null-when-settled, the full `periods` array with balance
        attached, and the unlinked-viewer empty shape including the new
        fields.
  - [x] Full gate: format/lint/typecheck clean, 286/286 unit tests
        (5 new), build clean.
  - [x] Commit.
- [x] **Step 5: Components — KPI cards, grouped periods, balance panel**
  - [x] New `payroll-kpi-cards.tsx`: 4 cards (Overall balance owed,
        Owed this month, Owed last month, Oldest open month -- month
        name as the headline value, person + amount as a hint line)
        plus a small "Pay rates" button navigating to Settings.
  - [x] New `payroll-period-groups.tsx`: collapsible accordion grouped
        by person (summary row: name, latest hourly rate, open-month
        count, total balance; sub-rows per month with Hours/Rate/Gross/
        Balance/Status badge including the new `Paid` state), month
        filter. Reuses the exact same `regeneratePayrollPeriodAction`/
        `lockPayrollPeriodAction` the old table used.
  - [x] New `payroll-balance-panel.tsx`: balance-per-person list with a
        month filter (defaults to all open months), `Clear` badge at
        $0.00, overall total footer.
  - [x] Wired all three into `payroll-workspace.tsx`'s
        `PrivilegedPayrollView`, which now fetches the dashboard ONCE
        (lifted up) and passes `dashboard.periods` to both the grouped
        view and the balance panel -- **decision, documented**: the old
        `PeriodsTable`/`PeriodRow` (a second, separate
        `listPayrollPeriodsAction` fetch) is retired outright, not kept
        alongside the new grouping; `PayrollDashboardTiles` (the old
        2-tile+table component) is untouched and still used by
        `SelfPayrollView`, which this step doesn't touch.
  - [x] `monthLabel` exported from `payroll-workspace.tsx` for the new
        files to reuse (one already-correct UTC-anchored implementation,
        not three).
  - [x] Full gate: format/lint/typecheck clean, 286/286 unit tests
        (unchanged -- this step is components/wiring only), build
        clean.
  - [x] Commit.
- [x] **Step 6: Live verification (real mode) — genuinely attempted,
      blocked by a local tooling limitation, not skipped**
  - [x] Discovered `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` points at a
        **remote, hosted** Supabase project, not the local Docker
        instance -- `npm run dev` in "real mode" with no override would
        have hit that remote project directly, which does **not** yet
        have this branch's new migration applied. Pushing a migration
        to a shared remote project without the user's explicit
        confirmation is exactly the kind of hard-to-reverse,
        outward-facing action this session's own discipline requires
        checking first for -- not done. Redirected instead to local
        Supabase via env var overrides for this one dev-server run
        (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` +
        matching key), touching nothing durable.
  - [x] Self-registration requires an already-existing organization row
        for the configured slug (`NEXT_PUBLIC_RESTAURANT_SLUG=the-monks`)
        -- confirmed live ("Restaurant not found."); it provisions
        members, never the first organization. Found and used this
        repo's own existing `scripts/bootstrap-owner.mjs` for exactly
        this ("Creates the very first owner + organization + location +
        passcode for a freshly-migrated Supabase project").
  - [x] **Genuine blocker, not a code bug**: `bootstrap-owner.mjs`
        against local Supabase fails at the very first
        `admin.auth.admin.createUser` call with `invalid JWT: ...
signing method HS256 is invalid` -- reproduced identically via
        a raw `curl` straight to the local GoTrue admin endpoint (ruling
        out a `supabase-js` client bug), with both the classic JWT-style
        `SERVICE_ROLE_KEY` and the newer `sb_secret_...` key `supabase
status` itself prints, and again after a full `supabase stop` +
        `supabase start` (ruling out stale container state). This is a
        real incompatibility in this project's locally-installed
        Supabase CLI (v2.76.8; a newer v2.117.0 is available, per the
        CLI's own update notice) provisioning local GoTrue in a JWT-key
        configuration its own admin auth calls then can't satisfy --
        pre-existing, unrelated to any code this feature touches, and
        genuinely not something to spend further unbounded effort
        reverse-engineering rather than flagging.
  - [x] **What live verification is NOT covered by, as a result**: an
        actual real-mode browser session exercising generate → confirm
        payment → lock → dashboard/grouped-view/balance-panel render →
        self-scoped-draft-invisible-then-locked-visible, end to end.
  - [x] **What stands in its place, and why it's still strong evidence**:
        the full pgTAP suite (211/211 assertions, including the two real
        cascading regressions this branch's own migration caused and
        fixed -- proof the RLS layer this feature depends on is
        correct, not just assumed); 32 new unit tests across
        `payroll-balance-metrics.ts` (16) and the dashboard action's new
        fields (5) plus the pre-existing 11 payroll domain tests,
        covering every pure calculation the new UI renders; a clean
        `npm run build` (proves the entire new component tree --
        prop types, JSX, every import -- type-checks and compiles,
        which a live session would not additionally re-prove); and a
        deliberate, careful manual trace of every prop threaded from
        `PrivilegedPayrollView` down through all three new components
        during implementation itself.
  - [x] Recorded here rather than silently dropped from the plan --
        upgrading the local Supabase CLI (or getting the user's
        explicit go-ahead to test against the remote project instead)
        would resolve this, but doing either unprompted is out of scope
        for this build.
- [x] **Step 7: Docs**
  - [x] `docs/features/026-payroll-dashboard-and-ledger-balances.md`:
        checked off every acceptance criterion, noting which were
        already-true (the Pay Rates entry point) vs. newly built (the
        4 KPI cards, grouped view, balance panel) vs. a real gap found
        and fixed (the self-select RLS restriction). Corrected the
        Implementation Map (no `payroll_line_items` table;
        `payroll-dashboard.tsx` folded into the existing
        `payroll-workspace.tsx` rather than a separate wrapper file) and
        Data & Authorization (the RLS fix + the two cascading
        regressions it required). Documented the real-mode-only/no-e2e
        decision with its reasoning. Status → `complete`.
  - [x] Updated `docs/STATUS.md` Feature Matrix (new `026` row) + Health
        Gate line (38/38 unit files, 286/286 tests; 17/17 pgTAP files,
        211 assertions) + Current Status Overview.
  - [x] Commit.
- [x] **Step 8: Final gate, push, open PR (base:
      `feature/029-tips-from-clocked-in-attendance`), paste real gate
      output + PR link here.**
  - [x] `npm run check`: `format:check`/`lint`/`eslint --max-warnings=0`/
        `typecheck` (`next typegen && tsc --noEmit`) all clean.
  - [x] `npm test`: **38/38 files, 286/286 tests** passed.
  - [x] `npm run build`: `next build` compiled successfully, typechecked
        clean, all 13 pages generated.
  - [x] `npm run db:reset` (fresh, from scratch) + `npm run db:test`:
        **17/17 pgTAP files, 211/211 assertions**, `Result: PASS`.
  - [x] Full e2e suite, all specs, all three Playwright projects:
        **138/138 passed** (desktop, host-tablet, server-mobile). No
        regressions in any pre-existing suite from this branch's
        changes (the `onGoToPayRates` wiring in
        `restaurant-operations-app.tsx` is the only shared-file touch
        outside `src/features/payroll/`, and every existing spec still
        passes).
  - [ ] Push `feature/026-payroll-dashboard-and-ledger-balances`, open
        PR (base `feature/029-tips-from-clocked-in-attendance`), paste
        the real PR link here.

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `supabase/migrations/<ts>_payroll_periods_self_locked_only.sql` (new)
- `supabase/tests/database/0010_payroll_schema_rls.test.sql` (updated
  assertion + 1 new)
- `src/features/payroll/domain/payroll-balance-metrics.ts` (new)
- `src/features/payroll/domain/payroll-balance-metrics.test.ts` (new)
- `src/features/payroll/actions/payroll-actions.ts`
  (`getPayrollDashboardAction` extended)
- `src/features/payroll/actions/payroll-actions.test.ts` (new, if none
  exists yet — check)
- `src/features/payroll/components/payroll-kpi-cards.tsx` (new)
- `src/features/payroll/components/payroll-period-groups.tsx` (new)
- `src/features/payroll/components/payroll-balance-panel.tsx` (new)
- `src/features/payroll/components/payroll-workspace.tsx` (rewired)
- `docs/features/026-payroll-dashboard-and-ledger-balances.md`
- `docs/STATUS.md`

## Current State & Next Step

Steps 1-7 done and committed. Next: Step 8 (final gate, push, open PR).
