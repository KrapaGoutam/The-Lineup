# Bar Inventory V1 — Test matrix

Created in BI-0. Maps scenario ids `BI-<area>-nnn` to the test layers of `TEST_STRATEGY.md` and the acceptance criteria of `ACCEPTANCE_CRITERIA.md`. A phase is not done until every row assigned to it is implemented and green; the **Phase** column says where the row lands. Status is updated in each phase's section of `IMPLEMENTATION_REPORT.md`.

Layers: **U** domain unit (Vitest) · **C** component/hook (Vitest + Testing Library) · **P** pgTAP · **R** hosted DEV DB (PostgREST, real JWTs) · **E** demo Playwright (3 projects) · **H** hosted DEV UI on a production build.

Shared golden vectors (already committed in BI-0, consumed by U and P): `tests/fixtures/bar-inventory/status-vectors.json`, `keys-vectors.json`, `analytics-vectors.json`. BI-0 fixture integrity: `src/features/bar-inventory/domain/golden-vectors.test.ts` (99 tests).

## Calculations and status (CALC)

| ID          | Scenario                                                                            | Layers | AC        | Phase |
| ----------- | ----------------------------------------------------------------------------------- | ------ | --------- | ----- |
| BI-CALC-001 | Every status vector (boundaries, fallback warning, par missing, decimals, archived) | U, P   | CALC-2..5 | BI-2  |
| BI-CALC-002 | `total` generated column = on_hand + backup, 2-decimal exact (`0.1 + 0.2 = 0.3`)    | P      | CALC-1    | BI-2  |
| BI-CALC-003 | Check constraints: quantities ≥ 0, warning ≥ cutoff, par ≥ 0                        | P, R   | CALC-3    | BI-2  |
| BI-CALC-004 | Status icon + text, not colour alone, light and dark                                | C, E   | CALC-6    | BI-3  |
| BI-CALC-005 | Dashboard KPI counts equal database counts                                          | R, E   | DASH-1    | BI-4  |
| BI-CALC-006 | Archived products excluded from KPIs, Order Soon, recommendations                   | U, P   | CALC-2    | BI-2  |

## Keys, vendors, categories, units (CAT)

| ID         | Scenario                                                                                        | Layers  | AC      | Phase |
| ---------- | ----------------------------------------------------------------------------------------------- | ------- | ------- | ----- |
| BI-CAT-001 | Name/size/SKU/unit key vectors identical in SQL and TypeScript                                  | U, P    | CAT-4,6 | BI-1  |
| BI-CAT-002 | Duplicate vendor spellings (`Del Papa`/`DelPapa`/`DEL PAPA`) refused with the colliding name    | P, R, E | CAT-4   | BI-1  |
| BI-CAT-003 | System vendor `Unassigned` seeded per organization, immutable, cannot be renamed/deactivated    | P, R    | CAT-2   | BI-1  |
| BI-CAT-004 | Vendor rename re-keys and refuses collisions; deactivate hides from pickers, history keeps name | P, R, E | CAT-3   | BI-1  |
| BI-CAT-005 | Vendor with products/history cannot be hard-deleted (`restrict`); no delete RPC exists          | P       | CAT-3   | BI-1  |
| BI-CAT-006 | Subcategory requires its category; product subcategory must belong to product category          | P, R, E | CAT-5   | BI-1  |
| BI-CAT-007 | Tito's 750 mL vs 1.75 L are two products; identical identity refused                            | P, R    | CAT-6   | BI-1  |
| BI-CAT-008 | Unit: five curated types + `other` requires a label ≤ 40; unknown type refused                  | U, P, R | CAT-1   | BI-1  |
| BI-CAT-009 | Create vendor from inside the product form without leaving the dialog                           | C, E    | CAT-2   | BI-1  |
| BI-CAT-010 | Archive/reactivate product checks the identity key before reactivating                          | P, R    | CAT-5   | BI-1  |
| BI-CAT-011 | Cross-tenant vendor/category/product id in any RPC fails (composite FK + RPC validation)        | P, R    | SEC-3   | BI-1  |

