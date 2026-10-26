# Current task — Next development cycle (handoff)

## Current State & Next Step

Current cycle: **next development cycle after the 2026-10-26 Production release**. Owner roadmap order: 1 Table Allocation same-server repeat (DONE) → 2 Bar Inventory V1 (PLANNED) → 3 Tasks Today management visibility (tracked) → 4 Tips V2 (#155).

Current branch: `docs/bar-inventory-v1-planning` (docs/tracking only, from `origin/development` `a9a1edf`)
HEAD: see `git log -1` / the planning docs PR

**Exact next action:** the owner reviews `docs/features/bar-inventory-v1/` and answers decisions D1–D8 (`PRD.md` §10). Then BI-0 (decisions + XLSX library review). **Do NOT begin Bar Inventory, Tasks Today or Tips V2 implementation; do NOT merge `development → main`.**

## Part 1 — Table Allocation bug (DONE)

- Table Allocation bug issue: #166 (closed; type:bug, module:table-allocation, priority:p1, Project #4 Done, milestone "Table Allocation V2 — Part 2")
- Root cause: `board_assign` refused any second active entry of a table for the same server (`same_server`) with no notion of turn.
- Turn identity: board cell `(rotation_round_id, rotation_member_id)`, ordered by `rotation_rounds.sequence`; decided in the database.
- Same-turn behavior: identical re-submit of the same cell = idempotent no-op; held in same-or-later turn = blocked (`same_server`), no mutation.
- Later-turn behavior: `PT409 same_server_repeat`; dialog End Previous + Assign / Cancel; confirm = `board_end_previous_and_assign` (atomic; previous entry ended, kept as history; `repeat: true` event; Undo/Redo functions unchanged).
- Migration: `20261026150000_table_allocation_same_server_repeat.sql` (DEV applied, PROD not).
- Tests: Vitest 746/746; pgTAP 0032 75/75 (+ existing suites pass; CI Database job green); demo Playwright 549/549 (3 projects); hosted DEV DB 92/92; hosted DEV UI 13/13 + 15/15.
- PR: #167 → `development`, CI green on exact head `505a76a` (application, browser-smoke, migrations-and-policies)
- development merge: **YES**, merge commit `a9a1edf`

## Part 2 — Bar Inventory V1 (planning only)

- Bar Inventory issue: #168 (type:feature, module:bar-inventory (new label, follows `module:*` convention), priority:p1, milestone "Future Product Backlog", Project #4 status Planned; Project "Module" field has no Bar Inventory option and was not altered)
- Planning branch: `docs/bar-inventory-v1-planning`
- Planning docs: `docs/features/bar-inventory-v1/` (PRD, DATA_MODEL, UI_UX_PLAN, IMPORT_EXPORT_SPEC, ANALYTICS_SPEC, SECURITY_AND_ROLES, ACCEPTANCE_CRITERIA, TEST_STRATEGY, IMPLEMENTATION_PLAN)
- Role decision: recommended management roles only (Owner / Manager / Assistant Manager = `owner`, `general_manager`, `shift_manager`); staff none in V1 (owner decision D1)
- Schema proposal: org-level vendors/categories/subcategories/products + location-level `inventory_stock`, immutable `inventory_adjustments`, `inventory_change_log`, server-staged `inventory_import_batches/rows`
- Import/export: CSV + XLSX (library decision D6 in BI-0; none installed today), preview before mutation, vendor matching, injection-safe export
- Filters: type-appropriate per column, chips, Clear all, URL state, sort presets
- Analytics: reason-aware ledger rules, days-to-cutoff range, movers, vendor demand
- Implementation phases: BI-0 … BI-11 (release blocked on #111/#113)

## Part 3 — Tasks enhancement

Tasks Today management visibility issue: #169 (type:feature, module:tasks, priority:p2, milestone "Future Product Backlog"). PLANNED ONLY.

## Part 4 — Tips V2

#155 stays open, untouched; fourth in the roadmap.

## Safety

```
development merged: YES (PR #167, a9a1edf); planning docs PR pending/merged per the PR
main merged: NO
DEV touched: YES (migration 20261026150000; hosted suites use their own synthetic org)
PROD touched: NO
PROD migrations: NO
```

DO NOT: `git add -A`, stage `docs/testing/` or `*.code-workspace`, commit directly to `main`/`development`, start Bar Inventory / Tasks / Tips implementation.
