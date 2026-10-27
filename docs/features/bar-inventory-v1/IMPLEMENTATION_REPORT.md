# Bar Inventory V1 — Implementation report

Running record of what each phase delivered, with evidence. Newest phase last. Safety ledger is repeated in every phase.

```
development merged: see each phase
main merged: NO
DEV touched: see each phase
PROD touched: NO
PROD migrations: NO
```

---

## BI-0 — Decisions, XLSX library review, vectors, test matrix (docs + fixtures only)

Branch `feature/bar-inventory-bi0-foundation` → PR into `development`. **No application code, no migration, no dependency change.**

### Delivered

| Item                                       | Where                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner decisions D1–D8 locked + spec deltas | `PRD.md` §10 (+ consequences), `DATA_MODEL.md` (units, read-time warning fallback), `ANALYTICS_SPEC.md` (D3 terminology), `SECURITY_AND_ROLES.md` |
| **D6 XLSX library decision with evidence** | `IMPORT_EXPORT_SPEC.md` §1                                                                                                                        |
| Golden vectors (status, keys, analytics)   | `tests/fixtures/bar-inventory/*.json`                                                                                                             |
| Vector integrity tests                     | `src/features/bar-inventory/domain/golden-vectors.test.ts` (99 tests; independent integer-cent / plain-string oracle)                             |
| Test matrix                                | `TEST_MATRIX.md` (107 scenarios mapped to layers, ACs and phases)                                                                                 |

### D6 — dependency review evidence (2026-10-26)

Scratch installs outside the repository, Node 24.18.1, npm 11.16.0.

