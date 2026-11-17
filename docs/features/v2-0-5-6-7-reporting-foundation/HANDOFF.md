# Release Group 1 — Reporting Foundation (V2.0.5 / V2.0.6 / V2.0.7)

Single authoritative handoff for this release group (repository convention: `docs/features/<slug>/HANDOFF.md`).
Order is strict: **A (V2.0.5) → B (V2.0.6) → C (V2.0.7)**. B starts only after A is merged; C only after B is verified.

## Identity

| Item                      | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Repository                | `KrapaGoutam/The-Lineup`                                                                           |
| Integration branch        | `development` @ `39ed0d4` (PR #350 merged; V2.0.4 PR #348 merged at `2e742f5`)                     |
| Production                | `main` — untouched, no changes authorized                                                          |
| Environment               | Local worktree only. Neon (external Monks) read **only**, aggregates only. No Supabase DEV writes. |
| Current batch             | **A — V2.0.5** (implemented, PR open — see Git delivery)                                           |
| Batch A branch / worktree | `fix/v2-005-monks-neon-timezone` / `.tmp/v2-005-monks-neon-timezone`                               |

## Batch A — V2.0.5 Monks Neon timezone

### Root cause (evidence-backed)

- Neon `attendance.clock_in` / `clock_out` are **`timestamp without time zone`** (`information_schema`), database session timezone `GMT`.
- The source application stores the restaurant's **local wall-clock time (America/Chicago)** in them. Evidence (800 rows, 2026-06-01 → 2026-11-17):
  - Median clock-in hour is **11 in every month** Jun–Nov. A real UTC instant would shift one hour across the DST boundary (Nov 1); a wall-clock value does not.
  - `hours_worked` equals the naive `clock_out − clock_in` for 779/779 closed rows.
  - `clock_in` calendar day equals `date` for 799/799 rows when read naively.
- The previous reader let the driver parse the zone-less value. node-postgres (`pg-types`) interprets it in the **process** time zone. On a UTC server (Vercel) stored `10:59` became the instant `10:59Z`, which renders in Chicago as **4:59 AM (CST) / 5:59 AM (CDT)**. A Central-time developer machine rendered correctly, which is why earlier local "live verification" passed. Reproduced exactly (`TZ=UTC` → 4:59 AM; `TZ=America/Chicago` → 10:59 AM).
- The reported "6 hours" is a CST artefact (it is 5 hours in CDT) — confirming it is **not** a fixed offset bug and no fixed offset is used.
- Classification: _timezone-naive source value, mis-parsed by the driver in the server's process zone_ (not a double conversion in the UI; the UI formatters already take an explicit zone).

### Fix (smallest layer)

- `attendance-data.ts`: both Neon attendance queries return `clock_in::text as clock_in_local` / `clock_out::text as clock_out_local` (aliases differ from the columns so `ORDER BY clock_in` still sorts on the real column). The driver never builds a `Date` from them.
- New pure module `src/features/attendance/domain/neon-timestamp.ts`: `neonWallTimeToInstantIso(text, timeZone = "America/Chicago")` resolves wall time → instant with the existing `zonedWallTimeToInstant` (Intl-based, DST-aware). Preserves seconds/fraction. Malformed / impossible / already-zoned input **throws** (no guessing; the fetch layer surfaces "Attendance data unavailable").
- `NeonAttendanceRow` contract is unchanged (`clockIn`/`clockOut` stay ISO instants), so every consumer (Attendance report, combined statement dialog, payroll statements, Tips roster) is corrected without edits.
- Stale comments in `src/lib/date-time.ts` corrected. `docs/features/018` claim "genuine `timestamptz`" corrected.

### Downstream impact review

| Surface                                                    | Uses                                                                                                                                         | Impact                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Attendance table / detail / report                         | `clockIn/Out` instants → `zonedWallTimeFromInstant(tz)`                                                                                      | **Corrected** (was 5–6 h early on UTC servers)                                   |
| Combined statement dialog / print                          | `formatBusinessTime(tz)`                                                                                                                     | **Corrected**                                                                    |
| Payroll preview, generate, statements, financial snapshots | `hoursWorked` (source `hours_worked`) + Neon `date` only; instants are display-only (`financial-source.ts` sets `grossElapsedSeconds: null`) | **No financial change. No payroll recomputation. Existing snapshots untouched.** |
| Tips "pull clocked-in" roster                              | Neon `date` + open-shift predicate (no instants)                                                                                             | Unaffected                                                                       |
| Internal Lineup attendance (`native-*`, kiosk)             | Supabase `timestamptz`                                                                                                                       | **Untouched** (no import of the new module; verified by grep)                    |

### Findings recorded (not fixed here — need owner decision)

1. **Fall-back overnight shifts.** For a shift spanning the Nov DST fall-back hour, true elapsed time is 1 h longer than the source's naive `hours_worked`. Payroll uses `hours_worked`, so no code change; whether such shifts were over/under-paid historically is a financial-data question requiring an approved reconciliation strategy. Display now shows correct wall times; durations in this report remain `hours_worked`.
2. **Ambiguous repeated hour (01:00–02:00 on fall-back day).** The source cannot say which occurrence; policy is first occurrence (existing `zonedWallTimeToInstant` rule). Restaurant is closed then; impact negligible.
3. The Neon source zone is a constant (`EXTERNAL_NEON_SOURCE_TIME_ZONE = "America/Chicago"`, an IANA zone — not an offset) because Monks Webster is the only external source. A second external source would need a per-source zone parameter (the mapper already takes `timeZone`).

### Validation (actually run)

- `neon-timestamp.test.ts` (new, 13 tests) + `attendance-data.test.ts` + `src/lib/**`: 22 files / 250 tests pass under **`TZ=UTC`, `TZ=America/Chicago`, `TZ=Asia/Tokyo`**. Covers: reported 10:59 AM case; CST vs CDT; spring-forward and gap; fall-back ambiguity; fractional seconds; overnight; historical vs recent; duration from instants vs `hours_worked`; 12 h vs 24 h renderer agreement; invalid/zoned/impossible input; SQL asserts text alias + real-column ordering.
- Live read-only E2E through the real reader, `TZ=UTC` process, 78 rows 2026-11-01→17: Chicago-hour histogram {10:31, 11:34, 14:1, 15:5, 16:3, 22:3}, `date` mismatches 0, max duration error vs `hours_worked` 0.005 h (source rounding).
- `npm run typecheck` clean; ESLint `--max-warnings=0` clean on changed files; Prettier clean.
- **Not run locally:** full `npm test`, `npm run build`, Playwright, pgTAP — delegated to exact-head CI on the PR (no schema/UI change in this batch).

### Database / data preservation

No migration. No Supabase writes. Neon: read-only `SELECT`s only (schema + aggregates; no names, no credentials printed). No Neon record rewritten.

## Git delivery (Batch A)

Filled at PR time — see PR on `development`. Merge requires CI green on exact head + independent review.

## Resume instructions

1. If Batch A PR is not merged: review PR, confirm exact-head CI, merge into `development` (owner approval for merge if repo rules require).
2. Then start Batch B from the new `development` HEAD: branch `feature/v2-006-monthly-attendance-reports`, new worktree `.tmp/v2-006-monthly-attendance-reports`. Reuse `src/features/attendance/domain/attendance-report.ts`, `native-report.ts`, `components/attendance-report.tsx` + `native-attendance-report.tsx`, `features/payroll/components/combined-statement-dialog.tsx` (existing print), `src/lib/date-time.ts`.
3. Batch B scope questions to resolve from code first (not yet inspected): existing print/PDF infrastructure, org branding/logo config, Attendance filter UI, capability resolver for report scoping.

## Prohibited / known risks

- Do not touch `main`/Production; do not deploy migration 92 or other shelved migrations; no Neon writes; no payroll recomputation.
- `node_modules` in the worktree is a junction to the main checkout's (Next 16.4.3 vs lock 16.4.6): fine for vitest/lint/tsc, **do not run `next build` through the junction**.
- Pre-existing dirty main worktree (untracked `.tmp/`, `scripts/manage-dev-module.mjs`, `tests/real/ui/v2-0-4-*.spec.ts`) was not modified.
