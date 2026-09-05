# Feature 003 — Live table-allocation rotation

Status: implemented (interactive reference UI and production schema)

## User outcome

The floor team maintains a live rotation board whose server columns can change during service. Each filled round creates the next row automatically and every destructive action is recoverable through history.

## Rules

- Active server memberships become ordered columns; managers can add, remove, pause, and resume them.
- Employees may add a table only to their own active column. Managers may edit any column.
- A cell may contain one table or a combined-table label such as `12 + 13`.
- A new empty round appears only when every active, non-paused column in the current round is filled.
- Paused or removed columns do not block the next round and history remains visible.
- Undo/redo operates on append-only board events. Clear row, clear column, and clear board are manager/owner-only soft-clear events.
- Persisted writes use actor-stamped append-only events; transaction/idempotency hardening is required before a multi-device pilot.

## UI

- Horizontally scrollable board on tablet/mobile, sticky server headers, large Add table controls, and explicit paused labels.
- Undo/redo stays visible. Destructive clear actions require confirmation in persisted mode.
- Activity status is described with text/icons, never color alone.

## Data and authorization

- Service session owns ordered members, rotation rounds, entries, and events.
- Realtime is subscribed only while the live board is open.
- Occupied-table and duplicate-active-allocation constraints remain authoritative in Postgres.

## Tests

- Auto-row, pause/remove behavior, employee ownership, manager clear, and undo/redo domain tests.
- RLS and no-anon database checks.
- Playwright employee self-column and manager board-control flows.

## Codex build prompt

Implement the approved event-backed allocation board. Keep the reducer pure, enforce employee self-column writes and manager clears twice (application plus RLS), and verify touch and keyboard behavior.
