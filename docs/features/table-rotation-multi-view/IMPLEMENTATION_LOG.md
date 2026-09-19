# Table Rotation Multi-View — Implementation Log

Concise engineering facts only, phase by phase. See `AGENT_HANDOFF.md` for
current state/next-step and `IMPLEMENTATION_CONTRACT.md` for the frozen
design this log tracks against.

## Phase A — Baseline + branch

- Branch: `feature/table-rotation-multi-view` (created from `main` at
  `2130026`).
- Baseline reconfirmed live: Vitest 359/359, pgTAP 228/228 (18 files).
  Matches `docs/STATUS.md`, no drift since planning.
- Commit `cab76c5`: froze planning docs + copied design handoff (docs only).

## Phase B+C — Occupancy integrity, auto-row reconciliation, permission expansion (combined)

Combined into one migration because they're tightly coupled (the
permission-gated RPCs and the occupancy trigger both live in the same
`board_*` surface).

**Migration**: `supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql`

**Deviation from the frozen contract** (documented per the contract's own
rule — smallest safe deviation, when repository state materially differs
from a frozen assumption): the contract specified two new tables,
`table_occupancy` + `table_occupancy_members`. Implementation found
`public.section_assignments` already exists (foundation migration),
already has almost exactly the right shape (organization_id,
service_session_id, dining_table_id, server_profile_id, one-row-per-table-
per-session uniqueness), already has correct `_select_member` RLS and
Realtime publication membership, and was confirmed dead code (Phase 0).
Extended it instead of adding two new tables:

- Added `rotation_member_id`, `table_rotation_entry_id`, `released_at`.
- Replaced its old always-unique `(service_session_id, dining_table_id)`
  constraint with a partial unique index (`where released_at is null`) —
  a table can be claimed/released/reclaimed many times per session.
- A combined label (`"T1 + T2"`) is just two `section_assignments` rows
  sharing one `table_rotation_entry_id` — no junction table needed.
- Dropped `section_assignments_operate_service` (direct client writes).
  All writes now flow through one `SECURITY DEFINER` trigger
  (`private.sync_table_occupancy`, fired `AFTER INSERT OR UPDATE OR DELETE`
  on `table_rotation_entries`), so occupancy can never drift from the grid
  log, and every existing/new RPC that touches `table_rotation_entries`
  (`board_assign`, `board_clear_cell/row/column/board`, `board_undo`,
  `board_redo`) gets correct occupancy behavior automatically, including
  undo/redo, without per-RPC occupancy code.

Also **not** added: `table_rotation_entries.dining_table_id`. The frozen
contract planned this column, but it's redundant once occupancy resolution
happens inside the trigger (which resolves labels against `dining_tables`
directly) — a scalar FK on `table_rotation_entries` couldn't represent a
combined-table entry correctly anyway (two tables, one entry).

**What else this migration does**:

- `board_assign` gained `p_confirm_transfer boolean default false` (old
  6-arg overload explicitly dropped, not left ambiguous for PostgREST).
  Threaded into the trigger via a transaction-local GUC
  (`app.confirm_transfer`). Conflict without confirmation raises
  `Table % is already assigned to another active server on this board.`
- `private.ensure_trailing_round` rewritten for the ~2-trailing-empty-round
  rule (was: ensure exactly 1). Same name/signature, no caller changes
  needed.
- New `board_delete_row` RPC — only succeeds on a round with zero entries.
- New `board_event_type` value `delete_row`; `board_undo`/`board_redo`
  gained matching case branches.
- New `private.assert_is_active_board_member` (all 5 DB roles); replaces
  `private.assert_is_board_manager` inside `board_clear_row`,
  `board_clear_column`, `board_clear_board`, `board_add_row`, and gates
  the new `board_delete_row`. `assert_is_board_manager` itself is
  untouched (left in place, unused by this feature going forward).
- `rotation_members_operate_service` RLS policy: role array extended to
  include `server` (reorder, pause/resume, remove-from-rotation).

