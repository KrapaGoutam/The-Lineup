# Bar Inventory V1 — UI / UX plan

Planning only; wireframe-level text, no visual assets. Built with the existing design system (`docs/DESIGN_SYSTEM.md`: dark/light tokens `ok` green, `warn` amber, `destructive` red, `Badge` tones, `Dialog`, `Card`, `Button`, `Select`, `Input`).

## 1. Navigation (audit-based)

There is **no nav registry**: navigation is the `AppTab` union and the primary/secondary arrays in `src/components/restaurant-operations-app.tsx`. Registering the module = add `"barInventory"` to `AppTab`, a `barInventoryTab` definition (lucide icon, label **Bar Inventory**), append it to `secondaryTabs` behind the manager gate (`isManager`, repeated on the content block like Team), and add the content block. The mobile "More" sheet maps `moreTabs = [...secondaryTabs]`, so it appears there automatically. The fixed 3-button mobile dock (Allocation, Tasks, More) and `primaryTabs = [allocationTab, tasksTab]` are **not touched** — Table Allocation and Tasks keep primary reachability; the existing e2e nav test (TASK-082) keeps passing and gains one assertion (Bar Inventory under More / secondary tier; absent for staff).

```
Desktop    Primary:   Table Allocation · Tasks
           Secondary: Schedule · Team · Attendance · Bar Inventory · Tip Split · Payroll      [Settings]
Mobile     Dock:      Allocation · Tasks · More
           More:      Schedule · Team · Attendance · Bar Inventory · Tip Split · Payroll · Settings
```

Module props follow the shell convention (`restaurantSlug`, `user`, `onSessionInvalid`, optional `demo`); data loads through server actions (not `page-data.ts`), like Tasks. Demo mode ships a small in-memory demo inventory so the Playwright demo suite can run the UI.

## 2. Module layout

