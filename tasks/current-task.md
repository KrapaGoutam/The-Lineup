# #109 UX Consistency — Agent Handoff

Branch: `fix/table-allocation-ux-consistency`
HEAD: see `git log -1` (U1-U5 commits + this validation/handoff commit on top of the base)
Base development: `e2bbd4e` (#134 closeout merge, PR #148)

U1: ✅ Picker inner buttons no longer open the map — `picker-cell-click.ts` (+ unit, + demo e2e that fails unfixed)
U2: ✅ Recent activity from all 18 board_event_type values — `domain/board-activity.ts`, `AllocationContext.recentActivity`, Dashboard list (ordering created_at, id)
U3: ✅ whole-assignment copy — `domain/assignment-scope.ts`, `assignmentTables` on FloorOccupant, Floor panel / Servers dialog / map labels / decision dialog
U4: ✅ Servers + Floor legend counts from the read model; `ServerSummary.unmappedTableLabels`; "N not on the floor map (…)"
U5: ✅ stale comments/status refreshed; historical reports intentionally untouched

Completed: all five items, docs in `docs/features/table-allocation-ux-consistency/` (PLAN, ACCEPTANCE_CRITERIA 15/15, TEST_MATRIX, IMPLEMENTATION_REPORT)
In progress: PR → development, CI
Not started: merge, #109 closure, post-merge docs closeout branch

Files changed: allocation components/domain/data (see PR), tests/e2e + tests/real spec, docs/STATUS.md, docs/ROADMAP.md, multi-view README
Uncommitted: nothing expected (untracked and never staged: `The Lineup.code-workspace`, `docs/testing/`)
Commits: U1 f927959, U2 742e8c5, U3 29d4219, U4 261d2cc, U5 84f153e, then validation/handoff

Tests: Vitest 64 files / 559 tests; lint, typecheck, build pass; demo Playwright desktop + server-mobile 230/230, host-tablet allocation 50/50; hosted real UI (production build, DEV) 18/18. No pgTAP (no DB change).
CI: pending (PR not yet opened when this was written)

#109: open, Project #4 = In Progress, milestone "Future Product Backlog" (#5)
Project #4: In Progress
Milestone: Future Product Backlog (Part 1 milestone is already closed)
PR: —

Docs: see feature directory above

development merged: NO
main merged: NO
DEV touched: YES (hosted real-mode UI suite only; synthetic data; board reset by the suite)
PROD touched: NO

PR #135 untouched: YES

Exact next command: `gh pr create --base development --head fix/table-allocation-ux-consistency` (if not yet open), then `gh pr checks <n> --watch`
Exact next task: wait for CI (application, browser-smoke, Vercel; Database should not trigger), merge with a MERGE COMMIT, comment final evidence on #109, close it, Project #4 → Done, then docs closeout branch `docs/table-allocation-ux-closeout` (STATUS/ROADMAP/this file) → PR → development
Read first: docs/features/table-allocation-ux-consistency/IMPLEMENTATION_REPORT.md
DO NOT: merge to main, touch PROD, squash/rebase-merge, touch PR #135, `git add -A`/`git add .`, stage `docs/testing/` or `*.code-workspace`
