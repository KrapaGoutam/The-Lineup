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
