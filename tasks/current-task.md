# Current Task: Table Allocation Version Upgrade Part 1 — Audit and Plan

**Status:** Audit, plan, validation, and local documentation commit complete. Waiting for explicit implementation approval.

**Branch:** `upgrade/table-allocation-v2-part1`

**Base:** fetched `origin/main` at `3403058`

**Audit:** `docs/features/table-rotation-multi-view/VERSION_UPGRADE_PART1_AUDIT.md`

**Plan:** `docs/features/table-rotation-multi-view/VERSION_UPGRADE_PART1_PLAN.md`

## Checklist

- [x] Recover local and remote Git state.
- [x] Preserve the pre-existing untracked `The Lineup.code-workspace` file.
- [x] Verify local `main` equals fetched `origin/main`.
- [x] Create `upgrade/table-allocation-v2-part1` from `origin/main`.
- [x] Read repository instructions and current table-rotation handoff/index.
- [x] Initialize and continuously maintain the audit document.
- [x] Inventory Table Allocation source, tests, migrations, and documentation.
- [x] Audit database tables, relationships, RPCs, RLS, and security-definer code.
- [x] Trace the Floor/Servers End-table RLS defect exactly.
- [x] Audit all five view data flows and the operation matrix.
- [x] Audit occupancy, multi-table, service-session, realtime, hydration, and undo/redo behavior.
- [x] Audit test coverage, migration history, CI/deployment, and CLI identities.
- [x] Attempt read-only production comparison and stop on project identity mismatch.
- [x] Complete findings classification and recommendations.
- [x] Create the implementation plan derived from audit findings.
- [x] Run documentation/basic repository validation.
- [x] Commit only the audit/plan/handoff/task artifacts.
- [x] Withhold push because GitHub and full cloud project identity are not safe; record the blocker.
- [x] Stop and wait for explicit implementation approval.

## Current State & Next Step

The audit records 2 P0, 18 P1, 12 P2, and 2 P3 grouped findings. The two P0 findings are the cross-actor entry UPDATE policy failure for End and missing structural same-session integrity between an entry's round/member and the session used as the lock/authorization guard.

Production parity is not verifiable from the current Supabase context: expected ref `ftadewtkjlaotfdvtjcv` is inaccessible and only unrelated JobQuest projects are visible. GitHub CLI's `KrapaGoutam` token is invalid. The Vercel linked project resolves read-only, but no cloud mutation is permitted until the complete identity gate passes.

Next exact task: user reviews/approves the plan. If approved, restore and verify exact project identities before beginning only the authorized implementation phase. The recommended first authorization is Phase 0 and Phase 1.

## Validation Status

- Allocation Vitest: 73/73 passed during the read-only test audit.
- Documentation Prettier check: passed for all four task artifacts.
- ESLint and TypeScript/Next route type generation: passed.
- Full `npm run check`: format stage is blocked only by the preserved pre-existing untracked `The Lineup.code-workspace`; that user file was not edited.
- Allocation pgTAP: 12 files / 168 planned assertions mapped, not rerun because local Supabase/Docker was unavailable.
- Allocation Playwright: 2 files / 51 tests mapped, not rerun; current configuration is demo-mode and CI desktop-only.
- Production database comparison: blocked safely by Supabase identity mismatch.

## Guardrails

- Do not delete or restore any user files.
- Do not mutate production data, credentials, policies, or migrations.
- Do not implement product changes during this phase.
- Do not merge any branch or pull request.
- Preserve and exclude `The Lineup.code-workspace`.
