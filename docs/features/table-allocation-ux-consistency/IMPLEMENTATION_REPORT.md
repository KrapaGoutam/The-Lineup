# Implementation report -- #109 UX Consistency

U1-U5 complete on `fix/table-allocation-ux-consistency`. No migration, no schema change. PROD and `main` untouched; DEV used read/write only by the hosted real-mode UI suite (synthetic data).

## U2 -- Recent activity from the complete event model (done)

- Event model: the DB enum `board_event_type` has 18 values (assign, add_column, pause_column,
  resume_column, remove_column, clear_row, clear_column, clear_board, undo, redo, move_column,
  add_row, clear_cell, delete_row, transfer, end, skip, end_and_assign). Payload keys were read
  from `20261023110000_table_rotation_v2_trusted_mutations.sql` (`private.emit_board_event`).
  No event type was invented.
- One presenter: `domain/board-activity.ts` (`presentBoardEvent`, `buildRecentActivity`). Typed
  `Record<BoardEventType, ...>`, so a new enum value fails typecheck until it has copy; the test
  is also driven by the generated enum.
- Unknown / future event types, malformed payloads and unknown actors/servers never throw and
  render the fallback ("updated the board") or neutral names. Raw payload JSON is never rendered.
- Ordering: the query orders by `created_at` then `id` (write order tiebreak); the presenter sorts
  newest-first by the same rule, never by client insertion order. No schema change.
- Data/UI: `AllocationContext.recentActivity` (server read) -> workspace state (synced on the same
  paths as the cross-edit log, incl. historical dates and Realtime refresh) -> Dashboard list with
  actor, copy, an "(undone)" text marker and the location-time-zone wall-clock time. Demo mode (no
  `board_events`) feeds the same shape from the cross-edit log.
- The Grid's separate "Cross-column edits" attribution card is intentionally unchanged.

## U3 -- Whole-assignment explanatory UX (done)

- Behavior is unchanged. A combined assignment ("T1 + T2") stays ONE logical assignment; Transfer,
  End and Unassign still act on all of it. No partial-release model, no new data, no extra clicks.
- Data: `resolveFloorTables` (the one derivation behind Floor / Picker / Servers) now gives each
  occupant `assignmentTables` -- every physical table in the same assignment -- so no view parses
  labels on its own.
- Copy lives in one module, `domain/assignment-scope.ts` (`getAssignmentScope`), for floor staff:
  "T1 + T2 are one assignment." / "Transfer moves the entire assignment (T1 + T2)." /
  "Ending this assignment releases both tables." / "Unassign removes the entire assignment
  (T1 + T2)." (`all N tables` for 3+). No database terms. A single table gets `null` for every
  note, so ordinary actions keep their concise UI.
- Where it shows (next to the action being chosen, not a banner):
  - Floor occupied-table panel: "Combined" badge + summary, a one-line note under each of
    Transfer / End table / Unassign (tied with `aria-describedby`; button names unchanged), and the
    transfer step reads "Give T1 + T2 to:".
  - Servers table dialog: same, plus each server card lists "T1 + T2 · one assignment".
  - Picker / Servers / Floor map tiles: accessible name gains ", combined with T2" after the
    unchanged "assigned to <server>" text.
  - Assign-decision dialog (Transfer an existing table / End existing table(s)): combined entries
    note that they are replaced / released as a whole.
- No new confirmation was added to any action.

## U4 -- Servers counts include authoritative off-map claims (done)

- Defect: the Servers card counted `tables.filter(occupiedBy.columnId === column.id)`, i.e. only
  tables with a position on the floor map, so a server that held an unpositioned table showed one
  fewer than the Dashboard and the Grid. Its table pills were also built from map tiles, so an
  off-map table could not be reached from Servers at all.
- Source of truth: `buildBoardReadModel` -- the board's active entries, the same derivation the
  Dashboard totals use. Nothing is read from map position, DOM nodes or rendered markers.
  `ServerSummary` gains `unmappedTableLabels` (the held labels with no map row), computed centrally.
- Count semantics (decision, reused from Part 1, not new): "N tables" = PHYSICAL tables, every
  combined part counted. `T1 + T2` is one assignment but two tables. This is
  `ServerSummary.activeTableLabels.length`; the per-server numbers sum to the Dashboard's
  "Active tables" (`stats.occupiedTables`), asserted in a test. The Servers card additionally says
  "T1 + T2 · one assignment" so the two readings are never confused.
- Visibility (reuses the Dashboard's existing wording, no new concept): the card shows
  "N not on the floor map (labels)", the pill is warning-toned AND its accessible name ends
  ", not on the floor map" (not colour-only), and the pill is actionable (Transfer / End / Unassign).
- Same defect, same fix, Floor legend: its per-server "N tables" also counted map tiles; it now reads
  the read model's count (`FloorView` takes `servers`). Grid renders the board and was already
  correct; Picker renders the Grid plus the map.
- Demo mode note: the demo seed's labels ("12", "8", "21 + 22") are not on the demo floor map
  (`DEMO_FLOOR_LAYOUT` uses T-labels), so demo Servers cards now truthfully show them as
  "not on the floor map". Real mode shows what each location actually registered.

## U5 -- Stale comments / status text, DOC-001 (done)

Scope kept to Table Allocation, #109, the current roadmap/status and current test counts.

Updated (living / current-state text that was false):

- `allocation-workspace.tsx` comment: said Floor is the one surface for Transfer / End. Servers'
  per-table dialog also offers them (Picker/Server follow-up); now says so and notes whole-assignment.
- `floor-view.tsx` / `server-board-view.tsx` headers: said the actions act on "that one selected
  table"; they act on that table's logical assignment (whole combined assignment).
- `table-map.tsx` header: said the repo has no Dialog primitive yet; Picker and Servers use the
  shared `Dialog`.
- `docs/STATUS.md` health gate (45 files / 359 tests / 153 e2e / 18 pgTAP files, 228 assertions,
  dated Sept 11) -> measured current: 64 files / 559 tests, 345 demo e2e tests (3 projects),
  29 pgTAP files / 553 planned assertions; plus a #109 section.
- `docs/ROADMAP.md`: #109 moved from FOLLOW-UP to ACTIVE.
- `docs/features/table-rotation-multi-view/README.md`: "Transfer and End are Floor-only" ->
  Floor panel and Servers dialog; whole-assignment note.
- GitHub #109 body: removed "PR #131, not yet merged"; reconciled status + the five-item checklist.

Deliberately NOT edited (historical evidence of a past state, not a claim about now):
`IMPLEMENTATION_LOG.md`, `PART1_*`, `VERSION_UPGRADE_PART1_AUDIT.md`, the Part 1
`AGENT_HANDOFF.md`, `TEST_PLAN.md` baselines ("359/359", "228"), `TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md`,
and the e2e test titles that say "Floor-only" about Grid/Picker hiding the buttons (still true of
Grid and Picker). `docs/CI_CD.md`'s PR #131 registry-limit exception is a recorded historical
exception and stays.

## Known gaps / follow-up candidates (not fixed here, by scope)

- Picker: the cell body itself has no keyboard route to open the map (only pointer/touch); keyboard
  users can still reach every inner control. A dedicated "Choose table" button per cell would fix
  it; that is new UI, not the propagation boundary U1 covers.
- Demo mode only: the demo seed labels ("12", "21 + 22") are not on `DEMO_FLOOR_LAYOUT`, so demo
  Servers cards show them as "not on the floor map". The data is the demo's, the note is truthful.
- No partial release of a combined assignment (explicitly out of scope; would need a data model).