## Stock, ledger, concurrency (ADJ)

| ID         | Scenario                                                                                         | Layers | AC     | Phase |
| ---------- | ------------------------------------------------------------------------------------------------ | ------ | ------ | ----- |
| BI-ADJ-001 | `set` writes stock + one ledger row with prev values read from the locked row                    | P, R   | HIST-2 | BI-2  |
| BI-ADJ-002 | Forged previous values impossible (no client DML, RPC ignores any `prev`)                        | P, R   | HIST-2 | BI-2  |
| BI-ADJ-003 | Ledger update/delete/truncate refused (`23514`); tenant cascade teardown still possible          | P      | HIST-2 | BI-2  |
| BI-ADJ-004 | `status_after` and `cutoff_at_time` recorded per row; later cutoff edit does not rewrite history | P      | HIST-2 | BI-2  |
| BI-ADJ-005 | Stale `set` returns structured `PT409 stale` with current values, actor and time                 | P, R   | CONC-1 | BI-2  |
| BI-ADJ-006 | Two parallel `set` edits: exactly one wins, the other gets `PT409`                               | R      | CONC-1 | BI-2  |
| BI-ADJ-007 | Two parallel `delta` deliveries both land; total exact; two ledger rows                          | R      | CONC-2 | BI-2  |
| BI-ADJ-008 | Identical `set` re-submit is a no-op: no version bump, no ledger row                             | P, R   | CONC-3 | BI-2  |
| BI-ADJ-009 | Every reason (9) accepted; unknown reason refused; note ≤ 500                                    | U, P   | HIST-1 | BI-2  |
| BI-ADJ-010 | Move between on hand and backup keeps total; ledger shows both deltas                            | U, P   | INV-4  | BI-2  |
| BI-ADJ-011 | Thresholds (`set_levels`) are versioned, validated, and write a change-log row                   | P, R   | HIST-4 | BI-2  |
| BI-ADJ-012 | Stale-cell UX: notice with Keep theirs / Apply mine; refetch shows latest; intentional retry     | C, E   | CONC-1 | BI-3  |

## Filters, sorting, table kit (FLT)

| ID         | Scenario                                                                                                                                                                                 | Layers  | AC            | Phase   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------- | ------- |
| BI-FLT-001 | Text filter: contains / starts with / exact, case-insensitive, trims                                                                                                                     | U       | INV-2         | BI-3    |
| BI-FLT-002 | Multi-select filter: any-of, search within options, counts, select all/none                                                                                                              | U, C    | INV-2         | BI-3    |
| BI-FLT-003 | Numeric filter: `=` `<` `<=` `>` `>=` range, blank cells excluded, decimals                                                                                                              | U       | INV-2         | BI-3    |
| BI-FLT-004 | Date filter: Today / 7 d / 30 d / custom range in the **location** time zone                                                                                                             | U       | INV-2         | BI-3    |
| BI-FLT-005 | Filter combination AND across columns, OR within a multi-select                                                                                                                          | U       | INV-2         | BI-3    |
| BI-FLT-006 | Active chips render and remove one filter; Clear filter; Clear all                                                                                                                       | C, E    | INV-2         | BI-3    |
| BI-FLT-007 | Filter state serialized to URL; refresh/back restores; **switching organization/location resets it**                                                                                     | U, C, E | INV-2         | BI-3    |
| BI-FLT-008 | Stable multi-key sort on every sortable column; presets; `aria-sort`                                                                                                                     | U, C    | INV-3         | BI-3    |
| BI-FLT-009 | Every table surface has a filter per relevant column: Inventory, Dashboard Order Soon, Vendors, Categories, Subcategories, Products, History, Analytics, Import preview, recommendations | C, E    | INV-2, DASH-3 | BI-3..8 |
| BI-FLT-010 | Mobile: filters reachable in a bottom sheet with the same controls and chips                                                                                                             | E       | INV-5         | BI-3    |

