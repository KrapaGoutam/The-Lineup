# Bar Inventory V1 — Implementation plan

**Status:** BI-0 complete (decisions D1–D8 locked, XLSX library chosen, vectors + test matrix committed). Build phases BI-1 → BI-10 proceed one branch/PR per phase into `development`; evidence per phase in `IMPLEMENTATION_REPORT.md`.

**Cycle scope note (owner brief 2026-10-26):** in this cycle **BI-11 is the final integration gate** (full suite once, release-readiness input). The Production release described in the BI-11 row below is a **separate future task** that needs explicit owner authorization and #111/#113; `development → main` is never part of this cycle.

Tracking: GitHub issue #168 "[Feature] Bar Inventory V1 — stock, ordering, history and analytics" (labels `type:feature`, `module:bar-inventory`, `priority:p1`; Project #4; milestone "Future Product Backlog"). Branch convention per phase: `feature/bar-inventory-<phase>` → PR → `development` (merge commit). Never `main`, never PROD in a feature PR.

## Audit findings that shape the plan

| Finding (repo audit, 2026-10-26)                                                                                                   | Consequence                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Nav is the `AppTab` union + arrays in `restaurant-operations-app.tsx`; mobile dock fixed at 3; "More" = `secondaryTabs`            | Register as a secondary tab, gated like Team; no dock change; add one nav e2e assertion                  |
| Roles: DB `owner/general_manager/shift_manager` = Owner/Manager/Assistant Manager; Tasks uses membership-only `tasks_is_manager`   | New `private.inventory_is_manager` with the same array; optional `can()` capability for readability      |
| Tasks V1 is the template: SELECT-only RLS, `*_begin` preamble, append-only events, `task_*` RPCs, 4 doc files, 4 test layers       | Mirror it (`inventory_*`)                                                                                |
| **No XLSX library, no CSV parser worth reusing, no chart library, no DataTable/filter/Tabs/Sheet/Skeleton primitives**             | Real scope: build a filterable-table kit + minimal SVG charts + hardened CSV/XLSX I/O (BI-3, BI-7, BI-8) |
| Export helpers exist only inside payroll, with **no formula-injection protection**                                                 | Lift to `src/lib/csv` and harden (BI-8)                                                                  |
| No optimistic-concurrency primitive anywhere (`updated_at` written, never compared)                                                | Introduce `version` + `PT409 stale` pattern (BI-2)                                                       |
| Single-location pilot: `getPrimaryLocation`, `tasks_can_access_location` seam                                                      | Every RPC takes `p_location_id`; V1 UI single location                                                   |
| pgTAP last file 0032; infra open items #111 (deploy-migrations), #113 (migration/app sequencing), #164 (deferred Production smoke) | **Release (BI-11) is blocked on #111/#113**; DEV validation proceeds independently                       |

## Phases

Effort: S ≈ 1–2 days, M ≈ 3–5, L ≈ 1–2 weeks (one engineer). Each phase ends with the full quality gate (`TEST_STRATEGY.md` §5), updated `tasks/current-task.md`, and a docs section in `docs/features/bar-inventory-v1/IMPLEMENTATION_REPORT.md`.

