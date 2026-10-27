# Current Task Handoff — Bar Inventory V1 build, then Tasks V1.1

## Current State & Next Step

**Current cycle:** implementation after the 2026-10-26 Production release. Owner order: Phase group A **Bar Inventory V1 (BI-0 → BI-11)**, then Phase group B **Tasks V1.1 (T-0 → T-6)**, then STOP on `development` (Tips V2 #155 is NOT part of this task).
**Feature:** Bar Inventory V1 (#168) · **Phase:** BI-11 (final Bar Inventory gate) — done, in PR: three independent read-only reviews, every finding verified, 16 defects fixed with regression tests, full suite and hosted DEV re-run green. See `docs/features/bar-inventory-v1/FINAL_GATE.md`. **Next: the security dependency bumps (`fix/security-dependency-bumps`: next 16.3.4→16.4.3, zod 4.5.4→4.6.7), then Tasks V1.1.**

**Branch:** `feature/bar-inventory-bi11-final-gate` · **Base development:** `01c0263` (BI-10 merge, PR #186, CI green)
**Issue:** #168 (open) · **Project #4:** Bar Inventory item (do not duplicate) · **PR:** BI-11 PR into `development` (find with `gh pr list --head feature/bar-inventory-bi11-final-gate`)

**Exact next action:** wait for exact-head CI on the BI-11 PR (application, browser-smoke); if green, merge with a **merge commit**. Then branch `fix/security-dependency-bumps` from `origin/development`: bump `next` to 16.4.3 and `zod` to 4.6.7 (non-major; `npm audit --omit=dev` flagged Server Actions DoS and zod collection memory exhaustion), run the FULL suite (Vitest, pgTAP, Playwright 3 projects cold-cache, hosted DEV on a production build), PR, merge. Then **Tasks V1.1**: read `docs/features/tasks-v1-1/` and issues #169 / #154 first. Owner decisions pending (see FINAL_GATE.md): AC-EXP-4 export audit log (build or waive) and light-theme contrast tokens.
**Exact next command:** `gh pr checks <BI-11 PR number> --watch`

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
- [x] **BI-8** CSV/XLSX import & export — 8a exports MERGED (PR #179) · 8b import engine MERGED (PR #180) · 8c-1 database MERGED (PR #182) · 8c-2 application MERGED (PR #183, `c3ccbcc`) · **8d XLSX import: PR open** (report §BI-8d; hosted DEV UI 5/5)
- [x] **BI-9** responsive polish, a11y, regression, Realtime notify→refetch — **PR open** (report §BI-9; migration `20261027130000` on DEV; hosted DEV UI 6/6 + 11/11 on a production build)
- [x] **BI-10** hosted DEV validation — **GO**, PR open (`DEV_VALIDATION.md`; hosted DB 38/38, hosted UI on a DEV-pinned production build 23/23)
- [x] **BI-11** final integration gate — **PR open** (`FINAL_GATE.md`; NOT a release; `main` and PROD untouched)

## Tasks V1.1 phases (after Bar Inventory)

Scope: default landing = Tasks → Today for every role (explicit deep links respected) · management Today view (All Staff / My Tasks / person, server-authorized, staff name per task) · notification scope narrowed to Opening/Closing (#154) · server-authoritative Opening reminders at open, +15, +30 (location time zone, DST-safe, deduped per location/service date/recipient/stage `OPEN`/`OPEN_PLUS_15`/`OPEN_PLUS_30`, suppressed when complete, catch-up shows newest only, nothing after +30). Issues #169, #154 (search before creating any). Docs in `docs/features/tasks-v1-1/`. Phases T-0 → T-6 are defined when group A completes. Not started.

## BI-11 evidence (full report: `docs/features/bar-inventory-v1/FINAL_GATE.md`)

```
Unit:     Vitest 1406/1406 (104 files)
DB:       pgTAP 38 files pass (no migration in BI-11); hosted DB suites 42/42 incl. ledger paging past the 1,000-row API cap
Browser:  full Playwright cold-cache CI=1: desktop 241, tablet 241, phone 239 + 2 skips; 0 use-server errors
Hosted:   production build pinned to DEV (PROD ref in 0 files): UI 24/24 (incl. History + export past 1,000 rows); no leftovers, 26 V2 Harness orgs unchanged
Static:   lint · typecheck · prettier --check PASS
CI:       pending on the PR head
```

**WebKit (Windows):** the BI-3 full run wedged once at default parallelism; not reproduced (report §BI-3). Run Playwright per project with `--workers=2 --global-timeout=…`.

## Safety ledger

```
development merged: YES for BI-0..8d (#171-#184)
main merged: NO
DEV touched: YES (BI-1/BI-2, BI-8c and BI-9 migrations — BI-9 added 20261027130000, publication membership only; hosted suites use synthetic orgs and tagged data)
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
- XLSX libraries are exact-pinned (`write-excel-file@4.1.1`, `read-excel-file@9.3.12`, `fflate@0.8.3`); do not add another spreadsheet library. The guard is `src/lib/xlsx/guard.ts`.
- Shared vectors are the contract between SQL and TypeScript: never edit a vector to hide a mismatch.
- Every table/list view must reuse the BI-3 `FilterableTable` + `table-filters.ts`; no ad hoc filter systems.

**Read first:** this file · `docs/features/bar-inventory-v1/IMPLEMENTATION_REPORT.md` §BI-3 · `IMPLEMENTATION_PLAN.md` · `UI_UX_PLAN.md`.
**DO NOT:** merge to `main`, touch PROD, delete the synthetic DEV orgs, start Tips V2, squash/rebase-merge, or merge on red/stale CI.
