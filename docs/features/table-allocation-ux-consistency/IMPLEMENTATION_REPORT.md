# Implementation report -- #109 UX Consistency

In progress. U1 done; U2-U5 pending.

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
