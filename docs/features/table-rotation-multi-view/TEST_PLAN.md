# Table Rotation Multi-View — Test Plan

Baseline (must not regress): Vitest 359/359, Playwright 153/153, pgTAP 228
assertions. New tests must expand these counts, not merely maintain them.

Upgrade 1.1 baseline (must not regress from this point forward): Vitest
379/379, Playwright 189/189 (63/63 × 3 device projects), pgTAP 279
assertions. See "Upgrade 1.1" section below for the coverage added to
reach these counts, including the follow-up "Transfer/End are Floor-only"
UI refinement.

Multi-table follow-up baseline (must not regress from this point
forward): Vitest 385/385 (+6), Playwright 219/219 (73/73 × 3 device
projects, +10 each), pgTAP 297 assertions (+18). See "Multi-table
follow-up" section below.

"End one or more" follow-up baseline (must not regress from this point
forward): Vitest 389/389 (+4), Playwright 231/231 (77/77 × 3 device
projects, +4 each), pgTAP 319 assertions (+22). See "End one or more"
section below.

## Permissions

- Staff can: add row, clear row/column/board, delete an empty row, reorder,
  pause/resume, remove server — all previously manager-only.
- Staff still cannot: delete an employee account, change a role, access
  payroll admin, or any capability outside `allocation:operate`.
- `board_clear_row`/`clear_column`/`clear_board`/`add_row`/`delete_row`
  RPCs succeed for a `server`-role caller and still succeed for
  manager/owner.
- `rotation_members_operate_service` RLS allows `server` to reorder/remove.

## Quick Add

- Clocked-in members appear prioritized/grouped.
- A member already active in rotation never appears in Quick Add.
- Adding does not auto-add anyone not explicitly selected.
- Search finds non-clocked-in members.
- No payroll/wage/clock-timestamp data leaks into the Quick Add response.

## Occupancy

- Two concurrent `board_assign` calls targeting the same `dining_table_id`
  in the same session: exactly one succeeds, the other gets a typed
  conflict error (pgTAP + a concurrency-oriented integration test).
- Floor availability and Picker availability agree for the same table at
  the same time (shared derivation, not two computations).
- Unassign/clear releases the occupancy claim (table becomes available
  again).
- `board_assign` with `p_confirm_transfer: true` atomically releases the
  old holder's claim and claims for the new one — no window where the
  table is claimed by both or neither. (This is the occupancy-conflict
  override, not Upgrade 1.1's Transfer action — see that section below
  for the distinct `board_transfer` RPC.)
- A free-text `table_label` that doesn't resolve to a `dining_tables` row
  behaves exactly as it does today (no occupancy check, no rejection).

## Combined tables

- Assigning `"12 + 13"` claims both member tables in one occupancy row.
- Either table being already claimed by someone else blocks the combined
  assignment (transfer flow required for both).
- Undo/redo reverses/reapplies the whole combined claim atomically.

## Rotation

- Reorder, pause, resume, assignment (with and without "advance rotation").
- `board_set_column_status` transitions match existing state semantics.

## Auto row

- Assigning into the last round creates enough rounds to restore 2 empty
  trailing rounds.
- Assigning into the second-to-last round does the same.
- Assigning into a round that isn't in the last two positions does not
  create new rounds.
- No infinite row creation under repeated assignment.
- Two concurrent assigns each triggering a top-up do not create duplicate/
  colliding `sequence` values (Realtime-safe).
- Manual `board_add_row` composes correctly with the auto-rule (doesn't
  get "corrected" away).

## Grid

- CRUD and permissions above continue to pass with the loosened gates.
- Delete row is disabled/rejected for a non-empty round, enabled for empty.
- Sticky header/scroll behavior unchanged (regression only, not new
  coverage unless currently untested).
- Upgrade 1.1: Skip Turn is available on an empty cell and renders `0`;
  Transfer and End Table controls are not rendered on an active cell
  (Edit and Unassign remain) — Floor-only per the follow-up UI decision.

## Floor

- All registered tables render at their seeded positions.
- Tap available table, pick a server with zero active tables → assigned
  directly, no decision dialog.
- Tap available table, pick a server with one or more active tables →
  decision dialog (Assign Also / Transfer / End existing table(s) &
  Assign / Cancel) — multi-table and "End one or more" follow-up
  sections below have the detail.
- Occupied table → detail sheet → transfer/end/unassign all work, and
  act only on that one selected table (a server's other active tables
  are never touched).

## Picker

- Selecting a table in the popup assigns to the currently selected Grid
  cell/column.
