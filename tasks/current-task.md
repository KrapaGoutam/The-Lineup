# Current task — Next development cycle (handoff)

## Current State & Next Step

Current cycle: **next development cycle after the 2026-10-26 Production release**. Owner roadmap order: 1 Table Allocation same-server repeat → 2 Bar Inventory V1 → 3 Tasks Today management visibility → 4 Tips V2 (#155).

Current branch: `fix/table-allocation-same-server-repeat`
HEAD: see `git log -1` (PR #167)

**Exact next action:** wait for exact-head CI on PR #167, merge with a **merge commit** into `development` (never squash/rebase), then start `docs/bar-inventory-v1-planning` from the new `origin/development` (planning docs + Bar Inventory / Tasks Today issues + roadmap; no application code).

## Part 1 — Table Allocation bug

- Table Allocation bug issue: #166 (type:bug, module:table-allocation, priority:p1, Project #4, milestone "Table Allocation V2 — Part 2")
- Root cause: `board_assign` refused any second active entry of a table for the same server (`same_server`) with no notion of turn.
- Turn identity: board cell `(rotation_round_id, rotation_member_id)`, ordered by `rotation_rounds.sequence`; decided in the database.
- Same-turn behavior: identical re-submit of the same cell = idempotent no-op; held in same-or-later turn = blocked (`same_server`), no mutation.
- Later-turn behavior: `PT409 same_server_repeat`; dialog End Previous + Assign / Cancel; confirm = `board_end_previous_and_assign` (atomic; previous entry ended, kept as history; `repeat: true` event; Undo/Redo functions unchanged).
- Migration: `20261026150000_table_allocation_same_server_repeat.sql` (DEV applied, PROD not).
- Tests: Vitest 746/746; pgTAP 0032 75/75 (+ existing suites pass); demo Playwright 549/549 (3 projects); hosted DEV DB 92/92; hosted DEV UI 13/13 + 15/15.
- PR: #167 → `development`
- CI: pending at the time of writing
- development merge: NO (pending CI)

## Part 2 — Bar Inventory V1 (planning only)

- Bar Inventory issue: not yet created (after the bug merge)
- Planning branch: `docs/bar-inventory-v1-planning` (not yet created); drafts exist untracked in `docs/features/bar-inventory-v1/`
- Role decision: recommended management roles only (Owner / Manager / Assistant Manager = `owner`, `general_manager`, `shift_manager`); staff none in V1 (owner decision D1)
- Schema proposal: `docs/features/bar-inventory-v1/DATA_MODEL.md`
- Import/export, filters, analytics, phases: see that folder

## Part 3 — Tasks enhancement

Tasks Today management visibility issue: not yet created (search found no equivalent). PLANNED ONLY.

## Part 4 — Tips V2

#155 stays open, untouched; fourth in the roadmap.

## Safety

```
development merged: NO (pending PR #167)
main merged: NO
DEV touched: YES (migration 20261026150000; hosted suites use their own synthetic org)
PROD touched: NO
PROD migrations: NO
```

DO NOT: `git add -A`, stage `docs/testing/` or `*.code-workspace`, commit directly to `main`/`development`, start Bar Inventory / Tasks / Tips implementation.
