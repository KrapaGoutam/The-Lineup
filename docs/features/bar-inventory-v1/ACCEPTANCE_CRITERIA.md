# Bar Inventory V1 — Acceptance criteria

Status: ⬜ pending (plan). `AC-<area>-<n>`; mapped to tests in `TEST_STRATEGY.md`.

## Access and navigation (AC-NAV)

- [ ] AC-NAV-1 "Bar Inventory" appears in the **secondary** nav tier (desktop) and under **More** (mobile) for Owner, Manager, Assistant Manager only.
- [ ] AC-NAV-2 Table Allocation and Tasks stay primary; the mobile dock stays Allocation · Tasks · More; existing nav e2e (TASK-082) still passes.
- [ ] AC-NAV-3 Staff (host/server) never see the module; the route/action and every database object refuse them (`42501`).
- [ ] AC-NAV-4 Three primary views: Dashboard, Inventory, Manage; no unplanned primary tab.

## Products, vendors, categories (AC-CAT)

- [ ] AC-CAT-1 A product has Vendor, Name, Category?, Subcategory?, Size, Unit, SKU?, On Hand, Backup, Cutoff, Warning, Par, Notes?, Active/Archived.
- [ ] AC-CAT-2 Vendor is a structured entity; products reference a vendor id; "Unassigned" is an explicit system vendor.
- [ ] AC-CAT-3 Vendors can be added, renamed, deactivated, reactivated; never hard-deleted when referenced; inactive vendors keep readable history.
- [ ] AC-CAT-4 Duplicate vendor spellings ("Del Papa", "DelPapa", "del papa", "DEL PAPA") cannot coexist; the UI says which existing vendor collides.
- [ ] AC-CAT-5 Category/Subcategory optional; a subcategory requires its category; archive instead of delete.
- [ ] AC-CAT-6 Tito's 750 mL and Tito's 1.75 L are distinct products; identical identity (vendor+name+size+unit) is refused.

## Calculations and status (AC-CALC)

- [ ] AC-CALC-1 Total available = on hand + backup (generated, never manually persisted).
- [ ] AC-CALC-2 Critical: total ≤ cutoff; Low: cutoff < total ≤ effective warning; Healthy: total > effective warning; No cutoff: cutoff blank. Archived excluded from KPIs.
- [ ] AC-CALC-3 Effective warning = explicit warning, else `cutoff + max(1, ceil(cutoff × 0.25))`; warning ≥ cutoff enforced.
- [ ] AC-CALC-4 Suggested order = `max(0, par − total)` for Critical/Low; no par → "Order needed" with no invented number. Worked example (2+1, cutoff 4, warning 6, par 12) → Critical, order 9.
- [ ] AC-CALC-5 TypeScript and SQL implementations agree on every shared test vector.
- [ ] AC-CALC-6 Status is shown with icon **and** text, not colour alone, in both themes.

## Dashboard (AC-DASH)

- [ ] AC-DASH-1 KPI tiles: Active items, Critical, Low, Healthy, No cutoff configured, Recently changed.
- [ ] AC-DASH-2 **Order Soon** groups Critical+Low items by vendor; each group shows critical count, low count, items, suggested quantities and a suggested total; sorted Critical → Low → closest to cutoff.
- [ ] AC-DASH-3 Dashboard filters: Vendor, Status, Category, Subcategory, search; numeric filters on Total, Cutoff, Warning, Par, Suggested Order; chips + Clear all.
- [ ] AC-DASH-4 "Running out soonest" and "Fastest movers" sections; insufficient data says so.

## Inventory table (AC-INV)

- [ ] AC-INV-1 Columns: Vendor, Name, Category, Subcategory, Size, Unit, SKU, On Hand, Backup, Total, Cutoff, Warning, Par, Status, Last Updated, Updated By.
- [ ] AC-INV-2 **Every meaningful column has a type-appropriate filter** (text, multi-select, numeric `= < > between`, status, date range, person multi-select); active filters shown as chips; Clear all; filter state survives refresh (URL).
- [ ] AC-INV-3 Every sensible column sortable; presets: Name A–Z, Vendor, Lowest stock first, Closest to cutoff, Highest movement, Recently updated.
- [ ] AC-INV-4 Inline edit of On Hand, Backup, Cutoff, Warning, Par for management; every quantity edit writes an immutable adjustment (previous → new, delta, reason, note, actor, time, source).
- [ ] AC-INV-5 Mobile/tablet representation (cards / reduced columns) with quick adjust; no page-level horizontal scroll.
- [ ] AC-INV-6 Keyboard-operable table; touch targets ≥ 44 px.

## Adjustments and history (AC-HIST)

- [ ] AC-HIST-1 Reasons: Stock Count, Delivery/Restock, Usage, Breakage, Comp, Transfer In, Transfer Out, Correction, Other; optional note.
- [ ] AC-HIST-2 Ledger rows are immutable (update/delete/truncate refused), previous values come from the locked row, `status_after` and `cutoff_at_time` recorded.
- [ ] AC-HIST-3 Item History drawer lists changes newest first with filters (date, reason, actor, source, delta range) and exports.
- [ ] AC-HIST-4 Non-quantity changes (thresholds, metadata, vendor/category changes, exports) are recorded with actor in the change log.
- [ ] AC-HIST-5 Archived products/vendors/categories remain readable in history.

