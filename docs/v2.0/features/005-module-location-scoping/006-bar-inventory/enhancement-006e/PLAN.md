# Feature V2-005.006-E: Bar Inventory Usability & Physical Storage Layout — Plan

- **Feature:** V2-005.006-E (Combined Bar Inventory Enhancement)
- **Parent Issue:** #253 (The Lineup V2.0 Milestone #8)
- **Branch:** `feature/v2-005-006e-inventory-storage-enhancement`
- **Worktree:** `.tmp/v2-005-006e-inventory`
- **Target Branch:** `development`
- **Architecture Model:** OPTION A — PLACEMENT ONLY

---

## 1. Executive Summary

This enhancement delivers the approved combined Bar Inventory usability and physical layout upgrades under a single implementation lifecycle (internal phases E0–E5):

1. **Fraction & Decimal Quantities:** Support mixed fractions (`1 1/2`), simple fractions (`1/2`, `1/4`, `3/4`), whole numbers, and 2-decimal inputs with strict rejection of nonrepresentable fractions (`1/8`, `1/3`) and negative/malformed values.
2. **Unified Selection Model:** Indeterminate header checkbox, Select All shown/filtered, Clear Selection, and individual checkboxes with accurate counts across Inventory Table and Cooler Layout.
3. **Safe Inventory & Date Group Imports:** Preserve existing CSV/XLSX stock import while introducing a dedicated Date Groups import mode aligned with the Date Groups export format.
4. **Physical Placement Model (Option A):** Additive schema for Storage Areas, Shelves/Sections, and Product Placements without duplicating stock or modifying authoritative branch-level stock ledgers.
5. **Cooler Layout View:** Visual 2D cooler and shelf layout with branch & storage area filtering, search, direct access to item details and editing, and placement management.

---

## 2. Work Breakdown & Checkpoints

### IE-E0: Audit & Architecture Contract (Current)

- Reconcile existing capabilities, access control, and invariants.
- Formalize Option A (placement only) contract.
- Produce documentation suite and entry-point matrix.

### IE-E1: Quantity + Selection UX

- Pure quantity parser supporting decimals and 2-decimal-representable fractions.
- Update `stock-rules.ts`, `bulk-count.ts`, `editable-cell.tsx`, `item-sheet.tsx`, `date-tracking.tsx`.
- Table selection header with indeterminate checkbox and unified selection state.
- Targeted unit & component tests.

### IE-E2: Inventory & Date Imports

- Integrate fraction parser into stock import runner (`import-plan.ts`).
- Implement Date Groups import mode (matching export structure: Vendor, Name, Size, Unit, Date group ID, Dated quantity, Manufactured, Expires, Notes).
- Safe preview (create/update/unchanged/skip/error) and transactional commit.
- Targeted import tests.

### IE-E3: Physical Placement Model

- Forward-only additive migration:
  - `inventory_storage_areas`
  - `inventory_storage_shelves`
  - `inventory_storage_placements`
- Strict foreign keys, RLS policies, and `SECURITY DEFINER` RPCs using `private.inventory_begin()`.
- Overall actor compatibility (profile attribution).
- pgTAP tests.

### IE-E4: Cooler Layout UI + Editing

- View toggle: `[Inventory Table] [Cooler Layout]`.
- Filtering: Restaurant Branch & Storage Area (including All Storage Areas & Unassigned).
- 2D Shelf visualization with left-to-right slot ordering.
- Reuse `ItemSheet`, `EditableCell`, and date tracking actions for direct editing.
- Placement management (add area/shelf, assign, move, unassign).
- Responsive desktop, tablet, and mobile layouts.

### IE-E5: Consolidated Verification & PR

- Run affected unit tests, pgTAP, Vitest, TypeScript check (`npm run check`), production build (`npm run build`).
- Prepare single pull request targeting `development`.
- Document verification receipts and prepare handoff for independent Claude Sonnet High review.
