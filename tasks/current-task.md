# V2-002.004 — Staff Assignment Management

Canonical docs: `docs/v2.0/features/002-organizations-locations/004-staff-assignment-management/`
Parent Feature: Issue #250 · Program: Issue #248 · Milestone #8
Branch: `feature/v2.0-002.004-staff-assignment-management` (from `origin/development` `4d78eba63ec846198bd3cd654d99221f3f8b7c71`)
Environment: Codex Local (Windows)

## Implementation Checklist

- [x] Baseline recorded; PR #278 verified merged
- [x] Domain: `domain/staff-assignment.ts` (+ tests DOM-001…012)
- [x] Server actions: `actions/staff-assignment-actions.ts` (+ tests ACT-001…017, SEC-001/005/006/010/011)
- [x] UI: Staff tab, Staff Assignments dialog, multi-location editor, role select, badges
- [x] Demo-isolated source (`staff-assignment-demo.ts`)
- [x] Component tests (UI-001…019) and mocked Playwright spec
- [x] format:check, lint, typecheck, `npm test`, `next build --webpack`, check:local-paths
- [x] Docs: PLAN / STATUS / TEST_MATRIX / EVIDENCE, CURRENT_STATE
- [x] Commit, push, open PR into `development`
- [x] Exact-head CI green on `242ba18e78201ca299fb55554db96e7ec7de2e5f`
- [x] **Codex Local**: hosted DEV migration + 149 targeted pgTAP assertions, Overall-admin roster RLS, atomicity/tenant isolation, WebKit tablet 12/12
- [x] Merge commit into `development`: `b08efeee933507dcd4d7e475f2ebab957d47453e`

## Current State & Next Step

V2-002.004 is complete. PR #280 merged into `development` at `b08efeee933507dcd4d7e475f2ebab957d47453e`; hosted DEV and all required gates are verified. V2-002 remains `IN_PROGRESS`; V2-002.005 is next but was not started in this closeout.
