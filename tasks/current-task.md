# Current Task Handoff — Bar Inventory V1 build, then Tasks V1.1

## Current State & Next Step

**Current cycle:** implementation after the 2026-10-26 Production release. Owner order: Phase group A **Bar Inventory V1 (BI-0 → BI-11)**, then Phase group B **Tasks V1.1 (T-0 → T-6)**, then STOP on `development` (Tips V2 #155 is NOT part of this task).
**Feature:** Bar Inventory V1 (#168) · **Phase:** BI-8c-1 (import batches + atomic commit, database) — code complete, gated, applied to DEV, in PR. BI-8c-2 (application) is next.

**Branch:** `feature/bar-inventory-bi8c-import-commit` · **Base development:** `0283b5d` (BI-8b + docs sync)
**Issue:** #168 (open) · **Project #4:** Bar Inventory item (do not duplicate) · **PR:** BI-8c-1 PR into `development` (find with `gh pr list --head feature/bar-inventory-bi8c-import-commit`)

**Exact next action:** wait for exact-head CI on the BI-8c-1 PR (application, browser-smoke, migrations-and-policies); if green, merge with a **merge commit**; then `git fetch origin && git switch -c feature/bar-inventory-bi8c2-import-ui origin/development` and build **BI-8c-2**, the application half, on the merged DB + the BI-8b engine: (1) `next.config` `experimental.serverActions.bodySizeLimit` (default 1 MB is below the 5 MB file cap); (2) server actions in `actions/inventory-actions.ts` (ONLY async functions may be exported from that `"use server"` file; verify with a cold-cache `CI=1` run): `importPreviewAction` (decode + `parseCsv` + `mapHeaders` + `buildImportPlan` against the authoritative snapshot, nothing written) and `importCommitAction` (re-plan from the SAME inputs, compare a plan fingerprint to the one the person reviewed, build the staged plan JSON per the migration header, call `inventory_import_stage` then `inventory_import_commit`, send EVERY named RPC argument with explicit nulls, map `{ok:false, conflicts}` and errors to plain messages); (3) a pure `toStagedPlan(plan, selection, catalog)` (+ fingerprint) in `domain/import-stage.ts` that turns `PlanRow`s into the staged JSON (needs `expectedProductVersion`, vendor/category ids, full target product fields for SKU-approved identity changes, `set_product`), with unit tests; add `expectedProductVersion` to `PlanRow`; (4) a demo commit engine so the flow is testable in demo; (5) Manage → Import UI on the table kit: upload, column mapping (`mapHeaders` overrides), Preview (counts, per-row Current → Imported → Delta, warnings, errors, near-miss choices from `plan.nearMisses` → `options.choices`, `needsApproval` ticks, row selection), error-report CSV download, deliberate Confirm that cannot double-submit (a request id per attempt), result and conflict messages, refresh of Inventory; (6) e2e (demo) + extend `tests/real/ui/bar-inventory.real.spec.ts` for hosted. Skipped (documented): the per-export change-log entry. Then 8d (XLSX).
**Exact next command:** `gh pr checks <BI-8c-1 PR number> --watch`

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
- [ ] **BI-8** CSV/XLSX import & export — **8a exports MERGED** (PR #179) · **8b import engine MERGED** (PR #180) · **8c-1 database: PR open** (migration `20261027120000` applied to DEV; pgTAP 0037; hosted 9/9) · 8c-2 application (next) · 8d XLSX import
- [ ] **BI-9** responsive polish, a11y, regression, Realtime notify→refetch
- [ ] **BI-10** hosted DEV validation
- [ ] **BI-11** final integration gate (full suite once; **not** a Production release)

## Tasks V1.1 phases (after Bar Inventory)

Scope: default landing = Tasks → Today for every role (explicit deep links respected) · management Today view (All Staff / My Tasks / person, server-authorized, staff name per task) · notification scope narrowed to Opening/Closing (#154) · server-authoritative Opening reminders at open, +15, +30 (location time zone, DST-safe, deduped per location/service date/recipient/stage `OPEN`/`OPEN_PLUS_15`/`OPEN_PLUS_30`, suppressed when complete, catch-up shows newest only, nothing after +30). Issues #169, #154 (search before creating any). Docs in `docs/features/tasks-v1-1/`. Phases T-0 → T-6 are defined when group A completes. Not started.

## BI-8c-1 evidence (per-phase detail: see the report)

```
Unit:     Vitest 1248/1248 (96 files); no application code changed in 8c-1
DB:       pgTAP 0037 57/57; all 37 pgTAP files pass; migration 20261027120000 (first since BI-2)
Browser:  not applicable to 8c-1; all Bar Inventory specs 118 pass + 2 intentional skips at the BI-8a merge
Hosted:   DEV DB 9/9 (real JWTs: access, commit, replay, idempotent staging, double-submit race, conflict, rollback); no leaks (26 V2 Harness orgs unchanged)
Static:   lint · typecheck · prettier --check PASS
CI:       pending on the PR head
```

**WebKit (Windows):** the BI-3 full run wedged once at default parallelism; not reproduced (report §BI-3). Run Playwright per project with `--workers=2 --global-timeout=…`.

## Safety ledger

```
development merged: YES for BI-0..8b (#171-#180)
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
