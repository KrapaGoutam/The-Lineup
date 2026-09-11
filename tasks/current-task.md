# Current Task: Attendance Timezone Bug Fix (Phase 2 of the mega-request)

**Active Spec:** none (bug fix, not a numbered feature) — see
`docs/agent-handoff.md` for the full mega-request context and remaining
phases.
**Branch:** `fix/attendance-timezone`, branched from `main` after PR #34
merged.
**Status:** Complete — ready to push and open a PR.
**Assigned Agent:** Claude Code

## 🎯 Objective

Fix the reported clock-in/out timezone bug (an 11:06 AM clock-in
displaying as 6:06 AM) as Phase 2 of a much larger mega-request. See
`docs/agent-handoff.md` for the full picture — this file only tracks
this one bounded bug fix.

## 🔎 Root cause (confirmed by reading the actual data pipeline, not assumed)

Not a Neon/region/storage issue — `attendance-data.ts` confirms
`clock_in`/`clock_out` are genuine `timestamptz` columns, correctly
parsed into real JS `Date` instants and correctly serialized via
`.toISOString()`. That pipeline was already correct end to end.

The bug was entirely in display:
`combined-statement-dialog.tsx` had its own local `formatClockTime`
built on `Date.prototype.toLocaleTimeString` with **no `timeZone`
option** — silently defaulting to the viewer's own browser timezone
instead of the restaurant's business timezone. `attendance-report.tsx`
already had a correct, timezone-aware `formatClockTime` (built on
`zonedWallTimeFromInstant` from `src/lib/timezone.ts`, which already had
full CDT/CST/DST-transition test coverage) — the Combined Statement
dialog just never received a `timeZone` prop and rolled its own broken
second implementation instead of reusing it.

## 🛠️ Fix

- New `src/lib/date-time.ts`: `formatBusinessTime` / `formatBusinessDate`
  / `formatBusinessDateTime`, built on `Intl.DateTimeFormat` with an
  explicit, required `timeZone` argument — no fallback to any implicit
  environment zone anywhere in the module. This is the shared home
  Section 17 of the mega-request asks for; every future 12-hour
  print/statement surface should format through it rather than rolling
  its own `toLocaleTimeString` call.
- `combined-statement-dialog.tsx`: added a required `timeZone: string`
  prop; replaced the local broken `formatClockTime` with
  `formatBusinessTime` from the new shared module.
- Threaded `timeZone` through every call site: both in
  `attendance-report.tsx` (it already had `timeZone` in scope) and
  through `payroll-workspace.tsx`'s
  `PayrollWorkspace → PrivilegedPayrollView/SelfPayrollView →
PeriodLedgerPanel → CombinedStatementDialog` chain (added as a new
  prop at each level — it wasn't threaded that far down before).
- `attendance-report.tsx`'s own already-correct 24-hour `formatClockTime`
  was deliberately left untouched — different, intentional display style
  (an internal ops table, not a formal statement), not the bug.
- `combined-statement-dialog.tsx`'s `formatPaymentDate` was also left
  untouched — it's a plain calendar-date column (`payment_date`, no time
  component), already correctly formatted with an explicit
  `timeZone: "UTC"` to avoid re-interpreting the date itself; not an
  instant, not affected by this bug class.

## 🔒 Non-negotiable constraints honored

- Neon stayed read-only — no query changes, no schema changes.
- No manual `-5`/`+5` hour offset anywhere — every zone conversion goes
  through `Intl.DateTimeFormat`'s own `timeZone` option (or, for the
  reverse/harder direction elsewhere in the app, the existing
  DST-transition-aware `zonedWallTimeToInstant`).
- `America/Chicago` is passed as a real IANA zone name, sourced from the
  existing `timeZone` prop chain (itself ultimately DB-driven via
  `scheduleContext.timeZone` in real mode) — never hardcoded as a raw
  UTC offset.

## 🧪 Tests added

- `src/lib/date-time.test.ts` (new, 7 tests): CDT (summer, UTC-5) and CST
  (winter, UTC-6) render the identical correct wall-clock time from two
  different UTC instants; explicit assertion that the old broken output
  ("4:06 PM") is NOT produced; midnight/noon boundaries; a second
  explicit timezone (UTC) to prove the function isn't hardcoded to
  Chicago either.
- `combined-statement-dialog.test.tsx` (new describe block, 2 tests): a
  real attendance row rendered through the actual dialog component,
  asserting the correct wall-clock time appears (both a CDT and a CST
  example) — the actual regression test for the reported bug, not just
  the underlying utility.

## ✅ Verification Gate

- [x] `npm run format:check` — clean.
- [x] `npm run lint` — clean.
- [x] `npx tsc --noEmit` — clean (also caught every test call site that
      needed the new required `timeZone` prop).
- [x] `npx vitest run` — 45/45 files, 334/334 tests (up from 325 — 9 new).
- [x] `npm run build` — clean.
- [x] `npx playwright test tests/e2e/attendance-reporting.spec.ts tests/e2e/payroll-timesheet-overhaul.spec.ts --project=desktop` — 10/10.
- [x] `npm run test:e2e -- --project=desktop` (full suite) — 51/51.

## 🗂️ File List

- `src/lib/date-time.ts` (new)
- `src/lib/date-time.test.ts` (new)
- `src/features/payroll/components/combined-statement-dialog.tsx`
- `src/features/payroll/components/combined-statement-dialog.test.tsx`
- `src/features/payroll/components/payroll-workspace.tsx`
- `src/features/payroll/components/payroll-workspace.test.tsx`
- `src/features/attendance/components/attendance-report.tsx`
- `docs/agent-handoff.md` (new — full mega-request context)
- `tasks/current-task.md` (this file)

## Current State & Next Step

This bug fix is complete and quality-gated. Next: commit, push, open a
PR, verify CI, then continue to Phase 3 (payroll bulk generation) per
`docs/agent-handoff.md`.
