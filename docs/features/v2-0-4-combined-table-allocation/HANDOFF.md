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
| H3 Batch C dashboard/integration | IN PROGRESS: Dashboard "Dine-in today" card DONE; remaining = independent review pass, a11y spot check, full-suite gate, PR.                                                                   |
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
- Not yet run: full `npm run test`, `npm run build`, `npm run check` (format:check), server-mobile for the old specs, hosted/real (pgTAP, real-mode) suites -- none needed unless server code changes (none did).
- Test plan (maps to the prompt's 17 coverage items): unit — dine-in metrics (reseat, transfer, skip, bar, free-text, combined parts), combined-view selectors (history order/keying, active records, tiles), reducer `transferredIn`; component — mode switching, NEXT-cell assign with picker preselection, grid/plan picker parity, occupied disabled, pause blocks assignment, add-server dedupe/search, tools confirm; Playwright demo-mode — three modes, assign/transfer/end/clear/undo, latest-first + jump, tablet 1024×768 no page scroll, portrait fallback, cross-view parity. Hosted/RLS coverage is unchanged because no schema or action changed; concurrency is covered by the existing `table-allocation-conflicts` real tests (re-run only if actions change).

## Environment

- Local only so far. DEV (`opmujepkemwcdxxorhfd`) and PROD (`ftadewtkjlaotfdvtjcv`) untouched.
- Migrations: none required (see D-5). If this changes, stop and re-plan.
- Prohibited without a fresh explicit owner approval: any PROD write, `development → main` merge, DEV migration/config change, kiosk/attendance/auth/employee changes, dispatching the stale `deploy-migrations` workflow, starting V2.0.5.

## Recovery

- Last confirmed safe state: the H1/H2 checkpoint commit on this branch (all focused checks above green).
- Exact next action: Batch C remainder -- run `npm run test`, `npm run build`, `npm run check`; independent review of the diff (code-review skill); a11y spot check; open ONE PR to `development`.
- Local dev server for Playwright: `NEXT_PUBLIC_DEMO_MODE=true npm run dev -- --webpack` then `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test ... ` (the Playwright-managed webServer start is flaky because `next dev` prints an upgrade nudge and exits on some runs; the Next 16.4.5 bump is a separate follow-up, see V2.0.3 closeout). Remove `nextjs-portal` in the page when driving the mobile nav.
- node_modules is a Windows junction: create with PowerShell `New-Item -ItemType Junction` (the bash `mklink` form created a wrong target once).
- Resume: read this file, `git -C <worktree> status`, `git log --oneline origin/development..HEAD`, run only the tests for files listed under the latest checkpoint. Preserve all uncommitted work. Do not read the chat transcript.
- Blocked items: none.
