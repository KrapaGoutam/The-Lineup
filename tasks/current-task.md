# Cross-View Integrity — Agent Handoff

Branch: `fix/table-allocation-cross-view-integrity`
HEAD: see `git log -1`
Base development: `63fdbe0` (PR #152 merge)

X0: ✅ audit + tracking (#153 parent, #154 Tasks notification follow-up, #155 Tips V2 planning; Project #4; milestone "Table Allocation V2 — Part 2"; #133 status comment posted)
X1: ⬜ canonical identity + off-map representation
X2: ⬜ occupied-table conflict resolver (+ migration `20261026090000_*`)
X3: ⬜ Servers ended/session-history
X4: ⬜ parameterized cross-view matrix
X5: ⬜ real-mode concurrency / reconnect / service-date
X6: ⬜ PR #135 reintegration

Canonical identity findings:
Table "1": NO `dining_tables` row — free-text board label, no ledger claim (DEV probe 2026-10-26)
T1: `dining_tables.id` 19 (DEV), registered, mapped at (8,72) — distinct from "1"

Off-map contract: registered-unpositioned OR unregistered held label; shown in all five views (see PLAN.md)
Conflict contract: shared `classifyTableClaim` + one dialog; Transfer / End + Assign / Cancel; same-server = notice
Transfer: existing `board_transfer`, moves the whole holder assignment
End + Assign: `board_assign(p_confirm_transfer, p_end_whole_assignment)` single atomic call, `assign` event with `displaced`
Combined assignment: acts on the whole assignment; no partial release
Ended-history contract: `ServerSummary.sessionHistory`; active count excludes ended

Files changed: docs only so far (docs/features/table-allocation-cross-view-integrity/*)
Migrations: none yet (planned `20261026090000_table_allocation_conflict_resolution.sql`)
Commits: see git log
Uncommitted: nothing expected (never stage `docs/testing/`, `*.code-workspace`)

Tests: not run yet
domain: -
component: -
Playwright matrix: -
real-mode: -
production build: -
DB: local Supabase Docker stack is running (pgTAP possible)
CI: -

GitHub issue: #153 (children not created; one parent is enough)
Project #4: #153 In Progress; #154/#155 Backlog
Milestone: Table Allocation V2 — Part 2

PR: not opened
PR #135 status: parked, untouched; infra green, awaiting application fix + final owner Preview smoke

Docs updated: PLAN, ACCEPTANCE_CRITERIA, TEST_MATRIX, IMPLEMENTATION_REPORT (X0)
Backlog updated: see tasks/backlog.md

development merged: NO
main merged: NO
DEV touched: YES (read-only identity probe)
PROD touched: NO

Running processes: none
Exact next command: `git status -sb` then continue X1 (see PLAN.md)
Exact next action: implement `domain/table-identity` + off-map read model (X1)
Read first: docs/features/table-allocation-cross-view-integrity/PLAN.md
DO NOT: merge to main, touch PROD, squash/rebase-merge, touch PR #135 before this lands, `git add -A`/`git add .`, stage `docs/testing/` or `*.code-workspace`, map "1" to "T1"
