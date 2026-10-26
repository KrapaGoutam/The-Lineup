# Bar Inventory V1 — Product Requirements

Status: **PLAN — awaiting owner review. No application code, no migration.** Tracking: issue #168 "[Feature] Bar Inventory V1 — stock, ordering, history and analytics" (label `module:bar-inventory`, milestone "Future Product Backlog"), Project #4. Roadmap position **#2**.

Companion documents: `DATA_MODEL.md` · `UI_UX_PLAN.md` · `IMPORT_EXPORT_SPEC.md` · `ANALYTICS_SPEC.md` · `SECURITY_AND_ROLES.md` · `ACCEPTANCE_CRITERIA.md` · `TEST_STRATEGY.md` · `IMPLEMENTATION_PLAN.md`.

## 1. Outcome

A manager can answer five questions in seconds, on a phone behind the bar or a desktop in the office:

1. What is running low? 2. What is critical? 3. What needs to be ordered soon? 4. Who do I order it from? 5. What is moving fastest?

…and can keep the answer true: edit counts quickly, import a vendor sheet or spreadsheet, see exactly who changed what and when, and export an order list per vendor.

## 2. Who it is for

| Role (designation)                | V1 access                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner, Manager, Assistant Manager | Full: view, edit quantities, manage products/vendors/categories, import/export, history, analytics                                                  |
| Staff (server, host, bartender…)  | **No access in V1** (module hidden, route refused, RLS denies). Read-only staff access is a deliberate V2 decision — see `SECURITY_AND_ROLES.md` §4 |

The recommended default is "management roles only". It is a one-line policy in one database function, so changing it later is cheap.

## 3. Scope (V1)

In scope: three primary views (**Dashboard**, **Inventory**, **Manage**); structured vendors, categories, subcategories; products with on-hand, backup, cutoff, warning, par; calculated total and status; immutable adjustment ledger with reasons; per-item history; vendor-grouped **Order Soon** recommendations with suggested quantities; operational analytics; CSV and XLSX **import with preview** and **export**; column-appropriate filters and sorting on every table; location scoping; concurrency-safe server-authoritative mutations; archive instead of delete.

Out of scope (explicitly, V1): purchase orders / sending orders to vendors / receiving against a PO (documented as future phase, §9); automatic Task creation or manager notifications for critical stock (§9); POS integration or automatic depletion from sales; barcode scanning; multi-location UI (the model supports it, V1 ships one location); unit conversion (1 L ≠ 1000 mL in V1); recipes / cocktail costing; cost/price tracking.

## 4. Core concepts

**Product** = what is stocked (vendor, name, category?, subcategory?, size, unit, SKU?, notes, active/archived). **Stock** = the quantities of a product at a location (on hand, backup, cutoff, warning, par). **Adjustment** = an immutable ledger row recording every quantity change (previous → new, delta, reason, note, actor, time, source). **Import batch** = one reviewed bulk upload.

### Fields

| Field              | Required | Notes                                                                                                                                 |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Vendor             | Yes      | A structured vendor, never free text per row. System vendor "Unassigned" exists for the explicit unassigned state (owner decision D2) |
| Name               | Yes      | "Tito's Handmade Vodka"                                                                                                               |
| Category           | No       | e.g. Spirits                                                                                                                          |
| Subcategory        | No       | e.g. Vodka; only meaningful under a category                                                                                          |
| Size               | No       | "750 mL", "1.75 L", "50 L"                                                                                                            |
| Unit type          | Yes      | bottle, can, keg, case, bag, each, … (curated list + other)                                                                           |
| SKU / item code    | No       | Strong match key for import when present                                                                                              |
| On hand            | Yes      | ≥ 0, up to 2 decimals                                                                                                                 |
| Backup stock       | Yes      | ≥ 0; stored apart from the bar (storeroom)                                                                                            |
| Cutoff limit       | No\*     | The minimum acceptable stock. \*Required by the import template; blank manually → "No cutoff configured"                              |
| Warning level      | No       | "Approaching the minimum". Blank → computed fallback (§5)                                                                             |
| Par / target level | No       | The level to order back up to                                                                                                         |
| Notes              | No       |                                                                                                                                       |
| Active / Archived  | —        | Archive instead of delete once history exists                                                                                         |

## 5. Business rules (authoritative; the database and the TypeScript mirror must agree — shared test vectors in `TEST_STRATEGY.md`)

