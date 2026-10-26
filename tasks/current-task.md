# Current task — Bar Inventory V1 build, then Tasks V1.1 (handoff)

## Current State & Next Step

Cycle: **implementation after the 2026-10-26 Production release.** Owner order: Phase group A **Bar Inventory V1 (BI-0 → BI-11)**, then Phase group B **Tasks V1.1 (T-0 → T-6)**, then STOP (Tips V2 #155 is next; not in this task).

Current branch: `feature/bar-inventory-bi2-stock-ledger` (from `origin/development` `92024d3`; BI-0 #171 and BI-1 #172 merged)
**Exact next action:** BI-2 PR is open: wait for exact-head CI (application, browser-smoke, Database), merge with a merge commit; then branch `feature/bar-inventory-bi3-table-kit` and build the table kit (DataTable, column filters x4 types, chips, sort presets, Tabs/Sheet/Skeleton/EmptyState/StatusBadge) + Inventory view (desktop/tablet/mobile cards, inline edit + reason popover, stale-cell UX); apply the filters to the BI-1 Manage tables. Owner decision pending: delete 26 leaked synthetic "V2 Harness" orgs from DEV (see report §BI-2).

Owner decisions **D1–D8 are LOCKED** (`PRD.md` §10): management roles only · vendor required + system "Unassigned" · Observed Depletion vs Confirmed Usage · blank = unchanged, `0` = zero · org catalog + location stock · XLSX via `read-excel-file@9.3.12` + `write-excel-file@4.1.1` (BI-8) · Realtime = notify→refetch · units Bottle/Can/Pack/Case/Keg + Other.

## Rules for every phase

`feature/*` · `fix/*` · `docs/*` branch → targeted validation → PR → exact-head CI → **merge commit** → `development`. Never commit to `development`/`main`. **No `development → main`** in this task. Migrations DEV only; PROD never touched. `git add` explicit paths only (never `-A`; `docs/testing/` and `*.code-workspace` stay untracked). Do not mix Bar Inventory and Tasks code on one branch. Tips V2 is NOT implemented here.

## Bar Inventory phases

- [x] **BI-0** decisions locked · XLSX library review (D6) · golden vectors · `TEST_MATRIX.md` (107 scenarios) · `IMPLEMENTATION_REPORT.md` — merged (PR #171, `92a5ae4`)
- [x] **BI-1** org-level catalog (migration `20261026170000`, DEV applied), 13 RPCs, Manage UI, nav registration — code complete, PR pending (evidence: report §BI-1). Interim: column filters land in BI-3.
- [x] **BI-2** `inventory_stock`, status view, immutable `inventory_adjustments`, `inventory_stock_adjust` / `_set_levels`, optimistic concurrency, 3 FK-cascade fixes — code complete, PR pending (report §BI-2)
- [ ] **BI-3** table kit + filters + Inventory view (desktop/tablet/mobile)
- [ ] **BI-4** Dashboard (KPIs)
- [ ] **BI-5** Order Soon by vendor + recommendation export
- [ ] **BI-6** History / versioning
- [ ] **BI-7** Analytics
- [ ] **BI-8** CSV/XLSX import & export
- [ ] **BI-9** responsive polish, a11y, regression, Realtime notify→refetch
- [ ] **BI-10** hosted DEV validation
- [ ] **BI-11** final integration gate (full suite once; **not** a Production release)

## Tasks V1.1 phases (after Bar Inventory)

Scope in the owner brief: default landing = Tasks → Today (deep links respected) · management Today view (All Staff / My Tasks / person, server-authorized; staff name per task) · notification scope narrowed to Opening/Closing (#154) · server-authoritative Opening reminders at open, +15, +30 min in the location time zone, deduplicated per recipient/stage/service date, suppressed when complete. Issues #169, #154 (no duplicates). Phases T-0 → T-6 are defined when group A completes.

- [ ] T-0 … T-6 (not started)

## Safety ledger (this cycle so far)

```
development merged: YES for BI-0 (PR #171, 92a5ae4); BI-1 PR pending
main merged: NO
DEV touched: YES (BI-1 migration 20261026170000; hosted suites use synthetic/tagged data)
PROD touched: NO
PROD migrations: NO
```

## GitHub

#168 Bar Inventory V1 (open) · #169 Tasks Today management visibility (open) · #154 Tasks notification narrowing (open) · #155 Tips V2 (open, untouched) · #111 deploy-migrations (open, blocked) · #113 migration/app sequencing (open) · #164 deferred Production checks (open). Verified live 2026-10-26.

## Notes for the next agent

- The `docs/production-release-2026-10-26` branch holds an unmerged docs commit (`a4a8106`: release PASS handoff/STATUS). It is not on `development`; do not assume its content is present.
- XLSX library installs happen in BI-8 only. The pre-flight zip guard (bounded `fflate` streaming inflate) is specified in `IMPORT_EXPORT_SPEC.md` §1 and was prototyped in BI-0 (scratch, not committed).
- Shared vectors are the contract between SQL and TypeScript: never "fix" a mismatch by editing a vector without an owner-visible reason.
