# Pre-V2-007 Operational Enhancements — Verification Evidence

This document captures cryptographic, database, static analysis, and test run evidence for the Pre-V2-007 operational enhancements.

---

## 1. Batch A — Attendance Manual Entry Evidence

### Cherry-Picked Commits from `feature/attendance-manual-entry`

Original authoritative checkpoint: `2713f1c0a147b4f1a5e22e7095ec3581955e5f2f`

```text
ac07948 - feat(attendance): add attendance manual entry domain, RPC migration, and pgTAP tests
459ee22 - feat(attendance): add manual entry form and dialog components with validation
5322f6b - feat(attendance): integrate manual entry button and refresh flow in manager timesheet
2713f1c - docs(attendance): complete attendance manual entry documentation and handoff package
```

### Migration Verification

Migration file: [`supabase/migrations/20261110203355_attendance_manual_entry.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/migrations/20261110203355_attendance_manual_entry.sql)

**SHA-256 Digest:**

```text
99C8BCB14A12D46745B2B80F5CBB44183A10C5A340290EC483B4E02D76977854
```

Verification command:

```powershell
(Get-FileHash supabase/migrations/20261110203355_attendance_manual_entry.sql -Algorithm SHA256).Hash
```

Matches expected hash exactly.

### Hosted DEV Migration Boundary Policy

- **Target Project:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Policy Enforcement:** Migration `20261110203355_attendance_manual_entry.sql` is held at the local boundary.
- **Authorization Gate:** Will NOT be applied to hosted DEV until the repository owner explicitly grants approval.

---

## 2. Batch B — Visual Cooler Layout Refinement Evidence

### Architecture & Quantity Invariance

1. **Schema & RPC Boundaries:**
   - Database table: `inventory_storage_placements`
   - RPC: `inventory_storage_placement_set` / command: `storagePlacementSet`
   - Fields managed: `id`, `storage_area_id`, `shelf_id`, `product_id`, `slot_number`, `slot_label`, `display_order`, `expected_version`.
   - Invariant: `inventory_storage_placements` contains ZERO quantity fields (`on_hand`, `backup`, `par`, `warning`, `cutoff`) and writes ZERO rows to `inventory_stock_ledger`.
2. **UI Enhancements Implemented:**
   - Physical cooler styling with climate badges (e.g., `36°F · Commercial Cooler`), metallic bottom rail gradient, and container framing.
   - Physical shelves ordered top to bottom by `display_order`.
   - Accessible Move Up / Move Down buttons for reordering shelves with boundary disabling.
   - Dynamic slot allocation rendering both occupied slots and explicit empty slots (at least 4 slots per shelf).
   - Empty slots render with dashed borders, `Slot X` badge, `Empty` indicator, and direct "+ Place Product" touch/click button.
   - Click-to-place opens `PlacementMoveDialog` pre-filled with the shelf and slot number.
   - Drag-and-drop support: drag product tiles to empty slots with visual ring cues, with collision detection blocking occupied drops.
   - Item Sheet integration: clicking any placed product triggers `onSelectProduct(productId)` opening the unified 4-tab Item Sheet (`Counts | Levels | Dates | History`).

---

## 3. Test Run Logs Summary

### Quality Check (`npm run check`)

```text
> restaurant-roster@0.1.0 check
> npm run format:check && npm run lint && npm run typecheck

> restaurant-roster@0.1.0 format:check
> prettier --check .
All matched files use Prettier code style!

> restaurant-roster@0.1.0 lint
> eslint . --max-warnings=0

> restaurant-roster@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
```

### Full Vitest Suite (`npm run test`)

```text
Test Files  283 passed (283)
     Tests  3886 passed | 7 skipped (3893)
  Duration  21.82s
```

### Playwright E2E (`npx playwright test tests/e2e/bar-inventory-cooler-layout.spec.ts`)

```text
Running 21 tests using 12 workers
21 passed (17.4s)
```

### Webpack Build (`npx next build --webpack`)

```text
▲ Next.js 16.4.3 (webpack)
✓ Compiled successfully in 15.0s
  Running TypeScript ...
  Finished TypeScript in 14.8s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (13/13) in 708ms
  Finalizing page optimization ...
  Collecting build traces ...
```

---

## 4. Preservation & Isolation Verification

- Root repository worktree (`c:\Users\krapa\Documents\Projects\Restaurent\The Lineup`): Unmodified on branch `docs/recipes-owner-retest-handoff`.
- Attendance worktree (`c:\Users\krapa\Documents\Projects\Restaurent\The Lineup\.tmp\attendance-manual-entry`): Unmodified on commit `2713f1c`.
- External Neon attendance database: Unmodified.
- Main / Production branches: Strictly untouched.