| Check                                               | Result                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-excel-file@9.3.12` + `write-excel-file@4.1.1` | 9 packages total (`fflate`, `saxen`, `unzipper-esm`, `graceful-fs`, `node-int64`, `worker-f` + the two), **`npm audit`: 0 vulnerabilities**, MIT                                |
| `exceljs@4.4.0`                                     | 194 packages, `npm audit`: 2 moderate (`uuid`), 21.8 MB unpacked — rejected                                                                                                     |
| `xlsx@0.18.5` (npm SheetJS)                         | `npm audit`: **1 high** (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) — rejected                                                                         |
| Round trip                                          | Written `[Vendor, Name, 4, -2, 0]` / `[…, 3.5, null, null]` read back identically; `=cmd\|' /C calc'!A0` survives as text; blank → `null`, `0` → `0`                            |
| Formulas                                            | cached `=1+1` → `2`; **formula without a cached value → `null` (indistinguishable from blank)** → our guard must flag it (specified for BI-8)                                   |
| Multi-sheet                                         | default export returns `[{ sheet: "Bar List", data }, { sheet: "Old counts", data }]` → sheet picker is possible                                                                |
| Corrupt input                                       | truncated zip → `InvalidInputError "Couldn't unzip"`; text renamed `.xlsx` → `InvalidInputError "Doesn't look like an .xlsx"`                                                   |
| **Zip bomb, library alone**                         | 150 MB-uncompressed entry (0.15 MB compressed) inflated fully: **~509 MB RSS** before the library rejected the (incomplete) workbook → unsafe without a guard                   |
| **Zip bomb, our guard**                             | `fflate` `Unzip` bounded streaming inflate: 400 MB bomb (0.39 MB compressed) rejected as `entry_too_large` in **~304 ms, ~185 MB RSS**; header-declared sizes are never trusted |
| Macro workbook                                      | `xl/vbaProject.bin` entry detected by the guard (`macro: true`)                                                                                                                 |

Not evaluated (and not claimed): `exceljs` / `xlsx` zip-bomb behaviour, their formula semantics. They were rejected on audit results and footprint alone.

Decision: **`read-excel-file@9.3.12` + `write-excel-file@4.1.1`, exact pins, server-only, behind the bounded guard; `fflate@0.8.3` as a direct pin.** Installed in BI-8, so BI-0 changes no `package.json`/lockfile. Accepted risk: single-maintainer packages with API churn across majors → thin adapters + exact pins + adapter test suite as the upgrade gate. Fallback: CSV-only.

### Decisions beyond D1–D8 made in BI-0 (flagged for the owner, easy to reverse)

1. **No CSV dependency** — a small RFC 4180 parser/writer in `src/lib/csv` (caps, BOM, delimiter sniffing). Revisit `papaparse` if it exceeds ~150 lines.
2. **Warning fallback is computed at read time**, never stored on the row.
3. **Cent arithmetic everywhere** (`numeric(13,2)` in SQL; integer cents in TypeScript) — the `0.1 + 0.2` vector proves a naïve float implementation fails a boundary.
4. **Phase naming for this cycle:** the plan's _BI-11 = Release_ is **not in scope** (no `development → main` without separate owner authorization and the #111/#113 gate). In this cycle **BI-11 is the final integration gate** (full suite once, release-readiness input), per the owner's execution brief.
5. **"Include count variance as usage" toggle renamed "Include observed depletion"** (D3 terminology), default on.

### Gates

| Gate                                | Result                         |
| ----------------------------------- | ------------------------------ |
| Vitest (new file)                   | 99/99                          |
| Full `npm run check` / `vitest run` | recorded in the PR (see below) |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

---

## BI-1 — Organization-level catalog (vendors, categories, subcategories, products)

Branch `feature/bar-inventory-bi1-catalog` → PR into `development`. Migration `20261026170000_bar_inventory_catalog.sql` (**DEV applied, PROD not**).

### Delivered

| Layer    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database | `inventory_vendors / categories / subcategories / products / change_log`; generated matching keys (`name_key`, `size_key`, `sku_key`, `unit_key`); identity + SKU partial unique indexes (active rows only); composite tenant FKs; `inventory_is_manager`, `inventory_can_access_location`, `inventory_begin`; SELECT-only RLS (management only); append-only change log; immutable system vendor `Unassigned` (created lazily by `inventory_bootstrap`); 13 `inventory_*` RPCs with `version` / `PT409 stale` and `23505 duplicate` (detail names the existing row) |
| Domain   | `keys.ts` (proven against `keys-vectors.json`), `catalog-commands.ts` (zod), `catalog-engine.ts` (pure twin of the RPCs, powers demo mode), `demo-catalog.ts`                                                                                                                                                                                                                                                                                                                                                                                                        |
| App      | `getCatalogSnapshotAction` / `runCatalogCommandAction` (zod → `requireLiveSession` → manager check → RPC with explicit nulls), paged loader, `useCatalogController` (focus refresh, stale → refetch), Manage view (Products · Vendors · Categories, Show archived), dialogs incl. inline "New vendor…" and the stale "Save over their change" flow, nav registration (secondary tier / More, managers only)                                                                                                                                                          |
| Tests    | pgTAP 0033 (107) + 0034 generated key vectors (48); Vitest +65; hosted DEV DB 15; hosted DEV UI 3; demo Playwright 15 (3 projects)                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Design decisions

1. **Lazy system vendor** instead of a trigger on `organizations`: no change to a core table, nothing seeded into PROD by the migration. `inventory_bootstrap` (called by the snapshot loader) and the vendor RPCs create it; the name key `unassigned` is reserved.
2. **Generated key columns** (not triggers): the database computes the authoritative keys; a client cannot supply one (`428C9`). The TS mirror is proven against the same vectors as SQL (generator `scripts/bar-inventory/generate-pgtap-vectors.mjs`; a Vitest test fails if the committed SQL drifts).
3. **No-op re-submits**: an identical update returns the current version with no write and no log row.
4. **Foreign keys are `NO ACTION`, not `RESTRICT`**, so an organization delete (tenant teardown) can cascade vendors and products in one statement while a direct vendor delete with products still fails (`23503`, proven).
5. **Product stock creation moves to BI-2** (the stock table does not exist yet); BI-2 re-creates `inventory_product_create` to add the stock row and backfills.

### Known interim state (intentional, closed by later phases)

- **Column filters / sorting / global search on the Manage tables** are not in BI-1. The owner requirement (type-appropriate filter on every column) is delivered by the BI-3 table kit and then applied to Products, Vendors, Categories (TEST_MATRIX BI-FLT-009). `development` is not released, so this interim state never reaches Production.
- Dashboard and Inventory tabs are informational placeholders until BI-3/BI-4.
- Product form has no counts/levels yet (BI-2/BI-3).

### Defects found and fixed while testing

- Page-level horizontal overflow on mobile (412 px): the `sr-only` actions header inside the scrolling table container was absolutely positioned and escaped it. Fixed with a `relative` scroll container; the e2e asserts no page-level horizontal scroll on all three projects.
- A pgTAP assertion expectation (SKU key keeps punctuation: `TIT750` ≠ `TIT-750`) was wrong, the code was right; corrected the test.

### Gates (exact numbers)

| Gate                             | Result                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| format (changed paths), lint     | PASS                                                                                      |
| typecheck                        | PASS                                                                                      |
| Vitest                           | 910/910 (78 files)                                                                        |
| pgTAP (local scratch DB)         | 0033: 107/107 · 0034: 48/48                                                               |
| Hosted DEV DB (real JWTs)        | 15/15 (`tests/real/bar-inventory-catalog.db.real.test.ts`)                                |
| Hosted DEV UI (dev server → DEV) | 3/3 (`tests/real/ui/bar-inventory.real.spec.ts`), incl. real stale-conflict UX and reload |
| Demo Playwright, new spec        | 15/15 (desktop, host-tablet, server-mobile)                                               |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: YES (migration 20261026170000; hosted suites use their own synthetic org / tagged rows, cleaned up; the append-only change log and system vendor remain in the DEV org by design)
PROD touched: NO
PROD migrations: NO
```

---

## BI-2 — Stock, immutable adjustment ledger, status view

Branch `feature/bar-inventory-bi2-stock-ledger` → PR into `development`. Migrations (all **DEV applied, PROD not**): `20261026180000_bar_inventory_stock_ledger.sql`, `20261026190000_bar_inventory_actor_fk_deferrable.sql`, `20261026190100_bar_inventory_fk_deferrable_cascade.sql`, `20261026190200_bar_inventory_subcategory_org_cascade.sql`.

