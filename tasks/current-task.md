# V2-002.004 — Staff Assignment Management

Canonical docs: `docs/v2.0/features/002-organizations-locations/004-staff-assignment-management/`
Parent Feature: Issue #250 · Program: Issue #248 · Milestone #8
Branch: `feature/v2.0-002.004-staff-assignment-management` (from `origin/development` `4d78eba63ec846198bd3cd654d99221f3f8b7c71`)
Environment: Claude Code Cloud

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
- [ ] Exact-head CI green (see PR)
- [ ] **Codex Local**: pgTAP, hosted DEV integration, Overall-admin roster RLS check, WebKit tablet run
- [ ] Merge commit into `development` (only after all gates)

## Current State & Next Step

Cloud work complete; state is `READY_FOR_CODEX_LOCAL_VALIDATION`. Next step: Codex Local follows the handoff in `EVIDENCE.md`. Do not start V2-002.005.
