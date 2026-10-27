# Current Task Handoff

**Cycle:** post-release development on `development` (PROD release of 2026-10-26 is done). Owner sequence (2026-10-27): Tasks plan → **Bar Inventory — Vendor Order Drafts V1** (VOD-0 → VOD-4) → **Tasks V1.1** (T-1 → T-6) → final `development` integration gate → STOP before `main`/PROD. Tips V2 (#155) is NOT part of this task.
**Feature:** Bar Inventory — Vendor Order Drafts V1 (NEW enhancement; Bar Inventory V1 #168 stays COMPLETE, do not reopen it and do not rerun BI-11)
**Phase:** **VOD-0 (planning only)** — in progress, PR not yet opened

## Current State & Next Step

**Branch:** `docs/bar-inventory-vendor-order-drafts-v1-plan` · **Base development:** `126c72d` (merge of PR #189)
**HEAD:** the VOD-0 docs commit once made (`git rev-parse HEAD`; at the time of writing the branch holds uncommitted docs on top of `126c72d`)
**Issue:** #190 (NEW, created this session; labels type:feature, priority:p2, module:bar-inventory; milestone Future Product Backlog) · **Project #4:** #190 added, Status Planned / Priority P2 / Phase Plan / Version Future / Work Type Feature (the Module field has no Bar Inventory option, same as #168) · **PR:** none yet

**Completed this session**

- #188 (next 16.4.3, zod 4.6.7) was already MERGED: head `f7e794b`, merge `0699498`, CI `application` / `migrations-and-policies` / `browser-smoke` green on that head; `deploy-migrations` skipped as designed. Nothing to redo.
- Stray `AGENTS.md` heading edit (`#`→`##`, Next postinstall) inspected (only that line), restored to the repository version.
- Tasks V1.1 plan PR **#189 MERGED**: head `31b23a9`, CI `application` + `browser-smoke` green on that exact head (local HEAD = PR head = CI-tested SHA), merge commit `126c72d`. It locks the four owner decisions: `?tab=` addressing (kebab-case, `/r/[slug]?tab=`, invalid → Tasks), Opening/Closing operational notifications kept, Opening reminders for management **plus staff authorized to work the incomplete Opening items (own scope only; management-only rejected)**, every non-cancelled Opening item required (future `required` flag → backlog). Database workflow correctly did not run (no `supabase/**` change).

**In progress (VOD-0, docs only, uncommitted on the branch):** `docs/features/bar-inventory-vendor-order-drafts-v1/{PLAN,ACCEPTANCE_CRITERIA,TEST_MATRIX}.md`; roadmap row 3, `docs/STATUS.md` section, `tasks/backlog.md` row, this handoff.
**Not started:** VOD-1 … VOD-4, Tasks T-1 … T-6, final development gate.

**Exact next action:** run `npx prettier --check` on the changed docs, commit with explicit paths (never `git add -A`), push `docs/bar-inventory-vendor-order-drafts-v1-plan`, open the PR to `development` (mention #190), wait for exact-head CI (local HEAD = PR head = CI-tested SHA), merge with a MERGE COMMIT, fetch/refresh `development`, update this handoff, then branch `feature/bar-order-drafts-v1-foundation` for **VOD-1**. Do NOT start VOD-1 on the docs branch. Do NOT start Tasks T-1 before VOD-4 is done.
**Exact next command:** `npx prettier --check docs/features/bar-inventory-vendor-order-drafts-v1/*.md docs/ROADMAP.md docs/STATUS.md tasks/backlog.md tasks/current-task.md`

**Key VOD decisions (full text in `PLAN.md` §3):** tab "Order Drafts" between Inventory and Manage (History/Analytics stay sub-views — the repo has no such tabs) · tables `inventory_order_drafts` + `inventory_order_draft_items`, one `DRAFT` per org+location+vendor via a partial unique index, `DRAFT`/`SENT` only · suggestion snapshot + frozen labels at send · six RPCs (open, save, fill, clear, sync, mark_sent), draft-level `version` + `PT409` · Mark Sent never references `inventory_stock`/`inventory_adjustments` (body-scan pgTAP + before/after equality test) · export = new `order_draft` request kind through `exportDataAction`/`ExportDocument` (request carries only a draft id) · system "Unassigned" vendor gets no draft · no Realtime in V1. Planner decisions D-VOD-9 (Unassigned) and D-VOD-12 (export includes the Suggested column) are open to owner veto and do not block VOD-1.

**Tasks V1.1 repo truth (verified 2026-10-27):** the app has NO per-module URLs — `tab` is `useState<AppTab>("allocation")` in `src/components/restaurant-operations-app.tsx`; only `/` and `/r/[slug]` exist. `tasks_can_view` lets any member view Opening/Closing items but only managers, assignees and `all_team`/`anyone` can work them (`tasks_can_work`), which is the staff reminder eligibility rule. Business hours live in `operating_hours` (+ `locations.opening_local` fallback), time zone in `locations.time_zone`. The Tasks snapshot already runs idempotent sweeps on load; reminders follow that pattern. Owner decisions pending (FINAL_GATE.md): AC-EXP-4 export audit log and light-theme contrast tokens.

**Tests:** none run this session (docs only). Last known green: Vitest 1406/1406, Playwright desktop 241 / host-tablet 241 / server-mobile 239 (+2 skips), pgTAP 38 files (from #188 / BI-11).
**CI:** #188 and #189 exact-head green (above). **Hosted DEV:** untouched this session.
**Uncommitted files:** the VOD-0 docs listed above. **Running background processes:** none started by this session.
**Known defects:** none new. Local branch `feature/tasks-v1-1-default-landing` exists and points at `126c72d` with no commits of its own; it is not in use (T-1 must wait for VOD-4) — delete it or reuse it from a fresh `development` when T-1 starts.

```
development merged: YES (#189 = 126c72d)
main merged: NO
DEV touched: YES earlier in Bar Inventory (BI-1/2/8c/9 migrations); NOT this session
PROD touched: NO
PROD migrations: NO
```

**Tasks V1.1 repo truth (verified 2026-10-27):** the app has NO per-module URLs — `tab` is `useState<AppTab>("allocation")` in `src/components/restaurant-operations-app.tsx`; only `/` and `/r/[slug]` exist. "Deep links respected / refresh keeps the module" therefore needs a minimal `?tab=` mechanism (PLAN §D-1). Business hours live in `operating_hours` (+ `locations.opening_local` fallback), time zone in `locations.time_zone`. The Tasks snapshot already runs idempotent sweeps on load (`task_notifications_sweep`); reminders follow that pattern. Owner decisions pending (FINAL_GATE.md): AC-EXP-4 export audit log and light-theme contrast tokens.

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

Scope: default landing = Tasks → Today for every role (explicit deep links respected) · management Today view (All Staff / My Tasks / person, server-authorized, staff name per task) · notification scope narrowed to Opening/Closing (#154) · server-authoritative Opening reminders at open, +15, +30 (location time zone, DST-safe, deduped per location/service date/recipient/stage `OPEN`/`OPEN_PLUS_15`/`OPEN_PLUS_30`, suppressed when complete, catch-up shows newest only, nothing after +30). Issues #169, #154 (search before creating any). Docs in `docs/features/tasks-v1-1/`. Phases T-0 → T-6 are defined in `docs/features/tasks-v1-1/PLAN.md` (T-0 merged, PR #189). T-1 → T-6 not started; they wait for Vendor Order Drafts V1 (VOD-4).

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

#190 Vendor Order Drafts V1 (open, planned) · #168 Bar Inventory V1 (open) · #169 Tasks Today management visibility (open) · #154 Tasks notification narrowing (open) · #155 Tips V2 (open, untouched) · #111 deploy-migrations (open, blocked) · #113 migration/app sequencing (open) · #164 deferred Production checks (open).

## Notes for the next agent

- Uncommitted files / running processes: none after the BI-3 commit. Only unrelated `@playwright/mcp` and devtools node processes exist — do not kill them.
- `docs/production-release-2026-10-26` holds an unmerged docs commit (`a4a8106`); do not assume its content is on `development`.
- XLSX libraries are exact-pinned (`write-excel-file@4.1.1`, `read-excel-file@9.3.12`, `fflate@0.8.3`); do not add another spreadsheet library. The guard is `src/lib/xlsx/guard.ts`.
- Shared vectors are the contract between SQL and TypeScript: never edit a vector to hide a mismatch.
- Every table/list view must reuse the BI-3 `FilterableTable` + `table-filters.ts`; no ad hoc filter systems.

**Read first:** this file · `docs/features/bar-inventory-v1/IMPLEMENTATION_REPORT.md` §BI-3 · `IMPLEMENTATION_PLAN.md` · `UI_UX_PLAN.md`.
**DO NOT:** merge to `main`, touch PROD, delete the synthetic DEV orgs, start Tips V2, squash/rebase-merge, or merge on red/stale CI.