- **Total available = on hand + backup.** Computed (stored as a database-generated column so filters/sorts/analytics can use it without drift), never manually persisted.
- **Cutoff** is the minimum acceptable stock. **Warning** is "approaching the minimum". They are different things.
- **Effective warning** = the explicit Warning level if set, else `cutoff + max(1, ceil(cutoff × 0.25))`. (Cutoff 4 → warning 5; cutoff 20 → 25.) Validation: warning ≥ cutoff.
- **Status** (archived items are excluded from every KPI and recommendation):
  - no cutoff configured → **No cutoff** (neutral, own KPI card);
  - `total ≤ cutoff` → **Critical** (red);
  - `cutoff < total ≤ effective warning` → **Low / approaching** (amber);
  - `total > effective warning` → **Healthy** (green/neutral).
    Status is always shown with an icon **and** text, never colour alone.
- **Suggested order quantity** = `max(0, par − total)` for Critical and Low items. With no par: show **"Order needed"** and no invented number.
  Worked example: on hand 2, backup 1 → total 3; cutoff 4, warning 6, par 12 → **Critical**, suggested **9**.
- **Order Soon** = Critical + Low items, grouped by vendor, default sort Critical first, then Low, then closest to cutoff.
- **Quantities never change without a ledger row.** Inline edit is a convenience over the adjustment RPC, never a direct write.
- **Archive, don't destroy.** Products, vendors, categories and subcategories with history are archived/deactivated, never hard-deleted; history stays readable.

## 6. Views (summary — wireframes in `UI_UX_PLAN.md`)

1. **Dashboard** — KPI cards (Active items, Critical, Low, Healthy, No cutoff, Recently changed); **Order Soon** grouped by vendor with counts and suggested quantities, vendor/status/category/subcategory filters, export of the recommendation; Critical list; movement insights (fastest/slowest, days-to-cutoff).
2. **Inventory** — the working table: every meaningful column filterable and sortable; inline edit of On hand / Backup / Cutoff / Warning / Par (managers); per-item History; export all / filtered.
3. **Manage** — Products, Vendors, Categories & Subcategories, Import / Export, import batch history.

History and Analytics live as a Dashboard section, an Inventory drill-down (item History drawer) and a secondary full-page History/Analytics sub-view (reached from Dashboard and Inventory). **No fourth primary tab** unless owner review shows it improves usability.

## 7. Navigation

Secondary tier (see `UI_UX_PLAN.md` §1): desktop nav **Primary** — Table Allocation, Tasks; **Secondary** — Schedule, Team, Attendance, **Bar Inventory**, Tip Split, Payroll, Settings. Mobile — under **More**. Table Allocation and Tasks keep primary reachability; nothing is displaced.

## 8. Success criteria

- A manager finds what to order, from whom, and how many, in ≤ 3 taps/clicks from opening the module on a phone.
- A weekly 300-item count can be entered/imported and reviewed in under 10 minutes, with every change in history.
- No lost updates when two managers edit; no silent overwrites on import; no duplicate vendors from spelling variants.
- Every table column has a filter appropriate to its data type; filters can be cleared at once and are visible as chips.
- Exports match what the screen shows (filters honoured) and are safe to open in Excel.

## 9. Future phases (not V1)

- **Purchase orders:** Suggested Order → Purchase Order → Sent → Received → inventory updated (receiving writes Delivery adjustments, source `receiving`). The V1 ledger `source` and `reason` vocabularies already leave room.
- **Tasks / notifications:** critical stock → create a Task or notify managers. Needs owner approval and the Tasks notification scope (#154) settled first.
- **Staff read-only access**, multi-location switching, saved filter views, barcode scanning, POS-driven depletion, cost tracking.

## 10. Owner decisions needed before BI-0 (recommended defaults in bold)

| #   | Decision                                                                    | Options                                                                                 |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1  | Staff access in V1                                                          | **none** · read-only                                                                    |
| D2  | Vendor required, with explicit "Unassigned"                                 | **required + system "Unassigned" vendor** · allow null vendor                           |
| D3  | Is a negative **Stock Count** variance counted as consumption in analytics? | **yes, default on, toggleable** · only explicit "Usage" events                          |
| D4  | Blank cell in an import **update** row                                      | **leave unchanged** · set to zero                                                       |
| D5  | Catalog scope                                                               | **organization-level products + location-level stock** · everything location-level      |
| D6  | XLSX library                                                                | decided in BI-0 after a dependency/security review (no XLSX library is installed today) |
| D7  | Realtime for stock                                                          | **notify → refetch (existing pattern)** · none in V1                                    |
| D8  | Unit types                                                                  | **curated list + "other"** · fully free text                                            |
