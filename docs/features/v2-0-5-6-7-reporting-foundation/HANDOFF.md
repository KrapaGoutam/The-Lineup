# Release Group 1 — Reporting Foundation (V2.0.5 / V2.0.6 / V2.0.7)

Single authoritative handoff for this release group (repository convention: `docs/features/<slug>/HANDOFF.md`).
Order is strict: **A (V2.0.5) → B (V2.0.6) → C (V2.0.7)**. B starts only after A is merged; C only after B is merged into `development`.

## Identity

| Item                      | Value                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                | `KrapaGoutam/The-Lineup`                                                                                                                                                                                               |
| Integration branch        | `development` @ `fbf44a1` (PR #354 merged; V2.0.5 timezone fix)                                                                                                                                                        |
| Production                | `main` — untouched, no changes authorized                                                                                                                                                                              |
| Environment               | Local worktree only. Neon (external Monks) never touched in the correction pass. No Supabase DEV writes. No payroll/financial records touched.                                                                         |
| Current batch             | **B — V2.0.6** (PR #355 reviewed and corrected; awaiting exact-head CI and owner merge decision)                                                                                                                       |
| Batch A branch / commit   | `fix/v2-005-monks-neon-timezone` / PR #354 merged at `fbf44a1a2cc5158bf372e43967562b88a70bd68f`                                                                                                                        |
| Batch B branch / worktree | `feature/v2-006-monthly-attendance-reports` / `.tmp/v2-006-monthly-attendance-reports`                                                                                                                                 |
| Batch B PR                | #355 → `development`                                                                                                                                                                                                   |
| Batch B reviewed head     | `c5cd729abad91fb823cf723914d97dae832efd36` (Antigravity implementation; CI `application` failed at `format:check`, run `44355259400`; `browser-smoke` passed)                                                          |
| Batch B corrected head    | The commit that contains this file, i.e. the PR #355 head after the correction push. A commit cannot contain its own hash; the exact SHA and CI run ids are recorded in the PR #355 comment and the completion report. |

## Batch A — V2.0.5 Monks Neon timezone

Merged to `development` via PR #354 (`fbf44a1a2cc5158bf372e43967562b88a70bd68f`) after passing independent review and CI gate.
Evidence retained: Neon clock columns are `timestamp without time zone` (local wall time); fix at the Neon data boundary
(`::text` + `neonWallTimeToInstantIso`, America/Chicago); 13 new tests pass under `TZ=UTC / America/Chicago / Asia/Tokyo`;
read-only live probe OK; typecheck/lint/prettier clean; exact-head CI green; independent review PASS.

## Batch B — V2.0.6 Monthly Attendance Reports, Statements & Dynamic Branding

### What Antigravity delivered (commit `c5cd729`)

- **B1 filters**: `AttendanceMonthNav`, presets (This month / Last month / This week / Last week / Today), custom range, single / multiple / all employees (`profileIds` on `getNativeAttendanceReportAction` and `listNativeAttendance`), manager roster via `listLocationEmployeesAction`.
- **B2 unified contract**: `UnifiedAttendanceReport` with `normalizeNativeAttendanceToUnified` and `normalizeNeonAttendanceToUnified`.
- **B3 print**: `UnifiedAttendancePrintDialog` (All / Selected / Single), `.print-timesheet-table` header repeat and row-break rules in `globals.css`.
- **B4 branding**: `resolveReportBrand` + `ReportLetterhead`.

### Independent review findings (this pass)

| #   | Severity | Finding                                                                                                                                                                                                                                                            | Status                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| F1  | CI       | `HANDOFF.md` failed `prettier --check` (CI run `44355259400`).                                                                                                                                                                                                     | Fixed (file re-formatted with pinned Prettier 3.6.2)        |
| F2  | High     | Monks Webster letterhead printed **"Webster, New York"**. The restaurant is in Webster, Texas. The error pre-dated B (original `report-letterhead.tsx`) and had been copied into the new resolver and tests.                                                       | Fixed                                                       |
| F3  | High     | Native normalizer rounded each shift to 0.1h **before** summing (10 × 1h57m30s printed 20.0h; exact 19.58h).                                                                                                                                                       | Fixed                                                       |
| F4  | High     | Native normalizer **fell back to gross elapsed seconds** when net payable was null, so a shift with an unclassified break was reported as payable hours. This contradicts the native model (`summarizeNativeReport`: net only, unresolved counted, never guessed). | Fixed                                                       |
| F5  | Medium   | Voided sessions were counted as shifts and hours on the statement (native model excludes them).                                                                                                                                                                    | Fixed (excluded and counted separately)                     |
| F6  | High     | Footer printed `Page {n} of {employee-section count}`; an employee spanning two physical pages produced wrong numbers.                                                                                                                                             | Fixed (removed; see decision)                               |
| F7  | High     | A truncated read (2,000-row limit, newest-first) was passed silently into the statement, so oldest days of the month were missing and totals were wrong while looking complete.                                                                                    | Fixed (printing blocked)                                    |
| F8  | Medium   | `ResolveBrandInput.logoMarkup` fed `dangerouslySetInnerHTML` from caller input (not exploitable today; no caller passed it, but it invited raw-HTML injection).                                                                                                    | Fixed (input removed; only trusted constants)               |
| F9  | Medium   | `profileIds` had no length bound (unbounded IN-list).                                                                                                                                                                                                              | Fixed (max 200, UUID-validated)                             |
| F10 | Low      | Liquor Tap city/state was guessed from the location name (`nasa` → "Houston, Texas", otherwise "League City, Texas").                                                                                                                                              | Fixed (address taken from the location record; no guessing) |
| F11 | Low      | Empty multi-select silently meant "all employees"; copy was "All employees (no filter)".                                                                                                                                                                           | Fixed (explicit wording)                                    |
| F12 | Info     | Handoff claimed the Neon normalizer was part of the delivered UI. It is **not wired to any component**; only the native source feeds the new statement UI.                                                                                                         | Documented (see Functional coverage)                        |

Non-issues confirmed: RLS and tenant isolation (see Security), `profileIds` cannot widen access, SVG logo constant is trusted and only that constant reaches raw HTML, US Letter `@page`, header repeat and row-break CSS.

### Corrected files

- `src/features/attendance/domain/unified-attendance-report.ts` — integer-second aggregation, hours basis, unresolved/voided/partial handling.
- `src/features/attendance/domain/unified-attendance-report.precision.test.ts` (new) — 10 regression tests.
- `src/components/print/report-branding.ts` (+ test) — correct Monks address, location-address-first, no name guessing, no caller logo markup.
- `src/components/print/report-letterhead.tsx` (+ test) — street address line, no `logoMarkup` pass-through.
- `src/features/attendance/components/unified-attendance-print-dialog.tsx` (+ test) — no page counts, partial-report block, totals row, hours basis.
- `src/features/attendance/components/native-attendance-report.tsx` (+ test) — location address to brand, `truncated` to report, clearer clear/empty copy, truncation banner text.
- `src/features/attendance/actions/native-report-actions.ts` (+ test) — `profileIds.max(200)`, location address on the source view.
- `src/features/attendance/data/native-report-data.test.ts` — IN-list keeps the location scope.
- `docs/features/v2-0-5-6-7-reporting-foundation/HANDOFF.md`, `tasks/current-task.md`.

### Decisions

**Financial precision.** Canonical unit is integer seconds. Native hours = `netPayableSeconds` of closed, non-voided sessions only (identical to `summarizeNativeReport().resolvedNetPayableSeconds`). Open sessions and sessions with an open/unclassified break contribute no hours and are counted as _unresolved_; gross elapsed is never substituted. Neon hours = source `hours_worked`, converted once to whole seconds and summed as integers (source gross/net policy is the source's own and is labelled as such). Rounding to 0.01h happens only in `formatHoursDisplay`. The statement prints the hours basis and the unresolved-shift count. The payroll financial source of truth, snapshots and paid amounts are untouched.

**Print pagination.** "Page X of Y" removed. Browsers expose no reliable physical page count to HTML, and `@page` margin-box counters are Chromium-only. Each employee still starts on a new page (`break-after: page`); long tables repeat their header and never split a row. Physical page numbering is deferred (see Deferred).

**Truncation.** When the read hits its row limit the report is flagged `isPartial`. The print dialog then renders no statement at all (so browser print cannot output one), disables Print and explains how to narrow the range. The on-screen banner says the same. No pagination rewrite was needed: a 92-day range cap and 2,000-row limit remain.

**Branding.** Order: canonical `locations.address` → verified constants (Monks Webster address `1416 FM 528 Rd, Suite D, Webster, TX 77598`, logo, `monkswebster.com`, used only for the Webster branch) → nothing. Another Monks branch with no address does not inherit Webster's. Liquor Tap League City / NASA are identified by branch name only, never receive Monks branding, website or logo, and print no address until one is on the location record.

### Security findings

- Reads go through `attendance_session_summaries` (`security_invoker = true`), so base-table RLS applies: a member reads **own** rows, or any row at a location where `private.attendance_can_manage_location` holds; a restrictive module-enforcement policy only removes access. `profileIds`/`profileId` are an extra `AND` and can only narrow.
- Action path: `resolveContext` verifies session, active member, primary location and the R1 stale-tab `expectedLocationId`; the location is the server-verified one, never client-supplied. Roster action requires `attendance_can_manage`.
- Existing pgTAP `0073_attendance_v2_foundation` already covers (RLS, existing assertions): unrelated org member sees nothing; foreign-organization user sees nothing; an employee sees only their own sessions; a b1 manager reads b1 but not b4. Because access is evaluated per request, loss of a location assignment removes access on the next call. pgTAP was **not re-run** in this pass (no DB change).
- New focused tests: IN-list keeps location scope; oversized or non-UUID `profileIds` rejected before any read; truncation surfaced.
- Only the repo-controlled `THE_MONKS_LOGO_MARKUP` constant can reach `dangerouslySetInnerHTML`; tests assert caller markup is ignored.

### Functional coverage (honest status)

| Capability                                                   | Status                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This month / Last month / explicit month-year / custom range | Implemented (UI tests cover presets; month nav from B1)                                                                                                   |
| Single / multiple / all authorized employees                 | Implemented for managers (native source); staff see only themselves                                                                                       |
| Native internal attendance statement                         | Implemented and print-verified                                                                                                                            |
| External Monks (Neon) attendance statement                   | **Partial**: `normalizeNeonAttendanceToUnified` exists and is tested but is **not wired** to the Neon workspace UI. Existing Neon print path is unchanged |
| Empty results, missing punches, overnight, DST               | Domain tests (overnight stays on service date; 25h DST fall-back keeps real elapsed seconds). No DST payroll reconciliation performed                     |
| Organization branding                                        | Implemented with the limits above                                                                                                                         |
| Physical page numbering                                      | Not provided (deferred)                                                                                                                                   |

### Verification evidence

- Antigravity (reused where still valid): 35 attendance/print files / 403 tests; 4,375 repository tests (7 skipped); lint/typecheck clean; browser-smoke CI green on `c5cd729`.
- This pass, targeted: `src/features/attendance`, `src/features/payroll`, `src/components/print`, `src/lib` — 68 files / 823 tests pass. `tsc --noEmit` and `eslint --max-warnings=0` (attendance, print) exit 0. Prettier verified on changed files.
- **Real print check (Chromium via Playwright, US Letter, print media, temporary harness route since removed):** PDF = 4 pages, MediaBox 612 × 792 pt (Letter); a 61-row employee spans 2 pages, two others 1 page each (4 total, matching section breaks); no horizontal overflow of tables; `thead` = `table-header-group`, `tr` `break-inside: avoid`; no dialog chrome, buttons or inputs visible in print; white background; no "Page n of" text; letterhead shows `1416 FM 528 Rd, Suite D` / `Webster, TX 77598`. **Not verified:** pixel-level inspection of PDF pages 2+ (no PDF rasteriser on this machine), so header repetition on a continuation page is confirmed from computed CSS only; Safari and Firefox print engines not tested.
- Exact-head GitHub CI for the corrected head: see PR #355 comment.

### Merge status

PR #355 is open against `development`. Not merged. Required: green exact-head CI, independent review result, and owner approval for the merge commit (repository merge-commit convention).

### Files in the original delivery

`report-branding.ts`/`.test.ts`, `report-letterhead.tsx`/`.test.tsx`, `unified-attendance-report.ts`/`.test.ts`, `unified-attendance-print-dialog.tsx`/`.test.tsx`, `native-report-data.ts`, `native-report-actions.ts`/`.test.ts`, `native-attendance-report.tsx`/`.test.tsx`, `attendance-workspace.test.tsx`, `globals.css`, `tasks/current-task.md`.

### Deferred

- Physical page numbering (needs `@page` margin boxes with a supported fallback or server-side PDF).
- Wiring the Neon normalizer to the Monks attendance workspace statement.
- Pixel-level PDF inspection and Safari/Firefox print checks.
- Historical DST payroll reconciliation (no payroll or snapshot recalculation was attempted).
- Address on Liquor Tap location records (needed to print their address).

## Batch C — V2.0.7 Combined Attendance & Payroll Reporting (planned, not started)

The earlier proposal (`feature/v2-007-payroll-enhancements`) was too narrow and is superseded.
Preferred branch: `feature/v2-007-combined-reporting`. Starts only after PR #355 is merged into `development`.

Scope:

- Reporting Center navigation.
- Authorized organization and branch aggregation.
- All / selected / individual employees.
- Attendance only, Payroll only, or Both.
- Combined or separate document output.
- Cover and executive summary.
- All-employee payroll register.
- Individual employee statements.
- Attendance detail pages.
- Adjustments and payment ledger.
- Financial source attribution and reconciliation.
- Role / capability authorization.

Inputs from Batch B to reuse: `resolveReportBrand` / `ReportLetterhead`, the `UnifiedAttendanceReport` contract (seconds-based, with `hoursBasis`, `isPartial`, `totalUnresolvedShifts`), and the print-isolation CSS. Payroll remains the financial source of truth; attendance hours are never converted into paid amounts here.

Next action: owner decision on PR #355 merge, then a Batch C discovery pass.
