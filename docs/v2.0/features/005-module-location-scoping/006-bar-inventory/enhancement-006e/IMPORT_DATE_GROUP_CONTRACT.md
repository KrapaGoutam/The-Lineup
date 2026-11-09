# Feature V2-005.006-E: Import & Date Group Contract

## 1. Stock Importer Preservation

The existing inventory stock importer (`import-view.tsx`, `import-columns.ts`, `import-plan.ts`, `import-run.ts`, `import-stage.ts`, `import-actions.ts`) remains intact:

- Supports CSV and XLSX files.
- Automatically and manually maps columns.
- Performs SKU and identity matching `(Vendor, Name, Size, Unit)`.
- Implements two-decimal fractional parsing for quantity inputs (`onHand`, `backup`, `cutoff`, `warning`, `par`).
- Preserves the blank-versus-zero rule: blank cell = leave unchanged; `0` = set to zero.

---

## 2. Date Groups Import Mode

### 2.1 Interface & Mode Selection

- Integrated directly into the existing Import modal (`ImportView`).
- Mode switcher: `[Stock Inventory] [Date Groups]`.
- No separate or detached import pages.

### 2.2 Template & Column Mapping

Mirrors the existing exported Date Groups format:

1. `Vendor` (Required for product matching)
2. `Name` (Required for product matching)
3. `Size` (Optional)
4. `Unit` (Optional)
5. `Date group ID` (Optional: UUID of existing `inventory_date_lots` record to update)
6. `Dated quantity` (Optional: decimal or fraction)
7. `Manufactured` (Date string: YYYY-MM-DD or YYYY-MM)
8. `Manufacture precision` (Optional: `day` or `month`, auto-derived if omitted)
9. `Expires` (Date string: YYYY-MM-DD or YYYY-MM)
10. `Expiration precision` (Optional: `day` or `month`, auto-derived if omitted)
11. `Notes` (Optional: text up to 500 characters)

Exported date group reports can be re-imported directly without schema restructuring.

### 2.3 Staged Preview & Classification

- **Create:** Valid product match, no Date Group ID provided (or unknown ID marked for creation) $\to$ Inserts new lot into `inventory_date_lots`.
- **Update:** Valid Date Group ID matching an existing active lot for that product and branch $\to$ Updates lot dates, quantity, or notes.
- **Unchanged:** Imported row matches existing lot values exactly.
- **Skip:** Row missing dates or explicitly ignored.
- **Error:** Product not found, invalid dates (e.g. expiration before manufacture), negative or nonrepresentable fractional quantity, or Date Group ID belonging to another location/product.

### 2.4 Safe Commit Rules

- Verified live session, organization, and active branch context.
- Manager level $\ge 2$ at target branch.
- Atomic batch execution via `inventory_date_group_import_commit` RPC.
- Date group imports **never** modify authoritative stock on hand or backup in `inventory_stock`.
- Date group imports **never** create entries in the immutable stock ledger (`inventory_adjustments`).