## Inventory UI (INV)

| ID         | Scenario                                                                                         | Layers | AC       | Phase |
| ---------- | ------------------------------------------------------------------------------------------------ | ------ | -------- | ----- |
| BI-INV-001 | All 16 columns present on desktop; tablet hides the planned columns; mobile renders cards        | C, E   | INV-1, 5 | BI-3  |
| BI-INV-002 | Inline edit: Enter/blur commits, Esc reverts, reason popover default Stock Count, remembered     | C, E   | INV-4    | BI-3  |
| BI-INV-003 | Keyboard: arrow-key cell navigation, roving tabindex, touch targets ≥ 44 px                      | C, E   | INV-6    | BI-3  |
| BI-INV-004 | No page-level horizontal scroll at 320–1440 px                                                   | E      | INV-5    | BI-3  |
| BI-INV-005 | Empty states (no products, no filter matches) and loading skeletons without layout shift         | C, E   | —        | BI-3  |
| BI-INV-006 | Optimistic total/status update replaced by the server answer; failed edit keeps the user's value | C, E   | INV-4    | BI-3  |

## Dashboard and Order Soon (DASH)

| ID          | Scenario                                                                                            | Layers  | AC            | Phase |
| ----------- | --------------------------------------------------------------------------------------------------- | ------- | ------------- | ----- |
| BI-DASH-001 | KPI tiles: Active, Critical, Low, Healthy, No cutoff, Recently changed (7 d)                        | U, E    | DASH-1        | BI-4  |
| BI-DASH-002 | Vendor grouping: header counts, suggested total, items without par show "Order needed" not a number | U, E    | DASH-2        | BI-5  |
| BI-DASH-003 | Order: Critical → Low → closest to cutoff; groups by critical count, low count, name                | U       | DASH-2        | BI-5  |
| BI-DASH-004 | Vendor filter narrows Order Soon; export of recommendations equals what is shown                    | U, R, E | DASH-3, EXP-1 | BI-5  |
| BI-DASH-005 | Mobile Dashboard: 2-column tiles, vendor cards, sticky export                                       | E       | INV-5         | BI-4  |
| BI-DASH-006 | Critical/Low tile jumps to Inventory with the status filter pre-applied                             | E       | DASH-3        | BI-4  |

## History (HIST)

| ID          | Scenario                                                                            | Layers  | AC     | Phase |
| ----------- | ----------------------------------------------------------------------------------- | ------- | ------ | ----- |
| BI-HIST-001 | Item history newest first, shows previous → new, delta, reason, note, actor, source | P, R, E | HIST-3 | BI-6  |
| BI-HIST-002 | History filters: date, actor, reason, source, delta range                           | U, E    | HIST-3 | BI-6  |
| BI-HIST-003 | Cursor pagination is stable while rows are inserted                                 | P, R    | HIST-3 | BI-6  |
| BI-HIST-004 | History RLS: management only; staff/outsider/anon denied                            | P, R    | SEC-1  | BI-6  |
| BI-HIST-005 | Archived product and deactivated vendor remain readable in history                  | P, R    | HIST-5 | BI-6  |
| BI-HIST-006 | Import-batch link from a ledger row opens the batch                                 | C, E    | IMP-9  | BI-8  |

## Analytics (ANA)