**Tests**: `supabase/tests/database/0019_table_rotation_multi_view_foundation.test.sql`
(15 assertions) — plain-server permission checks (assign/add-row/clear-
column), occupancy conflict + explicit transfer + release, combined-table
reservation, the exact auto-row round count, and `board_delete_row`'s
empty-vs-non-empty gate. All pass. Full suite: 243/243 (228 baseline + 15
new), zero regressions. Full local `npm run db:reset` + `npm run db:test`
run clean.

**Commit**: pending (this phase committed together with this log entry).

## Phase C (frontend) — Active Floor Operations wired into the Grid

- Added `"allocation:operate"` to the `Capability` union in
  `src/features/auth/domain/passcode.ts`, granted to all 3 `AppRole`
  values (owner/manager/server).
- `allocation-workspace.tsx`: replaced `isManager &&` with
  `canOperateFloor` (`can(user.role, "allocation:operate") && !readOnly`)
  at the 5 approved gate sites (Add row, Clear board, Quick Add, reorder/
  pause/resume/clear-column/remove-server block, Clear row).
  `isManager` itself is untouched — still gates the unrelated tips-reopen
  control, the one `isManager` use this feature does not touch.
- Demo-mode reducer (`rotation-board.ts`): reconciled `ensureTrailingRound`
  to the same ~2-trailing-empty-round rule as the real-mode RPC (was 1);
  fixed `getWorkingRound` (previously `rounds.at(-2)`, a shortcut that
  only worked for a 1-row buffer) to find the last round with any
  recorded value instead.
- Added `delete-row` to the demo reducer and to
  `executeBoardActionRemote` (calls `board_delete_row`); added a Delete
  row control next to Clear row in the Grid, disabled while the round has
  any assignment.
- Updated `rotation-board.test.ts` for the new round counts (6 pre-existing
  tests' expected numbers changed, all still asserting the same
  behaviors, just against the new buffer size) and added a `delete-row`
  test. 19/19 pass.
- `npm run check` / `npm test` / `npm run build` all pass. Commit `ae6c678`.

## Phase D — Quick Add clocked-in prioritization

- `getAllocationContext` (`allocation-data.ts`) now also returns
  `clockedInProfileIds`, reusing Tip Split's existing
  `fetchClockedInRoster` (Feature 029) rather than a second attendance
  query — prioritization/grouping signal only, never auto-added.
- `allocation-workspace.tsx`'s `availableMembers` (the "Floor team
  changed?" quick-add list) sorts clocked-in members first and marks them
  with a small dot.
- Commit `76d917d`.

## Phase G+H — Shared TableMap and the Floor view

- `src/features/allocation/domain/floor-layout.ts`: the approved physical
  layout (T1-T19, B1-B8, percentage coordinates digitized from
  `docs/design/table-rotation/reference/floor-layout-reference.png`) as
  demo-mode fixture data (`DEMO_FLOOR_LAYOUT`), plus `resolveFloorTables`
  — a pure, shared, client-side occupancy derivation from the current
  `RotationBoard` (documented as a display convenience; the actual
  double-booking guarantee is the Phase B+C trigger, independent of this).
  6 Vitest tests.
- `getAllocationContext` also returns `physicalTables`, reading an
  organization's own registered `dining_tables` (joined to `dining_areas`
  to infer bar vs. table — no dedicated resource-type column exists).
  Empty until an org has actually registered a floor plan; no data is
  seeded (no stable fixture to attach it to — see the "Not done" section
  below).
- `src/features/allocation/components/table-map.tsx`: the one shared
  floor renderer. Absolutely-positioned native `<button>`s over a
  data-driven percentage layout, not raw SVG shapes — this repo has no
  Dialog/Popover primitive yet, so native buttons give correct keyboard/
  focus/accessible-name semantics without hand-rolling ARIA on SVG nodes.
  Styled with the `--ok` token (same convention as `Badge`'s
  `tone="success"`), not raw Tailwind `emerald-*` classes — an initial
  version used raw emerald and was nearly unreadable in light mode; caught
  and fixed during manual browser verification (see below), not left in.
- `src/features/allocation/components/floor-view.tsx`: tap an available
  table → pick a server (2 taps) → `board_assign`. Tap an occupied table →
  Transfer (re-assign with `p_confirm_transfer: true`) or Unassign
  (`clear-cell`). All three go through the exact same `execute()` the
  Grid uses.
