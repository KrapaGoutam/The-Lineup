# V2.0.4 — Combined Table Allocation Workstation — HANDOFF

Single tracking document for this feature. Resume from "Recovery" at the bottom.

## Identification

- Version / feature: V2.0.4 Combined Table Allocation View (a new view inside the existing Table Allocation Rotation module; **not** a second allocation system).
- Repo: `KrapaGoutam/The-Lineup`.
- Worktree: `<repo>/.tmp/v2-0-4-combined-allocation` (node_modules is a junction to the main checkout's).
- Branch: `feature/v2-0-4-combined-table-allocation`, tracking `origin/development`.
- Base SHA: `1c5373e55cebe9f39360c9e12107c55e7ece3f63` (development, PR #346 merge). Verified by `git fetch` 2026-11-17.
- Main: `2933d3afc351273f04c89559397f2979e5f0eda9` (V2.0.2 + V2.0.3 release merge PR #347; parents dc2cc8f + 1c5373e, so development has no code main lacks).
- Latest source SHA / dirty state: see "Progress log" (last entry wins).

## Baseline reconciliation (H0)

- V2.0.3 is CLOSED and released: PR #347 merged to main 2026-11-17T06:36Z, migration `20261116180009` applied to PROD (ledger 98). Its closeout lives in the (untracked) `.tmp/v2-0-2-v2-0-3-release-review/RELEASE_READINESS_HANDOFF.md` plus `docs/features/v2-0-3-cross-org-kiosk-access/HANDOFF.md`. Neither was touched. Nothing from V2.0.1–V2.0.3 is repeated.
- `development` (1c5373e) is the correct V2.0.4 baseline. The main checkout sits on `docs/recipes-owner-retest-handoff` with unrelated untracked files; it was left alone.
- PROD, kiosk, attendance providers, employee assignments and auth are out of scope and must not be changed.

## Architecture decisions (D-1..D-8)

1. **Combined is a 6th tab** ("Combined") in `allocation-workspace.tsx`'s existing `activeView` state. No new route. Default tab stays `grid` (existing tests rely on it).
2. **One data source.** Combined receives the workspace's `board`, `readModel`, `claim` (shared occupied-table flow) and `execute`. It owns only UI state: mode, selection, popups, scroll-follow. No second allocation/rotation engine; "next server" is `getNextColumn` / `readModel.nextColumnId`.
3. **`execute` now returns `Promise<{ok:true}|{ok:false,error}>`** so the Quick Table Picker can close only after confirmed success and show errors with retry. Existing callers ignore the result.
4. **Assignment target** for a server = that server's own earliest empty round (`findEarliestEmptyRoundForColumn`), additive (a server may hold many tables), exactly as Picker/Floor do. Free table → `execute assign`; anything contested → `claim.intercept` (Transfer / End+Assign / repeat dialogs). Occupied tiles are disabled in the picker.
5. **Dine-in Today** = pure `domain/dine-in-metrics.ts`. Counts physical dine-in tables (each combined part) in cells that are `active` or `ended`, **excluding transfer continuations**. A new optional `RotationCell.transferredIn` flag marks the destination cell of a transfer: set by the pure reducer (demo/optimistic) and by the loader from non-undone `transfer` board events (`dest_round_id` + `dest_member_id`). Skipped / empty / cleared (deleted) cells never count. Table class comes from the registry `resourceType` (`bar_seat` excluded), never from `T`/`B` prefixes; an unregistered free-text label is treated as dine-in. Business day = the service session of the selected `serviceDate` (location time zone, existing mechanism). **No migration.** `Completed = DineInToday − ActiveDineIn`.
6. **Floor/Grid reuse** `TableMap` (plan, unchanged coordinates) and `OffMapTables`; a compact Grid of the same `ResolvedFloorTable[]` + off-map tables is new but uses the same selection handler. No new floor editor.
7. **Rotation Focus** = servers as columns, turns as rows, newest first, a sticky NEXT row on top, only rounds that hold a recorded entry are listed (empty buffer rounds are represented by NEXT). Rows are keyed by `round.id` / `sequence`, never array index. Follow-latest: scroll position pinned to the top unless the user scrolled away; "Jump to latest" resumes following.
8. **One-screen sizing** by measured available height (`useViewportFill`) on `lg+`; below `lg` the layout flows naturally with focused modes. Mode preference is stored per device+location in `localStorage` (try/catch, session fallback).

## Scope of change (planned files)

New: `src/features/allocation/domain/dine-in-metrics.ts`, `domain/combined-view.ts` (history rows, active records, picker tiles), `components/combined/*` (`combined-view.tsx`, `selected-table-panel.tsx`, `rotation-board-grid.tsx`, `quick-table-picker.tsx`, `add-server-picker.tsx`, `tools-menu.tsx`, `use-viewport-fill.ts`, `use-combined-mode.ts`), tests alongside, `tests/e2e/table-allocation-combined.spec.ts`.
Modified: `allocation-workspace.tsx` (tab, execute result, compact chrome), `domain/rotation-board.ts` (`transferredIn`), `data/allocation-data.ts` (flag from events), `components/dashboard-view.tsx` (Dine-in Today metric).
Not touched: auth, kiosk, attendance, payroll, inventory, migrations, RLS.

## Progress log

| Checkpoint                       | State                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H0 baseline + plan               | DONE — branch/worktree created, this file written.                                                                                                                                             |
| H1 Batch A shell/layout          | DONE (committed with H2).                                                                                                                                                                      |
| H2 Batch B workflows             | DONE (committed): assign/transfer/end/clear, NEXT row, Quick Table Picker, + Server, skip/pause/reorder, Tools + confirmations, latest-first history + Jump to Latest, active records, Expand. |
| H3 Batch C dashboard/integration | DONE (code freeze). Dashboard "Dine-in today" card; independent review run (10 findings: 8 fixed, 1 refined, 1 not a defect); full local gate green.                                           |
| PR / DEV acceptance              | pending (owner approvals required for any hosted write)                                                                                                                                        |
| Release to main                  | pending (separate owner approval)                                                                                                                                                              |

Latest source SHA: see `git log` (first V2.0.4 commit = H1/H2 checkpoint). Base `1c5373e`.

### Implemented (files)

- Domain: `domain/dine-in-metrics.ts`, `domain/combined-view.ts`, `RotationCell.transferredIn` (rotation-board.ts), loader `transferDestinationKeys` (data/allocation-data.ts).
- UI: `components/combined/*` (combined-view, floor-panel, rotation-board-grid, rotation-toolbar, selected-panel, active-records, quick-table-picker, add-server-picker, tools-menu, use-viewport-fill, use-combined-mode, types). Shared edits: `table-map.tsx` (compact / fitRatio / isTableDisabled, backwards compatible), `off-map-tables.tsx` (compact rail), `dashboard-view.tsx` (Dine-in today card), `allocation-workspace.tsx` (Combined tab, `execute` returns `ExecResult`, `assignFromCombined`, compact chrome in Combined), `restaurant-operations-app.tsx` (passes `locationName`).
- Tests: `domain/dine-in-metrics.test.ts`, `domain/combined-view.test.ts`, `components/combined/combined-view.test.tsx` (RTL, demo-mode workspace), loader tests, `tests/e2e/table-allocation-combined.spec.ts`.

### Design deviations / notes

- Rotation Focus, Split and Floor Focus all share ONE selection + ONE `SelectedPanel` (placement differs). The panel is a strip under the grid in Rotation Focus (the prompt allows a strip).
- Off-map tables in the Combined floor use a one-row scrolling rail (height-bounded).
- Floor tiles in the Combined map scale with the map (container query units) so dense floors do not overlap at half width; classic Floor/Picker maps are unchanged.
- "Clear entry" on a single entry is one tap (existing Unassign semantics, undoable); Clear row / column / board require a confirmation dialog.
- No guest-count/party-size control anywhere (asserted in a unit test).
- Dine-in "Active" counts dine-in tables only (bar seats excluded by registry class).

## Verification

- Commands executed (all on the worktree, base 1c5373e + working tree): `npm run typecheck` PASS; `eslint --max-warnings=0 src/features/allocation` PASS; `vitest run src/features/allocation` 25 files / 406 tests PASS; Playwright demo-mode against a local `next dev --webpack`: `table-allocation-combined.spec.ts` 21/21 (desktop, host-tablet, server-mobile); existing `table-rotation-multi-view`, `table-allocation-cross-view(-extras)`, `allocation-open-editing`, `dashboard` specs 146/146 desktop and 148/148 host-tablet (incl. the Combined spec).
- H3 gate on the final tree (after the review fixes below): `npm run check` PASS; `vitest run` 320 files / 4,322 passed, 7 skipped (pre-existing); `next build --webpack` PASS (Turbopack cannot resolve `next` through the worktree's node_modules junction -- local-only, CI builds a real checkout); `table-allocation-combined.spec.ts` 21/21 on desktop, host-tablet and server-mobile after the last code change.
- Old specs on server-mobile fail ONLY under `next dev` because the dev overlay (`nextjs-portal`) covers the mobile bottom nav; they are covered by CI's production build. Not a regression.
- Independent review (code-review skill, medium) findings and disposition: (1) deferred assign logged a cross-edit -- FIXED; (2) selection cleared by a late result -- FIXED (panel ignores results for a target it is no longer on; deferred results do not dismiss); (3) dine-in "source" detection was a label heuristic -- REFINED: the loader now flags a transfer destination only when its source entry is intact + ended (`transferDestinationKeys` takes the ended-entry set); the pure selector keeps its label check for demo/optimistic state; (4) payload ids as strings -- tolerant parse added (existing activity code already relies on numbers); (5) toolbar/Tools refusals invisible -- FIXED (inline dismissible alert); (6) small map tiles -- minimum raised (28px tables / 24px bar seats, scale with the map); (7) unmemoised `Set` -- FIXED; (8) Tools could not clear a skipped turn -- FIXED (+test); (9) viewport-fit staleness -- FIXED (ResizeObserver on body); (10) picker late result -- FIXED (session guard).
- Not run (and why): pgTAP / real-mode suites (no SQL, RLS, action or migration changed); hosted DEV suites (pending PR + owner approvals).
- Test plan (maps to the prompt's 17 coverage items): unit — dine-in metrics (reseat, transfer, skip, bar, free-text, combined parts), combined-view selectors (history order/keying, active records, tiles), reducer `transferredIn`; component — mode switching, NEXT-cell assign with picker preselection, grid/plan picker parity, occupied disabled, pause blocks assignment, add-server dedupe/search, tools confirm; Playwright demo-mode — three modes, assign/transfer/end/clear/undo, latest-first + jump, tablet 1024×768 no page scroll, portrait fallback, cross-view parity. Hosted/RLS coverage is unchanged because no schema or action changed; concurrency is covered by the existing `table-allocation-conflicts` real tests (re-run only if actions change).

## Environment

- Local only so far. DEV (`opmujepkemwcdxxorhfd`) and PROD (`ftadewtkjlaotfdvtjcv`) untouched.
- Migrations: none required (see D-5). If this changes, stop and re-plan.
- Prohibited without a fresh explicit owner approval: any PROD write, `development → main` merge, DEV migration/config change, kiosk/attendance/auth/employee changes, dispatching the stale `deploy-migrations` workflow, starting V2.0.5.

## Recovery

- Last confirmed safe state: the H3 code-freeze commit on this branch (all gates above green).
- Exact next action: push the branch, open ONE PR into `development`, wait for exact-head CI (application, browser-smoke, Vercel), then merge to `development` only if all required checks are green. DEV acceptance + `development -> main` need separate owner approval (see Environment).
- Local dev server for Playwright: `NEXT_PUBLIC_DEMO_MODE=true npm run dev -- --webpack` then `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test ... ` (the Playwright-managed webServer start is flaky because `next dev` prints an upgrade nudge and exits on some runs; the Next 16.4.5 bump is a separate follow-up, see V2.0.3 closeout). Remove `nextjs-portal` in the page when driving the mobile nav.
- node_modules is a Windows junction: create with PowerShell `New-Item -ItemType Junction` (the bash `mklink` form created a wrong target once).
- Resume: read this file, `git -C <worktree> status`, `git log --oneline origin/development..HEAD`, run only the tests for files listed under the latest checkpoint. Preserve all uncommitted work. Do not read the chat transcript.
- Blocked items: none (hosted DEV acceptance complete; awaiting owner Production release authorization).

## H4 addendum (2026-11-17, local-only note -- not committed on purpose)

- Merge: PR #348 -> `development` `2e742f5` (merge commit). `main` is still `2933d3a`. No migration was in the PR, so no database deployment ran.
- Owner approval: OPTION A selected (temporarily enable Table Allocation at DEV Location for hosted acceptance, then restore to disabled).
- Target environment: DEV Supabase `opmujepkemwcdxxorhfd`; organization "The Monk's DEV" (`c5e8ad9c-39be-4344-bbdb-ae84306f0134`); location "DEV Location" (`a5d46f61-cf64-4b96-8d9f-41d6812d561c`). Production (`ftadewtkjlaotfdvtjcv`) strictly untouched and read-only.
- Pre-change state:
  - Row: `location_id = 'a5d46f61-cf64-4b96-8d9f-41d6812d561c'`, `module_key = 'table_allocation'`, `is_enabled = false`, `metadata = {}`, `created_at = '2026-11-11T04:54:06.303542+00:00'`, `updated_at = '2026-11-11T04:55:30.718334+00:00'`, `updated_by = 'b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f'`.
  - Live preflight check: Authenticated browser login (`TestOwner`) verified Table Allocation was hidden in navigation.
- Temporary enablement receipt:
  - Guarded update executed via `manage-dev-module.mjs enable`.
  - Timestamp: `2026-11-17T11:55:39.310441+00:00`.
  - Readback verification: Exactly 1 row updated (`is_enabled: true`); total location configs count unchanged at 27; unrelated modules untouched.
- Hosted DEV Acceptance execution:
  - Target Preview: `https://the-lineup-fu901c88x-onepiece11.vercel.app` (pinned to DEV `opmujepkemwcdxxorhfd`, SHA `2e742f5`).
  - Suite: `tests/real/ui/v2-0-4-hosted-acceptance.real.spec.ts` (5/5 PASS, 27.2s).
  - Acceptance A (Module & Navigation): PASS. Table Allocation visible at DEV Location; all 6 tabs present (`Grid`, `Floor`, `Picker`, `Servers`, `Dashboard`, `Combined`); default tab is `Grid`; reload preserves session and context; 0 permission errors.
  - Acceptance B & C (Modes & Floor Configuration): PASS. Three Combined modes verified (Split Screen, Floor Focus with Plan/Grid toggling, Rotation Focus); real DEV Location floor layout verified (27 dining tables, saved coordinates honored); table selection synchronized across views.
  - Acceptance D, E, F (Rotation, Quick Assignment, Table Actions): PASS. Server rotation (+Server, roster search, adding TestServer1 and TestServer2, Pause/Resume controls); Quick Table Assignment (+Table, Quick Grid, busy tables disabled); table actions (assign T15, transfer T15 to TestServer2, end table T15, clear entry from history).
  - Acceptance G & I (Dashboard Metrics & Live Sync): PASS. Dashboard metrics (Dine-in Today, Active, Completed, Servers, Next) match between Combined view and Dashboard tab; bar seats excluded from dine-in totals; guest-count/party-size controls verified absent; cross-view synchronization with Floor and Servers tabs verified.
  - Acceptance H (Responsive Tablet): PASS. Tablet landscape (1024x768) verified (zero horizontal or vertical page scroll; overflow <= 1px; history independently scrolls); portrait fallback (768x1024) verified (no horizontal page overflow).
- Restoration receipt:
  - Guarded update executed via `manage-dev-module.mjs restore`.
  - Timestamp: `2026-11-17T12:01:46.702008+00:00`.
  - Readback verification: Exactly 1 row updated (`is_enabled: false`); total location configs count unchanged at 27; all 8 other modules at DEV Location retain original values (`bar_inventory: true`, others `false`).
  - UI verification: Live browser preflight check confirmed Table Allocation is no longer exposed in navigation (`Allocation direct button visible: false`).
  - Database reconciliation: Active table claims (`section_assignments`) = 0; all test allocations cleanly ended; 10 legitimate audit events recorded in `board_events`; 0 database drift.
- Release-readiness preflight:
  - Source `development` SHA: `2e742f57bd488c023b4a9e629a082079192d8cef` (PR #348 merged).
  - Target `main` SHA: `2933d3afc351273f04c89559397f2979e5f0eda9`.
  - Intervening development commits: 0.
  - Schema/migration diff: 0 migrations (`git diff origin/main...origin/development -- supabase/migrations` is empty).
  - Production note: Table Allocation is currently disabled on Production (`ftadewtkjlaotfdvtjcv`); merging the feature code alone will not expose Combined there without an explicit owner module enablement decision.
  - Release status: READY FOR RELEASE TO MAIN — awaiting separate owner authorization. Stop before `development -> main`.
- Local uncommitted: this addendum in `HANDOFF.md` only. No unapproved commits or pushes made.

## V2.0.4 Correction Addendum — Floor Data Parity & Aisle Layout Adjustment (2026-11-17)

### 1. Defect & Root Cause Investigation

- **Reported Issue:** The owner reported seeing _"No tables are configured for this location"_ on the floor display despite expecting tables in Table Allocation Rotation views.
- **Root Cause Analysis:**
  1. **Branch/Location Discrepancy:** On hosted DEV, the owner navigated to an organization/location where the `table_allocation` module was enabled (specifically `QA Restaurant A` / `QA A - Downtown`, `location_id = '94c63855-88a5-4c3d-bd55-be5e26be5382'`). In DEV Supabase (`opmujepkemwcdxxorhfd`), `QA A - Downtown` has active server columns and rotation session rows, but **0 physical tables registered in `dining_tables`**.
  2. **Monks Reference Data:** The 27 physical tables (T1-T19, B1-B8) belong exclusively to `The Monk's DEV` / `DEV Location` (`location_id = 'a5d46f61-cf64-4b96-8d9f-41d6812d561c'`), where `table_allocation` was correctly restored to disabled (`is_enabled: false`) following the H4 test campaign.
  3. **Null InitialContext Query Fallback:** In `src/features/allocation/components/allocation-workspace.tsx`, `physicalTablesLoadError` was defaulted to `false` when `initialContext === null`. In non-demo mode, a missing context indicates a page load/query failure, but resulted in displaying the empty location state instead of the load error banner.
  4. **Off-Map Table Masking:** In `TableMap`, if a location had registered off-map tables but 0 mapped tables, the map rendered _"No tables are configured for this location."_, obscuring that tables existed in the registry and off-map rail.

### 2. Resolution & Scope

- **Authoritative Registry Parity:**
  - Preserved strict tenant and location scoping. No tables are fabricated or hardcoded globally.
  - Wired `hasOffMapTables` prop to all callers of `TableMap` (`AllocationWorkspace`, `FloorView`, `FloorPanel`, `QuickTablePicker`, `ServerBoardView`).
  - Genuinely empty locations with 0 tables retain _"No tables are configured for this location."_
  - Locations with off-map tables only display _"No mapped tables for this location."_ with accessible off-map controls.
  - Failed initialContext loads properly trigger _"Couldn't load the floor layout. Try refreshing the page."_
- **Aisle Layout Adjustment:**
  - Created `isMonksReferenceLayout` and `adjustMonksAisleCoordinates` in `src/features/allocation/domain/floor-layout.ts`.
  - For the canonical Monks reference arrangement (T1-T19, B1-B8), display-only Y-coordinate for lower center tables T6, T7, T8 is adjusted from `y=56` to `y=58.5`.
  - In `fitFloorTables` (`src/features/allocation/domain/combined-view.ts`), this creates a balanced, open aisle between Middle (T14-T9) and Lower (T6-T8) rows (~25.1% gap), visually comparable to the Top-to-Middle aisle (~24.6% gap).
  - Added a non-interactive, accessible walkway indicator `[data-testid="floor-walkway-aisle"]` (`top: 43%, height: 6%, left: 18%, width: 74%`, `pointer-events-none`, `aria-hidden="true"`) between rows with zero overlap with any table tiles.
  - **Zero Data Modification:** Database coordinates in `dining_tables` remain untouched. Non-Monks branches and custom floor plans are completely unaffected.
  - Fits comfortably within Split Screen mode on 1024×768 tablets without introducing page scrolling or clipping.

### 3. Exact Files Modified

- `src/features/allocation/domain/floor-layout.ts`: Defined `MONKS_REFERENCE_LABELS`, `isMonksReferenceLayout()`, and `adjustMonksAisleCoordinates()`.
- `src/features/allocation/domain/floor-layout.test.ts`: Added unit tests for Monks layout detection, coordinate adjustment without input mutation, and non-Monks immunity.
- `src/features/allocation/domain/combined-view.ts`: Integrated `adjustMonksAisleCoordinates` into `fitFloorTables`.
- `src/features/allocation/domain/combined-view.test.ts`: Added test verifying balanced, visually comparable aisle gaps for Monks layout.
- `src/features/allocation/components/table-map.tsx`: Added `hasOffMapTables` support, off-map empty state messaging, and walkway aisle indicator rendering.
- `src/features/allocation/components/table-map.test.tsx`: Added unit tests for `hasOffMapTables`, empty state distinction, and aisle indicator.
- `src/features/allocation/components/allocation-workspace.tsx`: Handled null `initialContext` as load error; passed `hasOffMapTables` to Picker dialog.
- `src/features/allocation/components/floor-view.tsx`: Passed `hasOffMapTables` to `TableMap`.
- `src/features/allocation/components/server-board-view.tsx`: Passed `hasOffMapTables` to `TableMap`.
- `src/features/allocation/components/combined/floor-panel.tsx`: Passed `hasOffMapTables` to `TableMap`.
- `src/features/allocation/components/combined/quick-table-picker.tsx`: Passed `hasOffMapTables` to `TableMap`.
- `docs/features/v2-0-4-combined-table-allocation/HANDOFF.md`: Recorded H4 addendum and this correction report.

### 4. Verification Evidence

- `vitest run src/features/allocation`: 25 test files, 416 tests passed (100% green).
- `npm run typecheck`: Passed with 0 errors (`tsc --noEmit`).
- `npx eslint --max-warnings=0 src/features/allocation`: 0 warnings, 0 errors.
- `npx prettier --check src/features/allocation`: 100% compliant.
- Environment safety: PROD untouched; DEV database untouched; DEV `table_allocation` module remains disabled at DEV Location pending owner authorization.