## Concurrency (AC-CONC)

- [ ] AC-CONC-1 Two managers `set`-editing the same stock: the second gets a structured stale conflict with the current values; nothing is silently overwritten.
- [ ] AC-CONC-2 Two deliveries (`delta`) applied together both land; totals are exact.
- [ ] AC-CONC-3 Re-submitting an identical `set` is a no-op (no ledger row).
- [ ] AC-CONC-4 All quantity mutations are server-authoritative RPCs; Realtime only notifies.

## Import (AC-IMP)

- [ ] AC-IMP-1 CSV **and** XLSX supported; XLSX offers sheet selection when more than one sheet exists; `.xls/.xlsm/.xlsb` rejected.
- [ ] AC-IMP-2 Upload never mutates; flow Upload → Parse → Preview → Validate → Match → Show new entities → Show row errors → Confirm → Import.
- [ ] AC-IMP-3 Each row classified Create / Update / Skip / Error; Update rows show Current → Import → Δ per field.
- [ ] AC-IMP-4 Identity = vendor + name + size + unit (SKU stronger); name alone is never a key.
- [ ] AC-IMP-5 Vendors from the file are normalized and matched; unmatched ones show **NEW VENDOR — will be created** and are created only on confirm; near-misses require an explicit choice; no silent duplicates.
- [ ] AC-IMP-6 New Category / Subcategory shown for approval; blank Category/Subcategory never fails a valid row.
- [ ] AC-IMP-7 Confirmed import writes adjustments (`source = bulk_import`, batch id); blank cell on update = unchanged; `0` = zero.
- [ ] AC-IMP-8 Commit applies exactly the staged plan atomically; stock changed after preview → that row is a conflict, not overwritten.
- [ ] AC-IMP-9 Every batch is recorded (filename, format, actor, time, counts, created entities, errors) and reviewable.
- [ ] AC-IMP-10 File safety limits enforced (size, rows, XLSX zip/entry caps, formulas never evaluated, cell length).

## Export (AC-EXP)

- [ ] AC-EXP-1 Export current inventory, filtered inventory, history, vendor order recommendations, analytics data in CSV and XLSX; vendor recommendations as one XLSX sheet per vendor.
- [ ] AC-EXP-2 Filtered export equals exactly the on-screen filtered/sorted set, computed server-side.
- [ ] AC-EXP-3 Numbers exported as numbers; CSV has BOM; **formula-injection neutralized** in text cells, numeric cells untouched.
- [ ] AC-EXP-4 Exports are management-only and recorded in the change log.

## Analytics (AC-ANA)

- [ ] AC-ANA-1 Movement uses only Usage (and count variance when enabled) — never Corrections, transfers or deliveries; rules per `ANALYTICS_SPEC.md` §1.
- [ ] AC-ANA-2 Fastest/slowest movers, depletion over time, avg/day and /week, restocked qty and count, current total, days-to-cutoff, repeated cutoff hits, vendor demand.
- [ ] AC-ANA-3 Days-to-cutoff is shown as a whole-day range only when enough history exists; otherwise "Not enough history yet".
- [ ] AC-ANA-4 Dates interpreted in the location's time zone.

## Security, location, platform (AC-SEC)

- [ ] AC-SEC-1 RLS on every table; SELECT-only grants; no client DML; management role + location access in policies.
- [ ] AC-SEC-2 Every RPC: `auth.uid()` actor, active membership, tenant/location validation, `set search_path = ''`, private helpers not executable by clients.
- [ ] AC-SEC-3 Every table and RPC carries `organization_id`/`location_id`; no single-restaurant hard-coding; vendors org-level, stock location-level.
- [ ] AC-SEC-4 Forward-only migrations; DEV before PROD; PROD only through the migrations-first release route.
- [ ] AC-SEC-5 `npm run check`, unit, pgTAP, demo Playwright, hosted DEV DB and UI suites green before release.

## V1.1 acceptance criteria

The V1.1 contract supplements the original V1 checklist; it does not redefine it.

- [x] BI-E1: multiple scoped date groups, optional quantity, preserved precision,
      month boundaries/leap years/business date, configurable audited freshness rules.
- [x] BI-E2: selection, filtered selection, count editor, blank/zero semantics,
      structured reason/note, review, atomic commit, strict conflict and normal ledger.
- [x] BI-E3: scoped visibility/order/reset, keyboard reordering, locked identity,
      personal server views with explicit owned state and Dashboard URL precedence.
- [x] BI-E4: date sheets, coverage, Inventory summaries/filters/sorts, Manage rules,
      separate product-count Dashboard KPIs, prioritized alerts and drill-downs.
- [x] BI-E5: final hosted browser/cleanup/build/security/CI/integration gate (PR #226).

Evidence and exact counts: [V1_1_VALIDATION.md](V1_1_VALIDATION.md).
