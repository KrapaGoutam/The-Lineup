# Feature 003 — Live table-allocation rotation

Status: schema and UI complete but disconnected. The Postgres schema (`rotation_rounds`, `table_rotation_entries`, `board_events`), RLS, and pgTAP coverage are production-ready; `allocation-workspace.tsx` runs the pure `rotation-board.ts` reducer entirely on in-memory `useState` and never writes `board_events` or subscribes to Realtime. Wiring is tracked as `docs/ROADMAP.md` Phase 2 item 6. See `docs/AUDIT.md` (2026-09-05).

**Superseded in part by Features 009, 010, and 011** (2026-09-05): the "own active column only" rule below is a deliberate reversal, not an oversight — see `docs/features/011-allocation-board-open-editing.md` for the reasoning (including the tip-math question it required answering) and `docs/SECURITY.md`'s "Allocation-board open editing" section for the full authorization treatment. The quick-add list was never actually schedule-filtered (Feature 009 proved and locked that instead of changing it), and column reordering (Feature 010) is a genuinely new capability this spec didn't originally include.

## User outcome

The floor team maintains a live rotation board whose server columns can change during service. Each filled round creates the next row automatically and every destructive action is recoverable through history.

## Rules

- Active memberships become ordered columns — any active employee, scheduled for the shift or not (Feature 009); managers can add, remove, pause, resume, and reorder them (reorder: Feature 010).
- ~~Employees may add a table only to their own active column. Managers may edit any column.~~ Superseded by Feature 011 (revised twice): any signed-in active member may write a table entry against any column; editing someone else's is always attributed (recorded and shown to the whole team) with no reason field or reason data involved at all — own-column and cross-column writes are now identical, one input each. The board locks for everyone once that date's tips are finalized.
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

- Auto-row (opened on a row's first value, per-board, not per-column completion), pause/remove behavior, any-column writes with unconditional cross-column attribution (no reason mechanism), reorder, manager clear, and undo/redo domain tests.
- RLS and no-anon database checks.
- Playwright any-column write, reorder, finalized-day lock, and manager board-control flows.

## Codex build prompt

Superseded — Features 009, 010, and 011 were implemented directly (Claude, not Codex) per explicit division-of-labor change for that batch; see `docs/features/005-self-serve-registration.md`'s implementation note for the full context.