- Availability matches Floor's for the same table.
- Upgrade 1.1: an empty selected cell offers "Skip turn instead"; the
  shared table underneath never renders Transfer or End controls (same
  hidden state as Grid, since it's the same component).
- Multi-table follow-up: the TableMap opens as a popup dialog, never
  inline below the rotation grid; assigning an additional table to a
  server who already has one is always additive (no decision dialog,
  no auto-transfer of the existing table).

## Servers

- `+ Table` opens the shared picker and assigns correctly, always at
  that server's own earliest empty round (never a shared "current
  round" — multi-table follow-up).
- Reorder updates the same global order Grid/Floor Team show.
- Pause/resume/remove match Grid's existing behavior for the same RPCs.
- A server can show multiple simultaneously active tables at once.

## Dashboard

- Metrics (servers on floor, active/available tables, next turn) match
  the underlying data at the same instant.
- Master Rotation is read-only and matches Grid's data; the "back to
  editable Grid" action works.

## Themes

- Every new view renders correctly under both `data-theme` values —
  compare against `docs/design/table-rotation/screenshots/{dark,light}/`.

## Retention

- `board_events` rows older than 7 days are removed by the scheduled job.
- Rows within 7 days, and all other tables (attendance, payroll,
  `table_rotation_entries`, `rotation_rounds`, employee accounts), are
  untouched.

## Upgrade 1.1

- **Assign**: refuses to overwrite an ended or skipped cell (typed error,
  not a silent clobber); editing an already-active cell in place is
  unchanged. (pgTAP, Vitest)
- **Transfer**: moves the same assignment to the destination's earliest
  genuinely empty round; the source cell is deleted outright (no stale
  label survives); never overwrites the destination's ended or skipped
  cells (lands past them instead). (pgTAP, Vitest, Playwright)
- **End Table**: marks the entry ended in place (row survives, never
  deleted); releases the physical table's occupancy; reassigning the same
  freed physical table to someone else afterward creates a fresh active
  row and leaves the old ended row untouched. (pgTAP, Vitest, Playwright)
- **Unassign**: hard-deletes the entry (active, ended, or skipped) as a
  correction; never converts it into a Skip. (pgTAP, Vitest, Playwright)
- **Skip Turn**: only valid on a genuinely empty cell (typed error if the
  cell already holds any entry); renders as `0` via a `role="status"`
  element with accessible name "Skip turn" (never a literal editable
  label); occupies no physical table; counts as a used cell for the
  auto-row rule. (pgTAP, Vitest, Playwright)
- **Undo/Redo**: covers `transfer`/`end`/`skip` via `board_events`
  (no new client-side history system); round-trips correctly even when
  an undo and its own log entry share one transaction's `now()` (the
  target-selection queries order by `board_events.id`, not by
  `created_at`/`undone_at` timestamps). (pgTAP)
- **Floor Ended/Skipped are not occupancy**: `resolveFloorTables` only
  counts `status === "active"` cells — Floor/Picker/Servers/Dashboard
  metrics all agree that an ended or skipped table is available. (Vitest)
- **Dashboard Master Rotation**: preserves an ended entry's label
  (struck through, not blanked); renders a skip as `0`; Active/Available
  table metrics reflect current occupancy, not history. (Playwright)
- **Transfer/End are Floor-only** (follow-up UI refinement): Grid never
  renders a Transfer or End button on an active cell (only Edit and
  Unassign); Picker — which renders the same underlying rotation table —
  inherits the same hidden state; Floor's occupied-table panel still
  exposes all three (Transfer, End, Unassign). (Playwright)
- **Responsive/theme**: all new controls (Floor's Transfer/End/Unassign
  panel, Skip Turn, the Ended/Skipped cell badges) validated on desktop,
  iPad-landscape (`host-tablet`), and Pixel-mobile (`server-mobile`)
  Playwright projects, and visually spot-checked in both `light` and
  `dark` `data-theme`.

## Multi-table follow-up

- **Zero active tables**: assigning to a server with no active tables
  anywhere assigns directly — no decision dialog. (Playwright)
- **One or more active tables**: assigning to a server who already has
  at least one active table opens the decision dialog, listing their
  current tables and offering Assign Also / Transfer / End existing
  table(s) & Assign / Cancel. (Playwright)
- **Assign Also**: creates a new active row at the server's own earliest
  empty round; every existing active table is untouched; Grid, Servers,
  and Dashboard all reflect the new total. (pgTAP, Vitest, Playwright)
