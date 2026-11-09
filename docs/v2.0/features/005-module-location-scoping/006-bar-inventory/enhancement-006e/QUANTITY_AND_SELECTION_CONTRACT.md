# Feature V2-005.006-E: Quantity & Selection Contract

## 1. Fractional and Decimal Quantity Input

### 1.1 Supported Grammar & Normalization

The quantity parser accepts:

- Whole numbers: `0`, `2`, `15`
- Decimal numbers: `0.5`, `0.75`, `2.25`, `.5` (up to 2 decimal places)
- Simple fractions: `1/2`, `1/4`, `3/4`
- Mixed fractions: `1 1/2`, `2 1/4`, `3 3/4`

Values are normalized directly to exact two-decimal numbers stored in integer cents (e.g. `1 1/2` = `1.50`, `150` cents).

### 1.2 Nonrepresentable and Malformed Fractions

- A fraction $n/d$ (in lowest terms) is valid if and only if $100 \times n$ is evenly divisible by $d$ (`(100 * n) % d === 0`).
- Fractions with non-terminating or >2 decimal representations (such as `1/8` = 0.125, `1/3` = 0.333...) are **rejected** with an actionable error message:
  `"Fraction cannot be represented with 2 decimal places (such as 1/8). Use 1/2, 1/4, 3/4, etc."`
- Negative numbers (e.g. `-1`, `-1/2`) and malformed expressions (e.g. `1/0`, `abc`, `1 2 3`) are strictly rejected.
- Maximum quantity is capped at `9,999,999,999.99`.

### 1.3 Uniform Application

The quantity parser is applied universally across:

- Table `EditableCell` (On Hand, Backup).
- Mobile & Detail `ItemSheet` (On Hand, Backup).
- Bulk Count editor (`bulk-count.ts` and `bulk-count.tsx`).
- Inventory Stock CSV/XLSX importer (`import-plan.ts`).
- Date Groups quantity inputs (`DateTracking` and Date Groups importer).

---

## 2. Selection Model

### 2.1 Inventory Table & Cooler Layout Synchronization

Selection represents the set of selected unique products (`productId[]`) within the verified active branch:

- **Individual Checkbox:** Select or deselect a single product.
- **Select Filtered Results / Select All Shown:** Selects all eligible products currently passing active filters in the current view.
- **Select All Eligible:** In Cooler Layout or Inventory Table, select all active non-archived products.
- **Indeterminate Header Checkbox:**
  - Checked: All visible eligible products are selected.
  - Indeterminate: Some, but not all, visible eligible products are selected.
  - Unchecked: No visible products are selected.
  - Clicking toggles between selecting all visible eligible products and clearing selection.
- **Clear Selection:** Clears all selected products.
- **Archived Exclusions:** Archived products are never selectable in bulk actions.
- **Branch Context Switching:** Selection automatically clears upon switching location to prevent cross-branch mutations.
- **Bulk Edit Safety:** Products appearing in multiple physical placements map to a single unique `productId` in the selection set, preventing duplicate ledger writes during Bulk Edit.