| ID         | Scenario                                                                               | Layers | AC       | Phase |
| ---------- | -------------------------------------------------------------------------------------- | ------ | -------- | ----- |
| BI-ANA-001 | Confirmed Usage vs Observed Depletion vs Correction/Transfer/Delivery (D3 vectors)     | U      | ANA-1    | BI-7  |
| BI-ANA-002 | "Include observed depletion" toggle changes only the combined movement series          | U, C   | ANA-1    | BI-7  |
| BI-ANA-003 | Rates per day / week; history sufficiency (≥ 3 events, ≥ 14 days)                      | U      | ANA-2, 3 | BI-7  |
| BI-ANA-004 | Days to cutoff range vectors, whole days only, open upper end                          | U      | ANA-3    | BI-7  |
| BI-ANA-005 | Cutoff crossings use stored `status_after`/`cutoff_at_time`; chronic flag              | U, P   | ANA-2    | BI-7  |
| BI-ANA-006 | Local-day boundary incl. DST fall-back day (America/New_York)                          | U      | ANA-4    | BI-7  |
| BI-ANA-007 | Restocked quantity/count, vendor demand, shrink, count variance tables                 | U, R   | ANA-2    | BI-7  |
| BI-ANA-008 | Every chart has a data-table equivalent and export; "Not enough history" never guesses | C, E   | ANA-3    | BI-7  |

## Import (IMP)

| ID         | Scenario                                                                                                     | Layers  | AC       | Phase |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------- | -------- | ----- |
| BI-IMP-001 | CSV parser: quoted newline cell, doubled quotes, BOM, `;` and tab delimiters, UTF-16                         | U       | IMP-1    | BI-8  |
| BI-IMP-002 | XLSX: two sheets → sheet list returned; chosen sheet imported                                                | U, E    | IMP-1    | BI-8  |
| BI-IMP-003 | Hostile files: `.xls/.xlsm/.xlsb`, macro workbook, truncated zip, text renamed `.xlsx`, zip bomb, 5,001 rows | U       | IMP-10   | BI-8  |
| BI-IMP-004 | Formula cell: cached value read; formula **without** cached value is an Error cell, never a silent blank     | U       | IMP-10   | BI-8  |
| BI-IMP-005 | Header alias mapping and manual column mapping; missing required column blocks                               | U, E    | IMP-2    | BI-8  |
| BI-IMP-006 | Upload and preview never mutate (stock, products, vendors counts unchanged)                                  | R       | IMP-2    | BI-8  |
| BI-IMP-007 | Row classes Create / Update / Skip / Error; counts header; Current → Import → Δ                              | U, E    | IMP-3    | BI-8  |
| BI-IMP-008 | Identity matching: SKU stronger; SKU rename flagged; name alone never matches; in-file duplicate → Error     | U, P, R | IMP-4    | BI-8  |
| BI-IMP-009 | Vendor matching `Del Papa`/`DelPapa`; near miss `Fuast` → "Did you mean Faust?" requires a choice            | U, E    | IMP-5    | BI-8  |
| BI-IMP-010 | NEW VENDOR / NEW CATEGORY created only on confirm, in the same transaction as products                       | P, R    | IMP-5, 6 | BI-8  |
| BI-IMP-011 | **Blank = unchanged; `0` = zero** (create and update)                                                        | U, P, R | IMP-7    | BI-8  |
| BI-IMP-012 | Commit applies exactly the staged plan atomically; failure rolls back everything                             | P, R    | IMP-8    | BI-8  |
| BI-IMP-013 | Stock changed after preview → that row is `conflict`, others commit                                          | P, R    | IMP-8    | BI-8  |
| BI-IMP-014 | Every changed quantity writes a `bulk_import` ledger row with the batch id                                   | P, R    | IMP-7    | BI-8  |
| BI-IMP-015 | Batch history records filename, format, sheet, actor, counts, created entities, errors                       | P, R, E | IMP-9    | BI-8  |
| BI-IMP-016 | 5,000-row import completes within the time budget                                                            | R       | IMP-10   | BI-8  |
| BI-IMP-017 | Staged batch expires after 24 h; cancel discards; staff cannot stage or commit                               | P, R    | SEC-1    | BI-8  |
| BI-IMP-018 | Error report CSV: `Row, Column, Problem, Original value`                                                     | U, E    | IMP-3    | BI-8  |

## Export (EXP)