- **Transfer (same-server, from the decision dialog)**: relabels the
  chosen existing row in place — old table free, new table active under
  the same server, other active tables untouched. With more than one
  existing table, prompts for which one; never assumes
  oldest/newest/first/last. Distinct from the pre-existing
  occupied-table-tap Transfer (cross-server, `board_transfer`, same
  label) — both are covered, as two different code paths. (pgTAP,
  Vitest, Playwright)
- **End existing table(s) & Assign**: ends the chosen row(s) (history
  preserved, each as its own entry) and creates one new active row,
  atomically (`board_end_and_assign`); with more than one existing
  table, a multi-select — see "End one or more" section below for the
  full detail (this was originally single-choice-only; expanded to
  support ending several or all at once). (pgTAP, Vitest, Playwright)
- **Cancel**: zero state changes — no occupancy, history, or event
  mutation. (Playwright)
- **Undo/Redo of End existing table(s) & Assign**: round-trips
  correctly; undoing it reactivates the ended row(s) via the same code
  path `board_end_table`'s undo uses, and inherits the same typed
  occupancy-conflict protection (no new "don't steal a table back" logic
  needed). (pgTAP, Playwright)
- **Picker popup**: the TableMap opens as a `<dialog>`, never inline
  below the rotation grid; closing it (Close button, backdrop click, or
  Esc) returns to the selected-cell state without losing the selection.
  (Playwright)
- **Picker never auto-transfers**: assigning an additional table to a
  server who already has one via Picker creates an additional active row
  and never disturbs the existing one; Picker never shows Transfer/End
  controls and never opens Floor's decision dialog. (Playwright)
- **Servers multi-table display**: a server's card shows every currently
  active table simultaneously, not just the most recent one. (Playwright)
- **Occupancy safety**: the physical-table conflict check (the
  `sync_table_occupancy` trigger) applies uniformly to Assign Also,
  same-server Transfer, and End existing table(s) & Assign — none of
  them bypass it, so a stale client-side read of "available" still
  surfaces a typed conflict rather than double-booking. (pgTAP,
  inherited from existing `board_assign`/`board_end_table` coverage — no
  separate proof needed since these paths call the same underlying
  functions.)
- **Responsive/theme**: the Floor decision dialog and the Picker popup
  validated on desktop, iPad-landscape (`host-tablet`), and
  Pixel-mobile (`server-mobile`) — no body horizontal overflow, no
  layout breakage, touch-friendly targets — and visually spot-checked in
  both `light` and `dark`.

## End one or more

Expands "End existing table(s) & Assign" (above) from ending exactly
one table to ending any non-empty selection — one, several, or every
one of a server's active tables — in the same atomic step. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 9.

- **CASE A — end one**: unchanged behavior, still covered by the
  existing single-choice coverage above (now via a one-row-preselected
  multi-select internally, but the same outcome). (pgTAP, Playwright)
- **CASE B — end multiple**: selecting two of a server's three (or more)
  active tables ends exactly those two; every other active table is
  untouched; the newly selected table becomes active. (pgTAP, Vitest,
  Playwright)
- **CASE C — end all**: "Select all" ends every currently active table
  for that server before assigning the new one; the server ends up with
  exactly one active table (the new one). (pgTAP, Vitest, Playwright)
- **CASE D — cancel**: closing the multi-select (dialog `X`, backdrop,
  or Esc) with one or more boxes checked makes zero state changes —
  checking a box is local UI state only until the primary action is
  actually clicked. (Playwright)
