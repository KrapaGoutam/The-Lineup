# Feature V2-005.006-E: Cooler Layout UX & Editing

## 1. Visual Structure & Layout

### 1.1 View Switcher

Located within the Inventory tab of Bar Inventory:

```text
[Inventory Table] [Cooler Layout]
```

The user's default tabular workflow is preserved. Switching to Cooler Layout displays physical storage areas and shelves.

### 1.2 Dual Filter Controls

1. **Restaurant Branch Selector:**
   - Active verified branch (e.g. `Webster Branch`).
   - Other authorized branches (if user has multi-branch access).
   - `All Authorized Branches` overview (grouped by branch; read-only layout overview; requires selecting a verified branch context before initiating product edits).
2. **Storage Area Selector:**
   - `All Storage Areas` (Default: cards for Cooler 1, Cooler 2, Back Bar, Dry Storage, and Unassigned Storage).
   - Specific Area (e.g. `Cooler 1`: detailed 2D shelf and slot layout).
   - `Unassigned Storage`: displays catalog products with no storage placement at this branch.

### 1.3 Search & Filtering

- Search input filters products by name, vendor, category, or shelf position across the active layout.
- Products matching the query are highlighted or isolated within their shelves.

---

## 2. 2D Shelf Visualization

- Shelves are rendered top-to-bottom according to `display_order` (e.g. Top Shelf, Middle Shelf, Bottom Shelf).
- Slots within shelves are arranged left-to-right with clear visual slot badges (`L1`, `L2`, `R1`).
- Product cards show:
  - Product Name and Size.
  - Vendor & Category.
  - Stock badge (Total On Hand + Backup, Status: Critical, Low, Healthy).
  - Date status indicators (if expiration/freshness tracking is active).
  - Click-to-edit interaction.

---

## 3. Direct Item Editing

- Clicking any product card in Cooler Layout opens the existing `ItemSheet` or `EditableCell` flow.
- Managers have direct access to:
  - On Hand & Backup count edits (with reason and note).
  - Levels (Cutoff, Warning, Par).
  - Date Groups (add/edit manufacture and expiration dates).
  - Stock Adjustment History.
- Edits update the branch-level stock record and record an audit event in `inventory_adjustments`.
- The UI clarifies that product identity attributes (Name, Vendor, Category, Unit, Size) are organization-wide.

---

## 4. Placement Management

Authorized managers can configure the layout directly:

- **Add Storage Area:** Name, kind (`cooler`, `freezer`, `back_bar`, `shelf_rack`, `cabinet`, `dry_storage`, `other`).
- **Add Section / Shelf:** Area selection, optional section name, shelf name, display order.
- **Assign Product:** Place unassigned products into a specific area, shelf, and slot.
- **Move Product:** Reassign product to another shelf/slot without modifying stock quantities.
- **Remove Placement:** Remove product from placement (moves product back to Unassigned Storage).
- **Archive Storage Area:** Soft-archive an area safely without affecting catalog or stock.
- Touch-friendly and keyboard-accessible buttons ("Move To", "Place", "Remove") with accessible modal dialogues.

---

## 5. Responsive Design

- **Desktop (>=1024px):** Multi-column grid for All Storage Areas; full 2D shelf representations for single cooler view.
- **Tablet (768px - 1023px):** Two-column or single-column layout with horizontal slot scrolling if necessary, maintaining touch targets >= 44x44px.
- **Mobile (<768px):** Single-column stacked cards for areas and shelves, full vertical flow, no horizontal viewport overflow.