- Grid/Floor view switcher added to the workspace header (`role="tablist"`).
  Picker/Servers/Dashboard are NOT in the switcher yet — see "Not done."
- Manually verified in the browser (demo mode, `NEXT_PUBLIC_DEMO_MODE=true
npm run dev`, signed in as manager 2468): assigning T1 to Ava Brooks via
  Floor correctly appears as "Table T1" in Ava's Grid column in the same
  round, "Next turn"/"Recorded events" updated correctly, T1's map chip
  switched to occupied styling with the correct accessible name, and both
  light and dark themes render legibly.
- `npm run check` / `npm test` (366/366) / `npm run build` all pass.
  Commit `c8201e5`.

## Test fixes for the permission expansion (Playwright)

Running the full `npm run test:e2e` surfaced 3 pre-existing tests
asserting the _old_ manager-only gates this feature intentionally opens
(Clear board/Add row/reorder hidden from a plain server). Updated them to
assert the new, approved behavior (not reverted), turned the negative
add-row test into a positive one that exercises the control, and fixed
two now-wrong `toHaveCount(1)` assertions for the per-column "Move up"
button (should be 4, one per demo-seed column). All 153 Playwright tests
pass across all 3 device projects — same count as baseline. Commit
`479909e`.

## Phase I+J+K — Picker, Server Board, and Dashboard views

- **Picker**: the existing Grid Card, rendered unmodified for both `grid`
  and `picker` `activeView`s (no duplicate Grid implementation). Added
  `pickerTarget` state and a plain `onClick` on each cell's existing
  wrapper `<div>` (only wired to a handler when `activeView === "picker"`
  — zero behavior change for Grid-only usage). A `TableMap` panel renders
  below the Grid when in Picker mode; tapping an available table assigns
  into `pickerTarget` via the same `execute({type:"assign"})` path;
  tapping an occupied one surfaces the existing `actionError` banner
  instead of silently no-op'ing.
- **Server Board** (`server-board-view.tsx`, new): one card per active
  column — position, status, workload (derived from `resolvedTables`),
  assigned-table badges, reorder/pause/clear/remove (existing RPCs,
  unchanged), and `+ Table` opening `TableMap` scoped to that column's
  current round. Added `role="group"` + `aria-label` to each card for
  unambiguous addressing (tests and screen readers alike).
- **Dashboard** (`dashboard-view.tsx`, new): summary metrics (servers on
  floor, next turn, active/available tables from `resolvedTables`),
  upcoming rotation list, recent cross-column activity, and a **read-only
  Master Rotation** — a purpose-built table over the same `board` data,
  not a second instance of the interactive Grid (that component isn't
  factored out of `allocation-workspace.tsx` yet); same data, no mutation
  controls, "Open Grid" routes back. Also fixed a duplicate
  summary-section render (the shared top-level summary and Dashboard's
  own richer one were both showing) caught during manual verification.
- View switcher extended to all 5 tabs (`Crosshair`/`UsersRound`/
  `LayoutDashboard` icons for Picker/Servers/Dashboard).
- Manually verified end-to-end in the browser (demo mode, manager 2468):
  Picker cell-select → table-tap assign shows up on Grid; Server Board's
  `+ Table` shows up on Grid and updates workload count; Dashboard metrics
  and Master Rotation reflect the same assignments; "Next turn" and
  "Recorded events" update correctly across all of it.
- `npm run check` / `npm test` (366/366) / `npm run build` /
  Playwright desktop (57/57 including all 6 new tests) all pass.
  Commit `e312229`.

## Playwright coverage for Floor/Picker/Servers/Dashboard

New `tests/e2e/table-rotation-multi-view.spec.ts` (6 tests): Floor assign

- cross-view consistency, Floor's occupancy-conflict surfacing Transfer/
  Unassign instead of silent overwrite, Picker's select-then-assign flow,
  Server Board's `+ Table` + cross-view order consistency, Dashboard's
  metrics + read-only Master Rotation (asserts zero editable `Table #`
  inputs), and that a plain server has all 4 new tabs. Commit `435127a`.

## Known issue found during final validation: server-mobile Playwright project is unreliable in this sandbox

Running the full 3-project `npm run test:e2e` surfaced systemic failures
and multi-minute timeouts confined to the `server-mobile` (Pixel 7)
project only:

- `desktop`: 57/57 pass (51 baseline + 6 new), ~14s.
- `host-tablet`: 57/57 pass (51 baseline + 6 new), ~29s.
- `server-mobile`: only 9/57 passed in a from-scratch isolated run
  (8.3 minutes), and a targeted rerun of just the 6 new tests failed all
  6 with `<element> intercepts pointer events` / click-retry-timeout
  errors when clicking the main nav ("Table Allocation" / "More").

Diagnosis performed, not guessed:

- Reproduced on a **completely unrelated, pre-existing test**
  (`recurring-schedules.spec.ts`, "week navigation: Previous/Next/Today")
  run in isolation on this same branch — it also fails with the identical
  click-retry pattern on the "More" nav button. This test touches nothing
  this feature changed, which is strong evidence the problem isn't
  something introduced here.
- Killed several zombie `node.exe` processes (leftover from repeated
  local `npm run dev` restarts during manual browser verification) and
  retried — no change.
- Attempted to confirm pre-existence on `main` directly via a `git
worktree` + a `node_modules` junction (to avoid a slow `npm install`);
  Turbopack refused to start against a junctioned `node_modules`
  ("Symlink ... points out of the filesystem root"), so this could not be
  conclusively proven against a byte-for-byte clean `main` checkout in
  the time available.
- Given the unrelated-test reproduction, this is very likely a
  pre-existing characteristic of running Pixel-7 touch-emulation Chromium
  in this specific sandboxed environment (resource/timing-related), not a
  regression from this feature's changes -- but that could not be proven
  with full certainty, so it is reported here rather than asserted as
  fact.

**What this means for trustworthiness of this session's validation**:
Vitest, pgTAP, `npm run check`, `npm run build`, Playwright desktop, and
Playwright host-tablet are all fully, reliably green, including every new
test this feature added. Playwright server-mobile could not be reliably
exercised in this environment for either the baseline or this feature's
changes -- its results here should not be read as either a pass or a
fail for this feature specifically.

## Final local validation (this session)

- `npm run check`: PASS
- `npm test`: PASS, 366/366 (was 359/359; +7 net new: 1 delete-row test +
  6 floor-layout tests)
- `npm run build`: PASS
- `npm run test:e2e`: desktop 57/57 PASS, host-tablet 57/57 PASS,
  server-mobile unreliable in this sandbox (see above) — not a known
  regression, not confirmed clean either
- `npm run db:test`: PASS, 248/248 (was 228/228; +20 net new)
- Manual browser smoke test (demo mode, manager + server passcodes): all
  5 views verified working end-to-end, cross-view consistent, both themes
  legible.

## What is NOT done (honest accounting — see AGENT_HANDOFF.md for the full risk-ranked list and recommended next step)

- **`dining_tables` seeding / onboarding**: intentionally not done (see
  `IMPLEMENTATION_CONTRACT.md` section 3.1's own caveat) — there is no
  stable org/location fixture in this repo to attach seed data to
  (`supabase/seed.sql` is effectively empty; organizations are created via
  the real registration flow at runtime). Real-mode Floor/Picker/Servers
  will show no physical tables until an org has actually registered a
  floor plan. This is a genuine onboarding-flow gap, not something this
  feature should paper over with fake seed data.
- **Retention scope for `table_rotation_entries`/`rotation_rounds`**: not
  addressed — deliberately deferred per `IMPLEMENTATION_CONTRACT.md`
  section 21 (Feature 028's date navigation depends on that data; needs
  explicit product sign-off before any retention rule touches it).
- **Accessibility/performance review passes** (contract sections 24, 57):
  not formally done beyond what native `<button>`/`role="group"`
  semantics and the existing design-token discipline already provide by
  construction.
- **server-mobile Playwright reliability**: unresolved in this
  environment (see above) — worth investigating in a genuinely clean
  environment (fresh `npm install`, no leftover dev-server processes)
  before treating a future server-mobile failure there as a real
  regression.
- **Design-screenshot comparison pass** (contract section 49/50): not
  formally done — implementation was verified against the design
  reference by eye during manual testing, not via a systematic side-by-
  side screenshot diff.
