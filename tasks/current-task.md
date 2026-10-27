# Current Task Handoff — Bar Inventory V1 build, then Tasks V1.1

## Current State & Next Step

**Current cycle:** implementation after the 2026-10-26 Production release. Owner order: Phase group A **Bar Inventory V1 (BI-0 → BI-11)**, then Phase group B **Tasks V1.1 (T-0 → T-6)**, then STOP on `development` (Tips V2 #155 is NOT part of this task).
**Feature:** Bar Inventory V1 (#168) · **Phase:** BI-8c-2 (import application: actions, demo commit, Preview / Confirm UI) — code complete, gated, verified against hosted DEV, in PR. BI-8d (XLSX import) is next.

**Branch:** `feature/bar-inventory-bi8c2-import-ui` · **Base development:** `5227183` (BI-8c-1 merge, PR #182, head `d4cae90`, CI green)
**Issue:** #168 (open) · **Project #4:** Bar Inventory item (do not duplicate) · **PR:** BI-8c-2 PR into `development` (find with `gh pr list --head feature/bar-inventory-bi8c2-import-ui`)

**Exact next action:** wait for exact-head CI on the BI-8c-2 PR (application, browser-smoke); if green, merge with a **merge commit**; then `git fetch origin && git switch -c feature/bar-inventory-bi8d-xlsx-import origin/development` and build **BI-8d**: XLSX import converging on the SAME pipeline. (1) `src/lib/xlsx/read.ts` adapter around `read-excel-file/node` (v9.3.12 API: default export `readXlsxFile(buffer)` returns `[{sheet, data}]`, `readSheet(buffer, sheetName)`; blank cell → `null`, `0` → `0`; a formula with no cached value → `null`, so detect it) behind a **bounded pre-flight zip guard** per `IMPORT_EXPORT_SPEC.md` §1 (bounded streaming inflate with `fflate`, already a transitive dependency: cap entry count, total uncompressed size, per-entry size, sheet count ≤ 5, refuse macros / external links / `.xls` `.xlsm` `.xlsb`, a formula cell with no `<v>` is an Error cell, never evaluate formulas); (2) turn a sheet into the SAME `CsvRecord[]` (row numbers = spreadsheet rows, header = row 1; every cell to its display string with numbers as plain decimals; dates refused) so `mapHeaders` / `buildImportPlan` / `toStagedPlan` and the commit are untouched; (3) the file step in `ImportView`: accept `.xlsx`, a sheet picker when the workbook has more than one sheet (`ImportRequest` gains `format`, `sheet`, and the file travels as base64 or the server parses; the 6 MB action limit covers 5 MB), `format` and `sheet` recorded on the batch (`inventory_import_stage` already takes `p_format` and `p_sheet`; the action currently sends `csv` / null); (4) tests: valid workbook, multi-sheet pick, malformed / truncated / not-a-zip, oversized and zip-bomb entries, missing headers, extra columns, empty workbook / sheet, mixed valid + invalid rows, data type normalisation (numbers, text numbers, blanks vs 0, dates, booleans), formula without cached value, `.xls` family rejected, identical preview and commit semantics to CSV (same fixture as CSV gives the same plan), CSV unchanged; hosted UI run for an .xlsx upload (start the DEV-pinned server with `NEON_DATABASE_URL=` and run `playwright.real.config.ts`; clean up tagged data). Then BI-9.
**Exact next command:** `gh pr checks <BI-8c-2 PR number> --watch`

Owner decisions **D1–D8 are LOCKED** (`PRD.md` §10): management roles only · vendor required + system "Unassigned" · Observed Depletion vs Confirmed Usage · blank = unchanged, `0` = zero · org catalog + location stock · XLSX via `read-excel-file@9.3.12` + `write-excel-file@4.1.1` (BI-8) · Realtime = notify→refetch · units Bottle/Can/Pack/Case/Keg + Other.

## Rules for every phase

`feature/*` · `fix/*` · `docs/*` branch → targeted validation → PR → exact-head CI → **merge commit** → `development`. Never commit to `development`/`main`. **No `development → main`** in this task. Migrations DEV only; PROD never touched. `git add` explicit paths only (never `-A`; `docs/testing/` and `*.code-workspace` stay untracked). Do not mix Bar Inventory and Tasks code on one branch. Tips V2 is NOT implemented here. A commit after CI invalidates that CI evidence.

## Bar Inventory phases

- [x] **BI-0** decisions, XLSX review, vectors, `TEST_MATRIX.md` — merged (PR #171)
- [x] **BI-1** org-level catalog, 13 RPCs, Manage UI — merged (PR #172)
- [x] **BI-2** stock, immutable ledger, status view — merged (PR #173, `d216290`)
- [x] **BI-3** `FilterableTable` kit, filter engine, Inventory view, Manage filters — merged (PR #174, `4a5ed19`)
- [x] **BI-4** Dashboard — merged (PR #175, `ee573c0`)
- [x] **BI-5** Order soon by vendor + recommendations CSV export — merged (PR #176, `41fc232`)
- [x] **BI-6** History over the immutable ledger — merged (PR #177, `0e39e0f`)
- [x] **BI-7** Analytics from the ledger — merged (PR #178, `450aeaf`)
- [ ] **BI-8** CSV/XLSX import & export — 8a exports MERGED (PR #179) · 8b import engine MERGED (PR #180) · **8c-1 database MERGED** (PR #182, `5227183`; migration `20261027120000` on DEV) · **8c-2 application: PR open** (report §BI-8c-2; hosted DEV UI 4/4) · 8d XLSX import (next)
- [ ] **BI-9** responsive polish, a11y, regression, Realtime notify→refetch
- [ ] **BI-10** hosted DEV validation
- [ ] **BI-11** final integration gate (full suite once; **not** a Production release)

## Tasks V1.1 phases (after Bar Inventory)

Scope: default landing = Tasks → Today for every role (explicit deep links respected) · management Today view (All Staff / My Tasks / person, server-authorized, staff name per task) · notification scope narrowed to Opening/Closing (#154) · server-authoritative Opening reminders at open, +15, +30 (location time zone, DST-safe, deduped per location/service date/recipient/stage `OPEN`/`OPEN_PLUS_15`/`OPEN_PLUS_30`, suppressed when complete, catch-up shows newest only, nothing after +30). Issues #169, #154 (search before creating any). Docs in `docs/features/tasks-v1-1/`. Phases T-0 → T-6 are defined when group A completes. Not started.

## BI-8c-2 evidence (per-phase detail: see the report)

```
Unit:     Vitest 1277/1277 (97 files); import-flow 29
DB:       pgTAP 37 files pass (0037: 57); hosted DEV DB 9/9 (8c-1)
Browser:  Import 24 (3 projects); all Bar Inventory + payroll cold-cache CI=1 run 160 pass + 2 skips, 0 use-server errors
Hosted:   DEV UI 4/4 (real browser + server action + real JWT; double click once; change-under-preview refused); no leftovers, 26 V2 Harness orgs unchanged
Static:   lint · typecheck · prettier --check PASS
CI:       pending on the PR head
```

**WebKit (Windows):** the BI-3 full run wedged once at default parallelism; not reproduced (report §BI-3). Run Playwright per project with `--workers=2 --global-timeout=…`.

## Safety ledger

```
development merged: YES for BI-0..8c-1 (#171-#182)
main merged: NO
DEV touched: YES (BI-1/BI-2 and BI-8c migrations; hosted suites use synthetic orgs; BI-3..8b added none; BI-8c added 20261027120000)
PROD touched: NO
PROD migrations: NO
```

## Known problems

- **26 leaked synthetic "V2 Harness" orgs in DEV** — harmless; deletion NOT authorized by the owner. Do not delete; ask first if they ever invalidate a test.
- Windows WebKit instability under default Playwright parallelism (above).

## GitHub

#168 Bar Inventory V1 (open) · #169 Tasks Today management visibility (open) · #154 Tasks notification narrowing (open) · #155 Tips V2 (open, untouched) · #111 deploy-migrations (open, blocked) · #113 migration/app sequencing (open) · #164 deferred Production checks (open).

## Notes for the next agent

- Uncommitted files / running processes: none after the BI-3 commit. Only unrelated `@playwright/mcp` and devtools node processes exist — do not kill them.
- `docs/production-release-2026-10-26` holds an unmerged docs commit (`a4a8106`); do not assume its content is on `development`.
- XLSX library installs happen in BI-8 only; the bounded zip guard is specified in `IMPORT_EXPORT_SPEC.md` §1.
- Shared vectors are the contract between SQL and TypeScript: never edit a vector to hide a mismatch.
- Every table/list view must reuse the BI-3 `FilterableTable` + `table-filters.ts`; no ad hoc filter systems.

**Read first:** this file · `docs/features/bar-inventory-v1/IMPLEMENTATION_REPORT.md` §BI-3 · `IMPLEMENTATION_PLAN.md` · `UI_UX_PLAN.md`.
**DO NOT:** merge to `main`, touch PROD, delete the synthetic DEV orgs, start Tips V2, squash/rebase-merge, or merge on red/stale CI.
