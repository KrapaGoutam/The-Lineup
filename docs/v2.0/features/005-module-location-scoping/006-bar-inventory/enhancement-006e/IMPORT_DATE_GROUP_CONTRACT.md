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

---

## 3. Stage E6 amendments (verified by tests, not by inspection)

- **Atomicity.** `inventory_date_group_import_commit` is one transaction. The server action makes exactly one
  RPC call; a failure at any row rolls back every earlier row. (The first implementation looped
  `inventory_date_lot_save` from JavaScript, which was NOT atomic; that was fixed in E6.)
- **Idempotency.** The browser's `requestId` is only the key. Durability is the receipt table
  `inventory_date_group_imports` (`unique (organization_id, request_id)`), written in the same transaction.
  A retry with the same payload replays the stored result (`replayed: true`); the same id with a different
  payload is refused; two identical concurrent requests serialize on an advisory lock and commit once.
  A failed attempt writes no receipt, so a corrected retry under the same id succeeds.
- **Stale preview protection.** The plan carries the version of every group it will update; the fingerprint
  (53-bit) covers versions, dates, precision, quantity and notes; the database re-checks every version (PT409).
- **Archive state.** A row that names an archived group is a row error; imports never reactivate.
- **Round trip.** The real Date Groups export (MM/DD/YY, MM/YY, "—", extra status columns) re-imports as all
  "unchanged" with no header rewriting and no precision drift (domain test uses the real exporter).
- **No stock effect.** Verified: every stock row (quantity and version), the ledger and `stock_levels` audit
  entries are identical before and after (pgTAP 0072, real-JWT).
