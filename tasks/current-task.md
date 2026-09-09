# Current Task: Feature 033 — Print Layout Hardening, Isolation, and Duplex Pagination

**Active Spec:** `docs/features/033-print-layout-hardening-duplex.md`
**Branch:** `feature/033-print-layout-hardening-duplex` (branched from
`main`, after Feature 032 / PR #31 merged)
**Status:** Complete — PR open: https://github.com/KrapaGoutam/The-Lineup/pull/33
**Assigned Agent:** Claude Code (implementation, verification gate, and PR)

## 🎯 Objective

Fix three real print bugs (Dashboard Leak, single-page overflow for
Attendance/Payroll, and enforce strict 2-page-per-employee duplex
pagination for the Combined Monthly Statement) without reintroducing
the `visibility:hidden`/`position:absolute` isolation anti-pattern this
codebase's own Feature 030 bug-fix pass already identified and moved
away from.

## 📖 Key Findings & Architecture

1. **Audited before trusting the bug list.** Of the four claimed bugs,
   one ("Trailing Blank Page") was already fixed
   (`.print-page-break:last-child` in `globals.css`, from Feature 030).
   The Combined Statement file path named in the request
   (`src/components/reports/combined-statement-dialog.tsx`) doesn't
   exist -- the real file is
   `src/features/payroll/components/combined-statement-dialog.tsx`.
   `attendance-print-dialog.tsx` (named for a Step 2 fix) is a
   scope-picker dialog with zero printable content; the real Attendance
   print markup lives in `attendance-report.tsx`'s `PrintableReport`.
2. **"Dashboard Leak" was real, narrowly.** Only
   `attendance-report.tsx`'s own screen-only render branches lacked
   `print:hidden` (confirmed via grep before any fix). Every other
   print surface (`payroll-workspace.tsx`, `payroll-print-dialog.tsx`,
   `combined-statement-dialog.tsx`) was already correctly isolated.
3. **Kept the existing isolation strategy, not the spec's literal
   one.** `globals.css`'s own header comment documents that
   `visibility:hidden`+`position:absolute` is "a known cause of
   duplicate/blank-page print bugs" and was deliberately replaced with
   `hidden print:block`/`print:hidden`. Re-implementing the literal
   spec'd mechanism would have risked reintroducing that bug class.
   Fixed the real gap (two screen-wrapper `<div>`s missing
   `print:hidden`) inside the existing, proven pattern instead --
   documented in full in the feature doc's "Decisions and risks"
   section, mirroring the Feature 035 "anonymize, don't hard-delete"
   precedent from this same session (literal instruction conflicts with
   an already-fixed architectural decision → fix the real root cause
   under the existing architecture, don't revert the fix).
4. **Page counts can't come from Playwright DOM assertions.**
   Verified actual pagination with a one-off script that drove a real
   signed-in demo session and called
   `page.pdf({ preferCSSPageSize: true })` (the real Chromium print
   pipeline), then counted `/Type /Page` objects in the resulting PDF
   bytes -- Attendance single-employee: 1 page; Combined Statement: 2
   pages; "All employees" (5 demo employees): 5 pages, no trailing
   blank. A full-page screenshot with `page.emulateMedia({media:"print"})`
   visually confirmed no dashboard leak.

## 🔒 Non-negotiable Constraints

- No change to the print isolation _strategy_ (`hidden print:block`) --
  extend it to newly-found gaps, never reintroduce
  `visibility:hidden`/`position:absolute`.
- No data-fetching, authorization, or API changes -- print CSS and
  print-surface JSX only.
- The Combined Statement's two duplex pages must stay flat siblings of
  the print area (never nested under a shared per-employee wrapper),
  so `.print-page-break:last-child` keeps correctly identifying only
  the batch's true final page.
- Quality gates (`npm run check`, `npm test`, relevant Playwright
  specs) pass before every commit.

## 🛠️ Implementation Steps

- [x] **Step 1: Audit.** Read `attendance-print-dialog.tsx`,
      `payroll-print-dialog.tsx`, `attendance-report.tsx`,
      `combined-statement-dialog.tsx`, `globals.css`, and
      `restaurant-operations-app.tsx`'s `<main>`/`<header>`/`<nav>`
      structure before writing any code. Found the real root causes and
      two wrong file-path assumptions in the original request (see
      feature doc's "What the audit actually found").
- [x] **Step 2: Global Print CSS.** Added the missing
      `@page { size: letter portrait; margin: 8mm 8mm 6mm 8mm; }` to
      `globals.css`; compacted `.print-timesheet-table` cell
      padding/font-size. Deliberately did not add the
      `.print-report-container`/`visibility:hidden` rules from the
      original spec (see Constraints above).
- [x] **Step 3: Fix Dashboard Leak.** Wrapped every screen-only render
      branch in `attendance-report.tsx` (`accessError`, `!access`,
      `unlinked`, `all`-scope loading/error, and the real `self`/`all`
      content) in `print:hidden` -- as a _sibling_ of
      `CombinedStatementDialog`/`PrintableReport`, not their ancestor.
- [x] **Step 4: Attendance single-page guarantee.** Removed
      `PrintableReport`'s forced `min-h-[98vh]`, compacted padding/KPI
      margins, tightened the signature block (`mt-8 pt-6` →
      `mt-2 pt-3`) with `break-inside-avoid`.
- [x] **Step 5: Payroll single-page guarantee.** Compacted
      `payroll-print-dialog.tsx`'s per-employee page padding
      (`p-10` → `p-6`).
- [x] **Step 6: Combined Statement duplex restructuring.** Rewrote
      `combined-statement-dialog.tsx`'s per-employee render from one
      `.map` producing one page to a `.flatMap` producing two flat
      `.print-page-break` pages (Attendance, then Payroll +
      signatures), each with its own full letterhead.
- [x] **Step 7: Fix the two tests this broke.** Updated
      `combined-statement-dialog.test.tsx` and
      `payroll-workspace.test.tsx` (letterhead text now appears twice
      per statement, `.print-page-break` count doubled) and
      `payroll-timesheet-overhaul.spec.ts` (same, plus an explicit
      `.print-page-break` count assertion).
- [x] **Step 8: Quality gate.** `npm run check` (0 errors/warnings),
      `npx vitest run` (44 files, 325/325 -- unchanged count).
- [x] **Step 9: E2E regression check.** `attendance-reporting.spec.ts` +
      `payroll-timesheet-overhaul.spec.ts`, 30/30 across
      desktop/host-tablet/server-mobile.
- [x] **Step 10: Live pagination verification.** Started the dev server
      in demo mode, drove a real signed-in session, and rendered the
      actual paginated PDF output via `page.pdf({ preferCSSPageSize: true })`
      for Attendance (1 page), Combined Statement (2 pages), and "All
      employees" Attendance (5 pages, no trailing blank) -- plus a
      print-media screenshot confirming no dashboard leak. Cleaned up
      the dev server process and all script/PDF/screenshot artifacts
      afterward.
- [x] **Step 11: Documentation.**
  - [x] New `docs/features/033-print-layout-hardening-duplex.md`.
  - [x] Updated `docs/STATUS.md` (Current Status Overview, Feature
        Matrix row).
  - [x] This task file.
- [x] **Step 12: Commit + push + PR.**
  - [x] Commit with a clear conventional-commits message (`59662f5`).
  - [x] Push `feature/033-print-layout-hardening-duplex`.
  - [x] Open [PR #33](https://github.com/KrapaGoutam/The-Lineup/pull/33)
        against `main`.

## 🗂️ File List

- `src/app/globals.css`
- `src/features/attendance/components/attendance-report.tsx`
- `src/features/payroll/components/payroll-print-dialog.tsx`
- `src/features/payroll/components/combined-statement-dialog.tsx`
- `src/features/payroll/components/combined-statement-dialog.test.tsx`
- `src/features/payroll/components/payroll-workspace.test.tsx`
- `tests/e2e/payroll-timesheet-overhaul.spec.ts`
- `docs/features/033-print-layout-hardening-duplex.md` (new)
- `docs/STATUS.md`
- `tasks/current-task.md`

## Current State & Next Step

Feature 033 is fully complete: implemented, unit-tested,
e2e-regression-swept, live-verified via real PDF pagination (not just
DOM assertions), documented, committed (`59662f5`), pushed, and opened
as [PR #33](https://github.com/KrapaGoutam/The-Lineup/pull/33) against
`main`. Nothing further pending on this branch.