- **CASE E — no selection**: the primary action ("End N Table(s) &
  Assign `<table>`") is disabled whenever nothing is checked; the RPC
  also rejects an empty selection server-side
  (`'Select at least one table to end.'`), defense in depth against a
  client that somehow bypasses the disabled button. (pgTAP, Vitest)
- **CASE F — concurrent new-table conflict**: if the newly selected
  table gets claimed by someone else while the dialog is open, the whole
  call fails (typed conflict) and none of the selected existing tables
  are ended — no partial state where some are ended but the new table
  was never actually assigned. (pgTAP)
- **CASE G — stale existing table**: if one of the checked tables was
  already ended/reassigned by someone else before the call lands, the
  whole call is rejected and every selected table (including the ones
  that were still genuinely valid) stays untouched — all-or-nothing, not
  best-effort. (pgTAP)
- **CASE H/I — undo/redo**: a multi-table End+Assign undoes and redoes
  as one unit — all ended rows are restored/re-ended together, and the
  new row is removed/recreated together with them, never independently.
  (pgTAP, Playwright)
- **Responsive/theme**: the checkbox multi-select (checkboxes, "Select
  all"/"Clear all", the "N of M selected" count, the disabled-until-
  checked primary action) validated on desktop, iPad-landscape
  (`host-tablet`), and Pixel-mobile (`server-mobile`) — touch-friendly
  targets, no body horizontal overflow — and visually spot-checked in
  both `light` and `dark`.

## Picker direct popup / Server decision flow

Floor's decision flow (above) is treated as approved and unchanged. This
follow-up touches Picker's entry path and gives Server Board the same
decision flow Floor already had. Full spec:
`TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 10.

- **CASE A — direct popup**: clicking an eligible empty Picker cell opens
  the Table Layout popup immediately; no inline "Table Picker" section
  renders below the rotation grid, and no intermediate click is needed.
  (Playwright)
- **CASE B — Skip Turn in the popup**: the popup itself contains a "Skip
  turn (0)" action; selecting it records the cell as skipped, closes the
  popup, and changes no physical-table occupancy. (Playwright)
- **CASE C — table selection**: selecting an available table in the
  popup assigns it to the already-selected cell/server and closes the
  popup; Grid/Floor/Servers/Dashboard all reflect it. (Playwright)
- **CASE D — multi-table server, no auto-transfer**: assigning an
  additional table to a server who already has one via Picker never
  disturbs the existing one — always an additional active row, never a
  decision dialog (Picker's cell is always already explicit). (Playwright)
- **CASE E/F — Transfer/End stay hidden**: Picker never renders Transfer
  or End controls, popup or otherwise. (Playwright)
- **Server zero active**: `+ Table` → select an available table → direct
  assign, no decision dialog. (Playwright)
- **Server existing active**: `+ Table` → select an available table →
  the same four-choice decision dialog Floor uses (Assign Also /
  Transfer / End existing table(s) & Assign / Cancel), server already
  known from the card — never re-asked. (Playwright)
- **Server Assign Also / Transfer (single + multi-table sub-picker) /
  End one / End multiple / End all**: same outcomes as the equivalent
  Floor cases (above), reached via a server card instead of tapping a
  table first. (Playwright)
- **Server per-table actions**: tapping one already-assigned table's
  badge opens Transfer/End/Unassign scoped to that one table only —
  other active tables on the same server are untouched. (Playwright)
- **Cancel, everywhere**: Picker popup Cancel, Server Board's table
  layout popup close, Server Board's decision-dialog Cancel, and Server
  Board's multi-end dialog close each make zero state changes.
  (Playwright)
- **Responsive/theme**: Picker's popup and Server Board's table layout/
  decision/multi-end dialogs validated on desktop, iPad-landscape
  (`host-tablet`), and Pixel-mobile (`server-mobile`) — no body
  horizontal overflow, touch-friendly targets — and visually
  spot-checked in both `light` and `dark`.

## Floor available-table popup + ownership visuals

Full spec: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 11.

- **CASE A — popup opens, no inline panel**: clicking an available Floor
  table opens an "Assign `<table>`" popup; no "pick a server" section
  ever renders inline below the map. (Playwright, unit `getInitials`)
- **CASE B — Cancel**: Cancel from the popup makes zero state changes.
  (Playwright)
- **CASE C — zero active tables**: selecting a server with none assigns
  directly, no decision dialog. (Playwright)
- **CASE D — existing active tables**: selecting a server with one or
  more opens the existing four-choice decision dialog on top, unchanged
  from section 8. (Playwright)
- **Assigned tile visual**: after assigning, the tile shows the table
  label and the server's initials (e.g. "MC" for Mia Chen) on that
  server's accent color; the legend shows the same initials, the
  server's name, and the correct active-table count. (Playwright)
- **End visual**: ending the table removes the initials/accent
  immediately and restores available styling; the legend's count for
  that server decrements. (Playwright)
- **Unassign visual**: same outcome as End — initials/accent removed,
  available styling restored, legend count decrements. (Playwright)
- **Transfer visual**: transferring the table replaces the old server's
  initials/accent with the new server's immediately, with the table
  remaining assigned throughout (no available-state flash); legend
  counts move from the old server to the new one. (Playwright)
- **Multiple tables, same server**: assigning several tables to the same
  server shows matching initials/accent on every one of them, and the
  legend's count reflects the total. (Playwright)
- **`getInitials`**: two-part names ("Mia Chen" → "MC"), more than two
  parts (first + last only), a single-word name (its own first two
  letters), case-insensitivity, extra whitespace, and an empty string.
  (Vitest)
- **Accessibility**: an assigned tile's accessible name is unchanged —
  "Table `<n>`, assigned to `<full name>`" — the initials/color are
  supplementary, never the only place identity is exposed; an available
  tile stays "Table `<n>`, available." (Playwright, inherited from
  existing TableMap coverage — this follow-up added no new aria
  attributes, only visible text/color.)
- **Selected vs. ownership**: the temporary "tapped" ring renders
  distinctly from, and on top of, whatever ownership accent a tile
  already has — visually spot-checked, not independently asserted by an
  automated test (there is no accessible-name distinction to assert;
  it's a purely visual ring vs. background/border difference).
- **Responsive/theme**: the Floor legend (`overflow-x-auto` chip row)
  and the assign popup validated on desktop, iPad-landscape
  (`host-tablet`), and Pixel-mobile (`server-mobile`) — no body
  horizontal overflow, initials/legend readable, touch-friendly targets
  — and visually spot-checked in both `light` and `dark`.

## Production parity fix

Full spec: `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md` section 12.

- **`getInitials`/backfill idempotency, tenant isolation, no
  duplication, existing-layout-not-overwritten**: `0023_table_rotation_
floor_layout_backfill.test.sql`, 11 assertions (pgTAP).
- **Empty-layout explicit message**: `table-map.test.tsx`, 2 tests
  (Vitest/RTL) — zero tables renders the message and not the map; one
  or more tables renders the map and not the message.
- **Local vs. production distinction**: local/CI pgTAP can only prove a
  migration is _correct_ — it always runs against a freshly, fully
  migrated database, so it can never detect "correct locally, never
  applied to production" (the actual root cause here). That class of
  drift was only caught by direct production inspection (Supabase MCP,
  read-only queries), not by any automated test in this suite, and is
  called out explicitly rather than implied to be test-covered.
- **Production verification** (not run through this repo's test
  runners — see section 12.1's report for method and results):
  migration history parity, all 16 RPC signatures + grants, floor-layout
  row count/coordinates/area-name for the real location.

## Regression

- Features 003, 009, 010, 011, 028 — all existing acceptance criteria
  still pass (own-column/cross-column write attribution, any-employee
  quick add, reorder, open editing, date navigation + historical lock).
- Authentication, attendance, payroll, and unrelated schedule/timezone
  behavior — unaffected (no code touched outside
  `src/features/allocation/**` and its RPCs/migrations).

## Production stability hotfix

10 new pgTAP assertions
(`0024_table_rotation_concurrency_safe_positions.test.sql`): old/new
`board_add_column` signature swap, sequential position assignment
starting at 0, gap tolerance after a removal (`max(position)+1` never
reuses a vacated position), reactivation of a previously-removed
member keeps its own original position, and the unique
`(service_session_id, position)` constraint remains fully enforced
(forced immediate via `set constraints ... immediate`, since it's
deferred by design).

6 new Vitest assertions: `findEarliestEmptyRoundForColumn` treats a
missing cell (real mode's shape) as empty, not just an explicit
`status: "empty"` cell (`rotation-board.test.ts`); `diningAreaName`
reads the real single-object PostgREST shape correctly while
tolerating an array shape defensively, for both a populated and a
`null`/empty case (`allocation-data.test.ts`); `TableMap`'s new
`loadError` state takes priority over both the map and the "no tables
configured" message (`table-map.test.tsx`).

**Genuine two-connection concurrency test** (not pgTAP, not Vitest —
pgTAP runs each test file as one transaction, so it cannot exercise
true cross-connection concurrency): two parallel `psql` sessions
against the local Supabase Postgres container, each `pg_sleep(0.5)`
then calling `board_add_column` for the same session with a different
server, launched via shell backgrounding so both are genuinely in
flight together. Result: both succeeded, positions `0` and `1`, no
duplicate-key error, exactly one `service_sessions` row created.

**Not run**: local browser-based two-session multi-device validation
(login → immediate data, cross-tablet realtime sync, Floor/Server
assignment through the UI). Attempted; blocked by a local Supabase
CLI/GoTrue admin-key-format mismatch in this repo's local dev tooling,
unrelated to this hotfix's own changes — see
`IMPLEMENTATION_LOG.md`'s "Local validation" subsection for the exact
error and reasoning. CI's `migrations-and-policies` job independently
applied and pgTAP-tested this same migration against a fresh ephemeral
Supabase instance and passed, and the concurrency guarantee itself was
verified directly at the database level (above) rather than through
the UI, so this gap is specifically live two-tablet UI validation, not
the underlying correctness of any fix.
