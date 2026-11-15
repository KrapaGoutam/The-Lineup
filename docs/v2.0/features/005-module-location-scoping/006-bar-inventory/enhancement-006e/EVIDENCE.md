# Feature V2-005.006-E: Evidence & Verification Ledger

## 1. Verified Baseline State

- Target branch `development`: `75a4d3c2e8b70e3d619caf81cba2e6b4705ae3c7`
- Branch `main`: `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- Worktree created at `.tmp/v2-005-006e-inventory` tracking `development`.
- PR #315 (Batch B) confirmed merged into `development`.

## 2. Invariant Commitments

- **Option A (Placement Only):** No quantity column on placement tables (`inventory_storage_placements`).
- **Zero Stock Adjustments:** Placement mutations never alter stock counts or write to `inventory_adjustments`. Authoritative stock remains strictly at `inventory_stock (location_id, product_id)`.
- **Single PR Delivery:** One branch, one worktree, one PR targeting `development`.
- **No Production Deploy:** No deployment to hosted DEV in this session.

## 3. Checkpoint Receipts

### Checkpoint E1: Fractional Counts & Selection UX

- **Domain logic:** `src/features/bar-inventory/domain/stock-rules.ts`
  - Normalized parse output to 2 decimal places.
  - Allowed fraction inputs: `0`, `0.5`, `0.75`, `1/2`, `3/4`, `1/4`, `1 1/2`, `2`, `2.25`.
  - Strictly rejected: negative numbers, nonrepresentable fractions (`1/8`, `1/3`), malformed strings.
- **Component integration:**
  - `editable-cell.tsx`: Handles fractional inputs for on-hand, backup, and target quantities.
  - `item-sheet.tsx`: Direct fraction entry in item detail sheet.
  - `bulk-count.ts`: Accepts and processes fractional values in bulk cycle counts.
  - `filterable-table.tsx`: Added `headerRender` slot to `TableColumn`.
  - `inventory-view.tsx`: Indeterminate header checkbox (`HeaderCheckbox`), explicit `Select all eligible` vs `Select all shown`, clear selection, and selection reset on location switch.
- **Test suite results:**
  - `src/features/bar-inventory/domain/stock-rules.test.ts`: 65/65 passing.
  - `src/features/bar-inventory/domain/bulk-count.test.ts`: 25/25 passing.
  - `src/features/bar-inventory/components/editable-cell.test.tsx`: 6/6 passing.
  - `src/features/bar-inventory/components/table-kit/filterable-table.test.tsx`: 10/10 passing.

### Checkpoint E2: Inventory CSV/XLSX & Date Group Imports

- **Domain logic:** `src/features/bar-inventory/domain/import-date-groups.ts`
  - Pure date parsing (YYYY-MM-DD, MM/DD/YYYY, Excel serial dates).
  - Column alias resolution matching Date Groups export format.
  - Deterministic lot fingerprinting and plan categorization (Create, Update, Unchanged, Skip, Error).
- **Server actions:** `src/features/bar-inventory/actions/import-actions.ts`
  - `previewDateGroupImportAction`: Validates and parses uploaded file into plan preview.
  - `commitDateGroupImportAction`: Atomically creates/updates date lots via `inventory_date_lot_upsert`.
- **UI integration:** `src/features/bar-inventory/components/import-view.tsx`
  - Dual mode selector: "Stock Count & Catalog" vs "Date Groups & Expirations".
  - Interactive preview table with status badges and atomic commit button.
- **Test suite results:**
  - `src/features/bar-inventory/domain/import-date-groups.test.ts`: 14/14 passing.
  - `src/features/bar-inventory/domain/import-plan.test.ts`: 78/78 passing.
  - `src/features/bar-inventory/domain/import-flow.test.ts`: 29/29 passing.

### Checkpoint E3: Storage Area & Placement Database Schema

- **Migration:** `supabase/migrations/20261109120000_inventory_physical_storage_layout.sql`
  - Tables created: `inventory_storage_areas`, `inventory_storage_shelves`, `inventory_storage_placements`.
  - RLS enabled on all three tables with `private.inventory_can_access_location` and `private.location_module_allows(location_id, 'bar_inventory')`.
  - Strict Option A constraint: NO quantity column in `inventory_storage_placements`.
  - 7 Security Definer RPCs guarded by `private.inventory_begin(p_organization_id, p_location_id)`:
    - `inventory_storage_area_upsert`
    - `inventory_storage_area_archive`
    - `inventory_storage_shelf_upsert`
    - `inventory_storage_shelf_delete`
    - `inventory_storage_placement_set`
    - `inventory_storage_placement_delete`
    - `inventory_storage_placement_reorder`
- **Database test suite:** `supabase/tests/database/0071_inventory_storage_placement.test.sql`
  - 42/42 pgTAP tests passing.
  - Verified RLS isolation across tenants, module toggling, deferrable profile FKs, and security definer RPC validations.
  - Regression verified: `supabase/tests/database/0069_batch_b_inventory_recipes.test.sql` (44/44 passing).

### Checkpoint E4: Cooler Layout UI & 2D Shelf Visualizer

- **Domain types:** Added `StorageAreaView`, `StorageShelfView`, `StoragePlacementView`, `STORAGE_AREA_KINDS`, `STORAGE_AREA_KIND_LABELS` to `inventory-types.ts`.
- **Command schema:** Added 7 storage commands to `catalogCommandSchema` in `catalog-commands.ts`.
- **Server actions:** Extended `runCommand` in `inventory-actions.ts` to dispatch all 7 storage RPCs.
- **Data loading:** Extended `readCatalogData` in `catalog-data.ts` to load physical layout rows.
- **Demo engine:** Seeded realistic multi-cooler data in `demo-catalog.ts` and command simulation in `catalog-engine.ts`.
- **Components created:**
  - `cooler-layout-view.tsx`: 2D cooler layout visualizer with dual location + area filtering, shelf racks, slot numbers, and direct click-to-edit integration.
  - `storage-area-dialog.tsx`: Storage area configuration modal (name, kind, display order).
  - `storage-shelf-dialog.tsx`: Shelf & zone configuration modal.
  - `placement-move-dialog.tsx`: Product placement modal (assign shelf, slot label, slot number).
- **Test suite results:**
  - `src/features/bar-inventory/components/cooler-layout/cooler-layout.test.tsx`: 5/5 passing.
  - Full `bar-inventory` Vitest suite: 827/827 tests passing across 39 test files.

### Checkpoint E5: Consolidated Quality Verification

- **Code standard checks (`npm run check`):**
  - Prettier: `npm run format:check` — Clean, all files formatted.
  - ESLint: `npm run lint` — Clean, 0 errors, 0 warnings.
  - TypeScript: `npm run typecheck` (`next typegen && tsc --noEmit`) — Clean, 0 errors.
- **Full Vitest suite (`npm run test`):**
  - 251 test files passed.
  - 3,406 tests passed (7 skipped from existing baseline).
- **Database verification (`supabase test db`):**
  - `0071_inventory_storage_placement.test.sql`: 42/42 passed.
- **Production build (`next build`):**
  - Webpack & Next.js production build succeeded with all 13 routes optimized.
