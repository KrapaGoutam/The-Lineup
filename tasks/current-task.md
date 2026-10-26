# Canonical Table Input Resolution — Handoff

Branch: `fix/table-input-canonical-resolution`
HEAD: see `git log -1` (feature commit `faeca66` + closeout docs/tests commit)
Base development: `23e38a9` (PR #135 merge commit)

PR #135: MERGED into `development` with a merge commit `23e38a9` (head `1234ada`, exact-head CI green, owner Preview smoke PASS per the owner)
#133: CLOSED, Project #4 Done (milestone "Platform / CI Reliability" stays open: 12 other open issues)
#153: CLOSED, Project #4 Done
Owner smoke: PASS (owner statement); new contract correction tracked separately

Issue: #157 `[Bug] Resolve numeric Grid table input to registered physical tables` (type:bug, module:table-allocation, priority:p1)
Project #4: #157 In Progress -> Done after merge
Milestone: Table Allocation V2 — Part 2

Current phase: DONE. R0–R7 complete; PR #158 merged into development (merge commit f8fa191, head caef5aa, exact-head CI green).
R0 ✅ R1 ✅ R2 ✅ R3 ✅ R4 ✅ R5 ✅ R6 ✅ R7 ✅

Resolver contract:
Exact label: registered active label (trimmed, case-sensitive, same location) wins
Numeric shorthand: digits-only and no exact match -> `T` + digits if registered
Free-text fallback: trimmed text, no claim, off-map
Leading zeros: not collapsed (`01` -> `T01` or free text, never `T1`)
Combined labels: every part resolved, joined with " + ", duplicates collapsed

DB changes: private helpers `resolve_table_input`, `canonical_label_parts`, `canonical_table_label`; replaced `sync_table_occupancy`, `displace_conflicting_entries`, `board_assign`, `board_end_and_assign`
Migration: `supabase/migrations/20261026120000_table_input_canonical_resolution.sql`
DEV applied: YES (Management API, ref opmujepkemwcdxxorhfd hard-checked, recorded in schema_migrations)

board_assign: canonicalizes first (after auth/session), then all logic on the canonical label
occupancy trigger: same resolver
conflict detection: canonical on both sides; detail label / assignment_label canonical
same-server: canonical PT409 same_server
End + Assign: unchanged atomicity (single call), canonical label
Transfer: unchanged (`board_transfer`)

Grid / Floor / Picker / Servers / Dashboard: client mirror `domain/table-input.ts` wired in `allocation-workspace.tsx` (`execute`) and `table-claim.tsx` (`canonicalize`); read model unchanged (renders canonical stored labels)

Tests (final gate, actual):
pgTAP: 31 files / 646 assertions PASS (0031 new = 58; 0030 §3 changed deliberately)
Vitest: 74 files / 715 tests PASS
cross-view matrix: 51 scenarios (domain 52 tests) PASS; XM-011/012/013 rewritten + XM-014..019 added (input-form axis `typed`)
Playwright demo: 507 PASS (desktop + host-tablet + server-mobile)
hosted DB: 78 PASS (tasks-v1 12, table-input-canonical 16, conflicts 10, rotation-v2 40)
hosted UI (production build, DEV): 30 PASS (one transient XM-024 failure in the first full run; passed in the next two full runs and an isolated rerun)
multi-user: stale-browser shorthand test CR-UI + rewritten XM-011 PASS
build: PASS (pinned to DEV, PROD ref in 0 files)
lint / typecheck / format: PASS
CI: PASS on exact head caef5aa (application, browser-smoke, Database, Vercel; deploy-migrations skipped)

Commits: faeca66 feat (resolver + client + matrix + tests); closeout commit (docs, real-suite fixes)
Uncommitted: nothing expected (never stage `docs/testing/`, `The Lineup.code-workspace`)

development merged: YES (f8fa191)
main merged: NO
DEV touched: YES (migration + hosted suites with synthetic data)
PROD touched: NO
PROD migrations: NO

Running processes: local Supabase (docker) only; no `next start`

Exact next command: none
Exact next action: STOP. Owner sanity test (type 1 in the Grid, Floor shows T1 occupied). Next planned work: #154, #155, release-readiness audit (owner approval for main)
Read first: docs/features/table-input-canonical-resolution/IMPLEMENTATION_REPORT.md
Release-readiness (before any PROD deploy, owner approval only): run the read-only query in PLAN.md per real location
DO NOT: merge to main, touch PROD, squash/rebase-merge, `git add -A` / `git add .`, stage `docs/testing/` or `*.code-workspace`, add an alias table, rewrite history rows, widen grants, start #154 or #155 here
