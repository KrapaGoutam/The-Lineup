# Current Task: Generate Payroll → Modal (Phase 4 of the mega-request)

**Active Spec:** none (bounded phase, not a numbered feature) — see
`docs/agent-handoff.md` for the full mega-request context and remaining
phases.
**Branch:** `feature/payroll-modal-workflow`, branched from
`feature/payroll-bulk-generation` (Phase 3, PR #36) — **not** from
`main` directly, since this phase rewrites the exact placement of the
function Phase 3 just rewrote the content of. This PR's base should be
`feature/payroll-bulk-generation` until PR #36 merges, then rebased
onto `main`.
**Status:** Complete — ready to push and open a (stacked) PR.
**Assigned Agent:** Claude Code

## 🎯 Objective

Move "Generate Payroll" from an inline `<Card>` that expands
awkwardly below the page into a proper modal dialog, reusing this
codebase's existing modal convention. Phase 4 of the mega-request; see
`docs/agent-handoff.md` for the full picture.

## 🛠️ What was built

- New `GenerateFormDialog`: the fixed-overlay + `Card` modal shell
  (`role="dialog" aria-modal="true" aria-label="Generate Payroll"`,
  close `X` button, click-outside-to-close) — the exact same pattern
  `PayrollPrintDialog`/`CombinedStatementDialog` already use. No new
  modal system introduced.
- `GenerateForm` stripped of its own `Card`/header chrome — it's now
  bare content, rendered as `GenerateFormDialog`'s children.
- `PayrollKpiCards`'s toggle button: label is now a static "Generate
  Payroll" (no more "Hide form" toggle text — a modal has its own
  close button), `showGenerateForm` prop removed from its signature
  (unused there now; the workspace's own state variable of the same
  name is still needed to decide whether to mount the dialog).
- `PayrollPeriodGroups`'s empty-state copy updated to reference the
  renamed button.

## 🔒 Non-negotiables honored

- No new modal system — reused the exact existing fixed-overlay `Card`
  pattern, not a shadcn `Dialog` or anything new.
- Bulk-selection logic from Phase 3 untouched — only `GenerateForm`'s
  _placement_ changed, not its content/behavior.

## 🧪 Tests

- Fixed Phase 3's own `payroll-workspace.test.tsx` bulk-generate test
  for the new modal: renamed button-label assertions ("Generate
  period" → "Generate Payroll"), and — the real finding — scoped every
  post-open query to `within(screen.getByRole("dialog", { name:
"Generate Payroll" }))`, since the toolbar's opener button (still
  mounted behind the overlay) and the dialog's own submit button can
  share the exact same accessible name once exactly one employee is
  selected. Documented this gotcha in `docs/agent-handoff.md` for
  Phase 5, which will likely hit the same shape of issue.
- No new tests needed beyond that fix — this phase is a placement
  change, not new behavior.

## ✅ Verification Gate

- [x] `npm run format:check` — clean.
- [x] `npm run lint` — clean.
- [x] `npx tsc --noEmit` — clean.
- [x] `npx vitest run` — 44/44 files, 332/332 tests (same count as
      Phase 3 — no new tests, one fixed).
- [x] `npm run build` — clean.
- [x] `npm run test:e2e -- --project=desktop` (full suite, regression
      check) — 51/51.

## 🗂️ File List

- `src/features/payroll/components/payroll-workspace.tsx`
- `src/features/payroll/components/payroll-workspace.test.tsx`
- `src/features/payroll/components/payroll-kpi-cards.tsx`
- `src/features/payroll/components/payroll-period-groups.tsx`
- `docs/agent-handoff.md`
- `tasks/current-task.md` (this file)

## Current State & Next Step

This phase is complete and quality-gated. Next: commit, push, open a
PR (base `feature/payroll-bulk-generation`, not `main`, until PR #36
merges), verify CI, then continue to Phase 5 (Ledger → modal) per
`docs/agent-handoff.md`.
