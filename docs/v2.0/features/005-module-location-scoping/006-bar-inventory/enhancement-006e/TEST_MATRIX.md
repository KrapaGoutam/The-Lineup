# Feature V2-005.006-E: Test Matrix

## 1. Targeted Unit Tests (E1)

- **Fraction Parsing (`stock-rules.test.ts`):**
  - Valid fractions: `0`, `0.5`, `0.75`, `1/2`, `3/4`, `1/4`, `1 1/2`, `2`, `2.25`.
  - Nonrepresentable fractions: `1/8`, `1/3`, `2/3`, `1/6` rejected.
  - Negative values: `-1`, `-0.5`, `-1/2` rejected.
  - Malformed values: `1/0`, `abc`, `1 2 3/4`, `1.2.3` rejected.
  - Normalization to two decimal places and exact integer cents without floating point drift.
- **Bulk Count Integration (`bulk-count.test.ts`):**
  - Parsing fraction inputs in On Hand and Backup.
  - Review delta calculation with fractions.
- **Selection Component (`inventory-view.test.tsx` / `filterable-table.test.tsx`):**
  - Individual row checkbox selection.
  - Select all filtered results.
  - Indeterminate checkbox state when subset selected.
  - Clear selection.
  - Exclusion of archived items.

---

## 2. Targeted Import Tests (E2)

- **Stock Import (`import-plan.test.ts`):**
  - Fractional quantities in CSV/XLSX rows.
  - Blank vs zero handling preserved.
  - Rejection of invalid fractions in import rows.
- **Date Group Import (`import-date-groups.test.ts`):**
  - Product matching by Name + Vendor + Size + Unit and SKU.
  - Updating existing Date Group by ID.
  - Creating new Date Group when ID is absent.
  - Precision handling (Day vs Month).
  - Validating date ordering (expiration >= manufacture).
  - Fractional dated quantity parsing.
  - Preview classification (Create, Update, Unchanged, Skip, Error).
  - Atomic commit verification with no stock adjustment side-effects.

---

## 3. Storage Placement Tests (E3 & E4)

- **pgTAP Test Suite (`0071_inventory_storage_placement.sql`):**
  - Schema existence: `inventory_storage_areas`, `inventory_storage_shelves`, `inventory_storage_placements`.
  - Foreign key deferrability and profile attribution.
  - RLS policies: read access for location manager, denial for unauthorized staff or cross-tenant actors.
  - Storage RPC execution: create area, add shelf, place product, move product, archive area.
  - Option A invariant: product placements verify product organization; zero stock adjustments triggered.
- **Cooler Layout Component Tests (`cooler-layout.test.tsx`):**
  - Rendering storage areas, shelves, and slot badges.
  - Unassigned storage view.
  - Filtering by storage area and search term.
  - Selecting products and executing bulk count.
  - Triggering direct product editing.

---

## 4. Final Consolidated Verification (E5)

- All targeted unit test suites passing.
- Full Vitest suite passing.
- pgTAP database test suite passing.
- `npm run check` (TypeScript typecheck) clean.
- `npm run build` (Next.js production build) clean.
- Secret and private key scan clean.