### Delivered

| Layer    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database | `inventory_stock` (location-level; generated `total`; versioned; cutoff / warning / par with `warning >= cutoff`), immutable `inventory_adjustments` (previous values read from the locked row; generated deltas; frozen `status_after` and `cutoff_at_time`; nine reasons; `source` derived from the reason), `inventory_stock_status` security-invoker view (effective warning, status, suggested order, "order needed"), `inventory_stock_adjust` (`set` with expected version / `delta`, identical request = no-op) and `inventory_stock_set_levels` (versioned, change-logged), a trigger that seeds a stock row for every location of a new product, RLS (management + location access, SELECT only) |
| Domain   | `stock-rules.ts`: integer-cent mirror of the status rules, reasons and labels, proven against `status-vectors.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tests    | pgTAP 0035 (67) + generated 0036 (25, one product per golden vector asserted THROUGH the view); Vitest +37; hosted DEV DB 13 incl. real-JWT races                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Design decisions

1. **Identical request is a no-op before the version is consulted**: a double submit carries the old version, so checking the version first would turn a harmless retry into a spurious conflict. Different values with a stale version → `PT409 stale` (detail carries the current counts and who changed them).
2. **No previous-value parameter exists** on the RPC; the proof is a pgTAP assertion on the function's argument names.
3. **Quantities are validated, never rounded**: more than two decimals, negatives (set mode), > 9,999,999,999.99 → `22023`. SQL stores `numeric(12,2)`; TypeScript uses integer cents. The `0.1 + 0.2` vector proves the boundary is exact on both sides.
4. **Status is not stored**; `status_after` is frozen per ledger row so later cutoff edits cannot rewrite crossings (ANALYTICS_SPEC §3).
5. **Deleting a product cascades its stock and ledger** (service-role maintenance only; there is no client delete path) — the Tasks convention for append-only history.

### Defects found by the hosted suites and fixed here (all three were latent since BI-1)

Deleting an organization (tenant teardown; no client path) could not complete once the tenant had inventory data:

- actor / location / parent foreign keys were checked before a deeper cascade (product → stock → ledger) had removed the referencing rows → made **DEFERRABLE INITIALLY DEFERRED** (`…190000`, `…190100`), protection unchanged (a still-referenced row fails at commit);
- `inventory_subcategories` had **no foreign key to `organizations`**, so its rows could never cascade away → added (`…190200`);
- the hosted harness teardown now removes organizations (cascade) before memberships (`tests/real/support/harness.ts`); the pgTAP suites run the checks immediately where a violation must be reported at the statement and prove an org with categories, subcategories and products tears down completely.

### Open item for the owner (DEV hygiene)

Before these fixes, my hosted test runs leaked **26 synthetic "V2 Harness …" organizations** (and their "V2H owner / manager / outsider" users, with a few products and ledger rows) into the DEV project. All were created today by this build's own suites. The auto-mode permission layer refused a scripted cleanup (unverifiable deletion scope), so nothing was deleted. They are harmless but should be removed; with an explicit go-ahead I will delete exactly those ids (listed by a read-only query) using the verified cleanup script. New runs no longer leak (count verified stable).

### Gates (exact numbers)

| Gate                                      | Result                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| pgTAP (local scratch DB)                  | 0033: 108/108 · 0034: 48/48 · 0035: 67/67 · 0036: 25/25         |
| Hosted DEV DB (real JWTs)                 | 28/28 (catalog 15 + stock 13); no leaked fixtures after the fix |
| Hosted DEV UI (BI-1 spec, new migrations) | 3/3                                                             |
| format / lint / typecheck                 | PASS                                                            |
| Vitest                                    | 948/948 (79 files)                                              |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: YES (4 migrations; hosted suites with synthetic orgs; 26 leaked synthetic orgs remain pending owner go-ahead)
PROD touched: NO
PROD migrations: NO
```

## BI-3 — Shared table kit, column filters, Inventory view

Branch `feature/bar-inventory-bi3-table-kit` → PR into `development`. **No migration** (UI + domain + loader/action wiring only; DEV schema unchanged by this phase).

### Delivered

| Layer         | What                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter engine | `domain/table-filters.ts`: text (contains / starts with / equals), multi-select, numeric (`=` `<` `<=` `>` `>=` between), date (Today / Last 7 / Last 30 / Custom, evaluated in the **location time zone**), stable multi-key sort, URL serialization; malformed URL input and foreign-organization filter context are rejected |
| Table kit     | `components/table-kit/`: `FilterableTable` (desktop header filter popovers, mobile Filters sheet, active chips, Clear filter / Clear all, global search ANDed with column filters, sortable headers, sort presets, column chooser, card layout below `md`), `Sheet`, `StatusBadge`, `EmptyState`, outside-dismiss hook          |
| Inventory     | `inventory-view.tsx` + `domain/inventory-rows.ts`: all approved columns, status icon + text, inline stock edit with a reason step (`editable-cell.tsx`), mobile item sheet (`item-sheet.tsx`) and quick adjustment; demo-mode stock engine, stock loader and server-action integration                                          |
| Manage        | Products, Vendors and Categories tables use the same per-column filters (replacing ad hoc search)                                                                                                                                                                                                                               |