Three primary views as an in-page tablist (same pattern as Table Allocation's five views: `role="tablist"`, `overflow-x-auto`, `shrink-0` tabs so a 412 px viewport never scrolls the page):

```
Bar Inventory      [Location: The Monk's ▾ (hidden while single-location)]
[ Dashboard ] [ Inventory ] [ Manage ]                      Last updated 4:12 PM · refresh
```

History and Analytics are **not** primary tabs: Dashboard sections, an Inventory drill-down (History drawer), and a secondary full-page sub-view "Analytics & history" reached from Dashboard / Inventory (breadcrumb back). Revisit adding a fourth tab only if owner review shows the Dashboard becoming crowded.

## 3. Dashboard (desktop)

```
┌ KPI row (6 tiles, equal) ─────────────────────────────────────────────────────────────────────┐
│ Active items  │ ● Critical │ ▲ Low / approaching │ ✓ Healthy │ ○ No cutoff set │ Recently changed │
│     212       │     9      │         17          │    182    │       4         │   23 (7 days)    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
Filters:  Vendor ▾  Status ▾  Category ▾  Subcategory ▾   [search…]        Clear all · chips: [Vendor: Faust ×]

ORDER SOON                                                      Export recommendations ▾ (CSV · XLSX)
┌ FAUST ─────────── 3 need attention · 2 critical · 1 low ────────────── suggested total 24 ──┐
│ ● Casamigos Blanco 750 mL   Total 3 · Cutoff 4 · Par 10        Order 7     ~ Out in 0–1 days │
│ ● Tito's 1.75 L             Total 5 · Cutoff 5 · Par 12        Order 7     ~ At cutoff       │
│ ▲ Bulleit Bourbon 750 mL    Total 9 · Cutoff 6 · Par 12 (Low)  Order 3     ~ 4–5 days        │
├ DEL PAPA ─────────── 1 needs attention · 1 critical ──────────────────── suggested total 10 ─┤
│ ● Modelo Especial 12 oz     Total 2 · Cutoff 4 · Par 12        Order 10    ~ At cutoff       │
├ NO PAR SET ── items show "Order needed" (no invented quantity) ────────────────────────────────┤
└────────────────────────────────────────────────────────────────────────────────────────────────┘
RUNNING OUT SOONEST (days to cutoff)         │ FASTEST MOVERS (30 d)          [See analytics →]
 1 Casamigos Blanco …… 0–1 days  ▁▂▄▆█        │ 1 Tito's 750 mL   2.4/day ▁▃▅▇
```

Rules: vendor groups sorted by (critical count desc, low count desc, name); items inside by Critical → Low → closest to cutoff; vendor header shows counts + suggested total (items without par contribute "Order needed", not a number); the status marker is **icon + text** (● Critical, ▲ Low) plus colour — never colour alone; vendor groups are collapsible (`aria-expanded`), expanded by default when ≤ 5 groups.

### Dashboard (mobile ≤ 640 px)

KPI tiles in a 2-column grid (Critical and Low first, full-width tappable → jumps to Inventory with that status filter). Filters collapse into one **Filters (2)** button opening a bottom sheet. Order Soon becomes a stack of vendor cards (header tap = expand); each item is a two-line row (name · size / total·cutoff·par → **Order 7**). Insights stack below. Sticky bottom action: "Export recommendations".

## 4. Inventory view

### Desktop table

```
[ search… ]  Status ▾  Vendor ▾  Category ▾  …                 Columns ▾   Export all ▾ / Export 37 filtered ▾
Active filters: [Status: Critical ×] [Vendor: Faust ×]  [Total ≤ 5 ×]                         Clear all (3)
┌─Vendor▲─┬─Name────────────┬─Category─┬─Sub─┬─Size──┬─Unit──┬─SKU─┬OnHand┬Backup┬Total┬Cutoff┬Warn┬Par┬─Status────┬Updated────┬By──┬────┐
│ Faust   │ Casamigos Blanco│ Spirits  │Tequ.│750 mL │bottle │ …   │ [2 ] │ [1 ] │ 3   │ [4]  │[6] │[10]│ ● Critical│ Oct 26 4pm│Mia │ ⋯  │
```

- **Sticky header + first two columns**; horizontal scroll inside the table container only; column chooser (persisted per user in `localStorage`, with try/catch); density toggle.
- **Inline edit** (managers): On hand, Backup, Cutoff, Warning, Par are editable cells. `Enter`/blur commits through `inventory_stock_adjust` (`set` + `expected_version`); `Esc` reverts. Quantity edits open a compact **reason popover** (default **Stock Count**, structured list, optional note) — it never blocks keyboard flow (`Tab` to reason, `Enter` to save; "Use last reason" remembered for the session). Threshold edits (Cutoff/Warning/Par) commit silently with a change-log entry. Total and Status update instantly (optimistic), then are replaced by the server's answer.
- **Stale cell:** on `PT409 stale` the cell shows an inline notice "Mia changed this to 5 at 4:10 PM — Keep theirs · Apply mine (6)". No silent overwrite.
- Row `⋯` menu: **History**, Edit product, Archive. Status cells use icon + text. Row focus ring + roving tabindex; arrow keys move between cells; `Enter` edits.

### Filters per column (required: type-appropriate everywhere)

| Column group                                            | Filter control                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Vendor, Category, Subcategory, Size, Unit, Updated By   | multi-select with search box + "select all / none" + counts         |
| Name, SKU, Notes                                        | text: contains · starts with · equals (+ the global search)         |
| On hand, Backup, Total, Cutoff, Warning, Par, Suggested | numeric: `=` · `<` · `>` · between (min–max)                        |
| Status                                                  | multi-select: Critical · Low · Healthy · No cutoff · Archived       |
| Last updated                                            | date range with presets (Today, 7 d, 30 d, custom) in location time |
| Active/Archived                                         | toggle "Show archived" (default off)                                |

Filters open as popovers anchored on the column header (desktop) or in the Filters bottom sheet (mobile). All active filters render as removable **chips** and a visible **Clear all**. State is serialized to the URL query so refresh/back/share keep it. A single global search box **adds to** (never replaces) the column filters.

### Sorting

Every sensible column is sortable (click header; `aria-sort`; secondary sort with Shift-click). Presets menu: **Name A–Z · Vendor · Lowest stock first · Closest to cutoff · Highest movement (30 d) · Recently updated**. Default: Status (Critical first) then Name.

### Inventory (tablet 768–1024 px)

Same table, first column (Name) sticky, columns Category/Subcategory/SKU/Notes/Updated By hidden by default (reachable via Columns), edit cells ≥ 44 px.

### Inventory (mobile)

Card list, one card per item:

```
● Casamigos Blanco 750 mL                    [Critical]
  Faust · Spirits › Tequila
  Total 3   (On hand 2 + Backup 1)
  Cutoff 4 · Warn 6 · Par 10          Order 7
  [ − ] [ + ]  Quick adjust      [ History ] [ ⋯ ]
```

Tap card → detail sheet with all fields, edit steppers (`−`/`+`, numeric keypad), reason selector, and History. Search + Filters (n) sticky at top. Virtualization after 200 cards.

## 5. Item History (drawer on desktop, full-screen sheet on mobile)

```
Tito's Handmade 750 mL            Current  On hand 4 · Backup 6 · Total 10 · ▲ Low
History   [Date range ▾] [Reason ▾] [Actor ▾] [Source ▾] [Δ range ▾]            Export ▾
 Oct 26  4:12 pm   6 → 4   −2   Stock Count   Sidhu     manual edit
 Oct 24  9:40 am   2 → 6   +4   Delivery      Manager   bulk import · batch 12
 Oct 22  …         8 → 6   −2   Usage         Manager
```

Rows show on-hand and backup deltas separately when both change; unclassified/Correction rows are visually muted and excluded from movement analytics (legend explains). Cursor-paginated (server). Link from each row to its import batch.

## 6. Manage

Sub-tabs (secondary tablist inside the view): **Products · Vendors · Categories · Import / Export**.

**Products** — table with the Inventory filters plus _Archived_, _Has no category_, _No SKU_; actions: Add product (Dialog form: Vendor*, Name*, Category, Subcategory (disabled until Category chosen), Size, Unit\*, SKU, Notes, initial On hand / Backup / Cutoff / Warning / Par), Edit, Archive/Reactivate (confirm; explains history is kept), Merge duplicates (V1.1).

**Vendors** — table (Name, Active/Inactive, Item count, Last updated) with filters Name (text), Active (toggle), Item count (numeric), Last updated (date range). **Add vendor** (name; duplicate-key check shows "Del Papa already exists"), Rename, Deactivate (blocked until the manager chooses what happens to its active items: keep / move to another vendor — never deletes), Reactivate. System vendor "Unassigned" is read-only. Inactive vendors are hidden from pickers but history keeps their name.

**Categories** — two-level tree table (Category › Subcategory) with Name, Active, Item count; filters Name / Active / Item count; add, rename, archive, move subcategory.

**Import / Export** — wizard (§7), batch history list (filename, format, actor, time, counts, status), export shortcuts.

Empty states: no vendors → "Add your first vendor or import a spreadsheet" (two buttons); no products → "Import your inventory sheet" with template download.

## 7. Import wizard (Dialog; full-screen on mobile)

```
Step 1  Upload        [ Drop a .csv or .xlsx here · Download template ]          limits: 5 MB, 5,000 rows
Step 2  Sheet         (xlsx with > 1 sheet) ( ) Bar List (212 rows)  ( ) Old counts (40 rows)
Step 3  Map columns   Vendor ← "Vendor"  Name ← "Item"  On Hand ← "Qty" …   [required columns flagged]
Step 4  Preview       Create 12 · Update 183 · Skip 9 · Error 4 · New vendors 1 · New categories 2
                      [All] [Create] [Update] [Skip] [Error]   + the same column filters/sort as Inventory
                      per-row tick to skip · update rows show Current → Import → Δ
Step 5  Confirm       New vendor "Faust Dist." ✓ create   |  "Fuast" → [map to Faust ▾]
                      New category "Mixers" ✓   Reason for quantity changes: [Stock Count ▾]
                      [Import 195 rows, skip 4 errors]   [Back]   [Cancel]
Step 6  Result        Imported 195 · skipped 13 · conflicts 0   [Download error report] [View history batch]
```

Preview and result both announce counts to screen readers (`aria-live="polite"`); errors list the exact cell ("Row 14 · Cutoff Limit · '4 bottles' is not a number"). Blocking errors disable nothing but the affected rows; the primary button is disabled only when zero valid rows remain.

## 8. Analytics sub-view

Header filters (Vendor, Category, Subcategory, Item, Date range, Movement reason, Unit, toggles for count-variance and shrink). Sections: **Depletion over time** (line/bar with data-table toggle), **Fastest / Slowest movers** (ranked tables, sparkline column), **Days to cutoff** (range text, never decimals), **Restocks**, **Chronic cutoff** list, **Vendor demand** (bar), **Shrink and count variance**. Every chart has an accessible table equivalent and an Export. Insufficient data renders "Not enough history yet" (with how much history is needed), never a guess.

## 9. States

| State                | Treatment                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Loading              | skeleton rows/tiles (new `Skeleton` primitive); no layout shift                                                      |
| Empty (no products)  | illustration-free empty state with Import / Add product                                                              |
| Empty (filters)      | "No items match these filters" + **Clear all filters**                                                               |
| Critical / Low       | icon + label + token colour (`destructive` / `warn`), contrast ≥ 4.5:1 in both themes; row stripe is decorative only |
| No cutoff            | neutral badge "No cutoff set" + inline "Set cutoff" affordance                                                       |
| Archived             | muted row, "Archived" badge, hidden unless "Show archived"                                                           |
| Error / offline      | inline banner with Retry; edits that fail keep the user's value and show the server message                          |
| Concurrent edit      | stale-cell notice (§4)                                                                                               |
| Read-only (V2 staff) | all edit affordances absent, not merely disabled                                                                     |

## 10. Components to build (gaps from the audit)

The repo has only `badge, button, card, dialog, input, label, select` in `src/components/ui`, **no** table, filter, chart or tabs primitives, and ad hoc empty states. V1 introduces, under `src/features/bar-inventory/components/` first and promoted to `src/components/ui` only when a second module needs them: `DataTable` (sticky header/columns, sort, column chooser, row focus), `ColumnFilter` family (text, multi-select, numeric, date-range), `FilterChips`, `KpiTile`, `StatusBadge` (icon + text + tone), `InlineNumberCell`, `Sheet` (bottom sheet — currently hand-built only inside the "More" menu), `Tabs`, `EmptyState`, `Skeleton`, and minimal SVG chart primitives (`LineChart`, `BarChart`, `Sparkline`, no chart dependency in V1). CSV/XLSX helpers move to `src/lib/csv` (hardened).

## 11. Accessibility and responsive checklist

Keyboard: full table navigation, popovers trap/restore focus, `Esc` cancels edits; touch targets ≥ 44 px; `aria-sort`, `aria-live` for counts/errors/stale notices, `role=tablist` with arrow-key support (the existing tabs lack it — new `Tabs` adds it); status never colour-only; contrast ≥ 4.5:1 in dark **and** light (tokens exist); respects reduced motion; works at 320–1440 px with no page-level horizontal scroll; `localStorage` use wrapped in try/catch.

## 12. Open UX questions for the owner

1. Is a fourth primary tab (Analytics) preferable to the Dashboard section + sub-view? (Default: no.)
2. Should quantity edits always ask for a reason, or default silently to "Stock Count" with the reason editable afterwards? (Default: popover with remembered last reason.)
3. Is "Unit" required on manual create (default proposed: required with `bottle` preselected)?

## V1.1 interaction contract

Inventory offers individual active-row checkboxes, Select filtered results,
selection count, Clear selection and Bulk Edit. Sorting/filtering preserve selected
product IDs; archived products are excluded. The editor is a compact multi-column
count form on desktop and stacked fields on phones. Blank means unchanged; zero
means zero. Review lists changed products, old/new counts and deltas, reason and
note. A stale conflict shows reviewed/latest counts plus available actor/time;
Refresh counts and re-review is required. Existing cell/quick adjustments remain.

Columns preserve product Name and the selection control; row actions remain
outside customizable columns. Move Up/Down buttons support keyboard and touch;
Reset to Default resets only order/visibility. Phone cards keep their own layout.
Local cache keys include restaurant slug, profile ID and table key; unscoped V1
hidden-column preferences are intentionally not imported across users.

Saved Views are personal and server-persisted. Create, apply, update, save as,
rename, delete, make/remove default and reset to standard are available. Explicit
ownership covers search, filters, sort, visible columns, order and Show archived.
Unowned settings remain unchanged. Defaults initialize on Inventory entry only;
explicit URL state, including Dashboard drill-downs, takes precedence. Unknown
columns are dropped; new columns append. Unsupported payloads show a recoverable
error. Stale select values can yield the existing no-results state with removable
chips and Clear all. Archived visibility also survives URL reload.

Date Tracking summarizes nearest active expiration and oldest manufacture date,
with +N for additional groups. The sheet lists all groups, add/edit/archive,
quantity coverage and nonblocking overcoverage/unknown-quantity information.
Manage > Freshness Rules configures month limits per subcategory, with no assumed
beer policy. Expiration and manufacture statuses use text plus icons. Dashboard
cards count products, explicitly label overlapping expiration windows, and use
the most urgent group per product; archived groups/products never alert. Expired
items precede today/urgent/warning/soon. Stock KPIs remain independent.