| ID         | Scenario                                                                                                | Layers | AC    | Phase |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------ | ----- | ----- |
| BI-EXP-001 | CSV writer: BOM, quoting, CRLF; numbers as plain decimals                                               | U      | EXP-3 | BI-5  |
| BI-EXP-002 | **Formula injection**: leading `=` `+` `-` `@` tab CR neutralized in text cells; numeric `-2` untouched | U      | EXP-3 | BI-5  |
| BI-EXP-003 | XLSX writer: numeric cells stay numeric; dangerous text stored as explicit strings                      | U      | EXP-3 | BI-8  |
| BI-EXP-004 | Export all vs export current filtered: server re-runs the filter spec; client rows are never trusted    | U, R   | EXP-2 | BI-8  |
| BI-EXP-005 | Vendor recommendation export: flat CSV and one XLSX sheet per vendor                                    | U, E   | EXP-1 | BI-8  |
| BI-EXP-006 | Exports management-only and logged in the change log (actor, type, filter spec, row count)              | P, R   | EXP-4 | BI-8  |
| BI-EXP-007 | No internal ids or secrets in any export column                                                         | U      | EXP-3 | BI-8  |

## Security, roles, navigation (SEC / NAV)

| ID         | Scenario                                                                                                                        | Layers | AC           | Phase   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ------- |
| BI-SEC-001 | RLS enabled on every `inventory_*` table; SELECT-only grants; no client DML                                                     | P      | SEC-1        | BI-1    |
| BI-SEC-002 | Owner / general_manager / shift_manager allowed; server/host/outsider/deactivated/anon denied (`42501`) on select and every RPC | P, R   | SEC-1, NAV-3 | BI-1..2 |
| BI-SEC-003 | `search_path = ''` on every function; private helpers not executable by clients                                                 | P      | SEC-2        | BI-1    |
| BI-SEC-004 | `auth.uid()` is the actor; no actor parameter exists                                                                            | P      | SEC-2        | BI-1    |
| BI-SEC-005 | Composite-FK tenant isolation on all org-level and location-level references                                                    | P, R   | SEC-3        | BI-1    |
| BI-SEC-006 | Every role gets the same decision from the same RPC in hosted DEV                                                               | R      | SEC-1        | BI-10   |
| BI-NAV-001 | Bar Inventory in the secondary tier (desktop) and under More (mobile) for management only                                       | E      | NAV-1        | BI-1    |
| BI-NAV-002 | Dock stays Allocation · Tasks · More; Table Allocation and Tasks stay primary; TASK-082 still green                             | E      | NAV-2        | BI-1    |
| BI-NAV-003 | Staff never see the module; deep link shows "not available" and no data request succeeds                                        | E, H   | NAV-3        | BI-1    |
| BI-NAV-004 | Three primary views only: Dashboard · Inventory · Manage                                                                        | E      | NAV-4        | BI-1    |

## Realtime (RT, D7)

| ID        | Scenario                                                                                         | Layers | AC     | Phase |
| --------- | ------------------------------------------------------------------------------------------------ | ------ | ------ | ----- |
| BI-RT-001 | Publication includes `inventory_stock` and `inventory_adjustments` (notification only)           | P      | CONC-4 | BI-9  |
| BI-RT-002 | Two management contexts: A's edit reaches B without refresh via **refetch**, not payload         | H      | CONC-4 | BI-9  |
| BI-RT-003 | A forged/odd Realtime payload cannot change displayed quantities (client ignores payload values) | C      | CONC-4 | BI-9  |
| BI-RT-004 | Resubscribe loop regression (#134 class) absent on the production build                          | H      | CONC-4 | BI-9  |

## Release (REL)

| ID         | Scenario                                                                                | Layers | AC    | Phase |
| ---------- | --------------------------------------------------------------------------------------- | ------ | ----- | ----- |
| BI-REL-001 | DEV production-build UI has the PROD project ref in 0 files (`.next` grep)              | H      | SEC-4 | BI-10 |
| BI-REL-002 | Migrations replay from an empty database (CI Database job)                              | P      | SEC-4 | each  |
| BI-REL-003 | Migrations-first release route; blocked on #111/#113 — **not part of this build cycle** | —      | SEC-4 | BI-11 |
