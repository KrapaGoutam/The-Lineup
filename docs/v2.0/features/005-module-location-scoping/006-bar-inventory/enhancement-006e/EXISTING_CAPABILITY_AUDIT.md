# Feature V2-005.006-E: Existing Capability Audit

## 1. Inventory Engine & Catalog

- **Organization-Wide Catalog:** `inventory_vendors`, `inventory_categories`, `inventory_subcategories`, `inventory_products` belong to the organization. Product UUIDs are identical across branches.
- **Location-Scoped Stock:** `inventory_stock` contains authoritative `(on_hand, backup, cutoff, warning, par, version, last_adjusted_at)` keyed by `(location_id, product_id)`.
- **Immutable Ledger:** `inventory_adjustments` records every stock change with append-only semantics, reason codes, actor profile ID, and timestamp.
- **Order Drafts:** `inventory_order_drafts` and `inventory_order_draft_items` provide draft vendor orders with auto-fill against location par and stock.
- **Date Tracking:** `inventory_date_lots` stores lots with manufacture and expiration dates and optional dated quantities.
- **Exporting:** `exports.ts` prepares CSV and XLSX documents for inventory stock, date groups, adjustments history, recommendations, and analytics.

## 2. Selection & Table Capabilities

- `FilterableTable` provides sortable headers, column filtering, search, view presets, and responsive layout.
- Individual checkbox selection per row.
- "Select filtered results" button.
- "Clear selection" button.
- "Bulk Edit" modal for counting multiple selected products simultaneously.

## 3. Import Capabilities

- CSV and XLSX spreadsheet importing via `readWorkbook` / `readWorkbookBrowser`.
- Column auto-mapping and manual overrides.
- Product matching by SKU or `(Vendor, Name, Size, Unit)`.
- Near-duplicate detection and proposal resolution.
- Staged preview classifying rows into create, update, skip, error.
- Transactional commit via `inventory_import_commit` RPC.

## 4. Reusability Contract

Every existing capability will be reused without regression:

- The new fractional parser enhances numeric input across cells, sheets, bulk counts, and imports without changing two-decimal DB storage.
- Selection controls are enhanced with an indeterminate header checkbox and shared selection state without breaking filtered selection.
- Date group importing is added as a dedicated mode within the existing import modal, reading the exported Date Groups format.
- Physical placement is purely additive (Option A). Authoritative stock totals and ledger remain unchanged.
