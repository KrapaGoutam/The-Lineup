# V2-005.006-E: Bar Inventory Usability and Physical Storage Layout

Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0)
Feature: V2-005.006-E (Combined Bar Inventory Enhancement)
Branch: `feature/v2-005-006e-inventory-storage-enhancement` | Target: `development`
Worktree: `.tmp/v2-005-006e-inventory`
Status: IN PROGRESS — Phase E5 (Verification & PR Handoff)

## Checkpoints

- [x] IE-E0: Audit and locked scope
  - [x] Baseline and worktree verification
  - [x] Architectural contract and Entry Point Matrix documented
  - [x] Invariants verified (Option A: Placement only; authoritative stock at branch level)
- [x] IE-E1: Quantity + Selection UX
  - [x] Pure fractional & decimal quantity parser (0, 0.5, 0.75, 1/2, 3/4, 1/4, 1 1/2, 2, 2.25)
  - [x] Rejection of negative, malformed, or nonrepresentable fractions (e.g., 1/8)
  - [x] Integration into On Hand, Backup, Bulk Count, Item Sheet, and Date Groups
  - [x] Selection model: indeterminate header checkbox, Select All shown/filtered, Clear selection
  - [x] Targeted unit & component tests for quantities and selection
- [x] IE-E2: Inventory & Date Imports
  - [x] Preserved stock CSV/XLSX import with fraction support
  - [x] Date Groups import mode (CSV/XLSX) matching export columns
  - [x] Safe preview & atomic commit (Create, Update, Unchanged, Skip, Error)
  - [x] Targeted import and date-group tests
- [x] IE-E3: Storage Area & Placement Model
  - [x] Additive database migration: storage areas, shelves/sections, placements
  - [x] RLS policies + SECURITY DEFINER RPCs with module & location enforcement
  - [x] Overall actor compatibility + profile attribution
  - [x] pgTAP and data integrity verification (0071_inventory_storage_placement.test.sql - 42 tests passing)
- [x] IE-E4: Cooler Layout UI + Editing
  - [x] Inventory Table | Cooler Layout view toggle
  - [x] Filtering: Branch selector & Storage Area selector
  - [x] Visual 2D shelf & slot visualization (Cooler, Shelf, Slot ordering)
  - [x] Direct product editing reusing ItemSheet / EditableCell
  - [x] Placement management (Add area, add shelf, assign, move, unassigned)
  - [x] Responsive desktop, tablet, and mobile layouts
- [/] IE-E5: Consolidated Verification & PR
  - [x] Full targeted suite, pgTAP, Vitest (3406 passing across 251 test files), check (Prettier, ESLint, TypeScript), build
  - [ ] Commit locally and push one feature PR targeting `development`
  - [ ] Complete handoff documentation for Claude Sonnet High (E6)

## Stage E6 (Claude Code, independent review + DEV integration)

- [x] E6-A.1 Reproduced both red CI failures locally (0033 test 7: 26 vs 19; 0035 test 65: 1 non-deferrable FK) and fixed them (allow-list assertion; deferrable `inventory_storage_areas_location_fk`).
- [x] E6-A.2 Date Group import made truly atomic + durable idempotency (`inventory_date_group_import_commit`, receipt table, advisory lock).
- [x] E6-A.3 Storage RPCs hardened: versions/PT409, audit, duplicate guards, shelf delete requires explicit removal, archived-area recovery.
- [x] E6-A.4 Real read-only "All authorized branches" (replaces the fake "All Locations" label); per-branch stock never blended.
- [x] E6-A.5 Tests: pgTAP 0033/0035/0071/0072; real-JWT 29/29 (local GoTrue); Vitest incl. exhaustive fraction proof; Playwright 21/21 cooler + regression sweep.
- [ ] E6-A.6 Final consolidated gate: `npm run check`, one full Vitest run, production build, secret/path scan, push, exact-head CI green.
- [ ] E6-B DEV: encrypted ledger-81 backup, isolated restore, populated rehearsal, controlled `db push` (81 -> 82), hosted verification.
- [ ] E6-C Merge PR #316 normally into `development`, update #253, final report.

## Current State & Next Step

All code and tests for E6-A are in the working tree (uncommitted until the final gate). Next: run the final gate,
commit explicit paths (never `git add -A`; repo is public), push the feature branch, wait for exact-head CI.
Do NOT apply anything to hosted DEV before CI is green and the encrypted backup + restore rehearsal pass.
