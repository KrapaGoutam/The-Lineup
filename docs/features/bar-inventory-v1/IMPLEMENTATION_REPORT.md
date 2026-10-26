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
