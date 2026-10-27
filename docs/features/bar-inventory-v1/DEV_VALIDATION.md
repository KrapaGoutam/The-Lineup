# Bar Inventory V1 — hosted DEV validation (BI-10)

**Verdict: GO.** No open defects. The one defect found during this cycle that only real-mode counting could show (the snapshot re-read once a second, since BI-1) was found and fixed in BI-9, and is covered by regression tests and by the hosted runs below.

**Date:** 2026-10-27 · **Target:** the-lineup-dev (`opmujepkemwcdxxorhfd`) only · **Code under test:** `development` at `d61d35f` (BI-9 merge) plus the two BI-10 test files · **Migration head on DEV:** `20261027130000`

## How it was run

- A **DEV-pinned production build**: every variable taken from `.env.development.local` into the process environment (it wins over `.env.production.local`), `NEON_DATABASE_URL` blank, the DEV project ref asserted by a wrapper before the build. `next build` + `next start`, port 3000.
- **BI-REL-001:** the PROD project ref appears in **0** files of `.next`.
- Real browser (Chromium; a Pixel 7 profile for the phone checks) through the real passcode sign-in, the real Server Actions and the signed-in user's own JWT. Data created through the UI or the audited RPCs, tagged (`RealImp-`, `RealRT-`, `RealVal-`, or the harness's synthetic organizations), and removed afterwards.

## What was proven

| Area                                       | Evidence                                                                                                                                                                                                                                                           | Result |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **Dashboard / Order soon, real-mode read** | The critical item is on the order list; a healthy item is not (`bar-inventory-validation` 2)                                                                                                                                                                       | PASS   |
| **Inventory export, CSV and XLSX**         | Downloaded files compared **row by row with the database**: on hand, backup and total per item; XLSX numbers are real numbers (test 3)                                                                                                                             | PASS   |
| **Order soon export**                      | Exactly the one item that needs ordering (test 4)                                                                                                                                                                                                                  | PASS   |
| **History, real-mode read**                | Bulk import and two Usage counts, signed changes (−5, −6); the History CSV matches; the item sheet's own history shows the same three entries (tests 5–6)                                                                                                          | PASS   |
| **Analytics, real-mode read**              | Confirmed usage of 11 for the item logged as Usage twice (20 → 15 → 9); the analytics export carries it (test 7)                                                                                                                                                   | PASS   |
| **CSV import**                             | New vendor/category/product previewed and committed; a double click applies once; a change made under an open preview is refused and the preview refreshes (`bar-inventory-import` 1–4)                                                                            | PASS   |
| **XLSX import**                            | A workbook read by the server action, previewed, a text-renamed `.xlsx` refused, committed, batch recorded `format=xlsx` (5)                                                                                                                                       | PASS   |
| **Roles**                                  | Staff never see the module (UI). Database: staff and other tenants cannot adjust, set levels or read stock or catalog; no client writes (hosted DB suites, 38 tests)                                                                                               | PASS   |
| **Tenant isolation**                       | A manager of another organization cannot reach this location's ids or rows (catalog + stock suites); and **receives no Realtime events** for them (`realtime-access`)                                                                                              | PASS   |
| **Realtime — who is told**                 | Subscribed to the same location filter: the location's manager gets stock **and** ledger events; same-org staff and another tenant's manager get none                                                                                                              | PASS   |
| **Realtime — behaviour**                   | Window A imports, window B (never reloaded) shows the rows; a change behind the app's back shows as the database's value; A's inline edit reaches B; a 9-update burst ends on the final values in ≤ 4 reads; B's History follows (`bar-inventory-realtime` 1, 3–6) | PASS   |
| **No reload storm / resubscribe loop**     | A quiet 10 s costs the idle window **0** reads (on the production build, where #134 appeared) (`realtime` 2)                                                                                                                                                       | PASS   |
| **Concurrency**                            | Stale edit refused with who changed it; two managers racing one version: exactly one wins; parallel deltas both land and never go below zero; a real double-commit race applies once (hosted DB suites + UI)                                                       | PASS   |
| **Responsive, real data**                  | Phone profile: Dashboard, Inventory (cards), History, Analytics read the database and none scrolls sideways (`validation` 8). The demo sweep covers desktop, tablet and phone (BI-9)                                                                               | PASS   |

## Counts

| Suite                                                                     | Result                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hosted DB (vitest, real JWTs) — catalog, stock, import, realtime-access   | **38 / 38**                                                                                    |
| Hosted UI on the production build — import, realtime, validation, catalog | **23 / 23**                                                                                    |
| PROD ref in `.next`                                                       | **0** files                                                                                    |
| Leftovers after the runs                                                  | 0 tagged products, vendors, categories or batches; the 26 "V2 Harness" organizations unchanged |

## Not covered here (stated, not hidden)

- **Catalog edits are not Realtime-published** (a rename or archive in one window reaches another on its next focus re-read or next write). The spec named stock and the ledger.
- **History shows an item's current name and vendor** on older rows (no label snapshot in the ledger). Deliberate; a snapshot is a separate future change.
- **Analytics "14 days of history"** counts from an item's first ledger row.
- **Deferred analytics:** depletion over time, the shrink table, the count-variance table.
- **The per-export change-log entry** from the BI-8a spec is not built.
- The hosted UI config runs a **desktop** Chromium project; tablet WebKit and phone are covered in demo mode (all Bar Inventory specs, BI-9) and by the phone-profile hosted check above.
- **Production:** not touched. The release route (`development → main`, migrations-first) stays blocked on #111 / #113 and is not part of this cycle.

## Safety

```
development merged: see PR
main merged: NO
DEV touched: YES (read/write through the app and RPCs with tagged data, cleaned up; no migration in BI-10)
PROD touched: NO
PROD migrations: NO
```