| Phase     | Scope                                                                                                                                                                                                                                                                                                              | Deliverables / exit criteria                                                                                                       | Effort |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **BI-0**  | Owner decisions D1–D8; **XLSX library review (D6)**; golden vectors; `TEST_MATRIX.md`; confirm schema; no code                                                                                                                                                                                                     | Signed-off decisions recorded in `PRD.md`; chosen library + exact version; vectors committed                                       | S      |
| **BI-1**  | Schema foundation (org-level): vendors, categories, subcategories, products, keys, system "Unassigned" vendor, change log; helpers `inventory_is_manager/can_access_location/begin`; RLS; CRUD RPCs; **Manage → Vendors / Categories / Products** UI (basic tables) + nav registration (secondary tier, demo data) | Migration (DEV), pgTAP, R suite for CRUD/permissions/duplicates, nav e2e; staff cannot see/call                                    | L      |
| **BI-2**  | `inventory_stock`, generated `total`, `inventory_adjustments` (immutable), `inventory_stock_adjust` (`set` + `delta`, versions, idempotent no-op), `inventory_stock_set_levels`, status view                                                                                                                       | pgTAP (ledger, append-only, prev-from-locked-row, status vectors), R (stale `PT409`, parallel deltas, retry), TS domain mirror (U) | L      |
| **BI-3**  | **Table kit** (`DataTable`, column filters ×4 types, chips, sort presets, column chooser, `Tabs`, `StatusBadge`, `Skeleton`, `EmptyState`, `Sheet`) + **Inventory view** (desktop/tablet/mobile cards, inline edit with reason popover, stale-cell UX)                                                             | Filter-engine unit matrix (every type × operator), component tests, e2e on 3 projects, keyboard/a11y checks                        | L      |
| **BI-4**  | **Dashboard**: KPI tiles, filters, Recently changed, Critical list; low-stock logic wired to the status view; mobile layout                                                                                                                                                                                        | KPI counts = DB counts (R); e2e                                                                                                    | M      |
| **BI-5**  | **Vendor Order Soon**: grouping, suggested quantities/"Order needed", vendor filters, recommendation export (CSV first)                                                                                                                                                                                            | Grouping/ordering unit vectors, e2e                                                                                                | M      |
| **BI-6**  | **History/versioning**: item History drawer, history filters, cursor pagination, change-log views, import-batch links (stub)                                                                                                                                                                                       | RLS/pagination pgTAP, R, e2e                                                                                                       | M      |
| **BI-7**  | **Analytics**: pure analytics module, time-zone aware aggregation, SVG chart primitives, Analytics sub-view, days-to-cutoff, movers, vendor demand                                                                                                                                                                 | All `ANALYTICS_SPEC.md` §8 vectors; chart table-equivalents; e2e                                                                   | L      |
| **BI-8**  | **CSV/XLSX import & export**: hardened CSV parser + writer (`src/lib/csv`), XLSX adapter, column mapping, stage/commit RPCs, batch history, vendor/category matching UI, filtered/vendor/history exports, injection protection                                                                                     | Import/export vectors, atomic commit + conflict (R), 5,000-row run, malformed/zip-bomb tests, wizard e2e                           | L      |
| **BI-9**  | **Responsive UX + regression**: tablet/mobile polish, a11y audit (`design:accessibility-review`), cross-module regression (nav, Tasks, Table Allocation), empty/loading/error states, Realtime notify→refetch (if D7)                                                                                              | Full demo e2e (3 projects), regression green                                                                                       | M      |
| **BI-10** | **Hosted DEV validation**: DEV migrations, hosted DB + UI suites on a DEV-pinned production build, permission-parity matrix, import with a realistic sheet, write `DEV_VALIDATION.md`                                                                                                                              | GO / GO-WITH-ISSUES report with evidence; PROD ref absent from build                                                               | M      |
| **BI-11** | **Release**: `development → main` via the standard release route (migrations-first); **blocked on #111 (deploy-migrations) and #113 (migration/app sequencing)**; Production smoke (#164 pattern)                                                                                                                  | Release PR, PROD migration list, recovery proof, smoke                                                                             | M      |

Dependencies: BI-0 → BI-1 → BI-2 → BI-3 → {BI-4, BI-5, BI-6} (parallel-capable after BI-3) → BI-7 (needs BI-2 ledger and BI-3 chart/table kit) → BI-8 (needs BI-1/2; XLSX decision from BI-0) → BI-9 → BI-10 → BI-11. A usable **thin slice** (BI-1 → BI-5) delivers vendor-grouped ordering without analytics/import; import (BI-8) can be pulled earlier if the owner wants to load the existing sheet first.

## Migrations (planned, forward-only, DEV first)

| #         | Proposed file                               | Content                                                                                 |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| M1 (BI-1) | `…_bar_inventory_catalog.sql`               | vendors, categories, subcategories, products, keys, change log, helpers, RLS, CRUD RPCs |
| M2 (BI-2) | `…_bar_inventory_stock_ledger.sql`          | stock, adjustments, status view, adjust/levels RPCs, append-only guards                 |
| M3 (BI-8) | `…_bar_inventory_import.sql`                | import batches/rows, stage/commit/cancel RPCs, expiry sweep                             |
| M4 (BI-9) | `…_bar_inventory_realtime.sql` (only if D7) | publication membership                                                                  |

All migrations: fixed `search_path`, private helpers revoked from clients, no destructive changes, proof of replay from an empty database (CI Database job), DEV application recorded in the implementation report. **No PROD migration outside the release phase.**

## Risk register

| Risk                                            | Mitigation                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Scope: table kit + charts + XLSX are all new    | Phase them (BI-3/7/8); keep kit inside the module until reused; no chart dependency in V1           |
| XLSX dependency risk / bundle size              | D6 review in BI-0; server-only; pinned; fallback = CSV-only with "Save as CSV" if no safe library   |
| TS/SQL rule drift (status, keys)                | Single golden vectors consumed by both                                                              |
| Lost updates on counts                          | `version` + `PT409 stale` + `delta` mode; tested with real JWTs                                     |
| Analytics misreading corrections as consumption | Reason-typed ledger, explicit classification table, vectors                                         |
| Import overwriting stock                        | Server-staged plan, Current→Import→Δ preview, per-row version check, atomic commit                  |
| Release blocked by infra (#111/#113)            | DEV validation proceeds; BI-11 explicitly gated                                                     |
| Large catalogs                                  | 5,000-row cap, client-side filtering with server-side history/analytics/export; revisit if exceeded |

## Definition of done (per phase)

Acceptance criteria for the phase ticked with evidence; all gates green on the exact PR head; DEV migration applied and hosted suites green (BI-1+); docs/STATUS + `tasks/current-task.md` updated; PR merged with a merge commit; PROD untouched.

## Next action

BI-1 (catalog foundation) follows BI-0.