### Defects found while building, fixed here (regression tests added for each)

1. **Empty filter result removed the whole table** (and with it the filter controls, so the user could not clear the filter) → header and filter controls stay; the body shows an empty state.
2. **Stale inline edit**: a background refresh delivered version B while the user was editing version A, and the cell silently adopted B, so a submit could overwrite a concurrent change → the editing cell keeps the version it **started** from; the server's `PT409 stale` check stays authoritative. Proven with a real two-window scenario against DEV.
3. **Foreign-organization URL filters**: a shared URL carrying another organization's filter context could be re-stamped onto the current organization → foreign context is dropped when the module mounts.
4. **Mobile overflow** (BI-1 fix) is now also asserted for the Inventory view.

### WebKit investigation (full-suite wedge on Windows)

The first full demo run (default workers) stalled in the `host-tablet` (WebKit) project: 11 workers sat for ~39 minutes, the run was stopped, and the rest of `host-tablet` plus all of `server-mobile` never executed.

- The 11 stalled cases were 3 × `bar-inventory-inventory` (BI-3's own), 3 × `allocation-open-editing`, 5 × `attendance-reporting`. Rerun individually on `host-tablet` with 2 workers: **11/11 pass in 1.6–6.9 s**.
- Rerun per project with 2 workers and a global timeout: `host-tablet` **199/199 (7.1 min)**, `server-mobile` **197 passed, 2 skipped (2.6 min)**; the original run had `desktop` at 199 ok / 0 failed.
- No assertion failure reproduced. Classification: **non-reproduced environment instability (Windows WebKit under default parallelism)**, not a product defect. No test was skipped, deleted or weakened. Exact-head CI is the arbiter. Local full runs should use `--workers=2` per project.

### Gates (exact numbers)

| Gate                                        | Result                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| format / lint / typecheck                   | PASS                                                         |
| Vitest                                      | 998/998 (84 files); Bar Inventory focused 248/248            |
| Filter engine matrix (`table-filters.test`) | 27 tests                                                     |
| Playwright Inventory (demo)                 | 19 passed, 2 intentional phone-only skips                    |
| Playwright Manage filters                   | 12 passed                                                    |
| Playwright full, per project (2 workers)    | desktop 199 · host-tablet 199 · server-mobile 197 (+2 skips) |
| Hosted DEV UI                               | 4/4 incl. two-window stale-cell conflict                     |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: YES (hosted UI suite with synthetic orgs; no migration in BI-3)
PROD touched: NO
PROD migrations: NO
```

## BI-4 — Dashboard

Branch `feature/bar-inventory-bi4-dashboard` → PR into `development`. **No migration**: the Dashboard is a read model over the stock rows the Inventory view already loads.

### Delivered

| Layer     | What                                                                                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain    | `domain/dashboard.ts`: six KPI counts (`buildKpis`), urgency order (`needsOrdering`: Critical, then Low, then closest to cutoff, then vendor and name), 7-day change set in the **location time zone** (`recentlyChangedRows`), and the table state each tile opens (`tileDrillDown`)                               |
| UI        | `components/dashboard-view.tsx`: Active items / Critical / Low / Healthy / No cutoff / Recently changed tiles (2 columns on phones), **Order soon** and **Recently changed** as shared `FilterableTable`s (every column filterable), Fastest moving and Frequently hitting cutoff as honest "needs Analytics" cards |
| Table kit | `writeTableState` exported from `filterable-table.tsx` (the hook's URL write, extracted). A tile click writes the Inventory filter into the URL and switches view, so the drill-down opens with exactly the tile's rows (BI-DASH-006); `suggestedOrderText` moved to `inventory-rows.ts` and shared                 |
| Landing   | The module now opens on **Dashboard** (BI-1 had Inventory as an interim landing because no Dashboard existed)                                                                                                                                                                                                       |

### Decisions

1. **Order soon is a flat, filterable list here.** The vendor-grouped presentation with per-vendor counts and suggested totals is BI-5; it reuses `needsOrdering` and the same table.
2. **No invented analytics.** Fastest moving and Frequently hitting cutoff need the adjustment-history read model (BI-7), so they say so instead of showing numbers.
3. **A tile's number and its drill-down cannot disagree**: both come from the same rule (`tileDrillDown` is unit-tested against `buildKpis`).
4. **Recently changed = last 7 local days of `updatedAt`** (the Inventory table's "Last updated" column and its `7d` date filter), archived excluded. The demo stamps its seeded rows with the load time, so the demo shows 4.

### Gates

| Gate                                               | Result                                           |
| -------------------------------------------------- | ------------------------------------------------ |
| format / lint / typecheck                          | PASS                                             |
| Vitest                                             | 1013/1013 (85 files); new `dashboard.test.ts` 15 |
| Playwright Dashboard + module (3 projects)         | 30 passed                                        |
| Playwright Inventory + Manage filters (3 projects) | 31 passed, 2 intentional phone-only skips        |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO (no migration, no hosted run; hosted validation is BI-10)
PROD touched: NO
PROD migrations: NO
```

## BI-5 — Order soon by vendor and the recommendations export

Branch `feature/bar-inventory-bi5-order-soon` → PR into `development`. **No migration.**

### Delivered

| Layer  | What                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain | `domain/order-soon.ts`: `groupByVendor` (vendors by critical count, then low count, then name; items Critical → Low → closest to cutoff; per-vendor critical / low / suggested total in cents / "order needed" count) and the pure filter-column spec `ORDER_SOON_COLUMNS`, shared by the browser and the export                                                                                    |
| Export | `domain/order-export.ts`: `buildRecommendationsExport` takes the authorized rows plus the table's **serialized filter string**, re-applies it with the same parser and filter engine, and writes the CSV. `src/lib/csv/write.ts` is the writer: UTF-8 BOM, CRLF, RFC 4180 quoting, **formula-injection guard**, numbers stay numbers                                                                |
| Server | `exportOrderRecommendationsAction`: live-session check, management role check, rows loaded from the database under the caller's authorization, filters re-applied server-side. The client sends only the filter string, never rows. Demo mode (no server) runs the same pure builder in the browser                                                                                                 |
| UI     | `components/order-soon.tsx`: collapsible vendor groups (`aria-expanded`, open by default up to 5 vendors), status icon + text, "Order needed" when there is no Par. The shared table kit gains an optional `renderGroups` body, so every column filter, chip, search and the phone Filters sheet still apply; the Filters button is offered at every width because a grouped body has no header row |

### Decisions

1. **The file always equals the screen**: both come from `groupByVendor(applyFilters(needsOrdering(rows)))`; unit tests assert group order, quantities, filters and search against the export.
2. **No invented quantity**: without a Par the CSV cell says `Order needed`, not a number, and the vendor header counts such items separately from the suggested total.
3. **XLSX recommendations (one sheet per vendor)** arrive with the XLSX library in BI-8; the CSV writer in `src/lib/csv` is the one BI-8 extends.
4. `STATUS_LABEL` moved to `domain/stock-rules.ts` (re-exported from the badge) so the domain can name statuses without importing UI.

### Gates

| Gate                               | Result                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| format / lint / typecheck          | PASS                                                                                                |
| Vitest                             | 1031/1031 (87 files); new: `order-soon.test.ts` 13, `csv/write.test.ts` 5                           |
| Playwright Dashboard (3 projects)  | 24 passed (grouping, collapse, filters at every width, export of all rows and of a filtered subset) |
| Playwright all Bar Inventory specs | 70 passed, 2 intentional phone-only skips                                                           |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## BI-6 — History over the immutable ledger

Branch `feature/bar-inventory-bi6-history` → PR into `development`. **No migration**: the ledger (`inventory_adjustments`, BI-2) already holds everything History needs, and its RLS select policy already scopes reads by organization, location and role.

### Delivered

| Layer  | What                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain | `domain/history.ts`: `buildHistoryRows` joins ledger entries to the catalog by the product's stable id, newest first (the ledger id breaks equal-timestamp ties), with exact cent deltas; `HISTORY_COLUMNS` (pure filter spec, reusable by a server export), sort presets, `changeSummary` ("On hand 6 → 4 (−2) · Backup 1 → 3 (+2)")                                                                                          |
| Data   | `data/history-data.ts` + `getHistoryAction`: live-session and management-role checks, rows read under the caller's own RLS for the organization's location, bounded by range (30 / 90 / 365 days / everything) and a 5,000-row cap (the view says when it was cut); one item = its latest 25 changes                                                                                                                           |
| UI     | `components/history-view.tsx`: every ledger column filterable through the shared table kit (date, vendor, item, category, subcategory, size, unit, reason, source, previous / new / Δ on hand and backup, actor, note, import batch), chips, Clear filter / Clear all, search, sort presets, phone cards, a range selector. `components/item-history.tsx`: a collapsible **History** section in the item sheet, loaded on open |
| Demo   | The in-memory engine now appends a ledger entry per count change (same reason → source mapping, frozen status after), so History works and is testable without a database                                                                                                                                                                                                                                                      |

History is a secondary view reached from the Dashboard ("Full history") and from Inventory ("History"), not a fourth tab: the approved UI plan and `BI-NAV-004` keep three primary views.

### Historical identity (audit result)

The ledger stores only the product's stable id. That is enough to keep every entry attached to its item: products are archived, never deleted (the only delete is the service-role cascade used for tenant teardown), and vendors, categories and subcategories are deactivated, never removed. So an old row stays readable after a product rename, archive, vendor rename or deactivation, category rename, and an archived item is marked "Archived".

**Known limit, decided deliberately and not fixed here:** names are the item's _current_ ones. If a product is renamed, or moved to another vendor, older rows show the new name / vendor, because the ledger does not snapshot them. Snapshotting would change the audited `inventory_stock_adjust` function and need a backfill, which is a larger risk than this phase warrants; if the owner wants "as it was at the time" labels, it should be its own change. BI-7's Vendor Demand will read the product's current vendor for the same reason.

### Gates

| Gate                         | Result                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck    | PASS                                                                                                                                                                                    |
| Vitest                       | 1047/1047 (88 files); new `history.test.ts` 16 (order and ties, cent-exact deltas, labels, rename / archive / deactivate, every filter type, combined filters and search, default sort) |
| Playwright History           | 9 passed (3 projects): both entry points, newest first, reason filter + search + Clear all, item History, no page overflow                                                              |
| Playwright all Bar Inventory | 79 passed, 2 intentional phone-only skips                                                                                                                                               |

Not covered locally: the real-mode read (`getHistoryAction` against Supabase). Its columns were checked against the ledger migration; the hosted DEV run in BI-10 exercises it with real JWTs, including role denial and tenant isolation (RLS itself is covered by the BI-2 pgTAP suites).

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## BI-7 — Analytics from the ledger

Branch `feature/bar-inventory-bi7-analytics` → PR into `development`. **No migration.** The ledger already stores `status_after` and `cutoff_at_time` per row (BI-2), so crossings are exact and a later cutoff change cannot rewrite them.

### Delivered

| Layer  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain | `domain/analytics.ts` (pure, `ANALYTICS_SPEC.md` is normative): `classifyEntry`, `isCutoffCrossing`, windows in the location time zone, `buildItemAnalytics`, `estimateDaysToCutoff`, `fastestMoving` / `slowestMoving` / `frequentlyHittingCutoff`, `vendorDemand`, `summarize`, and the pure filter-column specs                                                                                                                                                                                                                                         |
| Data   | `cutoff_at_time` is now read with each ledger row (`HistoryEntry.cutoffAtTime`); the existing `getHistoryAction` serves analytics (365 days, 5,000-row cap, truncation reported)                                                                                                                                                                                                                                                                                                                                                                           |
| UI     | **Analytics view** (from Dashboard "See analytics"): period (7 / 14 / 30 / 90 days or a custom range), "Include observed depletion" (default on) and "Include breakage and comps" (default off), summary (total depletion split Confirmed / Observed, average per day and per week, restocked quantity and count, cutoff hits), an **Item movement** table and a **Vendor demand** table, both on the shared table kit with every column filterable; the totals follow the item table's filters. The Dashboard's two placeholders are now real top-5 lists |
| Demo   | Back-dated, deterministic chains per demo product, ending exactly at today's counts, so the demo shows every state (a chronic cutoff hitter, a fast mover, a slow one, an item with too little history). Unit-tested against the spec's own vectors                                                                                                                                                                                                                                                                                                        |

### Rules as implemented (locked D3 and the spec)

- **Consumption** is judged on the change in _total available_ (on hand + backup): a negative **Usage** is Confirmed Usage; a negative **Stock Count** is Observed Depletion (never called a sale); **Breakage / Comp** are shrink (off by default). **Correction, Transfer In / Out, Delivery, Restock, "Other", a positive Stock Count and a move between on hand and backup are never consumption.**
- **Rates** need ≥ 3 depletion events in the window and ≥ 14 days of history, else "Not enough history" and no number. Average per day = depletion ÷ calendar days in the window (quiet days count).
- **Days to cutoff**: `No cutoff set` → `At or below cutoff` → `Not enough history` → `No recent movement` → a whole-day range from the faster and slower of the 7- and 30-day rates (`12–24 days`, `about 3 days`, `30+ days`, `20–30+ days`). Never a decimal. Judged on the last 30 days whatever period is on screen.
- **Cutoff hit** = a change that leaves the item critical from a total above the cutoff recorded on that row: one per fall, not one per later adjustment while it stays down. **Chronic** = 2 or more hits in 30 days.
- **Dead stock** = nothing depleted over a window of 30+ days, in stock, 14+ days of history: rate 0, "No movement".

### Interpretations to confirm (small, deliberate)

1. "Item has existed ≥ 14 days" is measured from the item's **first recorded change**: the catalog does not expose a creation date, and the first recorded change is the evidence that matters.
2. Archived items are left out of the analytics tables.
3. The Dashboard's two lists are previews (top 5) of the Analytics tables; the filterable tables are in the Analytics view.
4. **Not in this phase:** the depletion-over-time chart (needs SVG primitives; the tables carry every metric, and the spec requires a table equivalent anyway), the shrink and count-variance tables, and the cross-unit "par turns" ranking beyond the per-item column.

### Defects found by this phase's tests and fixed

- `FilterableTable` defaulted `sortOnlyColumns` / `defaultSort` / `sortPresets` to a fresh `[]` each render, which invalidated its memoised rows and re-fired `onVisibleRows` every render; the first caller to set state from that callback looped. The defaults are stable now.
- The app shell re-renders every second (header clock) and rebuilds the `demo` object, so `loadHistory` changed identity every second; every ledger consumer re-read it and Analytics flashed its loading state, unmounting its tables mid-interaction. `loadHistory` now keeps one identity (it reads current values through a ref updated in a layout effect) and `useLedger` re-reads on an explicit key and never blanks the screen.
- Rates now display to at most 2 decimals (`formatRate`); the Dashboard briefly showed `0.1667/day`.

### Gates

| Gate                              | Result                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck         | PASS                                                                                                                                                                                                              |
| Vitest                            | 1103/1103 (90 files); new `analytics.test.ts` 49 (every spec vector, classifier, exclusions, windows and time zone, toggles, crossings, dead stock, rankings, vendor demand, filters), `analytics-demo.test.ts` 7 |
| Playwright Analytics (3 projects) | 21 passed: totals, Confirmed vs Observed, the toggle, ranking and thin data, period change and a refused custom range, filters narrowing table and totals, vendor demand, navigation                              |
| Playwright all Bar Inventory      | 100 passed, 2 intentional phone-only skips                                                                                                                                                                        |

Not covered locally: the real-mode ledger read (`cutoff_at_time` is a new selected column, checked against the ledger migration); the hosted DEV run in BI-10 exercises it.

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## BI-8a — Exports (CSV and XLSX)

BI-8 (import + export) is delivered in four slices, each its own PR through CI: **8a Exports** (this), **8b** the import engine (pure: CSV parser, header mapping, validation, matching, diff), **8c** import commit (migration for batches + atomic commit RPC, pgTAP, server actions, Preview / Confirm UI), **8d** XLSX import (bounded zip guard, sheet picker). Branch `feature/bar-inventory-bi8-import-export` → PR into `development`. **No migration.**

### Delivered

| Layer        | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependencies | `write-excel-file@4.1.1` and `read-excel-file@9.3.12`, exact pins, exactly as decided in BI-0 (D6). The reader is used here only to read generated workbooks back in tests; the guarded import use is 8d                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Shared       | `src/lib/export/document.ts`: one format-neutral table model written as CSV or XLSX, so both carry the same rows and the same formula guard (`neutralizeText`, one rule: a text value starting `=` `+` `-` `@` tab or CR gets a leading `'`; numbers are never altered); Excel-safe sheet names (no `[]:*?/\`, ≤ 31 chars, not blank, not the reserved "History", unique); filenames `bar-inventory_<restaurant>_<export>_<yyyy-mm-dd>.<ext>` (`-filtered` when filters are on). `src/lib/xlsx/write-node.ts` (server) and `write-browser.ts` (demo only, loaded on demand) are the only two places the writer is called |
| Domain       | `domain/exports.ts` `prepareExport`: **Inventory**, **History**, **Order recommendations** and **Analytics** from one request type. Each parses the table's filter string with the table kit's own parser and applies it with its own pure column spec (`INVENTORY_COLUMNS` is now shared by the Inventory view, so the screen and the file cannot drift), then the table's sort or its default. History and Analytics take their range / period                                                                                                                                                                         |
| Server       | `exportDataAction` replaces the BI-5 recommendations-only action: live-session and management-role checks, rows loaded under the caller's own RLS, filters re-applied here, CSV as text or XLSX as base64. The client sends **what** to export and the filter string, never rows. Demo mode (no server) builds the identical file in the browser from the same pure function                                                                                                                                                                                                                                             |
| UI           | `ExportControl` on Inventory, History, Order soon and Analytics: Download CSV / Download Excel (.xlsx); with filters on, the person chooses "Filtered rows (N)" or "All rows"                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### What each file contains

- **Inventory:** every active item (archived are left out, like the default view): vendor, name, category, subcategory, size, unit, SKU, on hand, backup, total, cutoff, warning, par, status, suggested order (a number, or "Order needed" with no Par, never invented), last updated as ISO **and** local time, updated by, notes.
- **History:** ledger rows newest first with ISO and local date, previous / new / change for on hand and backup as signed numbers, status after, actor, note, import batch. The XLSX sheet is "Inventory history" (Excel reserves the name "History").
- **Order recommendations:** CSV is one flat table with a Vendor column; XLSX is a **Summary** sheet plus **one sheet per vendor**.
- **Analytics:** the item table for the chosen period and toggles, with the period written on each row; a rate is blank when there was not enough history.

### Deferred (stated, not forgotten)

- The per-export **change-log entry** the spec describes (actor, export type, filters, row count) needs a database write; it goes with 8c's migration.
- Exports run in the request (a 5,000-row cap on ledger reads, a few MB at most); streaming and a progress bar are not needed at this size and are not built.

### Gates

| Gate                                        | Result                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck                   | PASS                                                                                                                                                                                                                                                                                                                            |
| Vitest                                      | 1136/1136 (93 files); new `exports.test.ts` 17 (filters, sort, filtered vs all, archived, formula in a name in both formats, ISO + local time, the four builders, workbook sheets), `export/document.test.ts` 12, `xlsx/write.test.ts` 4 (**round trip through the approved reader**: numbers stay numbers, `=cmd…` stays text) |
| Playwright exports (3 projects)             | CSV and XLSX downloads read back, filtered vs all, history, analytics, per-vendor workbook, menu dismiss; plus the updated recommendations flow                                                                                                                                                                                 |
| Playwright all Bar Inventory                | 118 passed, 2 intentional phone-only skips                                                                                                                                                                                                                                                                                      |
| Cold-cache CI-like run (`CI=1`, no `.next`) | 19 passed, 0 server-action errors (the BI-6 lesson)                                                                                                                                                                                                                                                                             |

Not covered locally: the real-mode action against Supabase (the same pure builder and the same loaders as History / Analytics); BI-10's hosted run exercises it with real JWTs.

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```

## BI-8b — The import engine (pure)

Second slice of BI-8 (8a exports merged, PR #179). Branch `feature/bar-inventory-bi8b-import-engine` → PR into `development`. **No migration, no UI, no server code:** this is the part that decides what a file would do, written as pure functions so every rule is unit-tested before any of it can touch data. 8c (database + Preview / Confirm UI) and 8d (XLSX) build on it.

### Delivered

| Module                     | What                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/csv/read.ts`      | RFC 4180 reader: quoted fields, doubled quotes, embedded newlines, CRLF / LF / CR, UTF-8 or UTF-16 byte-order marks, `,` `;` tab sniffed from the first line (never from inside quotes), control characters stripped, blank lines dropped while row numbers stay true to the file (header = row 1). **Bounded:** 5 MB, 5,000 data rows, 40 columns, 500 characters per cell, else a clear error and nothing is allocated past the cap                        |
| `domain/import-columns.ts` | Header mapping against the approved template with the spec's aliases (`Qty`, `Cut off`, `Min`, `Par`, `Target`, `Item`, `UPC` …), compared as letters and digits only; the **template minimum** (Vendor, Name, On Hand, Backup, Cutoff Limit, PRD) is reported when missing; unknown headers are listed, never dropped silently; two columns for one field → the first wins and the clash is reported; the manager's own mapping overrides the automatic one |
| `domain/import-plan.ts`    | `buildImportPlan(rows, header, catalog, options)` → every row classified **CREATE / UPDATE / SKIP / ERROR** with `Current → Imported → Delta` per changed field, the status move (e.g. Critical → Healthy), the stock version it was planned against (for conflict detection at commit), warnings, and the proposed new entities                                                                                                                             |

### Rules as implemented (locked D2, D4, D5 and `IMPORT_EXPORT_SPEC.md` §4-§6)

- **Blank = unchanged, `0` = zero**, for every count and level. A row that changes nothing is a Skip ("No changes"), so an all-blank row can never clear anything. On a **new** item, blank counts are 0 and blank levels are none.
- **Matching:** SKU first; else vendor + name + size + unit (size and unit normalised for matching only: `750ml` = `750 mL`). **Never by name alone**: _Tito's 750 mL_ and _Tito's 1.75 L_ are separate, and the same name under another vendor is a new item. A SKU match whose name / size / unit / vendor differ is an Update **flagged for the manager's tick** (`needsApproval`). A SKU that matches nothing creates the item with it; a different SKU on an identity match is an Error, not an overwrite.
- **Vendors, categories, subcategories** are matched (letters and digits only, so _Del Papa / DelPapa / DEL PAPA_ are one vendor) or **proposed**, once each, with the first-seen spelling; never created by the plan. A near-miss (edit distance ≤ 2 for longer names, ≤ 1 for short ones, none for tiny ones; e.g. _Fuast_ vs _Faust_) is reported as "Did you mean …?" and **blocks commit until the manager chooses** to map it or create it. A deactivated vendor or category is an Error (no silent reactivation). A subcategory needs a category.
- **Validation** with plain-language messages, all problems of a row reported together: Vendor and Name required; numbers must be plain, ≥ 0, ≤ 2 decimals (thousand separators, decimal commas and negatives are refused, not guessed); the Warning ≥ Cutoff rule is checked on the **resulting** values (a new cutoff is checked against the level already on file); Par below Cutoff is a warning and the row still imports; 200 characters per field, 500 for Notes; an unknown unit becomes "Other" with its own label (≤ 40), a blank unit assumes Bottle and says so.
- **In the file:** the same item twice → the later row is the Error and names the first; one SKU on two different items → **both** rows are Errors. Archived products cannot be updated by import.
- **`canCommit`** is true only when something would be written **and** nothing waits on a choice. Rows in error never propose new entities.

### What 8c and 8d add

8c: the migration (`inventory_import_batches`, the FK from `inventory_adjustments.import_batch_id`, the staged plan, the export change-log), the atomic commit that applies exactly the reviewed plan and writes `bulk_import` ledger rows (refusing a row whose stock changed since preview), pgTAP, server actions, the Preview / Confirm UI with batch history. 8d: XLSX reading behind the bounded zip guard, the sheet picker, rejection of `.xls` / `.xlsm` / `.xlsb`.

### Gates

| Gate                      | Result                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck | PASS                                                                                                                                                                                                                                                                                                                                                            |
| Vitest                    | 1248/1248 (96 files); new `csv/read.test.ts` 21 (every parsing case, the caps, UTF-16, round trip with the writer), `import-columns.test.ts` 22, `import-plan.test.ts` 69 (identity matching, vendor spellings and near-misses with choices, SKU rules, blank vs 0, diffs and status moves, every validation rule, duplicates and collisions, the plan summary) |
| Playwright                | not applicable: no UI or runtime change in this slice (CI still runs the full smoke)                                                                                                                                                                                                                                                                            |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```
