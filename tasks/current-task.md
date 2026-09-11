# Current Task: Ledger → Modal (Phase 5 of the mega-request)

**Active Spec:** none (bounded phase, not a numbered feature) — see
`docs/agent-handoff.md` for the full mega-request context and remaining
phases.
**Branch:** `feature/payroll-modal-workflow` (same branch as Phase 4 —
PR #37, stacked on `feature/payroll-bulk-generation`), 2nd commit.
**Status:** Complete — ready to commit and push.
**Assigned Agent:** Claude Code

## 🎯 Objective

Move the payroll ledger from expanding inline at the bottom of the
page into a modal dialog, for the privileged ("click a period row")
entry point only. Phase 5 of the mega-request; see
`docs/agent-handoff.md` for the full picture.

## 🛠️ What was built

- New `LedgerDialog`: the same fixed-overlay + `Card` modal shell
  pattern as `GenerateFormDialog` (Phase 4), factored separately since
  the ledger needs a real close button available even during its
  error/loading states, not just once it successfully renders.
- `PeriodLedgerPanel` gained an **optional** `onClose?: () => void`
  prop. Provided → the whole component (all three of its
  error/loading/success states) renders inside `LedgerDialog`. Omitted
  → renders exactly as before, a plain inline `Card`.
- **Only `PrivilegedPayrollView`'s entry point passes `onClose`**
  (modal). `SelfPayrollView`'s usage deliberately stays inline — a
  regular employee's ledger _is_ their "My Payroll" page's primary
  content, not a triggered popup.
- Internally, the component's single JSX return was split into named
  fragments (header/content/print-area/combined-statement-dialog)
  computed once, then assembled into either a plain `Card` or a
  `LedgerDialog` — preserving the exact print-isolation structure
  (print-only area as a flat sibling of the `print:hidden` screen
  content) Feature 033 established.

## 🔒 Non-negotiables honored

- No new modal system — reused the exact fixed-overlay `Card` pattern.
- Print/export (print statement, download CSV, combined statement)
  still work identically from inside the dialog — verified by the
  existing print regression test, now scoped through the dialog.
- Print isolation preserved exactly — the printable area stays a flat
  `hidden print:block` sibling of the `print:hidden` screen chrome in
  both the modal and inline render paths, matching Feature 033's
  established architecture.

## 🧪 Tests

- Strengthened the existing "PeriodLedgerPanel's single-statement
  print..." test: asserts the ledger now opens as a real
  `role="dialog"` element with the expected dynamic aria-label
  ("August 2026 Ledger"), scopes every subsequent query through
  `within(ledgerDialog)`, and adds an explicit close-button click
  asserting the dialog actually unmounts.
- No new test file — this phase extends existing coverage rather than
  adding a new surface.

## ✅ Verification Gate

- [x] `npm run format:check` — clean.
- [x] `npm run lint` — clean.
- [x] `npx tsc --noEmit` — clean.
- [x] `npx vitest run` — 44/44 files, 332/332 tests (same count — one
      test strengthened, none added).
- [x] `npm run build` — clean.
- [x] `npm run test:e2e -- --project=desktop` (full suite, regression
      check) — 51/51.

## 🗂️ File List

- `src/features/payroll/components/payroll-workspace.tsx`
- `src/features/payroll/components/payroll-workspace.test.tsx`
- `docs/agent-handoff.md`
- `tasks/current-task.md` (this file)

## Current State & Next Step

This phase is complete and quality-gated. Next: commit as a second
commit on `feature/payroll-modal-workflow`, push, update PR #37's
description, verify CI, then continue to Phase 6 (ledger unlock) per
`docs/agent-handoff.md`.
