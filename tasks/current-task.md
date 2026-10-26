# Canonical Table Input Resolution — Handoff

Branch: `fix/table-input-canonical-resolution`
HEAD: see `git log -1` (nothing committed yet at R3)
Base development: `23e38a9` (PR #135 merge commit)

PR #135: MERGED into `development` with a merge commit `23e38a9` (head `1234ada`, exact-head CI green, owner Preview smoke PASS reported by the owner in the 2026-10-26 task brief)
#133: CLOSED, Project #4 Done (milestone "Platform / CI Reliability" stays open: 12 other open issues)
#153: CLOSED, Project #4 Done
Owner smoke: PASS (owner statement); new contract correction tracked separately

Issue: #157 `[Bug] Resolve numeric Grid table input to registered physical tables` (type:bug, module:table-allocation, priority:p1)
Project #4: #157 In Progress (Module Table Allocation, P1, Bug, Implementation, Part 2, M)
Milestone: Table Allocation V2 — Part 2

Current phase: R3 done (DB). Next R4 (TS mirror + workspace wiring), R5 (matrix + tests), R6 (hosted DEV), R7 (PR).
R0 ✅ R1 ✅ R2 ✅ R3 ✅ R4 ⬜ R5 ⬜ R6 ⬜ R7 ⬜

Resolver contract:
Exact label: registered active label (trimmed, case-sensitive, same location) wins
Numeric shorthand: digits-only and no exact match -> `T` + digits if registered
Free-text fallback: trimmed text, no claim, off-map
Leading zeros: not collapsed (`01` -> `T01` or free text, never `T1`)
Combined labels: every part resolved, joined with " + ", duplicates collapsed

DB changes: new private helpers `resolve_table_input`, `canonical_label_parts`, `canonical_table_label`; replaced `sync_table_occupancy`, `displace_conflicting_entries`, `board_assign`, `board_end_and_assign`
Migration: `supabase/migrations/20261026120000_table_input_canonical_resolution.sql`
DEV applied: NO (not yet; local Supabase reset applies it; DEV via Management API + schema_migrations row at R6)

board_assign: canonicalizes first (after auth/session), then all logic on the canonical label
occupancy trigger: same resolver
conflict detection: canonical both sides (held entries are resolved too); detail label / assignment_label canonical
same-server: canonical PT409 same_server
End + Assign: unchanged atomicity (single call)
Transfer: unchanged (`board_transfer`)

Grid / Floor / Picker / Servers / Dashboard: R4 (TS mirror in domain + workspace `execute` / `claim.intercept`); read model unchanged (renders canonical stored labels)

Tests:
pgTAP: local `npx supabase test db` 31 files / 646 tests PASS (0031 new: 58; 0030 §3 intentionally changed)
Vitest: not yet re-run
cross-view matrix: XM-011 must change (input-form axis) at R5
Playwright / hosted DB / hosted UI / multi-user / build / lint / typecheck / CI: not yet run

Commits: none yet
Uncommitted: migration 20261026120000, pgTAP 0030 (edited) + 0031, docs/features/table-input-canonical-resolution/{PLAN,ACCEPTANCE_CRITERIA}.md, this file (stage exact paths only)

development merged: NO
main merged: NO
DEV touched: NO (this feature); DEV GitHub/Project only
PROD touched: NO
PROD migrations: NO

Running processes: local Supabase (docker) only

Exact next command: `npx vitest run src/features/allocation` after adding `src/features/allocation/domain/table-input.ts`
Exact next action: R4 — create `domain/table-input.ts` (mirror of the SQL resolver), wire it into `allocation-workspace.tsx` `execute` + `useTableClaim.intercept`, then update the old-contract tests (XM-011, cross-view-integrity tests)
Read first: docs/features/table-input-canonical-resolution/PLAN.md, supabase/migrations/20261026120000_table_input_canonical_resolution.sql
DO NOT: merge to main, touch PROD, squash/rebase-merge, `git add -A` / `git add .`, stage `docs/testing/` or `*.code-workspace`, add an alias table, rewrite history rows, widen grants
