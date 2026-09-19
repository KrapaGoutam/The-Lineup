# Table Rotation Multi-View — Test Plan

Baseline (must not regress): Vitest 359/359, Playwright 153/153, pgTAP 228
assertions. New tests must expand these counts, not merely maintain them.

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
- Transfer (`p_confirm_transfer: true`) atomically releases the old holder
  and claims for the new one — no window where the table is claimed by
  both or neither.
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

## Floor
- All registered tables render at their seeded positions.
- Tap available table → assign flow completes in 2 taps.
- Occupied table → detail sheet → transfer/unassign both work.

## Picker
- Selecting a table in the map assigns to the currently selected Grid
  cell/column.
- Availability matches Floor's for the same table.

## Servers
- `+ Table` opens the shared picker and assigns correctly.
- Reorder updates the same global order Grid/Floor Team show.
- Pause/resume/remove match Grid's existing behavior for the same RPCs.

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

## Regression
- Features 003, 009, 010, 011, 028 — all existing acceptance criteria
  still pass (own-column/cross-column write attribution, any-employee
  quick add, reorder, open editing, date navigation + historical lock).
- Authentication, attendance, payroll, and unrelated schedule/timezone
  behavior — unaffected (no code touched outside
  `src/features/allocation/**` and its RPCs/migrations).
