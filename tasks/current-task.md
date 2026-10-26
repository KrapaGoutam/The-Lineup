# Cross-View Integrity — Agent Handoff

Branch: `fix/table-allocation-cross-view-integrity`
HEAD: see `git log -1`
Base development: `63fdbe0` (PR #152 merge)

X0: ✅ audit + tracking (#153 parent; #154 Tasks notification follow-up and #155 Tips V2 are planning-only; Project #4; milestone "Table Allocation V2 — Part 2"; #133 status comment posted)
X1: ✅ canonical identity + off-map in all five views
X2: ✅ shared occupied-table resolver + migration `20261026090000` (applied to DEV only)
X3: ✅ Servers session history (ended stays struck through)
X4: ✅ 45-scenario shared matrix (domain + Playwright desktop/tablet/mobile)
X5: ✅ hosted DEV, production build: 10 DB + 11 UI tests; PROD ref absent from bundle
X6: ⬜ after merge to `development`: merge into `infra/dev-preview-ci-reliability`, exact-head CI, new Preview, owner smoke

Canonical identity findings:
Table "1": NO `dining_tables` row — free-text board label, no ledger claim (DEV probe 2026-10-26)
T1: `dining_tables.id` 19 (DEV), registered, mapped at (8,72) — distinct from "1". Never alias.

Off-map contract: registered-unpositioned OR unregistered held label; Grid badge, Floor rail, Picker section, Servers chip, Dashboard totals
Conflict contract: `classifyTableClaim` + `useTableClaim` dialog (Transfer / End + Assign / Cancel); same-server = notice
Transfer: existing `board_transfer`, moves the whole holder assignment
End + Assign: `board_assign(..., p_confirm_transfer, p_end_whole_assignment)`, one atomic call, `assign` event with `displaced`
Combined assignment: acts on the whole assignment; no partial release
Ended-history contract: `ServerSummary.sessionHistory`; ended counts 0 toward active
Stale path: DB raises PT409 with JSON detail; server action returns `conflict`; same dialog opens

Files changed: see PR (allocation domain/components/actions/data, testing/, tests/e2e, tests/real, supabase migration + pgTAP 0030, docs)
Migrations: `supabase/migrations/20261026090000_table_allocation_conflict_resolution.sql` (forward-only; DEV applied + recorded; PROD NOT applied)
Commits: X0 docs, feat (X1-X3), domain/component matrix tests, Playwright matrix, hosted suites, docs closeout
Uncommitted: nothing expected (never stage `docs/testing/`, `The Lineup.code-workspace`)

Tests (final gate 2026-10-26):
domain/component: Vitest 70 files / 663 tests PASS
Playwright matrix: demo suite 489 PASS (desktop + host-tablet + server-mobile), matrix = 45 scenarios x 3
real-mode: hosted DB 50 PASS (40 existing + 10 new); hosted UI on production build 29 PASS (18 existing + 11 new)
production build: PASS (pinned to DEV values, 0 files reference the PROD ref)
DB: pgTAP 30 files / 588 assertions PASS (local Supabase)
lint / typecheck / format: PASS (format only flags the untracked workspace file)
CI: not yet run (PR not opened at time of writing)

GitHub issue: #153 (one parent is enough; no child issues)
Project #4: #153 In Progress; #154/#155 Backlog
Milestone: Table Allocation V2 — Part 2

PR: open `fix/table-allocation-cross-view-integrity -> development` next
PR #135 status: parked, untouched; infra green, awaiting application fix + final owner Preview smoke

Docs updated: PLAN, ACCEPTANCE_CRITERIA, TEST_MATRIX, IMPLEMENTATION_REPORT, docs/STATUS.md, docs/ROADMAP.md
Backlog updated: tasks/backlog.md (#154, #155)

development merged: NO
main merged: NO
DEV touched: YES (migration applied; hosted suites with synthetic data; boards reset by the suites)
PROD touched: NO

Running processes: none (production `next start` on :3000 was stopped)
Exact next command: `git push -u origin fix/table-allocation-cross-view-integrity` then `gh pr create --base development`
Exact next action: open the PR, wait for exact-head CI (application, browser-smoke, Database, Vercel), merge with a MERGE COMMIT, then X6
Read first: docs/features/table-allocation-cross-view-integrity/IMPLEMENTATION_REPORT.md
DO NOT: merge to main, touch PROD, squash/rebase-merge, touch PR #135 before this lands on development, `git add -A`/`git add .`, stage `docs/testing/` or `*.code-workspace`, map "1" to "T1"
