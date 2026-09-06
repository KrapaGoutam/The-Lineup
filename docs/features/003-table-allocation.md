# Feature 003 — Live table-allocation rotation

Status: wired to hosted Supabase (Feature 015, Phase C). `allocation-workspace.tsx`'s `rotation-board.ts` reducer stays the pure source of truth for the board's _shape_ (unchanged by this phase, per the Phase C spec); in real mode every action calls one of ten new SECURITY INVOKER RPCs (one per action type, plus undo/redo) that write the mutation and its `board_events` row in one transaction, and a Realtime subscription on `board_events` (scoped to the open `service_session_id`) refreshes every other open board within a couple of seconds. Wiring this up surfaced four real RLS/grant gaps in the schema below — see `docs/SECURITY.md`'s updated "Allocation-board open editing" section and the three fixup migrations' own comments for what they were and why Feature 011 shipping demo-only let them go unnoticed until now. See `docs/AUDIT.md` (2026-09-05) for the pre-Phase-C state.

**Superseded in part by Features 009, 010, and 011** (2026-09-05): the "own active column only" rule below is a deliberate reversal, not an oversight — see `docs/features/011-allocation-board-open-editing.md` for the reasoning (including the tip-math question it required answering) and `docs/SECURITY.md`'s "Allocation-board open editing" section for the full authorization treatment. The quick-add list was never actually schedule-filtered (Feature 009 proved and locked that instead of changing it), and column reordering (Feature 010) is a genuinely new capability this spec didn't originally include.

## User outcome

The floor team maintains a live rotation board whose server columns can change during service. Each filled round creates the next row automatically and every destructive action is recoverable through history.

## Rules

- Active memberships become ordered columns — any active employee, scheduled for the shift or not (Feature 009); managers can add, remove, pause, resume, and reorder them (reorder: Feature 010).
- ~~Employees may add a table only to their own active column. Managers may edit any column.~~ Superseded by Feature 011 (revised twice): any signed-in active member may write a table entry against any column; editing someone else's is always attributed (recorded and shown to the whole team) with no reason field or reason data involved at all — own-column and cross-column writes are now identical, one input each. The board locks for everyone once that date's tips are finalized.
- A cell may contain one table or a combined-table label such as `12 + 13`.
- A new empty round appears the moment the current round gets its first value (a per-board signal, not a per-column completion condition — corrected pre-Phase-C; see DATA_MODEL.md's "Standing empty-row trigger" note).
- Paused or removed columns do not block the next round and history remains visible.
- Undo/redo operates on append-only board events, open to any active member (Feature 015 Phase C: a single shared timeline, not per-browser-tab). Clear row, clear column, clear board, and add row are restricted to owner/general_manager/shift_manager/host — enforced inside each RPC itself (Phase C), not only by hiding the controls in the UI.
- Persisted writes use actor-stamped append-only events; transaction/idempotency hardening is required before a multi-device pilot.

## UI

- Horizontally scrollable board on tablet/mobile, sticky server headers, large Add table controls, and explicit paused labels.
- Undo/redo stays visible. Destructive clear actions require confirmation in persisted mode.
- Activity status is described with text/icons, never color alone.

## Data and authorization

- Service session owns ordered members, rotation rounds, entries, and events; one active session per (location, service date), created lazily by the first manager/host action that day (Feature 015 Phase C).
- Realtime is subscribed only while the live board is open, scoped to that session's `board_events` (every mutating RPC logs one regardless of which table it actually changed, so this single subscription covers all of them).
- Occupied-table and duplicate-active-allocation constraints remain authoritative in Postgres.
- Ten SECURITY INVOKER RPCs (one per action, plus undo/redo) each do their table write and `board_events` row in one transaction.

## Tests

- Auto-row (opened on a row's first value, per-board, not per-column completion), pause/remove behavior, any-column writes with unconditional cross-column attribution (no reason mechanism), reorder, manager clear, and undo/redo domain tests.
- pgTAP: RPC existence and SECURITY INVOKER-only, the four RLS/grant gaps and their fixes, the deferrable position constraint, realtime publication membership (`0007_allocation_board_rpcs.test.sql`).
- Playwright any-column write, reorder, finalized-day lock, and manager board-control flows (demo mode); live-verified against the hosted project with two real accounts for real mode (see Feature 015's Phase C build notes).

## Codex build prompt

Superseded — Features 009, 010, and 011 were implemented directly (Claude, not Codex) per explicit division-of-labor change for that batch; see `docs/features/005-self-serve-registration.md`'s implementation note for the full context.
